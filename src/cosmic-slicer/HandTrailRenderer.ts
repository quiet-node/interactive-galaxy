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
import type {
  HandLandmarkerResult,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision';

// Cinematic ribbon shader (energy blade look)
const ribbonVertexShader = /* glsl */ `
  attribute float aAlpha;
  attribute float aProgress;
  varying float vAlpha;
  varying float vProgress;
  
  void main() {
    vAlpha = aAlpha;
    vProgress = aProgress;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ribbonFragmentShader = /* glsl */ `
  uniform vec3 uCoreColor;
  uniform vec3 uGlowColor;
  uniform float uTime;
  
  varying float vAlpha;
  varying float vProgress;
  
  // Compact hash/noise for shimmering plasma
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }
  
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  
  void main() {
    if (vAlpha < 0.01) discard;
    
    // Head-heavy glow like a sci-fi saber
    float head = smoothstep(0.6, 1.0, vProgress);
    float tail = 1.0 - smoothstep(0.0, 0.18, vProgress);
    
    // Plasma shimmer
    float shimmer = noise(vec2(vProgress * 14.0, uTime * 1.8)) * 0.6;
    float spark = noise(vec2(vProgress * 40.0 + uTime * 3.5, uTime * 2.1));
    float pulse = 0.85 + 0.15 * sin(uTime * 5.5 + vProgress * 9.0);
    
    // Core vs aura colors
    vec3 core = mix(uCoreColor * 1.2, uGlowColor * 0.8, 1.0 - vProgress * 0.35);
    vec3 aura = mix(uGlowColor * 1.8, uCoreColor * 0.4, head);
    
    vec3 color = mix(aura, core, 0.55 + 0.45 * head);
    color += uGlowColor * (shimmer * 0.65 + spark * 0.35);
    color *= pulse;
    
    float alpha = vAlpha;
    alpha *= (0.35 + 0.65 * head);       // brighter head
    alpha *= (0.55 + 0.45 * tail);       // preserve tail hint
    
    gl_FragColor = vec4(color, alpha);
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
 * Trail point with screen and world position
 */
interface TrailPoint {
  screenX: number;
  screenY: number;
  worldPos: THREE.Vector3;
  timestamp: number;
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
  isActive: boolean;
  geometry: THREE.BufferGeometry;
  mesh: THREE.Mesh;
}

/**
 * Configuration
 */
export interface CosmicTrailConfig {
  maxPoints: number;
  ribbonWidth: number;
  trailLength: number;
  coreColor: THREE.Color;
  glowColor: THREE.Color;
}

const DEFAULT_CONFIG: CosmicTrailConfig = {
  maxPoints: 64,
  ribbonWidth: 0.1,
  trailLength: 22,
  coreColor: new THREE.Color(0xffffff),
  glowColor: new THREE.Color(0x4488ff),
};

// Maximum distance (in pixels) to match a new detection to existing trail
const MATCH_THRESHOLD = 150;
// Time (ms) after which an unmatched trail starts fading
const FADE_DELAY = 100;
// Maximum number of simultaneous trails
const MAX_TRAILS = 2;

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

    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = (): void => {
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
  };

  /**
   * Create a new trail
   */
  private createTrail(screenX: number, screenY: number): TrackedTrail {
    const maxVerts = this.config.maxPoints * 2;
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3)
    );
    geometry.setAttribute(
      'aAlpha',
      new THREE.BufferAttribute(new Float32Array(maxVerts), 1)
    );
    geometry.setAttribute(
      'aProgress',
      new THREE.BufferAttribute(new Float32Array(maxVerts), 1)
    );

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
    const dx = screenX - trail.lastScreenX;
    const dy = screenY - trail.lastScreenY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Add interpolated points for smooth trails during fast movement
    if (trail.isActive && distance > 15) {
      const steps = Math.min(Math.ceil(distance / 12), 6);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const interpX = trail.lastScreenX + dx * t;
        const interpY = trail.lastScreenY + dy * t;
        this.addPoint(trail, interpX, interpY, timestamp);
      }
    } else if (distance > 5 || !trail.isActive) {
      this.addPoint(trail, screenX, screenY, timestamp);
    }

    trail.lastScreenX = screenX;
    trail.lastScreenY = screenY;
    trail.lastUpdateTime = timestamp;
    trail.isActive = true;
  }

  private addPoint(
    trail: TrackedTrail,
    screenX: number,
    screenY: number,
    timestamp: number
  ): void {
    // Light smoothing to fight jitter and keep the ribbon elegant
    const target = this.screenToWorld(screenX, screenY);
    const last = trail.points[trail.points.length - 1];
    const worldPos =
      last && trail.isActive ? last.worldPos.clone().lerp(target, 0.6) : target;

    trail.points.push({
      screenX,
      screenY,
      worldPos,
      timestamp,
    });

    while (trail.points.length > this.config.maxPoints) {
      trail.points.shift();
    }
  }

  private fadeTrail(trail: TrackedTrail): void {
    trail.isActive = false;
    const removeCount = Math.max(1, Math.floor(trail.points.length * 0.25));
    trail.points.splice(0, removeCount);
  }

  private screenToWorld(screenX: number, screenY: number): THREE.Vector3 {
    const ndcX = (screenX / this.width) * 2 - 1;
    const ndcY = -(screenY / this.height) * 2 + 1;

    const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
    vector.unproject(this.camera);

    const dir = vector.sub(this.camera.position).normalize();
    return this.camera.position.clone().add(dir.multiplyScalar(4));
  }

  private updateGeometry(trail: TrackedTrail): void {
    if (trail.points.length < 2) {
      trail.mesh.visible = false;
      return;
    }

    trail.mesh.visible = true;

    const posAttr = trail.geometry.attributes.position as THREE.BufferAttribute;
    const alphaAttr = trail.geometry.attributes.aAlpha as THREE.BufferAttribute;
    const progressAttr = trail.geometry.attributes
      .aProgress as THREE.BufferAttribute;

    const positions = posAttr.array as Float32Array;
    const alphas = alphaAttr.array as Float32Array;
    const progresses = progressAttr.array as Float32Array;

    const points = trail.points;
    const width = this.config.ribbonWidth;
    const cameraDir = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDir);

    for (let i = 0; i < points.length; i++) {
      const p = points[i].worldPos;
      const progress = i / (points.length - 1);

      // Camera-facing perpendicular for a true ribbon look
      const dir = new THREE.Vector3();
      if (i < points.length - 1) {
        dir.subVectors(points[i + 1].worldPos, p);
      } else if (i > 0) {
        dir.subVectors(p, points[i - 1].worldPos);
      }
      dir.normalize();

      const perp = new THREE.Vector3().crossVectors(dir, cameraDir);
      if (perp.lengthSq() < 1e-5) {
        perp.set(0, 1, 0);
      }
      perp.normalize();

      const velocityWidthBoost = THREE.MathUtils.lerp(0.9, 1.35, progress);
      const taperWidth =
        width * velocityWidthBoost * (0.35 + 0.85 * Math.pow(progress, 0.85));
      const alpha = Math.pow(progress, 0.9);

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
    }

    // Zero remaining vertices
    for (let i = points.length * 2; i < this.config.maxPoints * 2; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      alphas[i] = 0;
      progresses[i] = 0;
    }

    // Build indices
    const indices: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
    trail.geometry.setIndex(indices);

    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    progressAttr.needsUpdate = true;
    trail.geometry.computeBoundingSphere();
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
      trail.points = [];
      trail.isActive = false;
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    for (const trail of this.trails) {
      this.scene.remove(trail.mesh);
      trail.geometry.dispose();
    }
    this.material.dispose();
    this.trails = [];
    console.log('[HandTrailRenderer] Disposed');
  }
}
