/**
 * HandTrailRenderer Module
 * Robust position-based hand tracking (not relying on unreliable handedness labels)
 *
 * Key insight: MediaPipe's "Left"/"Right" labels are UNRELIABLE and can swap
 * between frames. Solution: Track hands by POSITION CONTINUITY instead.
 *
 * Algorithm:
 * 1. Each frame, get all detected finger tip positions
 * 2. Match new positions to existing trails using nearest-neighbor
 * 3. Create new trail if no match within threshold
 * 4. Fade orphaned trails
 */

import * as THREE from 'three';
import type { HandLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';

// Premium Lightsaber-Inspired Trail Shader
// Ultra-sharp white core with energy field and soft aura
const ribbonVertexShader = /* glsl */ `
  attribute float aAlpha;
  attribute float aProgress;
  attribute float aDistanceFromCenter;
  attribute float aVelocity;
  
  varying float vAlpha;
  varying float vProgress;
  varying float vDistanceFromCenter;
  varying float vVelocity;
  varying vec3 vWorldPosition;
  
  void main() {
    vAlpha = aAlpha;
    vProgress = aProgress;
    vDistanceFromCenter = aDistanceFromCenter;
    vVelocity = aVelocity;
    
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ribbonFragmentShader = /* glsl */ `
  uniform vec3 uCoreColor;
  uniform vec3 uGlowColor;
  uniform float uTime;
  uniform float uIntensity;
  
  varying float vAlpha;
  varying float vProgress;
  varying float vDistanceFromCenter;
  varying float vVelocity;
  varying vec3 vWorldPosition;
  
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  
  void main() {
    if (vAlpha < 0.01) discard;

    float d = abs(vDistanceFromCenter);
    
    float velocityBoost = 1.0 + vVelocity * 1.15;
    float intensityFactor = uIntensity * velocityBoost;
    float head = smoothstep(0.78, 0.98, vProgress);
    
    float coreWidth = mix(0.040, 0.070, vVelocity);
    float core = smoothstep(coreWidth, 0.0, d);
    vec3 coreRay = vec3(26.0, 26.0, 26.0) * core * intensityFactor;

    float auraWidth = mix(1.6, 2.2, vVelocity);
    float aura = exp(-d * d * auraWidth * 6.0);

    float shimmer = 0.82 + 0.18 * sin((vProgress * 18.0 - uTime * 6.0) * 6.28318);
    float shimmerMask = smoothstep(0.12, 0.55, d);
    vec3 auraCol = uGlowColor * (3.4 + 1.6 * head) * aura * shimmer * intensityFactor;
    auraCol *= (0.85 + 0.15 * shimmerMask);

    float edgeIon = smoothstep(0.55, 0.95, d) * smoothstep(0.20, 0.85, vProgress);
    float edgeNoise = step(0.93, hash12(vec2(vProgress * 120.0 + uTime * 3.5, d * 60.0)));
    vec3 ion = uGlowColor * edgeIon * edgeNoise * (5.0 * vVelocity);

    float sparkleGate = smoothstep(0.30, 1.0, vVelocity);
    float sparkle = step(0.985, hash12(vec2(vProgress * 240.0 + uTime * 8.0, d * 90.0)));
    sparkle *= smoothstep(0.22, 0.0, d);
    vec3 spark = vec3(10.0) * sparkle * sparkleGate;

    vec3 finalColor = coreRay + auraCol + ion + spark;

    float alpha = vAlpha;
    alpha *= (0.06 + 0.94 * smoothstep(0.22, 0.98, vProgress));
    alpha *= (0.65 + 0.65 * vVelocity);

    float coreAlpha = smoothstep(coreWidth * 1.6, 0.0, d) * 0.95;
    float auraAlpha = aura * 0.18;
    alpha *= (coreAlpha + auraAlpha);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

/**
 * 2D trail point for collision detection
 */
export interface TrailPoint2D {
  x: number;
  y: number;
  timestamp: number;
  opacity: number;
}

/**
 * Trail point with screen and world position + velocity
 */
interface TrailPoint {
  screenX: number;
  screenY: number;
  worldPos: THREE.Vector3;
  timestamp: number;
  velocity: number; // Speed at this point (0-1 normalized)
}

/**
 * Single hand trail (tracked by position, not label)
 */
interface TrackedTrail {
  id: number;
  points: TrailPoint[];
  lastScreenX: number;
  lastScreenY: number;
  lastUpdateTime: number;
  lastVelocity: number; // Track velocity for smoothing
  filterX: OneEuroFilter;
  filterY: OneEuroFilter;
  sparkleAccumulator: number;
  isActive: boolean;
  geometry: THREE.BufferGeometry;
  mesh: THREE.Mesh;
}

/**
 * Configuration for premium lightsaber trail
 */
export interface CosmicTrailConfig {
  maxPoints: number;
  ribbonWidth: number;
  trailLength: number;
  coreColor: THREE.Color;
  glowColor: THREE.Color;
  smoothingFactor: number; // Exponential smoothing (0-1, higher = smoother but more lag)
  velocityScale: number; // Scale factor for velocity calculations
  intensityBoost: number; // Base intensity multiplier
  positionFilterMinCutoff: number;
  positionFilterBeta: number;
  positionFilterDerivateCutoff: number;
  sparkleMaxCount: number;
  sparkleSpawnRate: number;
  sparkleBaseSize: number;
}

const DEFAULT_CONFIG: CosmicTrailConfig = {
  maxPoints: 64,
  ribbonWidth: 0.16, // Balanced width for visibility
  trailLength: 22,
  coreColor: new THREE.Color(0xffffff), // Pure white core
  glowColor: new THREE.Color(0x00d4ff), // Electric cyan glow
  smoothingFactor: 0.35, // Moderate smoothing - responsive but stable
  velocityScale: 1.0,
  intensityBoost: 1.15,
  positionFilterMinCutoff: 1.15,
  positionFilterBeta: 0.01,
  positionFilterDerivateCutoff: 1.0,
  sparkleMaxCount: 160,
  sparkleSpawnRate: 70,
  sparkleBaseSize: 9.0,
};

// Maximum distance (in pixels) to match a new detection to existing trail
const MATCH_THRESHOLD = 150;
// Time (ms) after which an unmatched trail starts fading
const FADE_DELAY = 100;
// Maximum number of simultaneous trails
const MAX_TRAILS = 2;

class LowPassFilter {
  private hatX: number | null = null;

  filter(x: number, alpha: number): number {
    if (this.hatX === null) {
      this.hatX = x;
      return x;
    }
    this.hatX = alpha * x + (1 - alpha) * this.hatX;
    return this.hatX;
  }
}

class OneEuroFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;

  private readonly x: LowPassFilter = new LowPassFilter();
  private readonly dx: LowPassFilter = new LowPassFilter();

  private lastTime: number | null = null;
  private lastRawX: number | null = null;

  constructor(minCutoff: number, beta: number, dCutoff: number) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filterValue(value: number, t: number): number {
    if (this.lastTime === null || this.lastRawX === null) {
      this.lastTime = t;
      this.lastRawX = value;
      return this.x.filter(value, 1.0);
    }

    const dt = Math.max(t - this.lastTime, 1 / 240);
    const rawDx = (value - this.lastRawX) / dt;
    const edx = this.dx.filter(rawDx, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const result = this.x.filter(value, this.alpha(cutoff, dt));

    this.lastTime = t;
    this.lastRawX = value;
    return result;
  }
}

class SparkleSystem {
  private readonly maxCount: number;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly points: THREE.Points;

  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;

  private readonly velocities: Float32Array;
  private readonly ages: Float32Array;
  private readonly lifes: Float32Array;

  private writeIndex: number = 0;

  constructor(scene: THREE.Scene, maxCount: number) {
    this.maxCount = maxCount;
    this.positions = new Float32Array(maxCount * 3);
    this.colors = new Float32Array(maxCount * 3);
    this.sizes = new Float32Array(maxCount);
    this.alphas = new Float32Array(maxCount);
    this.velocities = new Float32Array(maxCount * 3);
    this.ages = new Float32Array(maxCount);
    this.lifes = new Float32Array(maxCount);

    this.geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(this.positions, 3);
    const colAttr = new THREE.BufferAttribute(this.colors, 3);
    const sizeAttr = new THREE.BufferAttribute(this.sizes, 1);
    const alphaAttr = new THREE.BufferAttribute(this.alphas, 1);

    posAttr.setUsage(THREE.DynamicDrawUsage);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    sizeAttr.setUsage(THREE.DynamicDrawUsage);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);

    this.geometry.setAttribute('position', posAttr);
    this.geometry.setAttribute('color', colAttr);
    this.geometry.setAttribute('aSize', sizeAttr);
    this.geometry.setAttribute('aAlpha', alphaAttr);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uIntensity: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = aAlpha;
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float s = aSize;
          s *= clamp(300.0 / max(1.0, -mvPosition.z), 0.65, 2.25);
          gl_PointSize = s;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uIntensity;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec2 p = gl_PointCoord - vec2(0.5);
          float r = length(p);
          float m = smoothstep(0.5, 0.0, r);
          float a = vAlpha * m;
          if (a < 0.01) discard;
          vec3 col = vColor * (7.0 * uIntensity) * a;
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      vertexColors: true,
      toneMapped: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 210;
    scene.add(this.points);
  }

  setIntensity(intensity: number): void {
    this.material.uniforms.uIntensity.value = intensity;
  }

  setVisible(visible: boolean): void {
    this.points.visible = visible;
  }

  spawn(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    color: THREE.Color,
    size: number,
    life: number
  ): void {
    const i = this.writeIndex;
    this.writeIndex = (this.writeIndex + 1) % this.maxCount;

    const i3 = i * 3;
    this.positions[i3] = position.x;
    this.positions[i3 + 1] = position.y;
    this.positions[i3 + 2] = position.z;
    this.velocities[i3] = velocity.x;
    this.velocities[i3 + 1] = velocity.y;
    this.velocities[i3 + 2] = velocity.z;

    this.colors[i3] = color.r;
    this.colors[i3 + 1] = color.g;
    this.colors[i3 + 2] = color.b;
    this.sizes[i] = size;
    this.alphas[i] = 1.0;
    this.ages[i] = 0;
    this.lifes[i] = life;
  }

  update(deltaTime: number): void {
    for (let i = 0; i < this.maxCount; i++) {
      const life = this.lifes[i];
      if (life <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      const age = this.ages[i] + deltaTime;
      this.ages[i] = age;

      const t = age / life;
      if (t >= 1) {
        this.lifes[i] = 0;
        this.alphas[i] = 0;
        continue;
      }

      const i3 = i * 3;
      this.positions[i3] += this.velocities[i3] * deltaTime;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * deltaTime;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * deltaTime;
      this.velocities[i3] *= 0.985;
      this.velocities[i3 + 1] *= 0.985;
      this.velocities[i3 + 2] *= 0.985;

      const fade = 1 - t;
      this.alphas[i] = fade * fade;
      this.sizes[i] *= 0.998;
    }

    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * HandTrailRenderer - Position-based trail tracking
 */
export class HandTrailRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private config: CosmicTrailConfig;
  private container: HTMLElement;

  private width: number = 0;
  private height: number = 0;

  // Tracked trails (by position continuity, not hand label)
  private trails: TrackedTrail[] = [];
  private nextTrailId: number = 0;

  // Shared material
  private material: THREE.ShaderMaterial;
  private time: number = 0;

  private maxRenderPoints: number = 0;
  private sparkleRateMultiplier: number = 1.0;

  private sparkleSystem: SparkleSystem;
  private tmpCameraDir: THREE.Vector3 = new THREE.Vector3();
  private tmpDir: THREE.Vector3 = new THREE.Vector3();
  private tmpPerp: THREE.Vector3 = new THREE.Vector3();
  private tmpNdc: THREE.Vector3 = new THREE.Vector3();
  private tmpWorld: THREE.Vector3 = new THREE.Vector3();
  private tmpUnprojectDir: THREE.Vector3 = new THREE.Vector3();

  private worldPosPool: THREE.Vector3[] = [];
  private tmpSparkleColor: THREE.Color = new THREE.Color();
  private tmpWhiteColor: THREE.Color = new THREE.Color(0xffffff);

  // Visibility control (used to hide trails during POW laser)
  private enabled: boolean = true;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    container: HTMLElement,
    config: Partial<CosmicTrailConfig> = {}
  ) {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    this.config = { ...DEFAULT_CONFIG, ...config };

    const rect = container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uCoreColor: { value: this.config.coreColor },
        uGlowColor: { value: this.config.glowColor },
        uTime: { value: 0 },
        uIntensity: { value: this.config.intensityBoost },
      },
      vertexShader: ribbonVertexShader,
      fragmentShader: ribbonFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: true,
    });

    this.maxRenderPoints = this.config.maxPoints;

    this.sparkleSystem = new SparkleSystem(this.scene, this.config.sparkleMaxCount);
    this.sparkleSystem.setIntensity(this.config.intensityBoost);

    window.addEventListener('resize', this.handleResize);
  }

  setRenderMode(mode: 'on-top' | 'depth-aware'): void {
    if (mode === 'depth-aware') {
      this.material.depthTest = true;
      this.material.depthWrite = false;
    } else {
      this.material.depthTest = false;
      this.material.depthWrite = false;
    }
    this.material.needsUpdate = true;
  }

  setQualityLevel(level: 'high' | 'medium' | 'low'): void {
    if (level === 'high') {
      this.maxRenderPoints = this.config.maxPoints;
      this.sparkleRateMultiplier = 1.0;
      this.material.uniforms.uIntensity.value = this.config.intensityBoost;
      return;
    }

    if (level === 'medium') {
      this.maxRenderPoints = Math.max(12, Math.floor(this.config.maxPoints * 0.75));
      this.sparkleRateMultiplier = 0.55;
      this.material.uniforms.uIntensity.value = this.config.intensityBoost * 0.92;
      return;
    }

    this.maxRenderPoints = Math.max(10, Math.floor(this.config.maxPoints * 0.5));
    this.sparkleRateMultiplier = 0.25;
    this.material.uniforms.uIntensity.value = this.config.intensityBoost * 0.8;
  }

  /**
   * Enable or disable trail rendering (used during POW laser)
   */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;

    this.enabled = enabled;

    // Hide/show all trail meshes and sparkles
    for (const trail of this.trails) {
      trail.mesh.visible = enabled;

      // When disabling, mark trails as inactive to start fading them out
      // This prevents accumulated points from appearing when re-enabled
      if (!enabled) {
        trail.isActive = false;
      }
    }
    this.sparkleSystem.setVisible(enabled);
  }

  /**
   * Check if trails are currently enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  private handleResize = (): void => {
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
  };

  /**
   * Create a new trail with velocity tracking
   */
  private createTrail(screenX: number, screenY: number): TrackedTrail {
    const maxVerts = this.config.maxPoints * 2;
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(maxVerts), 1));
    geometry.setAttribute('aProgress', new THREE.BufferAttribute(new Float32Array(maxVerts), 1));
    geometry.setAttribute(
      'aDistanceFromCenter',
      new THREE.BufferAttribute(new Float32Array(maxVerts), 1)
    );
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(new Float32Array(maxVerts), 1));

    const maxSegments = this.config.maxPoints - 1;
    const indexArray = new Uint16Array(maxSegments * 6);
    for (let i = 0; i < maxSegments; i++) {
      const base = i * 2;
      const o = i * 6;
      indexArray[o] = base;
      indexArray[o + 1] = base + 1;
      indexArray[o + 2] = base + 2;
      indexArray[o + 3] = base + 1;
      indexArray[o + 4] = base + 3;
      indexArray[o + 5] = base + 2;
    }
    geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
    geometry.setDrawRange(0, 0);

    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 200;
    mesh.visible = false;

    this.scene.add(mesh);

    return {
      id: this.nextTrailId++,
      points: [],
      lastScreenX: screenX,
      lastScreenY: screenY,
      lastUpdateTime: performance.now(),
      lastVelocity: 0,
      filterX: new OneEuroFilter(
        this.config.positionFilterMinCutoff,
        this.config.positionFilterBeta,
        this.config.positionFilterDerivateCutoff
      ),
      filterY: new OneEuroFilter(
        this.config.positionFilterMinCutoff,
        this.config.positionFilterBeta,
        this.config.positionFilterDerivateCutoff
      ),
      sparkleAccumulator: 0,
      isActive: true,
      geometry,
      mesh,
    };
  }

  /**
   * Update trails from hand tracking results
   */
  update(handResults: HandLandmarkerResult | null, deltaTime: number): void {
    this.time += deltaTime;
    this.material.uniforms.uTime.value = this.time;
    this.sparkleSystem.setIntensity(this.config.intensityBoost);

    // Early return if disabled - don't accumulate trail points during POW mode
    if (!this.enabled) {
      // Continue fading existing trails even when disabled
      for (const trail of this.trails) {
        this.fadeTrail(trail);
      }

      // Remove dead trails
      this.trails = this.trails.filter((trail) => {
        if (trail.points.length === 0 && !trail.isActive) {
          this.scene.remove(trail.mesh);
          trail.geometry.dispose();
          return false;
        }
        return true;
      });

      // Update geometries for fading trails
      for (const trail of this.trails) {
        this.updateGeometry(trail);
      }

      this.sparkleSystem.update(deltaTime);
      return;
    }

    const currentTime = performance.now();

    // Collect all finger tip positions from this frame
    const detections: { x: number; y: number }[] = [];

    if (handResults?.landmarks) {
      for (const landmarks of handResults.landmarks) {
        const anchor = this.getHandAnchor(landmarks);
        detections.push(anchor);
      }
    }

    // Match detections to existing trails using nearest neighbor
    const matchedTrails = new Set<number>();
    const matchedDetections = new Set<number>();

    // For each detection, find the closest trail
    for (let di = 0; di < detections.length; di++) {
      const det = detections[di];
      let bestTrailIdx = -1;
      let bestDist = MATCH_THRESHOLD;

      for (let ti = 0; ti < this.trails.length; ti++) {
        if (matchedTrails.has(ti)) continue;

        const trail = this.trails[ti];
        const dx = det.x - trail.lastScreenX;
        const dy = det.y - trail.lastScreenY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < bestDist) {
          bestDist = dist;
          bestTrailIdx = ti;
        }
      }

      if (bestTrailIdx >= 0) {
        // Match found - update existing trail
        matchedTrails.add(bestTrailIdx);
        matchedDetections.add(di);
        this.updateTrail(this.trails[bestTrailIdx], det.x, det.y, currentTime);
      }
    }

    // Create new trails for unmatched detections (up to MAX_TRAILS)
    for (let di = 0; di < detections.length; di++) {
      if (matchedDetections.has(di)) continue;
      if (this.trails.length >= MAX_TRAILS) break;

      const det = detections[di];
      const newTrail = this.createTrail(det.x, det.y);
      this.trails.push(newTrail);
      this.updateTrail(newTrail, det.x, det.y, currentTime);
    }

    // Fade unmatched trails
    for (let ti = 0; ti < this.trails.length; ti++) {
      if (matchedTrails.has(ti)) continue;

      const trail = this.trails[ti];
      if (currentTime - trail.lastUpdateTime > FADE_DELAY) {
        this.fadeTrail(trail);
      }
    }

    // Remove dead trails
    this.trails = this.trails.filter((trail) => {
      if (trail.points.length === 0 && !trail.isActive) {
        this.scene.remove(trail.mesh);
        trail.geometry.dispose();
        return false;
      }
      return true;
    });

    // Update all geometries
    for (const trail of this.trails) {
      this.updateGeometry(trail);
    }

    this.updateSparkles(deltaTime);
    this.sparkleSystem.update(deltaTime);
  }

  private updateSparkles(deltaTime: number): void {
    const baseRate = this.config.sparkleSpawnRate * this.sparkleRateMultiplier;
    const sizeBase = this.config.sparkleBaseSize;
    const glow = this.config.glowColor;

    for (const trail of this.trails) {
      if (!trail.isActive || trail.points.length < 2) continue;
      const lastPoint = trail.points[trail.points.length - 1];
      const v = lastPoint.velocity;
      trail.sparkleAccumulator += baseRate * (0.15 + 0.85 * v) * deltaTime;

      while (trail.sparkleAccumulator >= 1) {
        trail.sparkleAccumulator -= 1;

        const jitterX = (Math.random() - 0.5) * 0.08;
        const jitterY = (Math.random() - 0.5) * 0.08;
        const jitterZ = (Math.random() - 0.5) * 0.08;
        const pos = this.tmpWorld.copy(lastPoint.worldPos);
        pos.x += jitterX;
        pos.y += jitterY;
        pos.z += jitterZ;

        const vel = this.tmpUnprojectDir;
        vel.set(
          (Math.random() - 0.5) * 0.35,
          (Math.random() - 0.5) * 0.35,
          -0.25 - Math.random() * 0.35
        );
        vel.multiplyScalar(0.55 + v * 1.25);

        const c = this.tmpSparkleColor.copy(glow);
        c.lerp(this.tmpWhiteColor, 0.35);

        const size = sizeBase * (0.65 + Math.random() * 0.55) * (0.8 + v);
        const life = 0.08 + Math.random() * 0.12;

        this.sparkleSystem.spawn(pos, vel, c, size, life);
      }
    }
  }

  /**
   * Use a palm-centric anchor so the trail follows the whole hand,
   * not just the index fingertip. Bias toward palm base + fingertips
   * for stability while still feeling responsive.
   */
  private getHandAnchor(landmarks: NormalizedLandmark[]): {
    x: number;
    y: number;
  } {
    const indices = [0, 5, 9, 13, 17, 8, 12];
    let sumX = 0;
    let sumY = 0;

    for (const idx of indices) {
      const lm = landmarks[idx];
      sumX += 1 - lm.x; // mirror horizontally to match rendering
      sumY += lm.y;
    }

    const inv = 1 / indices.length;
    return {
      x: sumX * inv * this.width,
      y: sumY * inv * this.height,
    };
  }

  private updateTrail(
    trail: TrackedTrail,
    screenX: number,
    screenY: number,
    timestamp: number
  ): void {
    const t = timestamp / 1000;
    const fx = trail.filterX.filterValue(screenX, t);
    const fy = trail.filterY.filterValue(screenY, t);

    const dx = fx - trail.lastScreenX;
    const dy = fy - trail.lastScreenY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const timeDeltaMs = Math.max(timestamp - trail.lastUpdateTime, 1);
    const rawVelocity = (distance / timeDeltaMs) * 1000;
    const scaledVelocity = rawVelocity * this.config.velocityScale;

    // Apply exponential smoothing to prevent jitter
    const smoothedVelocity =
      trail.lastVelocity * (1 - this.config.smoothingFactor) +
      scaledVelocity * this.config.smoothingFactor;

    const normalizedVelocity = Math.min(smoothedVelocity / 2400.0, 1.0);

    // Update trail velocity for next frame
    trail.lastVelocity = smoothedVelocity;

    // Add interpolated points for smooth trails during fast movement
    if (trail.isActive && distance > 15) {
      const steps = Math.min(Math.ceil(distance / 12), 6);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const interpX = trail.lastScreenX + dx * t;
        const interpY = trail.lastScreenY + dy * t;
        this.addPoint(trail, interpX, interpY, timestamp, normalizedVelocity);
      }
    } else if (distance > 5 || !trail.isActive) {
      this.addPoint(trail, fx, fy, timestamp, normalizedVelocity);
    }

    trail.lastScreenX = fx;
    trail.lastScreenY = fy;
    trail.lastUpdateTime = timestamp;
    trail.isActive = true;
  }

  private addPoint(
    trail: TrackedTrail,
    screenX: number,
    screenY: number,
    timestamp: number,
    velocity: number
  ): void {
    const worldPos = this.worldPosPool.pop() ?? new THREE.Vector3();
    this.screenToWorldInto(screenX, screenY, worldPos);

    trail.points.push({
      screenX,
      screenY,
      worldPos,
      timestamp,
      velocity,
    });

    while (trail.points.length > this.config.maxPoints) {
      const removed = trail.points.shift();
      if (removed) this.worldPosPool.push(removed.worldPos);
    }
  }

  private fadeTrail(trail: TrackedTrail): void {
    trail.isActive = false;
    const removeCount = Math.max(1, Math.floor(trail.points.length * 0.25));
    const removed = trail.points.splice(0, removeCount);
    for (const p of removed) this.worldPosPool.push(p.worldPos);
  }

  private screenToWorldInto(screenX: number, screenY: number, out: THREE.Vector3): void {
    const ndcX = (screenX / this.width) * 2 - 1;
    const ndcY = -(screenY / this.height) * 2 + 1;

    this.tmpNdc.set(ndcX, ndcY, 0.5);
    this.tmpNdc.unproject(this.camera);

    this.tmpUnprojectDir.copy(this.tmpNdc).sub(this.camera.position).normalize();

    out.copy(this.camera.position).add(this.tmpUnprojectDir.multiplyScalar(4));
  }

  private updateGeometry(trail: TrackedTrail): void {
    if (trail.points.length < 2) {
      trail.mesh.visible = false;
      trail.geometry.setDrawRange(0, 0);
      return;
    }

    trail.mesh.visible = true;

    const posAttr = trail.geometry.attributes.position as THREE.BufferAttribute;
    const alphaAttr = trail.geometry.attributes.aAlpha as THREE.BufferAttribute;
    const progressAttr = trail.geometry.attributes.aProgress as THREE.BufferAttribute;
    const distanceAttr = trail.geometry.attributes.aDistanceFromCenter as THREE.BufferAttribute;
    const velocityAttr = trail.geometry.attributes.aVelocity as THREE.BufferAttribute;

    const positions = posAttr.array as Float32Array;
    const alphas = alphaAttr.array as Float32Array;
    const progresses = progressAttr.array as Float32Array;
    const distances = distanceAttr.array as Float32Array;
    const velocities = velocityAttr.array as Float32Array;

    const points = trail.points;
    const startIndex = Math.max(0, points.length - this.maxRenderPoints);
    const pointCount = points.length - startIndex;
    if (pointCount < 2) {
      trail.mesh.visible = false;
      trail.geometry.setDrawRange(0, 0);
      return;
    }
    const width = this.config.ribbonWidth;
    this.camera.getWorldDirection(this.tmpCameraDir);

    for (let i = 0; i < pointCount; i++) {
      const srcIndex = startIndex + i;
      const p = points[srcIndex].worldPos;
      const progress = i / (pointCount - 1);
      const velocity = points[srcIndex].velocity || 0;

      // Camera-facing perpendicular for a true ribbon look
      const dir = this.tmpDir;
      if (i < pointCount - 1) {
        dir.subVectors(points[srcIndex + 1].worldPos, p);
      } else if (i > 0) {
        dir.subVectors(p, points[srcIndex - 1].worldPos);
      }
      dir.normalize();

      const perp = this.tmpPerp.crossVectors(dir, this.tmpCameraDir);
      if (perp.lengthSq() < 1e-5) {
        perp.set(0, 1, 0);
      }
      perp.normalize();

      // Enhanced width with velocity boost and taper
      const velocityWidthBoost = THREE.MathUtils.lerp(0.9, 1.5, velocity);
      const taperWidth = width * velocityWidthBoost * (1 + 0.85 * Math.pow(progress, 0.85));
      const alpha = Math.pow(progress, 1.85);

      const i6 = i * 6;
      positions[i6] = p.x + perp.x * taperWidth;
      positions[i6 + 1] = p.y + perp.y * taperWidth;
      positions[i6 + 2] = p.z + perp.z * taperWidth * 0.15;
      positions[i6 + 3] = p.x - perp.x * taperWidth;
      positions[i6 + 4] = p.y - perp.y * taperWidth;
      positions[i6 + 5] = p.z - perp.z * taperWidth * 0.15;

      const i2 = i * 2;
      alphas[i2] = alpha;
      alphas[i2 + 1] = alpha;
      progresses[i2] = progress;
      progresses[i2 + 1] = progress;

      // Distance from center: 0 at center, 1 at edge
      distances[i2] = -1.0;
      distances[i2 + 1] = 1.0;

      // Velocity attribute (same for both vertices of this segment)
      velocities[i2] = velocity;
      velocities[i2 + 1] = velocity;
    }

    // Zero remaining vertices
    for (let i = pointCount * 2; i < this.config.maxPoints * 2; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      alphas[i] = 0;
      progresses[i] = 0;
      distances[i] = 0;
      velocities[i] = 0;
    }

    trail.geometry.setDrawRange(0, (pointCount - 1) * 6);

    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    progressAttr.needsUpdate = true;
    distanceAttr.needsUpdate = true;
    velocityAttr.needsUpdate = true;
  }

  /**
   * Get trail segments for collision detection
   */
  getTrailSegments(): Map<string, TrailPoint2D[]> {
    const segments = new Map<string, TrailPoint2D[]>();

    for (let i = 0; i < this.trails.length; i++) {
      const trail = this.trails[i];
      if (trail.points.length >= 2 && trail.isActive) {
        const points: TrailPoint2D[] = trail.points.map((p) => ({
          x: p.screenX,
          y: p.screenY,
          timestamp: p.timestamp,
          opacity: 1.0,
        }));
        segments.set(`trail_${trail.id}`, points);
      }
    }

    return segments;
  }

  getTrailPointCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (let i = 0; i < this.trails.length; i++) {
      counts[`trail_${i}`] = this.trails[i].points.length;
    }
    return counts;
  }

  clear(): void {
    for (const trail of this.trails) {
      for (const p of trail.points) this.worldPosPool.push(p.worldPos);
      trail.points = [];
      trail.isActive = false;
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    for (const trail of this.trails) {
      for (const p of trail.points) this.worldPosPool.push(p.worldPos);
      this.scene.remove(trail.mesh);
      trail.geometry.dispose();
    }
    this.material.dispose();
    this.sparkleSystem.dispose(this.scene);
    this.trails = [];
    console.log('[HandTrailRenderer] Disposed');
  }
}
