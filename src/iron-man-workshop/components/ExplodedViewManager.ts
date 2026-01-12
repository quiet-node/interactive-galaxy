/**
 * ExplodedViewManager
 *
 * Orchestrates the exploded view / assembly sequence animation for the Mark VI model.
 * Inspired by the Mark 42/43 prehensile armor from Iron Man 3.
 *
 * Features:
 * - State machine: ASSEMBLED → EXPLODING → EXPLODED → ASSEMBLING → ASSEMBLED
 * - GSAP-powered butter-smooth animations with staggered timing
 * - Bidirectional animation (explode/assemble)
 * - Sound effect integration via Howler.js
 * - Particle trail callbacks for cinematic effects
 */

import * as THREE from 'three';
import gsap from 'gsap';
import { Howl } from 'howler';
import type { ExplodedViewState } from '../types';

/** Limb types matching the articulated GLB model */
export type LimbType =
  | 'head'
  | 'torso'
  | 'arm_left'
  | 'arm_right'
  | 'leg_left'
  | 'leg_right';

/** Configuration for explosion behavior per limb */
interface LimbExplosionConfig {
  /** Relative offset for final position (from original) */
  targetOffset: THREE.Vector3;
  /** Relative offset for Bezier control point (creates the curve/orbit) */
  controlOffset: THREE.Vector3;
  /** Rotation during flight (Euler angles) */
  rotation: THREE.Euler;
  /** Stagger delay from start */
  staggerDelay: number;
}

