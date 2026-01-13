/**
 * @fileoverview Technical specifications and status data for Mark VI armor components.
 *
 * Provides static data for the holographic info panel, including part names,
 * subtitles, and status indicators for each armor limb.
 *
 * @module iron-man-workshop/data/PartData
 */

/**
 * Information structure for an armor part displayed in the info panel.
 */
export interface PartInfo {
  /** Part display name (e.g., "MARK VI HELMET") */
  title: string;
  /** Secondary description line */
  subtitle: string;
  /** Array of status statistics to display */
  stats: {
    /** Stat label (e.g., "INTEGRITY") */
    label: string;
    /** Stat value (e.g., "100%") */
    value: string;
    /** Status level affecting display color */
    status: 'optimal' | 'warning' | 'critical' | 'normal';
  }[];
}

/**
 * Technical specification data for each Mark VI armor component.
 *
 * Keys correspond to limb identifiers from the articulated GLB model:
 * - `head`, `torso`, `arm_left`, `arm_right`, `leg_left`, `leg_right`
 * - `unknown` serves as a fallback for unrecognized parts
 */
export const MARK_VI_PART_DATA: Record<string, PartInfo> = {
  head: {
    title: 'MARK VI HELMET',
    subtitle: 'RT-Integrated HUD',
    stats: [
      { label: 'OS VER', value: 'JARVIS 12.4.0', status: 'optimal' },
      { label: 'INTEGRITY', value: '100%', status: 'optimal' },
      { label: 'OXYGEN', value: '98%', status: 'normal' },
    ],
  },
  torso: {
    title: 'GENERATION VI CHEST',
    subtitle: 'Vibranium Arc Reactor',
    stats: [
      { label: 'OUTPUT', value: '42.8 GJ/s', status: 'optimal' },
      { label: 'CORE TEMP', value: '2800 K', status: 'warning' },
      { label: 'ARMOR', value: 'Gold-Titanium', status: 'normal' },
    ],
  },
  arm_left: {
    title: 'LEFT GAUNTLET',
    subtitle: 'Repulsor Node 3L',
    stats: [
      { label: 'CHARGE', value: '100%', status: 'optimal' },
      { label: 'STABILIZERS', value: 'ACTIVE', status: 'optimal' },
      { label: 'CALIBRATION', value: '0.002%', status: 'normal' },
    ],
  },
  arm_right: {
    title: 'RIGHT GAUNTLET',
    subtitle: 'Repulsor Node 3R',
    stats: [
      { label: 'CHARGE', value: '100%', status: 'optimal' },
      { label: 'STABILIZERS', value: 'ACTIVE', status: 'optimal' },
      { label: 'MISSILES', value: 'LOADED', status: 'warning' },
    ],
  },
  leg_left: {
    title: 'LEFT GREAVE',
    subtitle: 'Turbine Thruster 4L',
    stats: [
      { label: 'FUEL', value: 'HYBRID', status: 'normal' },
      { label: 'THRUST', value: 'IDLE', status: 'normal' },
      { label: 'FLAPS', value: 'LOCKED', status: 'optimal' },
    ],
  },
  leg_right: {
    title: 'RIGHT GREAVE',
    subtitle: 'Turbine Thruster 4R',
    stats: [
      { label: 'FUEL', value: 'HYBRID', status: 'normal' },
      { label: 'THRUST', value: 'IDLE', status: 'normal' },
      { label: 'FLAPS', value: 'LOCKED', status: 'optimal' },
    ],
  },
  // Fallback
  unknown: {
    title: 'UNKNOWN COMPONENT',
    subtitle: 'Analyzing...',
    stats: [
      { label: 'STATUS', value: 'UNKNOWN', status: 'warning' },
      { label: 'SCAN', value: 'PENDING', status: 'normal' },
    ],
  },
};
