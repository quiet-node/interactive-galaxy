/**
 * @fileoverview Exploded view animation system for the Mark VI holographic model.
 *
 * Provides a state machine-driven animation system that separates the Iron Man suit
 * into individual limb components with cinematic Bezier curve trajectories. Inspired
 * by the Mark 42/43 prehensile armor from Iron Man 3.
 *
 * @module iron-man-workshop/components/ExplodedViewManager
 */

import * as THREE from 'three';
import gsap from 'gsap';
import { Howl } from 'howler';
import type { ExplodedViewState } from '../types';

/** Limb types matching the articulated GLB model (17 parts) */
export type LimbType =
  | 'head'
  | 'torso_front'
  | 'torso_back'
  | 'arm_shoulder_left'
  | 'arm_upperarm_left'
  | 'arm_forearm_left'
  | 'arm_hand_left'
  | 'arm_shoulder_right'
  | 'arm_upperarm_right'
  | 'arm_forearm_right'
  | 'arm_hand_right'
  | 'leg_left_thigh'
  | 'leg_left_calf'
  | 'leg_left_feet'
  | 'leg_right_thigh'
  | 'leg_right_calf'
  | 'leg_right_feet';

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
  onLimbMoveUpdate?: (limbName: LimbType, mesh: THREE.Object3D, velocity: THREE.Vector3) => void;
  /** Callback when an individual limb completes assembly */
  onLimbAssemblyComplete?: (limbName: LimbType) => void;
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
  // Arms: hands fastest, shoulders slowest
  arm_hand_left: 0.88,
  arm_hand_right: 0.88,
  arm_forearm_left: 0.92,
  arm_forearm_right: 0.92,
  arm_upperarm_left: 0.98,
  arm_upperarm_right: 0.98,
  arm_shoulder_left: 1.02,
  arm_shoulder_right: 1.02,
  // Legs: feet fastest, thighs slowest
  leg_left_feet: 0.9,
  leg_right_feet: 0.9,
  leg_left_calf: 0.95,
  leg_right_calf: 0.95,
  leg_left_thigh: 1.08,
  leg_right_thigh: 1.08,
  // Torso: heaviest
  torso_front: 1.1,
  torso_back: 1.12,
};

/**
 * Micro-rotation during flight (radians) - adds liveliness
 */
const LIMB_FLIGHT_SPIN: Record<LimbType, number> = {
  head: 0.15, // Subtle wobble
  // Arms - counter-rotate left/right
  arm_shoulder_left: -0.12,
  arm_shoulder_right: 0.12,
  arm_upperarm_left: -0.18,
  arm_upperarm_right: 0.18,
  arm_forearm_left: -0.22,
  arm_forearm_right: 0.22,
  arm_hand_left: -0.28,
  arm_hand_right: 0.28,
  // Legs - counter-rotate left/right
  leg_left_thigh: -0.1,
  leg_right_thigh: 0.1,
  leg_left_calf: -0.15,
  leg_right_calf: 0.15,
  leg_left_feet: -0.2,
  leg_right_feet: 0.2,
  // Torso
  torso_front: 0.05,
  torso_back: -0.05,
};

/**
 * Explosion configuration per limb
 * 17-part schematic-style arrangement for dramatic visual effect:
 * - Spread reduced to keep within viewport bounds
 * - Randomization added at runtime for unpredictability
 * - Dramatic rotations for "floating in space" look
 */
