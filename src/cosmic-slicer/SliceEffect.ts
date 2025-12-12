/**
 * SliceEffect Module
 * Premium particle explosion effects when objects are sliced
 *
 * Features:
 * - GPU-accelerated particles
 * - Color-matched explosions
 * - Velocity-based intensity
 * - Object pooling for performance
 */

import * as THREE from 'three';
import { SliceEffectConfig, DEFAULT_SLICE_EFFECT_CONFIG } from './types';

// Optimized vertex shader
const explosionVertexShader = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  attribute vec3 aColor;
  
  varying float vAlpha;
  varying vec3 vColor;
  
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    float perspectiveSize = aSize * (250.0 / -mvPosition.z);
    gl_PointSize = clamp(perspectiveSize, 1.0, 15.0);
  }
`;

// Soft particle fragment shader
const explosionFragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  
  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    
    if (dist > 0.5) discard;
    
    // Soft circular falloff
    float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;
    
    if (alpha < 0.01) discard;
    
    // Additive glow effect
    vec3 color = vColor * (1.0 + alpha * 0.5);
    
    gl_FragColor = vec4(color, alpha);
  }
`;

interface ExplosionInstance {
  id: number;
  startTime: number;
  startIndex: number;
  count: number;
  origin: THREE.Vector3;
  color: THREE.Color;
  active: boolean;
}

/**
 * SliceEffect - GPU-accelerated particle explosions
 */
export class SliceEffect {
  private scene: THREE.Scene;
  private config: SliceEffectConfig;

  // Three.js objects
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private points: THREE.Points;

  // Pool management
  private maxExplosions: number;
  private totalParticles: number;
  private explosions: ExplosionInstance[] = [];
  private nextId: number = 0;

  // Particle data
  private velocities: Float32Array;
  private initialAlphas: Float32Array;
  private lifetimeOffsets: Float32Array;

  // Attributes
  private positionAttr: THREE.BufferAttribute;
  private alphaAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;

  private isActive: boolean = false;

  constructor(
    scene: THREE.Scene,
    config: Partial<SliceEffectConfig> = {},
    maxExplosions: number = 10
  ) {
    this.scene = scene;
    this.config = { ...DEFAULT_SLICE_EFFECT_CONFIG, ...config };
    this.maxExplosions = maxExplosions;
    this.totalParticles = this.config.particleCount * maxExplosions;

    // Initialize data arrays
    this.velocities = new Float32Array(this.totalParticles * 3);
    this.initialAlphas = new Float32Array(this.totalParticles);
    this.lifetimeOffsets = new Float32Array(this.totalParticles);

    // Create geometry
    this.geometry = this.createGeometry();
    this.material = this.createMaterial();
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;

    // Get attribute references
    this.positionAttr = this.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    this.alphaAttr = this.geometry.getAttribute(
      'aAlpha'
    ) as THREE.BufferAttribute;
    this.sizeAttr = this.geometry.getAttribute(
      'aSize'
    ) as THREE.BufferAttribute;
    this.colorAttr = this.geometry.getAttribute(
      'aColor'
    ) as THREE.BufferAttribute;

    this.scene.add(this.points);
  }

  private createGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(this.totalParticles * 3);
    const alphas = new Float32Array(this.totalParticles);
    const sizes = new Float32Array(this.totalParticles);
    const colors = new Float32Array(this.totalParticles * 3);

    // Initialize
    alphas.fill(0);
    sizes.fill(this.config.particleSize);
    for (let i = 0; i < this.totalParticles; i++) {
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    return geometry;
  }

  private createMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: explosionVertexShader,
      fragmentShader: explosionFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  /**
   * Trigger explosion at position with color
   */
  trigger(
    position: THREE.Vector3,
    color: THREE.Color,
    velocityMultiplier: number = 1
  ): number {
    // Find available slot
    let slot = -1;
    for (let i = 0; i < this.maxExplosions; i++) {
      if (!this.explosions[i] || !this.explosions[i].active) {
        slot = i;
        break;
      }
    }

    // Recycle oldest if no slot
    if (slot === -1) {
      let oldestTime = Infinity;
      for (let i = 0; i < this.explosions.length; i++) {
        if (this.explosions[i].startTime < oldestTime) {
          oldestTime = this.explosions[i].startTime;
          slot = i;
        }
      }
      if (slot >= 0 && this.explosions[slot]) {
        this.deactivate(this.explosions[slot]);
      }
    }

    if (slot === -1) slot = 0;

    const explosion: ExplosionInstance = {
      id: this.nextId++,
      startTime: performance.now() / 1000,
      startIndex: slot * this.config.particleCount,
      count: this.config.particleCount,
      origin: position.clone(),
      color: color.clone(),
      active: true,
    };

    this.initializeParticles(explosion, velocityMultiplier);

    if (this.explosions.length <= slot) {
      this.explosions.push(explosion);
    } else {
      this.explosions[slot] = explosion;
    }

    this.isActive = true;
    return explosion.id;
  }

