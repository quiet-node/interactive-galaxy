/**
 * @fileoverview GPU-efficient particle trail system for cinematic thruster effects.
 *
 * Provides repulsor exhaust particle trails for moving armor limbs using object
 * pooling and THREE.Points with custom shaders. Inspired by the Mark 42/43
 * prehensile armor effects from the MCU.
 *
 * @module iron-man-workshop/components/ParticleTrailEmitter
 */

import * as THREE from 'three';

/** Configuration for particle trail appearance */
export interface ParticleTrailConfig {
  /** Maximum particles per trail */
  maxParticles: number;
  /** Particle lifetime in seconds */
  lifetime: number;
  /** Initial particle size */
  particleSize: number;
  /** Trail color (core) */
  coreColor: THREE.Color;
  /** Trail color (fade) */
  fadeColor: THREE.Color;
  /** Particles to emit per frame (can be fractional) */
  emissionRate?: number;
}

const DEFAULT_CONFIG: ParticleTrailConfig = {
  maxParticles: 120, // Increased for denser, more spectacular trails
  lifetime: 0.7, // Even longer lifetime for visible streak
  particleSize: 0.055, // Slightly larger for visibility
  coreColor: new THREE.Color(0x00ffff), // Cyan
  fadeColor: new THREE.Color(0x002233), // Darker fade
};

/** Individual particle data */
interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  lifetime: number;
  size: number;
  active: boolean;
}

/**
 * GPU-efficient particle emitter for single thruster exhaust trails.
 *
 * Architecture:
 * - **Object Pooling**: Pre-allocates all particles to avoid runtime GC pressure
 * - **Buffer Attributes**: Uses typed arrays for efficient GPU uploads
 * - **Custom Shader**: Renders soft circular glowing particles with additive blending
 * - **Velocity-Based Direction**: Particles trail opposite to movement direction
 *
 * Performance characteristics:
 * - Zero allocations during emission/update (pre-allocated pools and temp objects)
 * - Single draw call per emitter via THREE.Points
 * - Additive blending with depth write disabled for proper transparency
 *
 * @example
 * ```typescript
 * const emitter = new ParticleTrailEmitter({
 *   maxParticles: 120,
 *   lifetime: 0.7,
 *   coreColor: new THREE.Color(0x00ffff),
 * });
 * scene.add(emitter.getObject3D());
 * emitter.startEmitting(position, direction);
 * // In animation loop:
 * emitter.update(deltaTime);
 * ```
 */
export class ParticleTrailEmitter {
  private config: ParticleTrailConfig;
  private particles: Particle[] = [];
  private particleSystem: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private positionAttribute: THREE.BufferAttribute;
  private colorAttribute: THREE.BufferAttribute;
  private sizeAttribute: THREE.BufferAttribute;
  private isEmitting: boolean = false;
  private emitPosition: THREE.Vector3 = new THREE.Vector3();
  private emitDirection: THREE.Vector3 = new THREE.Vector3(0, -1, 0);

  // Performance: Pre-allocated temp objects to avoid per-frame GC pressure
  private readonly _tempColor: THREE.Color = new THREE.Color();