const LIMB_EXPLOSION_CONFIG: Record<LimbType, LimbExplosionConfig> = {
  // HEAD - Top center, prominent position
  head: {
    targetOffset: new THREE.Vector3(2.1, 0.2, 0.8),
    controlOffset: new THREE.Vector3(0, 0.6, 0.4),
    rotation: new THREE.Euler(-0.6, 0.8, -0.2),
    staggerDelay: 0.0,
  },

  // TORSO - Center, split front/back
  torso_front: {
    targetOffset: new THREE.Vector3(1.0, -0.15, 1.2),
    controlOffset: new THREE.Vector3(0, 0.2, 0.4),
    rotation: new THREE.Euler(0.5, -0.6, 0.2),
    staggerDelay: 0.03,
  },
  torso_back: {
    targetOffset: new THREE.Vector3(1.0, -0.3, -1.4),
    controlOffset: new THREE.Vector3(0, 0.1, -0.5),
    rotation: new THREE.Euler(0.7, -1.2, 0.15),
    staggerDelay: 0.05,
  },

  // LEFT ARM - Spread to upper-left quadrant (tighter)
  arm_shoulder_left: {
    targetOffset: new THREE.Vector3(-0.6, 0.6, 0.5),
    controlOffset: new THREE.Vector3(0.3, 0.5, -0.2),
    rotation: new THREE.Euler(0.5, -0.8, 1.2),
    staggerDelay: 0.08,
  },
  arm_upperarm_left: {
    targetOffset: new THREE.Vector3(-0.9, 0.4, 0.25),
    controlOffset: new THREE.Vector3(0.4, 0.6, -0.3),
    rotation: new THREE.Euler(0.6, -1.0, 1.4),
    staggerDelay: 0.14,
  },
  arm_forearm_left: {
    targetOffset: new THREE.Vector3(-1.2, 0.0, -0.15),
    controlOffset: new THREE.Vector3(0.5, 0.7, -0.4),
    rotation: new THREE.Euler(0.7, -1.1, 1.6),
    staggerDelay: 0.2,
  },
  arm_hand_left: {
    targetOffset: new THREE.Vector3(-1.8, -0.3, -0.5),
    controlOffset: new THREE.Vector3(0.6, 0.8, -0.5),
    rotation: new THREE.Euler(0.9, -1.2, 1.8),
    staggerDelay: 0.28,
  },

  // RIGHT ARM - Spread to upper-right quadrant (tighter)
  arm_shoulder_right: {
    targetOffset: new THREE.Vector3(1.5, 0.6, -0.4),
    controlOffset: new THREE.Vector3(-0.3, 0.5, -0.2),
    rotation: new THREE.Euler(0.4, 0.7, 0.5),
    staggerDelay: 0.06,
  },
  arm_upperarm_right: {
    targetOffset: new THREE.Vector3(1.2, 0.25, -0.7),
    controlOffset: new THREE.Vector3(-0.4, 0.6, -0.3),
    rotation: new THREE.Euler(0.5, 0.9, 0.7),
    staggerDelay: 0.12,
  },
  arm_forearm_right: {
    targetOffset: new THREE.Vector3(1.2, -0.15, -1.0),
    controlOffset: new THREE.Vector3(-0.5, 0.7, -0.4),
    rotation: new THREE.Euler(0.55, 1.0, 0.8),
    staggerDelay: 0.18,
  },
  arm_hand_right: {
    targetOffset: new THREE.Vector3(1.5, -0.5, -1.3),
    controlOffset: new THREE.Vector3(-0.6, 0.8, -0.4),
    rotation: new THREE.Euler(0.6, 1.1, 0.9),
    staggerDelay: 0.26,
  },

  // LEFT LEG - Spread to lower-left quadrant (tighter)
  leg_left_thigh: {
    targetOffset: new THREE.Vector3(-0.5, -0.1, 0.4),
    controlOffset: new THREE.Vector3(-0.3, -0.3, 0.5),
    rotation: new THREE.Euler(0.15, -0.9, 1.3),
    staggerDelay: 0.1,
  },
  leg_left_calf: {
    targetOffset: new THREE.Vector3(-0.9, -0.2, 0.6),
    controlOffset: new THREE.Vector3(-0.5, -0.5, 0.7),
    rotation: new THREE.Euler(0.2, -1.1, 1.5),
    staggerDelay: 0.16,
  },
  leg_left_feet: {
    targetOffset: new THREE.Vector3(-1.2, -0.6, 0.9),
    controlOffset: new THREE.Vector3(-0.7, -0.6, 0.8),
    rotation: new THREE.Euler(0.25, -1.3, 1.8),
    staggerDelay: 0.24,
  },

  // RIGHT LEG - Spread to lower-right quadrant (tighter)
  leg_right_thigh: {
    targetOffset: new THREE.Vector3(0.8, 0, -0.3),
    controlOffset: new THREE.Vector3(0.3, -0.3, -0.4),
    rotation: new THREE.Euler(0.35, 0.9, 0.4),
    staggerDelay: 0.12,
  },
  leg_right_calf: {
    targetOffset: new THREE.Vector3(1.1, -0.2, -0.6),
    controlOffset: new THREE.Vector3(0.5, -0.5, -0.6),
    rotation: new THREE.Euler(0.4, 1.1, 0.5),
    staggerDelay: 0.18,
  },
  leg_right_feet: {
    targetOffset: new THREE.Vector3(1.3, -0.6, -1.0),
    controlOffset: new THREE.Vector3(0.7, -0.6, -0.8),
    rotation: new THREE.Euler(0.5, 1.3, 0.6),
    staggerDelay: 0.24,
  },
};

