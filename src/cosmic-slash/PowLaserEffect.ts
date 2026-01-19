/**
 * PowLaserEffect Module
 * Stunning cosmic laser beam effect between two hand positions
 *
 * Visual Design:
 * - White-hot core with electric cyan and magenta energy field
 * - Animated energy pulses traveling along the beam
 * - Particle sparks emitting from the beam
 * - Connection orbs at each hand position
 */

import * as THREE from 'three';

// Laser beam vertex shader
const laserVertexShader = /* glsl */ `
  attribute float aDistance;
  
  varying float vDistance;
  varying vec2 vUv;
  
  void main() {
    vDistance = aDistance;
    vUv = uv;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Laser beam fragment shader - dramatic energy beam effect
const laserFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uCoreColor;
  uniform vec3 uInnerGlowColor;
  uniform vec3 uOuterGlowColor;
  
  varying float vDistance;
  varying vec2 vUv;
  
  // Simple noise function for shimmer
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // 2D Noise for electricity
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float res = mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
                    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    return res;
  }
  
  void main() {
    // Distance from center of beam (vUv.y goes from 0 to 1 across width)
    float d = abs(vUv.y - 0.5) * 2.0;
    
    // Core beam - ultra bright center
    float coreWidth = 0.18;
    float core = smoothstep(coreWidth, 0.0, d);
    vec3 coreColor = uCoreColor * core * 8.0 * uIntensity;
    
    // Inner energy field
    float innerWidth = 0.45;
    float inner = exp(-d * d * 8.0);
    
    // Animated energy pulses along the beam
    float pulseFreq = 20.0;
    float pulseSpeed = 18.0;
    float pulse = sin(vUv.x * pulseFreq - uTime * pulseSpeed) * 0.5 + 0.5;
    float pulse2 = sin(vUv.x * pulseFreq * 0.7 + uTime * pulseSpeed * 0.8) * 0.5 + 0.5;
    float combinedPulse = mix(pulse, pulse2, 0.5);
    
    // Electricity / Lightning effect
    float elecTime = uTime * 25.0;
    float elecNoise = noise(vec2(vUv.x * 15.0 - elecTime, vUv.y * 10.0));
    float elecLine = smoothstep(0.4, 0.5, elecNoise) * smoothstep(0.6, 0.5, elecNoise);
    vec3 elecColor = vec3(1.0, 0.9, 0.5) * elecLine * 5.0 * uIntensity; // Yellow lightning
    
    // Fire/Plasma mixing
    float plasmaNoise = noise(vec2(vUv.x * 8.0 - uTime * 12.0, vUv.y * 5.0));
    vec3 mixedGlow = mix(uInnerGlowColor, uOuterGlowColor, plasmaNoise);

    vec3 innerColor = mixedGlow * inner * (4.5 + combinedPulse * 2.5) * uIntensity;
    
    // Outer glow field
    float outer = exp(-d * d * 3.0);
    vec3 outerColor = uOuterGlowColor * outer * 2.5 * uIntensity;
    
    // Edge shimmer effect
    float shimmer = hash(vec2(vUv.x * 100.0 + uTime * 5.0, d * 50.0));
    float shimmerMask = smoothstep(0.3, 0.6, d) * smoothstep(0.8, 0.5, d);
    vec3 shimmerColor = uInnerGlowColor * shimmer * shimmerMask * 3.0 * uIntensity;
    
    // Combine all layers
    vec3 finalColor = coreColor + innerColor + outerColor + shimmerColor + elecColor;
    
    // Alpha calculation
    float alpha = max(core * 0.98, max(inner * 0.9, outer * 0.6));
    alpha *= uIntensity;
    
    // Fade at beam ends
    float endFade = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);
    alpha *= endFade;
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// Connection orb vertex shader
const orbVertexShader = /* glsl */ `
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Connection orb fragment shader
const orbFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColor;
  
  varying vec2 vUv;
  
  void main() {
    vec2 center = vUv - 0.5;
    float d = length(center);
    
    // Core glow
    float core = exp(-d * d * 20.0);
    vec3 coreColor = vec3(1.0, 1.0, 0.98) * core * 6.0;
    
    // Outer ring
    float ring = exp(-d * d * 8.0);
    vec3 ringColor = uColor * ring * 3.0;
    
    // Pulsing effect
    float pulse = sin(uTime * 8.0) * 0.15 + 0.85;
    
    vec3 finalColor = (coreColor + ringColor) * pulse * uIntensity;
    float alpha = max(core, ring * 0.7) * uIntensity;
    
    if (alpha < 0.01) discard;
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

/**
 * Configuration for the laser effect
 */
export interface PowLaserEffectConfig {
  beamWidth: number;
  coreColor: THREE.Color;
  innerGlowColor: THREE.Color;
  outerGlowColor: THREE.Color;
  intensity: number;
  collisionRadius: number;
}

const DEFAULT_CONFIG: PowLaserEffectConfig = {
  beamWidth: 0.85,
  coreColor: new THREE.Color(1.0, 1.0, 0.8), // Pale Yellow
  innerGlowColor: new THREE.Color(1.0, 0.4, 0.0), // Bright Orange
  outerGlowColor: new THREE.Color(0.8, 0.0, 0.1), // Deep Red
  intensity: 1.0,
  collisionRadius: 0.5,
};

/**
 * PowLaserEffect - Renders the cosmic laser beam between hands
 */
export class PowLaserEffect {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly config: PowLaserEffectConfig;

  // Beam geometry and material
  private beamGeometry: THREE.BufferGeometry | null = null;
  private beamMaterial: THREE.ShaderMaterial | null = null;
  private beamMesh: THREE.Mesh | null = null;

  // Connection orbs at each hand
  private leftOrb: THREE.Mesh | null = null;
  private rightOrb: THREE.Mesh | null = null;
  private orbGeometry: THREE.PlaneGeometry | null = null;
  private orbMaterial: THREE.ShaderMaterial | null = null;

  // State
  private isActive: boolean = false;
  private leftHandPos: THREE.Vector3 = new THREE.Vector3();
  private rightHandPos: THREE.Vector3 = new THREE.Vector3();
  private time: number = 0;
  private currentBeamWidth: number = 0;

  // Spark particles
  private sparkGeometry: THREE.BufferGeometry | null = null;
  private sparkMaterial: THREE.PointsMaterial | null = null;
  private sparkMesh: THREE.Points | null = null;
  private sparkPositions: Float32Array | null = null;
  private sparkVelocities: Float32Array | null = null;
  private sparkAlphas: Float32Array | null = null;
  private readonly maxSparks: number = 50;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    config: Partial<PowLaserEffectConfig> = {}
  ) {
    this.scene = scene;
    this.camera = camera;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentBeamWidth = this.config.beamWidth;

    this.initializeBeam();
    this.initializeOrbs();
    this.initializeSparks();
  }

  /**
   * Initialize the beam geometry and material
   */
  private initializeBeam(): void {
    // Create a ribbon geometry that we'll update each frame
    const segments = 32;
    const positions = new Float32Array(segments * 2 * 3);
    const uvs = new Float32Array(segments * 2 * 2);
    const distances = new Float32Array(segments * 2);
    const indices: number[] = [];

    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);

      // Top vertex
      uvs[i * 4] = t;
      uvs[i * 4 + 1] = 0;
      distances[i * 2] = t;

      // Bottom vertex
      uvs[i * 4 + 2] = t;
      uvs[i * 4 + 3] = 1;
      distances[i * 2 + 1] = t;

      // Create quad indices
      if (i < segments - 1) {
        const topLeft = i * 2;
        const topRight = (i + 1) * 2;
        const bottomLeft = i * 2 + 1;
        const bottomRight = (i + 1) * 2 + 1;

        indices.push(topLeft, bottomLeft, topRight);
        indices.push(topRight, bottomLeft, bottomRight);
      }
    }

    this.beamGeometry = new THREE.BufferGeometry();
    this.beamGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.beamGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.beamGeometry.setAttribute('aDistance', new THREE.BufferAttribute(distances, 1));
    this.beamGeometry.setIndex(indices);

    this.beamMaterial = new THREE.ShaderMaterial({
      vertexShader: laserVertexShader,
      fragmentShader: laserFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: this.config.intensity },
        uCoreColor: { value: this.config.coreColor },
        uInnerGlowColor: { value: this.config.innerGlowColor },
        uOuterGlowColor: { value: this.config.outerGlowColor },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.beamMesh = new THREE.Mesh(this.beamGeometry, this.beamMaterial);
    this.beamMesh.visible = false;
    this.beamMesh.renderOrder = 50;
    this.beamMesh.frustumCulled = false;

    this.scene.add(this.beamMesh);
  }

  /**
   * Initialize the connection orbs
   */
  private initializeOrbs(): void {
    this.orbGeometry = new THREE.PlaneGeometry(0.5, 0.5);

    this.orbMaterial = new THREE.ShaderMaterial({
      vertexShader: orbVertexShader,
      fragmentShader: orbFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: this.config.intensity },
        uColor: { value: this.config.innerGlowColor },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.leftOrb = new THREE.Mesh(this.orbGeometry, this.orbMaterial);
    this.leftOrb.visible = false;
    this.leftOrb.renderOrder = 51;

    this.rightOrb = new THREE.Mesh(this.orbGeometry, this.orbMaterial.clone());
    this.rightOrb.visible = false;
    this.rightOrb.renderOrder = 51;

    this.scene.add(this.leftOrb);
    this.scene.add(this.rightOrb);
  }

  /**
   * Initialize spark particles
   */
  private initializeSparks(): void {
    this.sparkPositions = new Float32Array(this.maxSparks * 3);
    this.sparkVelocities = new Float32Array(this.maxSparks * 3);
    this.sparkAlphas = new Float32Array(this.maxSparks);

    this.sparkGeometry = new THREE.BufferGeometry();
    this.sparkGeometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));

    this.sparkMaterial = new THREE.PointsMaterial({
      color: 0xffaa00, // Orange-Gold
      size: 0.12,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.9,
    });

    this.sparkMesh = new THREE.Points(this.sparkGeometry, this.sparkMaterial);
    this.sparkMesh.visible = false;
    this.sparkMesh.renderOrder = 52;

    this.scene.add(this.sparkMesh);
  }

  /**
   * Activate the laser effect
   */
  activate(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.time = 0;

    if (this.beamMesh) this.beamMesh.visible = true;
    if (this.leftOrb) this.leftOrb.visible = true;
    if (this.rightOrb) this.rightOrb.visible = true;
    if (this.sparkMesh) this.sparkMesh.visible = true;

    // Reset sparks
    if (this.sparkAlphas) {
      this.sparkAlphas.fill(0);
    }
  }

  /**
   * Deactivate the laser effect
   */
  deactivate(): void {
    if (!this.isActive) return;

    this.isActive = false;

    if (this.beamMesh) this.beamMesh.visible = false;
    if (this.leftOrb) this.leftOrb.visible = false;
    if (this.rightOrb) this.rightOrb.visible = false;
    if (this.sparkMesh) this.sparkMesh.visible = false;
  }

  /**
   * Check if the laser is active
   */
  getIsActive(): boolean {
    return this.isActive;
  }

  /**
   * Set hand positions (in world space)
   */
  setHandPositions(leftHand: THREE.Vector3, rightHand: THREE.Vector3): void {
    this.leftHandPos.copy(leftHand);
    this.rightHandPos.copy(rightHand);
  }

  /**
   * Update the laser effect
   */
  update(deltaTime: number): void {
    if (!this.isActive) return;

    this.time += deltaTime;

    // Dynamic Width Calculation
    const dist = this.leftHandPos.distanceTo(this.rightHandPos);
    // Map distance (0.2 - 1.5) to width (0.4 - 1.5)
    const clampedDist = Math.max(0.2, Math.min(2.0, dist));
    const targetWidth = 0.3 + clampedDist * 0.6;

    // Smooth lerp
    this.currentBeamWidth += (targetWidth - this.currentBeamWidth) * deltaTime * 5.0;

    // Update shader uniforms
    if (this.beamMaterial) {
      this.beamMaterial.uniforms.uTime.value = this.time;
    }
    if (this.orbMaterial) {
      this.orbMaterial.uniforms.uTime.value = this.time;
    }

    // Update beam geometry
    this.updateBeamGeometry();

    // Update orb positions
    this.updateOrbs();

    // Update sparks
    this.updateSparks(deltaTime);
  }

  /**
   * Update the beam ribbon geometry
   */
  private updateBeamGeometry(): void {
    if (!this.beamGeometry || !this.beamMesh) return;

    const posAttr = this.beamGeometry.getAttribute('position');
    if (!posAttr) return;

    const positions = posAttr.array as Float32Array;
    const segments = positions.length / 6;

    // Calculate beam direction and perpendicular
    const direction = new THREE.Vector3()
      .subVectors(this.rightHandPos, this.leftHandPos)
      .normalize();

    // Get perpendicular in screen space
    const cameraDir = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDir);

    const perpendicular = new THREE.Vector3()
      .crossVectors(direction, cameraDir)
      .normalize()
      .multiplyScalar(this.currentBeamWidth * 0.5);

    const temp = new THREE.Vector3();

    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);

      // Interpolate position along the beam
      temp.lerpVectors(this.leftHandPos, this.rightHandPos, t);

      // Add slight wave effect
      const wave = Math.sin(t * Math.PI * 4 + this.time * 6) * 0.02;
      temp.add(perpendicular.clone().multiplyScalar(wave * (1 - Math.abs(t - 0.5) * 2)));

      // Top vertex (offset by perpendicular)
      positions[i * 6] = temp.x + perpendicular.x;
      positions[i * 6 + 1] = temp.y + perpendicular.y;
      positions[i * 6 + 2] = temp.z + perpendicular.z;

      // Bottom vertex (offset by negative perpendicular)
      positions[i * 6 + 3] = temp.x - perpendicular.x;
      positions[i * 6 + 4] = temp.y - perpendicular.y;
      positions[i * 6 + 5] = temp.z - perpendicular.z;
    }

    posAttr.needsUpdate = true;
    this.beamGeometry.computeBoundingSphere();
  }

  /**
   * Update orb positions
   */
  private updateOrbs(): void {
    if (this.leftOrb) {
      this.leftOrb.position.copy(this.leftHandPos);
      this.leftOrb.lookAt(this.camera.position);
    }

    if (this.rightOrb) {
      this.rightOrb.position.copy(this.rightHandPos);
      this.rightOrb.lookAt(this.camera.position);
    }
  }

  /**
   * Update spark particles
   */
  private updateSparks(deltaTime: number): void {
    if (!this.sparkPositions || !this.sparkVelocities || !this.sparkAlphas || !this.sparkGeometry) {
      return;
    }

    const posAttr = this.sparkGeometry.getAttribute('position');
    if (!posAttr) return;

    // Spawn new sparks
    for (let i = 0; i < this.maxSparks; i++) {
      if (this.sparkAlphas[i] <= 0 && Math.random() < 0.35) {
        // Random position along the beam
        const t = Math.random();
        const pos = new THREE.Vector3().lerpVectors(this.leftHandPos, this.rightHandPos, t);

        // Add random offset
        pos.x += (Math.random() - 0.5) * 0.2;
        pos.y += (Math.random() - 0.5) * 0.2;
        pos.z += (Math.random() - 0.5) * 0.1;

        this.sparkPositions[i * 3] = pos.x;
        this.sparkPositions[i * 3 + 1] = pos.y;
        this.sparkPositions[i * 3 + 2] = pos.z;

        // Random velocity - More explosive
        this.sparkVelocities[i * 3] = (Math.random() - 0.5) * 4.0;
        this.sparkVelocities[i * 3 + 1] = (Math.random() - 0.5) * 4.0;
        this.sparkVelocities[i * 3 + 2] = (Math.random() - 0.5) * 2.0;

        this.sparkAlphas[i] = 1.0;
      }
    }

    // Update existing sparks
    for (let i = 0; i < this.maxSparks; i++) {
      if (this.sparkAlphas[i] > 0) {
        // Update position
        this.sparkPositions[i * 3] += this.sparkVelocities[i * 3] * deltaTime;
        this.sparkPositions[i * 3 + 1] += this.sparkVelocities[i * 3 + 1] * deltaTime;
        this.sparkPositions[i * 3 + 2] += this.sparkVelocities[i * 3 + 2] * deltaTime;

        // Fade out
        this.sparkAlphas[i] -= deltaTime * 2.5;
        if (this.sparkAlphas[i] < 0) this.sparkAlphas[i] = 0;

        // Apply drag
        this.sparkVelocities[i * 3] *= 0.95;
        this.sparkVelocities[i * 3 + 1] *= 0.95;
        this.sparkVelocities[i * 3 + 2] *= 0.95;
      }
    }

    posAttr.needsUpdate = true;
  }

  /**
   * Get the laser line segment for collision detection
   */
  getLaserSegment(): { start: THREE.Vector3; end: THREE.Vector3 } | null {
    if (!this.isActive) return null;

    return {
      start: this.leftHandPos.clone(),
      end: this.rightHandPos.clone(),
    };
  }

  /**
   * Get the collision radius
   */
  getCollisionRadius(): number {
    return this.config.collisionRadius;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.deactivate();

    if (this.beamMesh) {
      this.scene.remove(this.beamMesh);
    }
    if (this.leftOrb) {
      this.scene.remove(this.leftOrb);
    }
    if (this.rightOrb) {
      this.scene.remove(this.rightOrb);
    }
    if (this.sparkMesh) {
      this.scene.remove(this.sparkMesh);
    }

    this.beamGeometry?.dispose();
    this.beamMaterial?.dispose();
    this.orbGeometry?.dispose();
    this.orbMaterial?.dispose();
    (this.rightOrb?.material as THREE.Material)?.dispose();
    this.sparkGeometry?.dispose();
    this.sparkMaterial?.dispose();

    this.beamGeometry = null;
    this.beamMaterial = null;
    this.beamMesh = null;
    this.leftOrb = null;
    this.rightOrb = null;
    this.orbGeometry = null;
    this.orbMaterial = null;
    this.sparkGeometry = null;
    this.sparkMaterial = null;
    this.sparkMesh = null;
    this.sparkPositions = null;
    this.sparkVelocities = null;
    this.sparkAlphas = null;
  }
}
