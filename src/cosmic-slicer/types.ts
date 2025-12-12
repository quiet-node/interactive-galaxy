/**
 * Cosmic Slicer Type Definitions
 * Configuration and state types for the cosmic slicing game mode
 */

import * as THREE from 'three';

/**
 * Types of cosmic objects that can be sliced
 */
export enum CosmicObjectType {
  CRYSTAL = 'crystal',
  METEOR = 'meteor',
  STAR = 'star',
  DEBRIS = 'debris',
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
export const COSMIC_OBJECT_CONFIGS: Record<
  CosmicObjectType,
  CosmicObjectConfig
> = {
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
  [CosmicObjectType.DEBRIS]: {
    type: CosmicObjectType.DEBRIS,
    color: new THREE.Color(0x8db7ff), // Electric steel blue
    emissiveColor: new THREE.Color(0x5a9dff),
    emissiveIntensity: 1.15,
    scale: 0.55,
    speed: 2.8,
    collisionRadius: 0.5,
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
  starCount: 15000,
  starSpread: 50,
  starSize: 0.6,
  twinkleSpeed: 1.0,
};

/**
 * Main cosmic slicer controller configuration
 */
export interface CosmicSlicerConfig {
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
 * Default cosmic slicer configuration
 */
export const DEFAULT_COSMIC_SLICER_CONFIG: CosmicSlicerConfig = {
  objectPool: DEFAULT_OBJECT_POOL_CONFIG,
  handTrail: DEFAULT_HAND_TRAIL_CONFIG,
  sliceEffect: DEFAULT_SLICE_EFFECT_CONFIG,
  background: DEFAULT_COSMIC_BACKGROUND_CONFIG,
  debug: false,
};

/**
 * Debug information for the cosmic slicer
 */
export interface CosmicSlicerDebugInfo {
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
}