  private initializeParticles(
    explosion: ExplosionInstance,
    velocityMult: number
  ): void {
    const positions = this.positionAttr.array as Float32Array;
    const alphas = this.alphaAttr.array as Float32Array;
    const sizes = this.sizeAttr.array as Float32Array;
    const colors = this.colorAttr.array as Float32Array;

    for (let i = 0; i < explosion.count; i++) {
      const idx = explosion.startIndex + i;
      const i3 = idx * 3;

      // Position at origin
      positions[i3] = explosion.origin.x;
      positions[i3 + 1] = explosion.origin.y;
      positions[i3 + 2] = explosion.origin.z;

      // Spherical velocity
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed =
        this.config.initialVelocity * (0.5 + Math.random()) * velocityMult;

      this.velocities[i3] = Math.sin(phi) * Math.cos(theta) * speed;
      this.velocities[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      this.velocities[i3 + 2] = Math.cos(phi) * speed;

      // Alpha
      alphas[idx] = 0.7 + Math.random() * 0.3;
      this.initialAlphas[idx] = alphas[idx];

      // Lifetime offset
      this.lifetimeOffsets[idx] = (Math.random() - 0.5) * 0.25;

      // Size
      sizes[idx] = this.config.particleSize * (0.6 + Math.random() * 0.8);

      // Color
      colors[i3] = explosion.color.r;
      colors[i3 + 1] = explosion.color.g;
      colors[i3 + 2] = explosion.color.b;
    }

    this.positionAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  /**
   * Update all explosions
   */
  update(deltaTime: number): void {
    if (!this.isActive) return;

    const currentTime = performance.now() / 1000;
    const positions = this.positionAttr.array as Float32Array;
    const alphas = this.alphaAttr.array as Float32Array;

    let hasActive = false;
    let needsUpdate = false;

    for (const explosion of this.explosions) {
      if (!explosion || !explosion.active) continue;

      const elapsed = currentTime - explosion.startTime;
      const progress = elapsed / this.config.duration;

      if (progress >= 1.0) {
        this.deactivate(explosion);
        needsUpdate = true;
        continue;
      }

      hasActive = true;
      needsUpdate = true;

      // Update particles
      for (let i = 0; i < explosion.count; i++) {
        const idx = explosion.startIndex + i;
        const i3 = idx * 3;

        // Velocity decay
        const decay = Math.pow(this.config.velocityDecay, deltaTime * 60);
        this.velocities[i3] *= decay;
        this.velocities[i3 + 1] *= decay;
        this.velocities[i3 + 2] *= decay;

        // Update position
        positions[i3] += this.velocities[i3] * deltaTime;
        positions[i3 + 1] += this.velocities[i3 + 1] * deltaTime;
        positions[i3 + 2] += this.velocities[i3 + 2] * deltaTime;

        // Fade alpha
        const adjustedProgress = Math.max(
          0,
          Math.min(1, progress + this.lifetimeOffsets[idx])
        );
        const fade = 1.0 - adjustedProgress;
        alphas[idx] = this.initialAlphas[idx] * fade * fade;
      }
    }

    if (needsUpdate) {
      this.positionAttr.needsUpdate = true;
      this.alphaAttr.needsUpdate = true;
    }

    this.isActive = hasActive;
  }

  private deactivate(explosion: ExplosionInstance): void {
    explosion.active = false;
    const alphas = this.alphaAttr.array as Float32Array;
    for (let i = 0; i < explosion.count; i++) {
      alphas[explosion.startIndex + i] = 0;
    }
  }

  getActiveCount(): number {
    return this.explosions.filter((e) => e && e.active).length;
  }

  hasActiveExplosions(): boolean {
    return this.isActive;
  }

  clear(): void {
    for (const explosion of this.explosions) {
      if (explosion) this.deactivate(explosion);
    }
    this.isActive = false;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.explosions = [];
    console.log('[SliceEffect] Disposed');
  }
}
