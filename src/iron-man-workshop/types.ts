/**
 * @fileoverview Type definitions for the Iron Man holographic workshop mode.
 *
 * Provides configuration interfaces, debug info structures, and state types
 * used across the workshop module.
 *
 * @module iron-man-workshop/types
 */

/**
 * Configuration options for the workshop mode.
 */
export interface WorkshopConfig {
  /** Enable debug overlays and info display */
  debug: boolean;
  /** Bloom post-processing intensity (0-3) */
  bloomStrength: number;
  /** Bloom blur radius */
  bloomRadius: number;
  /** Luminance threshold for bloom activation */
  bloomThreshold: number;
  /** Primary hologram color (hex value) */
  primaryColor: number;
  /** Secondary hologram color (hex value) */
  secondaryColor: number;
}

/**
 * Default configuration values for the workshop mode.
 */
export const DEFAULT_WORKSHOP_CONFIG: WorkshopConfig = {
  debug: false,
  bloomStrength: 1.5,
  bloomRadius: 0.4,
  bloomThreshold: 0.1,
  primaryColor: 0x00ffff, // Cyan
  secondaryColor: 0x00ff88, // Green-cyan
};

/**
 * Debug information snapshot for the workshop debug overlay.
 */
export interface WorkshopDebugInfo {
  /** Current frames per second */
  fps: number;
  /** Number of hands currently tracked */
  handsDetected: number;
  /** Count of active scene elements */
  activeElements: number;
  /** Whether bloom post-processing is active */
  bloomEnabled: boolean;
  /** Whether any hand is currently grabbing */
  isGrabbing: boolean;
  /** Whether any hand is hovering over the schematic */
  isHovering: boolean;
  /** Current grab target identifier, or null if not grabbing */
  grabTarget: string | null;
}

/**
 * Animation state machine values for the exploded view feature.
 *
 * State transitions:
 * - `assembled` → `exploding` → `exploded`
 * - `exploded` → `assembling` → `assembled`
 */
export type ExplodedViewState = 'assembled' | 'exploding' | 'exploded' | 'assembling';