  constructor(config: Partial<ParticleTrailConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize particle pool
    for (let i = 0; i < this.config.maxParticles; i++) {
      this.particles.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: 0,
        lifetime: this.config.lifetime,
        size: this.config.particleSize,
        active: false,
      });
    }

    // Create geometry with buffer attributes
    this.geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(this.config.maxParticles * 3);
    const colors = new Float32Array(this.config.maxParticles * 3);
    const sizes = new Float32Array(this.config.maxParticles);

    this.positionAttribute = new THREE.BufferAttribute(positions, 3);
    this.colorAttribute = new THREE.BufferAttribute(colors, 3);
    this.sizeAttribute = new THREE.BufferAttribute(sizes, 1);

    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('color', this.colorAttribute);
    this.geometry.setAttribute('size', this.sizeAttribute);

    // Custom shader material for glowing particles
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = color;
          vAlpha = 1.0;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          // Circular soft particle
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;

          // Soft edge falloff
          float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
          alpha *= vAlpha;

          // Glow core
          float core = 1.0 - smoothstep(0.0, 0.3, dist);
          vec3 finalColor = vColor + vec3(core * 0.5);

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particleSystem = new THREE.Points(this.geometry, material);
    this.particleSystem.frustumCulled = false;
  }

  /**
   * Returns the Three.js Points object for scene integration.
   *
   * @returns The THREE.Points mesh containing all particles
   */
  getObject3D(): THREE.Points {
    return this.particleSystem;
  }

  /**
   * Begins particle emission at the specified position.
   *
   * @param position - World-space emission origin
   * @param direction - Initial velocity direction (will be normalized)
   * @param rate - Particles per frame (optional, default: 4)
   */
  startEmitting(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    rate?: number
  ): void {
    this.isEmitting = true;
    this.emitPosition.copy(position);
    this.emitDirection.copy(direction).normalize();
    if (rate !== undefined) {
      this.config.emissionRate = rate;
    }
  }

  /**
   * Updates the emission origin position.
   *
   * Call each frame while emitting to track a moving object.
   *
   * @param position - New world-space emission origin
   */
  updateEmitPosition(position: THREE.Vector3): void {
    this.emitPosition.copy(position);
  }

  /**
   * Updates emission direction based on object velocity.
   *
   * The direction is negated internally to create exhaust trailing behind movement.
   * Only updates if the velocity vector has meaningful magnitude (> 0.001).
   *
   * @param direction - Velocity vector (will be normalized and negated)
   */
  updateEmitDirection(direction: THREE.Vector3): void {
    if (direction.lengthSq() > 0.001) {
      // Only update if we have meaningful velocity
      this.emitDirection.copy(direction).normalize().negate(); // Negate for exhaust behind movement
    }
  }

  /**
   * Stops emitting new particles.
   *
   * Existing particles continue updating and will fade out naturally
   * according to their remaining lifetime.
   */
  stopEmitting(): void {
    this.isEmitting = false;
  }

  /**
   * Updates all particles and emits new ones if active.
   *
   * Per-frame update cycle:
   * 1. Emit new particles based on emission rate (if emitting)
   * 2. Age each particle and deactivate expired ones
   * 3. Apply velocity to particle positions
   * 4. Interpolate color from core to fade based on lifetime
   * 5. Shrink particle size as it ages
   * 6. Upload buffer updates to GPU
   *
   * @param deltaTime - Time since last frame in seconds
   */
  update(deltaTime: number): void {
    const positions = this.positionAttribute.array as Float32Array;
    const colors = this.colorAttribute.array as Float32Array;
    const sizes = this.sizeAttribute.array as Float32Array;

    // Emit new particles if active
    if (this.isEmitting) {
      // Calculate how many particles to emit this frame based on rate
      // Accumulator logic could be added for precise low-rate emission,
      // but for now simple per-frame count or probabilistic emission is fine.

      const rate = this.config.emissionRate ?? 4; // Default to 4 (burst mode)

      // Handle fractional rates (e.g. 0.5 = 1 particle every 2 frames)
      if (rate >= 1) {
        for (let i = 0; i < Math.floor(rate); i++) this.emitParticle();
        if (Math.random() < rate % 1) this.emitParticle();
      } else {
        if (Math.random() < rate) this.emitParticle();
      }
    }

    // Update all particles
    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];

      if (!particle.active) {
        // Hide inactive particles
        sizes[i] = 0;
        continue;
      }

      // Age the particle
      particle.age += deltaTime;

      if (particle.age >= particle.lifetime) {
        // Particle died
        particle.active = false;
        sizes[i] = 0;
        continue;
      }

      // Move particle
      particle.position.addScaledVector(particle.velocity, deltaTime);

      // Calculate life ratio (0 = born, 1 = dead)
      const lifeRatio = particle.age / particle.lifetime;

      // Update position
      positions[i * 3] = particle.position.x;
      positions[i * 3 + 1] = particle.position.y;
      positions[i * 3 + 2] = particle.position.z;

      // Fade color from core to fade color (using pre-allocated temp to avoid GC)
      this._tempColor.lerpColors(
        this.config.coreColor,
        this.config.fadeColor,
        lifeRatio
      );
      colors[i * 3] = this._tempColor.r;
      colors[i * 3 + 1] = this._tempColor.g;
      colors[i * 3 + 2] = this._tempColor.b;

      // Shrink size over lifetime
      sizes[i] = this.config.particleSize * (1 - lifeRatio * 0.7);
    }

    // Mark attributes as needing update
    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
    this.sizeAttribute.needsUpdate = true;
  }

  /**
   * Emits a single particle from the pool.
   *
   * Finds the first inactive particle, initializes it with randomized parameters
   * (lifetime, size, position offset, velocity spread), and marks it active.
   */
  private emitParticle(): void {
    // Find an inactive particle
    for (const particle of this.particles) {
      if (!particle.active) {
        particle.active = true;
        particle.age = 0;
        particle.lifetime = this.config.lifetime * (0.8 + Math.random() * 0.4);
        particle.size = this.config.particleSize * (0.7 + Math.random() * 0.6);

        // Start at emit position with slight random offset
        particle.position.copy(this.emitPosition);
        particle.position.x += (Math.random() - 0.5) * 0.1;
        particle.position.y += (Math.random() - 0.5) * 0.1;
        particle.position.z += (Math.random() - 0.5) * 0.1;

        // Velocity in emit direction - move faster for clear trail
        particle.velocity
          .copy(this.emitDirection)
          .multiplyScalar(1.2 + Math.random() * 0.4); // Faster for longer streaks
        // Less random spread for cleaner trails
        particle.velocity.x += (Math.random() - 0.5) * 0.15;
        particle.velocity.y += (Math.random() - 0.5) * 0.15;
        particle.velocity.z += (Math.random() - 0.5) * 0.15;

        return; // Only emit one particle per call
      }
    }
  }

  /**
   * Immediately deactivates all particles and stops emission.
   *
   * Resets the particle pool to initial state without disposing resources.
   */
  reset(): void {
    this.isEmitting = false;
    for (const particle of this.particles) {
      particle.active = false;
    }

    const sizes = this.sizeAttribute.array as Float32Array;
    sizes.fill(0);
    this.sizeAttribute.needsUpdate = true;
  }

  /**
   * Disposes GPU resources (geometry and material).
   *
   * After calling dispose(), the emitter cannot be reused.
   */
  dispose(): void {
    this.geometry.dispose();
    (this.particleSystem.material as THREE.ShaderMaterial).dispose();
    console.log('[ParticleTrailEmitter] Disposed');
  }
}