/** Stored original transform for limb */
interface LimbOriginalState {
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

/** Configuration for ExplodedViewManager */
export interface ExplodedViewConfig {
  /** Animation duration in seconds */
  animationDuration: number;
  /** Enable sound effects */
  enableSound: boolean;
  /** Enable particle trails */
  enableParticles: boolean;
  /** Callback when limb starts moving (for particles) */
  onLimbMoveStart?: (limbName: LimbType, mesh: THREE.Object3D) => void;
  /** Callback when limb stops moving (for particles) */
  onLimbMoveEnd?: (limbName: LimbType, mesh: THREE.Object3D) => void;
  /** Callback per-frame during limb movement (for particle trail following) */
  onLimbMoveUpdate?: (
    limbName: LimbType,
    mesh: THREE.Object3D,
    velocity: THREE.Vector3
  ) => void;
  /** Callback for animation state changes */
  onStateChange?: (newState: ExplodedViewState) => void;
  /** Callback for anticipation "charge" phase */
  onAnticipation?: () => void;
}

const DEFAULT_CONFIG: ExplodedViewConfig = {
  animationDuration: 1.2,
  enableSound: true,
  enableParticles: true,
};

/**
 * Cinematic timing constants (in seconds)
 * Based on Disney's 12 Principles of Animation and MCU Iron Man VFX
 */
const CINEMATIC_TIMING = {
  /** Brief "charge" before explosion - creates anticipation via glow effect */
  anticipation: 0.15,
  /** Main outward burst phase - SLOWER now */
  burst: 1.6,
  /** Settle/overshoot phase (handled by easing) */
  settle: 0.4,
};

/**
 * Velocity multipliers per limb - lighter parts move faster
 * Creates more natural physics feel
 */
const LIMB_VELOCITY_MULTIPLIER: Record<LimbType, number> = {
  head: 0.85, // Fastest - lightest
  arm_left: 1.0,
  arm_right: 1.0,
  leg_left: 1.15, // Slowest - heaviest
  leg_right: 1.15,
  torso: 1.0, // Anchor, doesn't move
};

/**
 * Micro-rotation during flight (radians) - adds liveliness
 */
const LIMB_FLIGHT_SPIN: Record<LimbType, number> = {
  head: 0.15, // Subtle wobble
  arm_left: -0.25, // Counter-rotate
  arm_right: 0.25,
  leg_left: -0.2,
  leg_right: 0.2,
  torso: 0,
};

/**
 * Explosion configuration per limb
 * 3D schematic-style arrangement for dramatic visual effect:
 * - Wider spread for clear separation
 * - Noticeable rotations for "floating in space" look
 */
const LIMB_EXPLOSION_CONFIG: Record<LimbType, LimbExplosionConfig> = {
  head: {
    // Center, Closest to user (High Z), slightly up
    targetOffset: new THREE.Vector3(1.8, -0.1, 0.3),
    controlOffset: new THREE.Vector3(0, 0.6, 0.4),
    rotation: new THREE.Euler(-0.4, 0.5, -0.1), // Random look
    staggerDelay: 0.0,
  },
  arm_left: {
    // TOP RIGHT (Cross-over), Random rotation
    targetOffset: new THREE.Vector3(-0.9, 0.2, 0.5),
    controlOffset: new THREE.Vector3(0.4, 0.7, -0.3),
    rotation: new THREE.Euler(0.5, -0.8, 1.2),
    staggerDelay: 0.25,
  },
  arm_right: {
    // TOP LEFT (Cross-over), Random rotation
    targetOffset: new THREE.Vector3(0.9, 0.5, -0.9),
    controlOffset: new THREE.Vector3(-0.4, 0.7, -0.2),
    rotation: new THREE.Euler(0.3, 0.5, 0.5),
    staggerDelay: 0.15,
  },
  leg_left: {
    // Bottom Left - Rotated to show profile/feet clearly
    targetOffset: new THREE.Vector3(-0.7, -0.9, 0.4),
    controlOffset: new THREE.Vector3(-0.5, -0.5, 0.6),
    rotation: new THREE.Euler(0.1, -0.8, 1.5),
    staggerDelay: 0.1,
  },
  leg_right: {
    // Bottom Right - Rotated to show profile/feet clearly
    targetOffset: new THREE.Vector3(0.7, -0.7, -0.5),
    controlOffset: new THREE.Vector3(0.5, -0.5, -0.4),
    rotation: new THREE.Euler(0.3, 0.8, 0.3),
    staggerDelay: 0.2,
  },
  torso: {
    // CENTER, slightly back to let head pop
    targetOffset: new THREE.Vector3(0.6, -0.3, -0.4),
    controlOffset: new THREE.Vector3(0, 0.1, -0.2),
    rotation: new THREE.Euler(0.5, -0.9, 0.1), // Tilted
    staggerDelay: 0.05,
  },
};

/**
 * ExplodedViewManager
 *
 * Controls the cinematic exploded view animation for the Iron Man suit.
 */
export class ExplodedViewManager {
  private state: ExplodedViewState = 'assembled';
  private limbMeshes: Map<LimbType, THREE.Object3D> = new Map();
  private originalStates: Map<LimbType, LimbOriginalState> = new Map();
  private config: ExplodedViewConfig;
  private timeline: gsap.core.Timeline | null = null;
  private levitationTimeline: gsap.core.Timeline | null = null;

  // Sound effects
  private sounds: {
    servoWhir: Howl | null;
    metalClick: Howl | null;
    powerUp: Howl | null;
  } = {
    servoWhir: null,
    metalClick: null,
    powerUp: null,
  };

  constructor(config: Partial<ExplodedViewConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enableSound) {
      this.initializeSounds();
    }
  }

