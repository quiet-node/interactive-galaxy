/**
 * Hologram Mode Types
 * Type definitions for the Iron Man holographic interface
 */

/**
 * Configuration for the hologram mode
 */
export interface HologramConfig {
  /** Enable debug mode */
  debug: boolean;
  /** Bloom intensity (0-3) */
  bloomStrength: number;
  /** Bloom radius */
  bloomRadius: number;
  /** Bloom threshold */
  bloomThreshold: number;
  /** Primary hologram color */
  primaryColor: number;
  /** Secondary hologram color */
  secondaryColor: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_HOLOGRAM_CONFIG: HologramConfig = {
  debug: false,
  bloomStrength: 1.5,
  bloomRadius: 0.4,
  bloomThreshold: 0.1,
  primaryColor: 0x00ffff, // Cyan
  secondaryColor: 0x00ff88, // Green-cyan
};

/**
 * Debug information for the hologram mode
 */
export interface HologramDebugInfo {
  fps: number;
  handsDetected: number;
  activeElements: number;
  bloomEnabled: boolean;
  isGrabbing: boolean;
  isHovering: boolean;
  /** Current grab target: 'body' or null */
  grabTarget: string | null;
}
