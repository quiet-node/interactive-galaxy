/**
 * FoggyMirrorTypes - Type definitions for foggy mirror interaction mode
 * Defines interfaces and types for the fog overlay clearing feature
 */

/**
 * Configuration for FogOverlay
 */
export interface FogOverlayConfig {
  /** Blur intensity in pixels (CSS filter) */
  readonly blurAmount: number;
  /** Background color of the fog overlay */
  readonly backgroundColor: string;
  /** Enable high DPI rendering for canvas */
  readonly enableHighDPI: boolean;
}

/**
 * Default configuration for FogOverlay
 */
export const DEFAULT_FOG_OVERLAY_CONFIG: FogOverlayConfig = {
  blurAmount: 80,
  backgroundColor: 'rgba(220, 220, 220, 0.85)', // Dense fog
  enableHighDPI: true,
};

/**
 * Configuration for HandTrailTracker
 */
export interface HandTrailConfig {
  /** Number of interpolation points between consecutive hand positions */
  readonly interpolationPoints: number;
  /** Minimum movement distance (pixels) to register as movement */
  readonly minMovementThreshold: number;
  /** Maximum number of trail points to track per hand */
  readonly maxTrailLength: number;
  /** Base clear radius in pixels */
  readonly baseClearRadius: number;
  /** Enable dynamic radius based on hand size */
  readonly dynamicRadius: boolean;
}

/**
 * Default configuration for HandTrailTracker
 */
export const DEFAULT_HAND_TRAIL_CONFIG: HandTrailConfig = {
  interpolationPoints: 5,
  minMovementThreshold: 2,
  maxTrailLength: 50,
  baseClearRadius: 60,
  dynamicRadius: true,
};

/**
 * Represents a 2D point in screen coordinates
 */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/**
 * Represents a single trail point with radius information
 */
export interface TrailPoint extends Point2D {
  /** Radius of the wipe effect at this point */
  readonly radius: number;
  /** Timestamp when this point was created */
  readonly timestamp: number;
}

/**
 * Tracked hand data with position and movement history
 */
export interface TrackedHand {
  /** Current palm position (normalized 0-1 coordinates) */
  readonly palmPosition: Point2D;
  /** Previous palm position for interpolation */
  readonly previousPosition: Point2D | null;
  /** Trail of interpolated points for smooth rendering */
  readonly trail: readonly TrailPoint[];
  /** Calculated hand size (distance between key landmarks) */
  readonly handSize: number;
  /** Handedness: 'Left' or 'Right' */
  readonly handedness: string;
  /** Instantaneous velocity in pixels per frame */
  readonly velocity: number;
}

/**
 * Configuration for FoggyMirrorController
 */
export interface FoggyMirrorConfig {
  /** Configuration for fog overlay */
  readonly fogOverlay: Partial<FogOverlayConfig>;
  /** Configuration for hand trail tracking */
  readonly handTrail: Partial<HandTrailConfig>;
  /** Enable debug visualization */
  readonly debug: boolean;
}

/**
 * Default configuration for FoggyMirrorController
 */
export const DEFAULT_FOGGY_MIRROR_CONFIG: FoggyMirrorConfig = {
  fogOverlay: {},
  handTrail: {},
  debug: false,
};

/**
 * State of the foggy mirror controller
 */
export type FoggyMirrorState = 'uninitialized' | 'ready' | 'active' | 'disposed';

/**
 * Debug information for FoggyMirrorController
 */
export interface FoggyMirrorDebugInfo {
  /** Number of hands currently detected */
  handsDetected: number;
  /** Current FPS of the update loop */
  fps: number;
  /** Number of active trail points being tracked */
  trailPoints: number;
  /** Percentage of the screen cleared (0-100) */
  clearedPercentage: number;
  /** Average wipe velocity (pixels/frame) */
  avgVelocity: number;
  /** Average brush size (pixels) */
  avgBrushSize: number;
}
