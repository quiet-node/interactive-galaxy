/**
 * Cosmic Slash Type Definitions
 * Configuration and state types for the cosmic slash game mode
 */

import * as THREE from 'three';

/**
 * Types of cosmic objects that can be sliced
 */
export enum CosmicObjectType {
  CRYSTAL = 'crystal',
  METEOR = 'meteor',
  STAR = 'star',
  VOID_PEARL = 'void-pearl',
  NEBULA_CORE = 'nebula-core',
  ANCIENT_RELIC = 'ancient-relic',
  COMET_EMBER = 'comet-ember',
}

/**
 * State of a cosmic object in its lifecycle
 */
export enum CosmicObjectState {
  /** Object is available in the pool */
  POOLED = 'pooled',
  /** Object is active and moving toward the camera */
  ACTIVE = 'active',
  /** Object has been sliced and is exploding */
  SLICED = 'sliced',
  /** Object passed the camera without being sliced */
  MISSED = 'missed',
}

/**
 * Configuration for a cosmic object
 */
export interface CosmicObjectConfig {
  /** Type of cosmic object */
  type: CosmicObjectType;
  /** Base color of the object */
  color: THREE.Color;
  /** Emissive color for glow effect */
  emissiveColor: THREE.Color;
  /** Emissive intensity (0-2) */
  emissiveIntensity: number;
  /** Base scale of the object */
  scale: number;
  /** Movement speed (units per second) */
  speed: number;
  /** Bounding sphere radius for collision */
  collisionRadius: number;
}

/**
 * Default configurations for each object type
 * Larger scale and more vibrant colors for visual impact
 */
export const COSMIC_OBJECT_CONFIGS: Record<CosmicObjectType, CosmicObjectConfig> = {
  [CosmicObjectType.CRYSTAL]: {
    type: CosmicObjectType.CRYSTAL,
    color: new THREE.Color(0x7fe4ff), // Premium icy aqua
    emissiveColor: new THREE.Color(0x5bd3ff),
    emissiveIntensity: 1.8,
    scale: 0.68,
    speed: 2.0,
    collisionRadius: 0.6,
  },
  [CosmicObjectType.METEOR]: {
    type: CosmicObjectType.METEOR,
    color: new THREE.Color(0xff7b3a), // Hot solar flare orange
    emissiveColor: new THREE.Color(0xff4f2f),
    emissiveIntensity: 1.4,
    scale: 0.72,
    speed: 2.45,
    collisionRadius: 0.62,
  },
  [CosmicObjectType.STAR]: {
    type: CosmicObjectType.STAR,
    color: new THREE.Color(0xfff6d5), // Warm stellar white
    emissiveColor: new THREE.Color(0xffd27a),
    emissiveIntensity: 2.6,
    scale: 0.58,
    speed: 1.7,
    collisionRadius: 0.55,
  },
  [CosmicObjectType.VOID_PEARL]: {
    type: CosmicObjectType.VOID_PEARL,
    color: new THREE.Color(0x4336ff),
    emissiveColor: new THREE.Color(0xb0a6ff),
    emissiveIntensity: 1.05,
    scale: 0.62,
    speed: 2.1,
    collisionRadius: 0.56,
  },
  [CosmicObjectType.NEBULA_CORE]: {
    type: CosmicObjectType.NEBULA_CORE,
    color: new THREE.Color(0x7a5cff),
    emissiveColor: new THREE.Color(0xff5fd7),
    emissiveIntensity: 1.2,
    scale: 0.66,
    speed: 2.15,
    collisionRadius: 0.58,
  },
  [CosmicObjectType.ANCIENT_RELIC]: {
    type: CosmicObjectType.ANCIENT_RELIC,
    color: new THREE.Color(0xffd28a),
    emissiveColor: new THREE.Color(0xffb84a),
    emissiveIntensity: 0.95,
    scale: 0.66,
    speed: 2.25,
    collisionRadius: 0.58,
  },
  [CosmicObjectType.COMET_EMBER]: {
    type: CosmicObjectType.COMET_EMBER,
    color: new THREE.Color(0xff5a3c),
    emissiveColor: new THREE.Color(0xffc06b),
    emissiveIntensity: 1.25,
    scale: 0.6,
    speed: 2.7,
    collisionRadius: 0.54,
  },
};

/**
 * Runtime state of a cosmic object instance
 */
