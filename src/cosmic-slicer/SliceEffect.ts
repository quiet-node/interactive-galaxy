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
import {
  CosmicObjectType,
  SliceEffectConfig,
  DEFAULT_SLICE_EFFECT_CONFIG,
} from './types';

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
  baseColor: THREE.Color;
  glowColor: THREE.Color;
  style: ExplosionStyle;
  active: boolean;
}

interface ExplosionStyle {
  countMin: number;
  countMax: number;
  sizeMin: number;
  sizeMax: number;
  speedMin: number;
  speedMax: number;
  hueJitter: number;
  colorMix: number;
  discBias: number;
  sparkChance: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function jitterHsl(color: THREE.Color, hueJitter: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  hsl.h = (hsl.h + (Math.random() - 0.5) * hueJitter + 1) % 1;
  hsl.s = clamp01(hsl.s * (0.9 + Math.random() * 0.2));
  hsl.l = clamp01(hsl.l * (0.85 + Math.random() * 0.35));
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

function getStyleForType(
  type: CosmicObjectType,
  baseCount: number
): ExplosionStyle {
  const cap = baseCount;

  const make = (
    s: Omit<ExplosionStyle, 'countMin' | 'countMax'> & {
      cm: number;
      cx: number;
    }
  ): ExplosionStyle => {
    return {
      countMin: Math.max(8, Math.min(cap, Math.floor(cap * s.cm))),
      countMax: Math.max(12, Math.min(cap, Math.floor(cap * s.cx))),
      sizeMin: s.sizeMin,
      sizeMax: s.sizeMax,
      speedMin: s.speedMin,
      speedMax: s.speedMax,
      hueJitter: s.hueJitter,
      colorMix: s.colorMix,
      discBias: s.discBias,
      sparkChance: s.sparkChance,
    };
  };

  if (type === CosmicObjectType.STAR) {
    return make({
      cm: 0.85,
      cx: 1.0,
      sizeMin: 0.65,
      sizeMax: 1.05,
      speedMin: 1.05,
      speedMax: 1.55,
      hueJitter: 0.02,
      colorMix: 0.55,
      discBias: 0.15,
      sparkChance: 0.18,
    });
  }
  if (type === CosmicObjectType.METEOR) {
    return make({
      cm: 0.75,
      cx: 0.95,
      sizeMin: 0.7,
      sizeMax: 1.15,
      speedMin: 1.1,
      speedMax: 1.7,
      hueJitter: 0.03,
      colorMix: 0.5,
      discBias: 0.25,
      sparkChance: 0.14,
    });
  }
  if (type === CosmicObjectType.CRYSTAL) {
    return make({
      cm: 0.7,
      cx: 0.9,
      sizeMin: 0.75,
      sizeMax: 1.25,
      speedMin: 0.95,
      speedMax: 1.4,
      hueJitter: 0.04,
      colorMix: 0.62,
      discBias: 0.28,
      sparkChance: 0.08,
    });
  }
  if (type === CosmicObjectType.VOID_PEARL) {
    return make({
      cm: 0.65,
      cx: 0.85,
      sizeMin: 0.75,
      sizeMax: 1.3,
      speedMin: 0.75,
      speedMax: 1.15,
      hueJitter: 0.06,
      colorMix: 0.7,
      discBias: 0.45,
      sparkChance: 0.1,
    });
  }
  if (type === CosmicObjectType.NEBULA_CORE) {
    return make({
      cm: 0.75,
      cx: 0.95,
      sizeMin: 0.8,
      sizeMax: 1.45,
      speedMin: 0.8,
      speedMax: 1.25,
      hueJitter: 0.08,
      colorMix: 0.72,
      discBias: 0.55,
      sparkChance: 0.06,
    });
  }
  if (type === CosmicObjectType.ANCIENT_RELIC) {
    return make({
      cm: 0.65,
      cx: 0.85,
      sizeMin: 0.65,
      sizeMax: 1.1,
      speedMin: 0.9,
      speedMax: 1.35,
      hueJitter: 0.02,
      colorMix: 0.42,
      discBias: 0.18,
      sparkChance: 0.12,
    });
  }
  return make({
    cm: 0.75,
    cx: 0.95,
    sizeMin: 0.8,
    sizeMax: 1.35,
    speedMin: 1.15,
    speedMax: 1.75,
    hueJitter: 0.04,
    colorMix: 0.55,
    discBias: 0.2,
    sparkChance: 0.16,
  });
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
    colorOrOptions:
      | THREE.Color
      | {
          type: CosmicObjectType;
          baseColor: THREE.Color;
          glowColor: THREE.Color;
          velocityMultiplier?: number;
        },
    velocityMultiplier: number = 1
  ): number {
    const options =
      colorOrOptions instanceof THREE.Color
        ? {
            type: CosmicObjectType.METEOR,
            baseColor: colorOrOptions,
            glowColor: colorOrOptions,
            velocityMultiplier,
          }
        : {
            ...colorOrOptions,
            velocityMultiplier:
              colorOrOptions.velocityMultiplier ?? velocityMultiplier,
          };

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

    const style = getStyleForType(options.type, this.config.particleCount);
    const count =
      style.countMin +
      Math.floor(
        Math.random() * Math.max(1, style.countMax - style.countMin + 1)
      );

    const explosion: ExplosionInstance = {
      id: this.nextId++,
      startTime: performance.now() / 1000,
      startIndex: slot * this.config.particleCount,
      count,
      origin: position.clone(),
      baseColor: options.baseColor.clone(),
      glowColor: options.glowColor.clone(),
      style,
      active: true,
    };

    this.initializeParticles(explosion, options.velocityMultiplier);

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

    const style = explosion.style;
    const discBias = clamp01(style.discBias + (Math.random() - 0.5) * 0.1);
    const speedMult =
      style.speedMin + Math.random() * (style.speedMax - style.speedMin);
    const baseSizeMult =
      style.sizeMin + Math.random() * (style.sizeMax - style.sizeMin);

    for (let i = 0; i < explosion.count; i++) {
      const idx = explosion.startIndex + i;
      const i3 = idx * 3;

      // Position at origin
      positions[i3] = explosion.origin.x;
      positions[i3 + 1] = explosion.origin.y;
      positions[i3 + 2] = explosion.origin.z;

      // Spherical velocity
      const theta = Math.random() * Math.PI * 2;
      const rnd = Math.random();
      const phi = Math.acos(2 * rnd - 1);
      const speed =
        this.config.initialVelocity *
        (0.5 + Math.random()) *
        velocityMult *
        speedMult;

      const disc = Math.random() < discBias;
      const sinPhi = disc ? 1.0 : Math.sin(phi);
      const cosPhi = disc ? (Math.random() - 0.5) * 0.35 : Math.cos(phi);

      this.velocities[i3] = sinPhi * Math.cos(theta) * speed;
      this.velocities[i3 + 1] = sinPhi * Math.sin(theta) * speed;
      this.velocities[i3 + 2] = cosPhi * speed;

      // Alpha
      alphas[idx] = 0.7 + Math.random() * 0.3;
      this.initialAlphas[idx] = alphas[idx];

      // Lifetime offset
      this.lifetimeOffsets[idx] = (Math.random() - 0.5) * 0.25;

      // Size
      sizes[idx] =
        this.config.particleSize * baseSizeMult * (0.55 + Math.random() * 0.9);

      // Color
      const mixFactor = clamp01(style.colorMix + (Math.random() - 0.5) * 0.22);
      const mixed = explosion.baseColor
        .clone()
        .lerp(explosion.glowColor, mixFactor);
      const jittered = jitterHsl(mixed, style.hueJitter);

      const isSpark = Math.random() < style.sparkChance;
      if (isSpark) {
        jittered.lerp(new THREE.Color(0xffffff), 0.55);
      }

      const brightness = isSpark
        ? 1.25 + Math.random() * 0.75
        : 0.85 + Math.random() * 0.55;
      jittered.multiplyScalar(brightness);

      colors[i3] = jittered.r;
      colors[i3 + 1] = jittered.g;
      colors[i3 + 2] = jittered.b;
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