/**
 * Random spread factor applied at runtime for unpredictable explosion
 * Each explosion will have slightly different positions. Reduced to keep in view.
 */
const EXPLOSION_RANDOM_SPREAD = 0.3;

/**
 * Orchestrates cinematic exploded view animations for the Iron Man suit schematic.
 *
 * Implements a state machine with four states:
 * - `assembled` - Default state, suit is intact
 * - `exploding` - Transition animation, limbs flying outward
 * - `exploded` - Limbs separated with levitation animation
 * - `assembling` - Transition animation, limbs returning to torso
 *
 * Animation features:
 * - Quadratic Bezier curve trajectories for organic movement
 * - Per-limb velocity multipliers (lighter parts move faster)
 * - Micro-rotation during flight for "floating in space" effect
 * - Staggered timing with random jitter for natural feel
 * - Post-explosion levitation loop with gentle bobbing
 *
 * @example
 * ```typescript
 * const manager = new ExplodedViewManager({
 *   animationDuration: 1.2,
 *   enableSound: true,
 *   onLimbMoveStart: (limbName, mesh) => particles.startEmitting(mesh),
 *   onLimbMoveEnd: (limbName, mesh) => particles.stopEmitting(mesh),
 * });
 * manager.initialize(schematicGroup);
 * await manager.explode();
 * ```
 */
export class ExplodedViewManager {
  private state: ExplodedViewState = 'assembled';
  private limbMeshes: Map<LimbType, THREE.Object3D> = new Map();
  private originalStates: Map<LimbType, LimbOriginalState> = new Map();
  private config: ExplodedViewConfig;
  private timeline: gsap.core.Timeline | null = null;
  private levitationTimeline: gsap.core.Timeline | null = null;