export interface CosmicObjectInstance {
  /** Unique identifier */
  id: number;
  /** Current state */
  state: CosmicObjectState;
  /** Object type configuration */
  config: CosmicObjectConfig;
  /** The Three.js object (Mesh or Group) */
  mesh: THREE.Object3D;
  /** Current position */
  position: THREE.Vector3;
  /** Current velocity (direction * speed) */
  velocity: THREE.Vector3;
  /** Rotation speed for visual effect */
  rotationSpeed: THREE.Vector3;
  /** Time when object was activated */
  activatedAt: number;
  /** Bounding sphere for collision detection */
  boundingSphere: THREE.Sphere;
}

/**
 * Configuration for the object pool manager
 */
export interface ObjectPoolConfig {
  /** Maximum number of objects in the pool */
  poolSize: number;
  /** Maximum number of active objects at once */
  maxActiveObjects: number;
  /** Spawn rate (objects per second) */
  spawnRate: number;
  /** Spawn zone z position (behind camera) */
  spawnZPosition: number;
  /** Spawn spread in x/y axis */
  spawnSpread: number;
  /** Z position at which objects are recycled (passed camera) */
  despawnZPosition: number;
}

/**
 * Default object pool configuration
 */
export const DEFAULT_OBJECT_POOL_CONFIG: ObjectPoolConfig = {
  poolSize: 25,
  maxActiveObjects: 12,
  spawnRate: 1.5,
  spawnZPosition: -15,
  spawnSpread: 8,
  despawnZPosition: 5,
};

/**
 * Configuration for ribbon trail rendering
 */
export interface HandTrailConfig {
  /** Maximum trail points */
  maxPoints: number;
  /** Ribbon width in world units */
  ribbonWidth: number;
  /** Trail points for collision detection */
  trailLength: number;
  /** Core color (bright center) */
  coreColor: string;
  /** Glow color (outer edge) */
  glowColor: string;
}

/**
 * Default hand trail configuration
 */
export const DEFAULT_HAND_TRAIL_CONFIG: HandTrailConfig = {
  maxPoints: 64,
  ribbonWidth: 0.1,
  trailLength: 24,
  coreColor: '#ffffff',
  glowColor: '#000000',
};

/**
 * Configuration for slice explosion effect
 */
export interface SliceEffectConfig {
  /** Number of particles per explosion */
  particleCount: number;
  /** Duration of explosion animation (seconds) */
  duration: number;
  /** Initial outward velocity of particles */
  initialVelocity: number;
  /** Velocity decay per frame */
  velocityDecay: number;
  /** Initial particle size */
  particleSize: number;
}

/**
 * Default slice effect configuration
 */
export const DEFAULT_SLICE_EFFECT_CONFIG: SliceEffectConfig = {
  particleCount: 100,
  duration: 1.2,
  initialVelocity: 4.0,
  velocityDecay: 0.94,
  particleSize: 0.8,
};

/**
 * Configuration for cosmic background
 */
export interface CosmicBackgroundConfig {
  /** Number of background stars */
  starCount: number;
  /** Spread of stars in 3D space */
  starSpread: number;
  /** Base star size */
  starSize: number;
  /** Twinkling speed multiplier */
  twinkleSpeed: number;
}

/**
 * Default cosmic background configuration
 */
export const DEFAULT_COSMIC_BACKGROUND_CONFIG: CosmicBackgroundConfig = {
  starCount: 6500,
  starSpread: 55,
  starSize: 0.45,
  twinkleSpeed: 0.85,
};

/**
 * Main cosmic slash controller configuration
 */
export interface CosmicSlashConfig {
  /** Object pool configuration */
  objectPool: ObjectPoolConfig;
  /** Hand trail configuration */
  handTrail: HandTrailConfig;
  /** Slice effect configuration */
  sliceEffect: SliceEffectConfig;
  /** Cosmic background configuration */
  background: CosmicBackgroundConfig;
  /** Enable debug visualization */
  debug: boolean;
}

/**
 * Default cosmic slash configuration
 */
export const DEFAULT_COSMIC_SLASH_CONFIG: CosmicSlashConfig = {
  objectPool: DEFAULT_OBJECT_POOL_CONFIG,
  handTrail: DEFAULT_HAND_TRAIL_CONFIG,
  sliceEffect: DEFAULT_SLICE_EFFECT_CONFIG,
  background: DEFAULT_COSMIC_BACKGROUND_CONFIG,
  debug: false,
};

/**
 * Debug information for the cosmic slash
 */
