/**
 * WipeToRevealTypes - Type definitions for wipe-to-reveal interaction mode
 * Defines interfaces and types for the blur overlay clearing feature
 */

/**
 * Configuration for BlurOverlay
 */
export interface BlurOverlayConfig {
  /** Blur intensity in pixels (CSS filter) */
  readonly blurAmount: number;
  /** Background color of the blur overlay */
  readonly backgroundColor: string;
  /** Enable high DPI rendering for canvas */
  readonly enableHighDPI: boolean;
}

/**
 * Default configuration for BlurOverlay
 */
export const DEFAULT_BLUR_OVERLAY_CONFIG: BlurOverlayConfig = {
  blurAmount: 30,
  backgroundColor: 'rgba(220, 220, 220, 0.4)', // Semi-transparent misty white
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
  /** Base wipe radius in pixels */
  readonly baseWipeRadius: number;
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
  baseWipeRadius: 60,
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
}

/**
 * Configuration for WipeToRevealController
 */
export interface WipeToRevealConfig {
  /** Configuration for blur overlay */
  readonly blurOverlay: Partial<BlurOverlayConfig>;
  /** Configuration for hand trail tracking */
  readonly handTrail: Partial<HandTrailConfig>;
  /** Enable debug visualization */
  readonly debug: boolean;
}

/**
 * Default configuration for WipeToRevealController
 */
export const DEFAULT_WIPE_TO_REVEAL_CONFIG: WipeToRevealConfig = {
  blurOverlay: {},
  handTrail: {},
  debug: false,
};

/**
 * State of the wipe-to-reveal controller
 */
export type WipeToRevealState = 'uninitialized' | 'ready' | 'active' | 'disposed';

/**
 * Debug information for WipeToRevealController
 */
export interface WipeToRevealDebugInfo {
  fps: number;
  handsDetected: number;
  trailPoints: number;
  clearedPercentage: number;
  avgVelocity: number;
  avgBrushSize: number;
}