/**
 * Manages multiple particle emitters for all armor limbs.
 *
 * Provides a high-level interface for starting/stopping particle trails per limb,
 * with automatic emitter creation and lifecycle management.
 *
 * @example
 * ```typescript
 * const system = new ParticleTrailSystem();
 * scene.add(system.getObject3D());
 *
 * // Create emitter for each limb
 * system.createEmitter('arm_left');
 * system.createEmitter('arm_right');
 *
 * // Start trail on limb movement
 * system.startTrail('arm_left', position, velocity);
 *
 * // In animation loop:
 * system.update(deltaTime);
 * ```
 */
export class ParticleTrailSystem {
  private emitters: Map<string, ParticleTrailEmitter> = new Map();
  private group: THREE.Group = new THREE.Group();

  constructor() {
    this.group.name = 'ParticleTrailSystem';
  }

  /**
   * Returns the container Group for scene integration.
   *
   * @returns THREE.Group containing all particle emitter Points meshes
   */
  getObject3D(): THREE.Group {
    return this.group;
  }

  /**
   * Creates and registers a particle emitter for a limb.
   *
   * @param limbName - Unique identifier for the limb (e.g., 'arm_left')
   * @param config - Optional configuration overrides for this emitter
   * @returns The created ParticleTrailEmitter instance
   */
  createEmitter(
    limbName: string,
    config?: Partial<ParticleTrailConfig>
  ): ParticleTrailEmitter {
    const emitter = new ParticleTrailEmitter(config);
    this.emitters.set(limbName, emitter);
    this.group.add(emitter.getObject3D());
    return emitter;
  }

  /**
   * Starts particle emission for a specific limb.
   *
   * @param limbName - The limb identifier
   * @param position - World-space emission origin
   * @param direction - Initial velocity direction
   * @param rate - Optional particles per frame
   */
  startTrail(
    limbName: string,
    position: THREE.Vector3,
    direction: THREE.Vector3,
    rate?: number
  ): void {
    const emitter = this.emitters.get(limbName);
    if (emitter) {
      emitter.startEmitting(position, direction, rate);
    }
  }

  /**
   * Updates the emission position for a limb's emitter.
   *
   * @param limbName - The limb identifier
   * @param position - New world-space emission origin
   */
  updateTrail(limbName: string, position: THREE.Vector3): void {
    const emitter = this.emitters.get(limbName);
    if (emitter) {
      emitter.updateEmitPosition(position);
    }
  }

  /**
   * Updates both emission position and direction for velocity-based trailing.
   *
   * Preferred method for cinematic particle trails that follow object movement.
   * The direction is automatically negated to create exhaust behind the object.
   *
   * @param limbName - The limb identifier
   * @param position - World-space emission origin
   * @param velocity - Movement velocity vector (will trail opposite)
   */
  updateTrailWithVelocity(
    limbName: string,
    position: THREE.Vector3,
    velocity: THREE.Vector3
  ): void {
    const emitter = this.emitters.get(limbName);
    if (emitter) {
      emitter.updateEmitPosition(position);
      emitter.updateEmitDirection(velocity);
    }
  }

  /**
   * Stops particle emission for a specific limb.
   *
   * @param limbName - The limb identifier
   */
  stopTrail(limbName: string): void {
    const emitter = this.emitters.get(limbName);
    if (emitter) {
      emitter.stopEmitting();
    }
  }

  /**
   * Updates all registered emitters.
   *
   * @param deltaTime - Time since last frame in seconds
   */
  update(deltaTime: number): void {
    for (const emitter of this.emitters.values()) {
      emitter.update(deltaTime);
    }
  }

  /**
   * Resets all emitters to their initial state.
   */
  reset(): void {
    for (const emitter of this.emitters.values()) {
      emitter.reset();
    }
  }

  /**
   * Disposes all emitters and clears the registry.
   */
  dispose(): void {
    for (const emitter of this.emitters.values()) {
      emitter.dispose();
    }
    this.emitters.clear();
    console.log('[ParticleTrailSystem] Disposed');
  }
}
