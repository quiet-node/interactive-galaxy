/**
 * PartData
 * Technical specifications and status data for Mark VI components
 */

export interface PartInfo {
  title: string;
  subtitle: string;
  stats: {
    label: string;
    value: string;
    status: 'optimal' | 'warning' | 'critical' | 'normal';
  }[];
}

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