  /**
   * Initialize the manager with limb references from the loaded model
   * Must be called after model is fully loaded
   */
  initialize(schematic: THREE.Group): void {
    // Find and store references to each limb mesh
    const limbNames: LimbType[] = [
      'head',
      'torso',
      'arm_left',
      'arm_right',
      'leg_left',
      'leg_right',
    ];

    schematic.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        limbNames.includes(child.name as LimbType)
      ) {
        const limbName = child.name as LimbType;
        this.limbMeshes.set(limbName, child);

        // Store original position and rotation
        this.originalStates.set(limbName, {
          position: child.position.clone(),
          rotation: child.rotation.clone(),
        });

        console.log(
          `[ExplodedViewManager] Registered limb: ${limbName}`,
          `pos: (${child.position.x.toFixed(2)}, ${child.position.y.toFixed(
            2
          )}, ${child.position.z.toFixed(2)})`
        );
      }
    });

    console.log(
      `[ExplodedViewManager] Initialized with ${this.limbMeshes.size} limbs`
    );
  }

  /**
   * Initialize sound effects using Howler.js
   */
  private initializeSounds(): void {
    // Sound effects will be loaded from audio files
    // Using silent stubs if files don't exist - user can provide proper audio later
    try {
      this.sounds.servoWhir = new Howl({
        src: ['/src/iron-man-workshop/audio/servo-whir.mp3'],
        loop: true,
        volume: 0.3,
        preload: true,
        onloaderror: () => {
          console.warn('[ExplodedViewManager] servo-whir.mp3 not found');
        },
      });

      this.sounds.metalClick = new Howl({
        src: ['/src/iron-man-workshop/audio/metal-click.mp3'],
        volume: 0.5,
        preload: true,
        onloaderror: () => {
          console.warn('[ExplodedViewManager] metal-click.mp3 not found');
        },
      });

      this.sounds.powerUp = new Howl({
        src: ['/src/iron-man-workshop/audio/power-up.mp3'],
        volume: 0.6,
        preload: true,
        onloaderror: () => {
          console.warn('[ExplodedViewManager] power-up.mp3 not found');
        },
      });
    } catch {
      console.warn('[ExplodedViewManager] Failed to initialize sounds');
    }
  }

  /**
   * Get current animation state
   */
  getState(): ExplodedViewState {
    return this.state;
  }

  /**
   * Check if animation is currently in progress
   */
  isAnimating(): boolean {
    return this.state === 'exploding' || this.state === 'assembling';
  }

  /**
   * Explode the suit - limbs fly outward from torso
   *
   * Cinematic 3-phase animation:
   * 1. Anticipation: Brief "charge" with scale pulse and glow intensification
   * 2. Burst: Rapid outward motion with micro-rotations and per-frame particle updates
   * 3. Settle: Overshoot with elastic settle for mechanical "click"
   */
  async explode(): Promise<void> {
    if (this.state !== 'assembled') {
      console.log(
        '[ExplodedViewManager] Cannot explode - not in assembled state'
      );
      return;
    }

    this.setState('exploding');
    this.playSound('powerUp');

    // Kill any existing timeline
    this.timeline?.kill();

    // Create master GSAP timeline
    this.timeline = gsap.timeline({
      onComplete: () => {
        this.stopSound('servoWhir');
        this.playSound('metalClick');
        this.setState('exploded');
      },
    });

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: ANTICIPATION - Brief "charge" before explosion
    // Creates dramatic pause via glow intensification (handled by callback)
    // NOTE: We avoid animating mesh.scale directly as it conflicts with parent transforms
    // ═══════════════════════════════════════════════════════════════════════

    // Notify anticipation phase for external effects (glow boost, camera effects)
    // The actual visual effect is handled in WorkshopController.onAnticipation callback
    this.config.onAnticipation?.();

    // Start servo whir at end of anticipation
    this.timeline.call(
      () => {
        this.playSound('servoWhir');
      },
      [],
      CINEMATIC_TIMING.anticipation
    );

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: BURST via BEZIER CURVES
    // ═══════════════════════════════════════════════════════════════════════

    const burstStartTime = CINEMATIC_TIMING.anticipation;

    for (const [limbName, mesh] of this.limbMeshes) {
      const explosionConfig = LIMB_EXPLOSION_CONFIG[limbName];
      const originalState = this.originalStates.get(limbName);

      if (!originalState) continue;

      // Define Bezier points
      // P0: Start (original position)
      const p0 = originalState.position.clone();
      // P2: End (target position)
      const p2 = p0.clone().add(explosionConfig.targetOffset);
      // P1: Control Point (arc)
      const p1 = p0.clone().add(explosionConfig.controlOffset);

      // Animation params
      const velocityMultiplier = LIMB_VELOCITY_MULTIPLIER[limbName];
      const limbDuration = CINEMATIC_TIMING.burst * velocityMultiplier;
      const staggerJitter = (Math.random() - 0.5) * 0.04;
      const staggerTime =
        burstStartTime + explosionConfig.staggerDelay + staggerJitter;

      const targetRotation = new THREE.Euler(
        originalState.rotation.x + explosionConfig.rotation.x,
        originalState.rotation.y +
          explosionConfig.rotation.y +
          LIMB_FLIGHT_SPIN[limbName],
        originalState.rotation.z + explosionConfig.rotation.z
      );

      // Create a progress object to animate
      const progressObj = { t: 0 };

      this.config.onLimbMoveStart?.(limbName, mesh);

      // Animate progress 0 -> 1 with easeOutExpo (Luxurious deceleration)
      this.timeline.to(
        progressObj,
        {
          t: 1,
          duration: limbDuration,
          ease: 'expo.out', // Snappy start, very slow settle
          onUpdate: () => {
            // Calculate new position along Bezier curve
            this.getBezierPoint(progressObj.t, p0, p1, p2, mesh.position);

            // Calculate tangent for particle emission direction
            const tangent = new THREE.Vector3();
            this.getBezierTangent(progressObj.t, p0, p1, p2, tangent);

            // Pass tangent as velocity for particle trails
            // Scale it up based on 1-t to simulate speed (highest at start)
            tangent.multiplyScalar(5 * (1 - progressObj.t));

            this.config.onLimbMoveUpdate?.(limbName, mesh, tangent);
          },
          onComplete: () => {
            this.config.onLimbMoveEnd?.(limbName, mesh);
          },
        },
        staggerTime
      );

      // Rotation matches the duration
      this.timeline.to(
        mesh.rotation,
        {
          x: targetRotation.x,
          y: targetRotation.y,
          z: targetRotation.z,
          duration: limbDuration,
          ease: 'power2.out',
        },
        staggerTime
      );
    }

    // Wait for animation to complete
    return new Promise((resolve) => {
      this.timeline?.eventCallback('onComplete', () => {
        this.stopSound('servoWhir');
        this.playSound('metalClick');
        this.setState('exploded');
        this.startLevitation(); // Enter alive state
        resolve();
      });
    });
  }

  /**
   * Assemble the suit - limbs fly back to torso
   *
   * Cinematic reassembly with:
   * - Per-frame particle trail updates
   * - Velocity-based movement timing
   * - Elastic "click into place" finish
   */
  async assemble(): Promise<void> {
    if (this.state !== 'exploded') {
      console.log(
        '[ExplodedViewManager] Cannot assemble - not in exploded state'
      );
      return;
    }

    this.setState('assembling');
    this.stopLevitation(); // Stop bobbing
    this.playSound('powerUp');
    this.playSound('servoWhir');

    // Kill any existing timeline
    this.timeline?.kill();

    // Create GSAP timeline for assembly
    this.timeline = gsap.timeline({
      onComplete: () => {
        this.stopSound('servoWhir');
        this.playSound('metalClick');
        this.setState('assembled');
      },
    });

    // Custom Assembly Sequence:
    // 1. Torso (Base) - First
    // 2. Limbs (Arms/Legs) - Second
    // 3. Head (Faceplate) - Last, with spin

    const sequenceGroups: { [key: string]: LimbType[] } = {
      torso: ['torso'],
      limbs: ['leg_left', 'leg_right', 'arm_left', 'arm_right'],
      head: ['head'],
    };

    // Delays relative to timeline start
    const sequenceDelays: { [key: string]: number } = {
      torso: 0.0,
      limbs: 0.25, // Limbs start much sooner (was 0.5)
      head: 0.8, // Head follows quicker (was 1.2)
    };

    for (const [groupName, limbs] of Object.entries(sequenceGroups)) {
      const groupDelay = sequenceDelays[groupName];

      for (const limbName of limbs) {
        const mesh = this.limbMeshes.get(limbName);
        const explosionConfig = LIMB_EXPLOSION_CONFIG[limbName];
        const originalState = this.originalStates.get(limbName);

        if (!mesh || !originalState) continue;

        // Calculate Bezier points
        const p0 = originalState.position.clone();
        const p2 = p0.clone().add(explosionConfig.targetOffset);
        const p1 = p0.clone().add(explosionConfig.controlOffset);

        const velocityMultiplier = LIMB_VELOCITY_MULTIPLIER[limbName];

        // Dynamic duration: Torso moves faster
        let durationMultiplier = 0.8;
        if (limbName === 'torso') durationMultiplier = 0.5; // SUPER FAST TORSO

        const baseDuration =
          CINEMATIC_TIMING.burst * velocityMultiplier * durationMultiplier;

        // Stagger within groups (except torso/head which are single)
        const intraGroupStagger =
          groupName === 'limbs' ? Math.random() * 0.2 : 0;
        const totalStartTime = groupDelay + intraGroupStagger;

        const progressObj = { p: 0 };

        this.config.onLimbMoveStart?.(limbName, mesh);

        this.timeline.to(
          progressObj,
          {
            p: 1,
            duration: baseDuration,
            ease: 'power4.inOut',
            onUpdate: () => {
              const t = 1 - progressObj.p; // Go backwards from 1 to 0

              this.getBezierPoint(t, p0, p1, p2, mesh.position);

              const tangent = new THREE.Vector3();
              this.getBezierTangent(t, p0, p1, p2, tangent);
              tangent.negate().multiplyScalar(5 * progressObj.p);

              this.config.onLimbMoveUpdate?.(limbName, mesh, tangent);
            },
            onComplete: () => {
              this.config.onLimbMoveEnd?.(limbName, mesh);
              mesh.position.copy(originalState.position);
              mesh.rotation.copy(originalState.rotation);
            },
          },
          totalStartTime
        );

        // Rotation logic
        // Special Head Spin
        if (limbName === 'head') {
          // 360 Spin on assembly
          this.timeline.fromTo(
            mesh.rotation,
            { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
            {
              x: originalState.rotation.x,
              y: originalState.rotation.y + Math.PI * 2, // 1 full extra spin
              z: originalState.rotation.z,
              duration: baseDuration,
              ease: 'expo.inOut',
            },
            totalStartTime
          );
        } else {
          // Standard limb rotation
          this.timeline.to(
            mesh.rotation,
            {
              x: originalState.rotation.x,
              y: originalState.rotation.y,
              z: originalState.rotation.z,
              duration: baseDuration,
              ease: 'power2.inOut',
            },
            totalStartTime
          );
        }
      }
    }

    // Wait for animation to complete
    return new Promise((resolve) => {
      this.timeline?.eventCallback('onComplete', () => {
        this.stopSound('servoWhir');
        this.playSound('metalClick');
        this.setState('assembled');
        resolve();
      });
    });
  }

  /**
   * Toggle between exploded and assembled states
   */
  async toggle(): Promise<void> {
    if (this.isAnimating()) {
      console.log(
        '[ExplodedViewManager] Animation in progress, ignoring toggle'
      );
      return;
    }

    if (this.state === 'assembled') {
      await this.explode();
    } else if (this.state === 'exploded') {
      await this.assemble();
    }
  }

  /**
   * Reset limbs to original positions immediately (no animation)
   */
  reset(): void {
    this.timeline?.kill();

    for (const [limbName, mesh] of this.limbMeshes) {
      const originalState = this.originalStates.get(limbName);
      if (originalState) {
        mesh.position.copy(originalState.position);
        mesh.rotation.copy(originalState.rotation);
      }
    }

    this.stopLevitation();
    this.setState('assembled');
    console.log('[ExplodedViewManager] Reset to assembled state');
  }

  /**
   * Helper: Calculate Quadratic Bezier Point
   * B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
   */
  private getBezierPoint(
    t: number,
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    target: THREE.Vector3
  ): void {
    const oneMinusT = 1 - t;
    const a = oneMinusT * oneMinusT;
    const b = 2 * oneMinusT * t;
    const c = t * t;

    target
      .set(0, 0, 0)
      .addScaledVector(p0, a)
      .addScaledVector(p1, b)
      .addScaledVector(p2, c);
  }

  /**
   * Helper: Calculate Quadratic Bezier Tangent (for velocity)
   * B'(t) = 2(1-t)(P1 - P0) + 2t(P2 - P1)
   */
  private getBezierTangent(
    t: number,
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    target: THREE.Vector3
  ): void {
    const a = 2 * (1 - t);
    const b = 2 * t;

    // We can use temporary vectors here, or just inline the math for performance
    // tangent = 2(1-t)*(p1-p0) + 2t*(p2-p1)

    // v1 = p1 - p0
    const v1x = p1.x - p0.x;
    const v1y = p1.y - p0.y;
    const v1z = p1.z - p0.z;

    // v2 = p2 - p1
    const v2x = p2.x - p1.x;
    const v2y = p2.y - p1.y;
    const v2z = p2.z - p1.z;

    target
      .set(a * v1x + b * v2x, a * v1y + b * v2y, a * v1z + b * v2z)
      .normalize();
  }

  /**
   * Start the levitation loop - parts gently bob and rotate
   */
  private startLevitation(): void {
    if (this.state !== 'exploded') return;

    // Kill any existing levitation
    this.stopLevitation();

    this.levitationTimeline = gsap.timeline({
      repeat: -1,
      yoyo: true,
      defaults: { ease: 'sine.inOut' },
    });

    console.log('[ExplodedViewManager] Starting levitation state');

    // Add unique bobbing for each limb
    for (const [limbName, mesh] of this.limbMeshes) {
      const randomPhase = Math.random() * 2;
      const bobAmount = 0.05;
      const rotAmount = 0.03;

      // Standard limbs: Bobbing without continuous trail
      this.levitationTimeline.to(
        mesh.position,
        {
          y: mesh.position.y + bobAmount,
          duration: 2.0 + Math.random(),
        },
        randomPhase
      );

      // Pulse particles occasionally during levitation for ALL parts
      this.levitationTimeline.add(() => {
        this.config.onLimbMoveStart?.(limbName, mesh);
        setTimeout(() => this.config.onLimbMoveEnd?.(limbName, mesh), 200);
      }, randomPhase);

      // Gentle rotation for all
      this.levitationTimeline.to(
        mesh.rotation,
        {
          z: mesh.rotation.z + rotAmount,
          duration: 3.0 + Math.random(),
        },
        randomPhase
      );
    }
  }

  private stopLevitation(): void {
    if (this.levitationTimeline) {
      this.levitationTimeline.kill();
      this.levitationTimeline = null;

      // Ensure torso trail is stopped (since it runs continuously)
      const torsoMesh = this.limbMeshes.get('torso');
      if (torsoMesh) {
        this.config.onLimbMoveEnd?.('torso', torsoMesh);
      }
    }
  }

  /**
   * Update state and notify listeners
   */
  private setState(newState: ExplodedViewState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.config.onStateChange?.(newState);
      console.log(`[ExplodedViewManager] State: ${newState}`);
    }
  }

  /**
   * Play a sound effect
   */
  private playSound(soundName: keyof typeof this.sounds): void {
    if (!this.config.enableSound) return;
    this.sounds[soundName]?.play();
  }

  /**
   * Stop a sound effect
   */
  private stopSound(soundName: keyof typeof this.sounds): void {
    if (!this.config.enableSound) return;
    this.sounds[soundName]?.stop();
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.timeline?.kill();
    this.timeline = null;

    // Stop and unload sounds
    Object.values(this.sounds).forEach((sound) => {
      if (sound) {
        sound.stop();
        sound.unload();
      }
    });

    this.limbMeshes.clear();
    this.originalStates.clear();
    console.log('[ExplodedViewManager] Disposed');
  }
}