  // Performance: Pre-allocated temp objects to avoid per-frame GC pressure in animation callbacks
  private readonly _tempTangent: THREE.Vector3 = new THREE.Vector3();

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
   * Initializes the manager with limb references from the loaded 3D model.
   *
   * Traverses the schematic group and registers each limb mesh by name,
   * storing original position and rotation for animation return points.
   *
   * @param schematic - The loaded Three.js Group containing named limb meshes
   *
   * @remarks
   * Must be called after the GLB model is fully loaded. Expected 17 limb names
   * matching the articulated model parts.
   */
  initialize(schematic: THREE.Group): void {
    // Find and store references to each limb mesh (17 parts)
    const limbNames: LimbType[] = [
      'head',
      'torso_front',
      'torso_back',
      'arm_shoulder_left',
      'arm_upperarm_left',
      'arm_forearm_left',
      'arm_hand_left',
      'arm_shoulder_right',
      'arm_upperarm_right',
      'arm_forearm_right',
      'arm_hand_right',
      'leg_left_thigh',
      'leg_left_calf',
      'leg_left_feet',
      'leg_right_thigh',
      'leg_right_calf',
      'leg_right_feet',
    ];

    schematic.traverse((child) => {
      if (child instanceof THREE.Mesh && limbNames.includes(child.name as LimbType)) {
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

    console.log(`[ExplodedViewManager] Initialized with ${this.limbMeshes.size} limbs`);
  }

  /**
   * Loads sound effects for animation feedback.
   *
   * Uses Howler.js to preload audio assets:
   * - `servo-whir.mp3` - Looped during limb movement
   * - `metal-click.mp3` - Plays on animation completion
   * - `power-up.mp3` - Plays on animation start
   *
   * @remarks
   * Gracefully handles missing audio files with console warnings.
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
   * Returns the current animation state.
   *
   * @returns Current state: `assembled`, `exploding`, `exploded`, or `assembling`
   */
  getState(): ExplodedViewState {
    return this.state;
  }

  /**
   * Checks whether an animation is currently in progress.
   *
   * @returns `true` if in `exploding` or `assembling` state
   */
  isAnimating(): boolean {
    return this.state === 'exploding' || this.state === 'assembling';
  }

  /**
   * Retrieves a limb mesh reference by type.
   *
   * Used by WorkshopController for direct manipulation during exploded grab.
   *
   * @param limbType - The limb identifier
   * @returns The limb mesh if registered, or `undefined`
   */
  getLimbMesh(limbType: LimbType): THREE.Object3D | undefined {
    return this.limbMeshes.get(limbType);
  }

  /**
   * Pauses the levitation animation for limb manipulation.
   *
   * Called when the user grabs a limb to prevent the bobbing animation
   * from conflicting with hand-controlled movement.
   *
   * @param limbType - The limb being grabbed (for logging)
   *
   * @remarks
   * Currently pauses the entire levitation timeline, not just the grabbed limb,
   * for implementation simplicity.
   */
  pauseLevitationForLimb(limbType: LimbType): void {
    // The levitation timeline animates all limbs together
    // For simplicity, we pause the entire levitation when any limb is grabbed
    if (this.levitationTimeline && !this.levitationTimeline.paused()) {
      this.levitationTimeline.pause();
      console.log(`[ExplodedViewManager] Paused levitation for limb grab: ${limbType}`);
    }
  }

  /**
   * Resumes levitation animation after limb release.
   *
   * Restarts the levitation timeline from current mesh positions rather than
   * resuming, which allows user-moved parts to maintain their new positions.
   */
  resumeLevitation(): void {
    // Instead of resuming (which would animate back to old positions),
    // restart the levitation from wherever the limbs currently are.
    // This allows user-moved parts to stay in their new positions.
    if (this.state === 'exploded') {
      console.log('[ExplodedViewManager] Restarting levitation from current positions');
      // startLevitation will kill the old timeline and create a new one
      // based on current mesh.position values
      this.startLevitation();
    }
  }

  /**
   * Triggers the explosion animation - limbs fly outward from the torso.
   *
   * Three-phase cinematic animation:
   * 1. **Anticipation** (0.15s): Brief pause with glow intensification
   * 2. **Burst** (1.6s): Rapid outward motion along Bezier curves with micro-rotations
   * 3. **Settle**: Elastic overshoot handled by `expo.out` easing
   *
   * @returns Promise that resolves when animation completes
   *
   * @remarks
   * Only triggers from `assembled` state. Automatically transitions to
   * `exploded` state and starts levitation loop on completion.
   */
  async explode(): Promise<void> {
    if (this.state !== 'assembled') {
      console.log('[ExplodedViewManager] Cannot explode - not in assembled state');
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

      // Define Bezier points with runtime randomization for unpredictability
      // P0: Start (original position)
      const p0 = originalState.position.clone();

      // P2: End (target position with random offset for variety)
      const randomOffset = new THREE.Vector3(
        (Math.random() - 0.5) * 2 * EXPLOSION_RANDOM_SPREAD,
        (Math.random() - 0.5) * 2 * EXPLOSION_RANDOM_SPREAD,
        (Math.random() - 0.5) * 2 * EXPLOSION_RANDOM_SPREAD
      );
      const p2 = p0.clone().add(explosionConfig.targetOffset).add(randomOffset);

      // P1: Control Point (arc) with slight randomization
      const controlRandomOffset = new THREE.Vector3(
        (Math.random() - 0.5) * EXPLOSION_RANDOM_SPREAD * 0.5,
        (Math.random() - 0.5) * EXPLOSION_RANDOM_SPREAD * 0.5,
        (Math.random() - 0.5) * EXPLOSION_RANDOM_SPREAD * 0.5
      );
      const p1 = p0.clone().add(explosionConfig.controlOffset).add(controlRandomOffset);

      // Animation params
      const velocityMultiplier = LIMB_VELOCITY_MULTIPLIER[limbName];
      const limbDuration = CINEMATIC_TIMING.burst * velocityMultiplier;
      const staggerJitter = (Math.random() - 0.5) * 0.04;
      const staggerTime = burstStartTime + explosionConfig.staggerDelay + staggerJitter;

      const targetRotation = new THREE.Euler(
        originalState.rotation.x + explosionConfig.rotation.x,
        originalState.rotation.y + explosionConfig.rotation.y + LIMB_FLIGHT_SPIN[limbName],
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

            // Calculate tangent for particle emission direction (using pre-allocated temp)
            this.getBezierTangent(progressObj.t, p0, p1, p2, this._tempTangent);

            // Pass tangent as velocity for particle trails
            // Scale it up based on 1-t to simulate speed (highest at start)
            this._tempTangent.multiplyScalar(5 * (1 - progressObj.t));

            this.config.onLimbMoveUpdate?.(limbName, mesh, this._tempTangent);
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
   * Triggers the assembly animation - limbs fly back to the torso.
   *
   * Cinematic reassembly sequence:
   * - **Phase 1**: Torso returns first (fastest)
   * - **Phase 2**: Arms and legs follow with staggered timing
   * - **Phase 3**: Head returns last with 360° spin flourish
   *
   * @returns Promise that resolves when animation completes
   *
   * @remarks
   * Only triggers from `exploded` state. Stops levitation animation
   * and returns all limbs to their original positions.
   */
  async assemble(): Promise<void> {
    if (this.state !== 'exploded') {
      console.log('[ExplodedViewManager] Cannot assemble - not in exploded state');
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

    // Custom Assembly Sequence - 17 parts with cascading timing:
    // 1. Torso → Shoulders → Upper arms → Forearms → Hands (inner to outer)
    // 2. Thighs → Calves → Feet (top to bottom)
    // 3. Head (Faceplate) - Last, with spin

    const sequenceGroups: { [key: string]: LimbType[] } = {
      torso_back: ['torso_back'],
      torso_front: ['torso_front'],
      shoulders: ['arm_shoulder_left', 'arm_shoulder_right'],
      upperArms: ['arm_upperarm_left', 'arm_upperarm_right'],
      forearms: ['arm_forearm_left', 'arm_forearm_right'],
      hands: ['arm_hand_left', 'arm_hand_right'],
      thighs: ['leg_left_thigh', 'leg_right_thigh'],
      calves: ['leg_left_calf', 'leg_right_calf'],
      feet: ['leg_left_feet', 'leg_right_feet'],
      head: ['head'],
    };

    // Delays relative to timeline start - cascading from center outward
    const sequenceDelays: { [key: string]: number } = {
      torso_back: 0.0,
      torso_front: 0.63,
      shoulders: 0.08,
      thighs: 0.12,
      upperArms: 0.18,
      calves: 0.22,
      forearms: 0.28,
      feet: 0.32,
      hands: 0.38,
      head: 0.5,
    };

    for (const [groupName, limbs] of Object.entries(sequenceGroups)) {
      const groupDelay = sequenceDelays[groupName];

      for (const limbName of limbs) {
        const mesh = this.limbMeshes.get(limbName);
        const explosionConfig = LIMB_EXPLOSION_CONFIG[limbName];
        const originalState = this.originalStates.get(limbName);

        if (!mesh || !originalState) continue;

        // Calculate Bezier points for assembly animation:
        // - p0: Target (original assembled position)
        // - p2: Current position (where the mesh actually is now - may have been moved by user)
        // - p1: Control point for curve arc (computed dynamically)
        const p0 = originalState.position.clone();
        const p2 = mesh.position.clone(); // Use CURRENT position, not config offset

        // Compute a control point that creates a nice arc between current and target positions.
        // Use the midpoint raised slightly along the explosion control offset direction for visual consistency.
        const midpoint = p0.clone().add(p2).multiplyScalar(0.5);
        // Add a fraction of the original control offset to create an arc (scaled down for subtlety)
        const p1 = midpoint.add(explosionConfig.controlOffset.clone().multiplyScalar(0.5));

        const velocityMultiplier = LIMB_VELOCITY_MULTIPLIER[limbName];

        // Dynamic duration: Torso parts move faster
        let durationMultiplier = 0.8;
        if (limbName === 'torso_front' || limbName === 'torso_back') {
          durationMultiplier = 0.5; // SUPER FAST TORSO
        }

        const baseDuration = CINEMATIC_TIMING.burst * velocityMultiplier * durationMultiplier;

        // Stagger within groups
        const intraGroupStagger = groupName !== 'head' ? Math.random() * 0.08 : 0;
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

              // Use pre-allocated temp tangent for particle emission
              this.getBezierTangent(t, p0, p1, p2, this._tempTangent);
              this._tempTangent.negate().multiplyScalar(5 * progressObj.p);

              this.config.onLimbMoveUpdate?.(limbName, mesh, this._tempTangent);
            },
            onComplete: () => {
              this.config.onLimbMoveEnd?.(limbName, mesh);
              mesh.position.copy(originalState.position);
              mesh.rotation.copy(originalState.rotation);
              // Trigger per-limb assembly completion sound
              this.config.onLimbAssemblyComplete?.(limbName);
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
   * Toggles between exploded and assembled states.
   *
   * Calls {@link explode} if currently assembled, or {@link assemble} if exploded.
   * Ignores input while an animation is in progress.
   *
   * @returns Promise that resolves when the triggered animation completes
   */
  async toggle(): Promise<void> {
    if (this.isAnimating()) {
      console.log('[ExplodedViewManager] Animation in progress, ignoring toggle');
      return;
    }

    if (this.state === 'assembled') {
      await this.explode();
    } else if (this.state === 'exploded') {
      await this.assemble();
    }
  }

  /**
   * Immediately resets all limbs to their original positions without animation.
   *
   * Kills any active timeline, stops levitation, and snaps limbs back to
   * their registered original transforms.
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
   * Immediately places parts in their exploded positions without animation.
   *
   * Used for the startup sequence where we want to start "exploded" but hidden,
   * so we can animate the assembly.
   *
   * @param distanceMultiplier - Multiplier for explosion distance (default 1.0).
   *                             Use larger values (e.g. 10.0) to place parts off-screen.
   */
  forceExplodedState(distanceMultiplier: number = 1.0): void {
    this.timeline?.kill();

    for (const [limbName, mesh] of this.limbMeshes) {
      const originalState = this.originalStates.get(limbName);
      const explosionConfig = LIMB_EXPLOSION_CONFIG[limbName];

      if (originalState && explosionConfig) {
        // Calculate target position (P0 + TargetOffset * distanceMultiplier)
        const offset = explosionConfig.targetOffset.clone().multiplyScalar(distanceMultiplier);
        const targetPos = originalState.position.clone().add(offset);

        // Calculate target rotation
        const targetRot = new THREE.Euler(
          originalState.rotation.x + explosionConfig.rotation.x,
          originalState.rotation.y + explosionConfig.rotation.y + LIMB_FLIGHT_SPIN[limbName],
          originalState.rotation.z + explosionConfig.rotation.z
        );

        // Apply immediately
        mesh.position.copy(targetPos);
        mesh.rotation.copy(targetRot);
      }
    }

    this.setState('exploded');
    // Only start levitation if we are at normal distance.
    // If we are way off screen, levitation isn't visible/needed and might look weird when flying in.
    if (distanceMultiplier <= 1.5) {
      this.startLevitation();
    } else {
      this.stopLevitation();
    }
    console.log(`[ExplodedViewManager] Forced exploded state (multiplier: ${distanceMultiplier})`);
  }

  /**
   * Calculates a point on a quadratic Bezier curve.
   *
   * Formula: B(t) = (1-t)² × P0 + 2(1-t)t × P1 + t² × P2
   *
   * @param t - Interpolation parameter (0 = start, 1 = end)
   * @param p0 - Start point
   * @param p1 - Control point (defines curve arc)
   * @param p2 - End point
   * @param target - Output vector (mutated in place)
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

    target.set(0, 0, 0).addScaledVector(p0, a).addScaledVector(p1, b).addScaledVector(p2, c);
  }

  /**
   * Calculates the tangent (velocity direction) at a point on a quadratic Bezier curve.
   *
   * Formula: B'(t) = 2(1-t)(P1 - P0) + 2t(P2 - P1)
   *
   * @param t - Interpolation parameter (0 = start, 1 = end)
   * @param p0 - Start point
   * @param p1 - Control point
   * @param p2 - End point
   * @param target - Output vector (mutated in place, normalized)
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

    target.set(a * v1x + b * v2x, a * v1y + b * v2y, a * v1z + b * v2z).normalize();
  }

  /**
   * Starts the levitation loop for exploded limbs.
   *
   * Creates an infinite yoyo timeline that gently bobs each limb with:
   * - Random phase offsets for organic asynchrony
   * - Subtle Y-axis position oscillation
   * - Minimal Z-axis rotation drift
   * - Periodic particle pulse callbacks
   *
   * @remarks
   * Only activates in `exploded` state. Automatically kills any previous
   * levitation timeline before creating a new one.
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

  /**
   * Stops the levitation animation loop.
   *
   * Kills the levitation timeline and emits a move-end callback for the torso
   * to ensure any continuous particle effects are properly terminated.
   */
  private stopLevitation(): void {
    if (this.levitationTimeline) {
      this.levitationTimeline.kill();
      this.levitationTimeline = null;

      // Ensure torso trails are stopped (since they run continuously)
      const torsoFrontMesh = this.limbMeshes.get('torso_front');
      if (torsoFrontMesh) {
        this.config.onLimbMoveEnd?.('torso_front', torsoFrontMesh);
      }
      const torsoBackMesh = this.limbMeshes.get('torso_back');
      if (torsoBackMesh) {
        this.config.onLimbMoveEnd?.('torso_back', torsoBackMesh);
      }
    }
  }

  /**
   * Updates the internal state and notifies listeners.
   *
   * @param newState - The new animation state to transition to
   */
  private setState(newState: ExplodedViewState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.config.onStateChange?.(newState);
      console.log(`[ExplodedViewManager] State: ${newState}`);
    }
  }

  /**
   * Plays a sound effect if sound is enabled.
   *
   * @param soundName - Key identifying the sound to play
   */
  private playSound(soundName: keyof typeof this.sounds): void {
    if (!this.config.enableSound) return;
    this.sounds[soundName]?.play();
  }

  /**
   * Stops a currently playing sound effect.
   *
   * @param soundName - Key identifying the sound to stop
   */
  private stopSound(soundName: keyof typeof this.sounds): void {
    if (!this.config.enableSound) return;
    this.sounds[soundName]?.stop();
  }

  /**
   * Disposes all resources held by the manager.
   *
   * Cleanup includes:
   * - Killing active animation timelines
   * - Stopping and unloading all audio resources
   * - Clearing limb mesh and original state references
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