export interface CosmicSlashDebugInfo {
  /** Current FPS */
  fps: number;
  /** Number of hands detected */
  handsDetected: number;
  /** Number of active objects */
  activeObjects: number;
  /** Number of objects sliced this session */
  totalSliced: number;
  /** Trail points per hand */
  trailPointCounts: Record<string, number>;
  /** Active explosion count */
  activeExplosions: number;

  /** Renderer draw calls (Three.js renderer.info) */
  drawCalls: number;
  /** Renderer triangle count (Three.js renderer.info) */
  triangles: number;

  /** Current trail render mode */
  trailRenderMode: 'on-top' | 'depth-aware';
  /** Current hand detection throttling interval */
  detectionIntervalMs: number;
}

// ============================================================================
// POW System Types
// ============================================================================

/**
 * POW system state phases
 */
export enum PowPhase {
  /** Charging - accumulating power from slices */
  CHARGING = 'charging',
  /** Ready - fully charged, waiting for activation */
  READY = 'ready',
  /** Active - laser beam is firing */
  ACTIVE = 'active',
  /** Cooldown - brief pause after use before charging resumes */
  COOLDOWN = 'cooldown',
}

/**
 * Current POW state
 */
export interface PowState {
  /** Current charge level (0-1 normalized) */
  charge: number;
  /** Current phase of the POW system */
  phase: PowPhase;
  /** Timestamp when current phase started */
  phaseStartTime: number;
  /** Number of objects destroyed by current/last POW activation */
  destroyedCount: number;
  /** Total score earned from current/last POW activation */
  destroyedScore: number;
}

/**
 * Configuration for the POW system
 */
export interface PowConfig {
  /** Charge gained per slice by object type (0-1 scale) */
  chargePerSlice: Record<CosmicObjectType, number>;
  /** Duration of the laser beam when activated (seconds) */
  activationDuration: number;
  /** Cooldown duration after POW ends before charging resumes (seconds) */
  cooldownDuration: number;
  /** Time both hands must be visible to trigger activation (ms) */
  activationDebounceMs: number;
  /** Minimum distance between hands to consider them "spread" (0-1 normalized screen) */
  minHandSpreadDistance: number;
  /** Score multiplier for objects destroyed by POW laser */
  laserDestroyMultiplier: number;
  /** Charge decay rate per second when not slicing (0 = no decay) */
  chargeDecayPerSecond: number;
  /** Seconds of inactivity before decay starts */
  decayDelaySeconds: number;
}

/**
 * Default POW configuration
 */
export const DEFAULT_POW_CONFIG: PowConfig = {
  chargePerSlice: {
    [CosmicObjectType.STAR]: 0.05,
    [CosmicObjectType.CRYSTAL]: 0.06,
    [CosmicObjectType.METEOR]: 0.07,
    [CosmicObjectType.VOID_PEARL]: 0.08,
    [CosmicObjectType.NEBULA_CORE]: 0.09,
    [CosmicObjectType.ANCIENT_RELIC]: 0.1,
    [CosmicObjectType.COMET_EMBER]: 0.11,
  },
  activationDuration: 2.5,
  cooldownDuration: 0.5,
  activationDebounceMs: 150,
  minHandSpreadDistance: 0.15,
  laserDestroyMultiplier: 2.0,
  chargeDecayPerSecond: 0.02,
  decayDelaySeconds: 3.0,
};

/**
 * Event types emitted by PowManager
 */
export type PowEvent =
  | { type: 'chargeChanged'; charge: number; delta: number }
  | { type: 'phaseChanged'; phase: PowPhase; previousPhase: PowPhase }
  | { type: 'activated' }
  | { type: 'deactivated'; destroyedCount: number; totalScore: number }
  | { type: 'objectDestroyed'; score: number };

/**
 * Listener type for POW events
 */
export type PowEventListener = (state: PowState, event: PowEvent) => void;

/**
 * Configuration for POW bar HUD
 */
export interface PowBarHudConfig {
  /** Position of the bar */
  anchor: 'left' | 'right';
}

/**
 * Configuration for POW laser effect
 */
export interface PowLaserEffectConfig {
  /** Laser beam width in world units */
  beamWidth: number;
  /** Core color (bright center) */
  coreColor: THREE.Color;
  /** Inner glow color */
  innerGlowColor: THREE.Color;
  /** Outer glow color */
  outerGlowColor: THREE.Color;
  /** Intensity multiplier for HDR rendering */
  intensity: number;
  /** Collision radius multiplier for the laser beam */
  collisionRadiusMultiplier: number;
}
