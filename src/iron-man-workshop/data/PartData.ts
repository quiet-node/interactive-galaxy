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
 * - 17 parts: head, torso_front, torso_back, arm_shoulder/upperarm/forearm/hand (L/R),
 *   leg_thigh/calf/feet (L/R)
 * - `unknown` serves as a fallback for unrecognized parts
 */
export const MARK_VI_PART_DATA: Record<string, PartInfo> = {
  // HEAD
  head: {
    title: 'MARK VI HELMET',
    subtitle: 'RT-Integrated HUD',
    stats: [
      { label: 'OS VER', value: 'JARVIS 12.4.0', status: 'optimal' },
      { label: 'INTEGRITY', value: '100%', status: 'optimal' },
      { label: 'OXYGEN', value: '98%', status: 'normal' },
    ],
  },

  // TORSO
  torso_front: {
    title: 'CHEST PLATE FRONT',
    subtitle: 'Vibranium Arc Reactor',
    stats: [
      { label: 'OUTPUT', value: '42.8 GJ/s', status: 'optimal' },
      { label: 'CORE TEMP', value: '2800 K', status: 'warning' },
      { label: 'ARMOR', value: 'Gold-Titanium', status: 'normal' },
    ],
  },
  torso_back: {
    title: 'CHEST PLATE REAR',
    subtitle: 'Spinal Exoskeleton',
    stats: [
      { label: 'COOLING', value: 'ACTIVE', status: 'optimal' },
      { label: 'SERVOS', value: '24 UNITS', status: 'optimal' },
      { label: 'POWER BUS', value: 'NOMINAL', status: 'normal' },
    ],
  },

  // LEFT ARM
  arm_shoulder_left: {
    title: 'LEFT SHOULDER PAD',
    subtitle: 'Pauldron Assembly 1L',
    stats: [
      { label: 'JOINT', value: 'SEALED', status: 'optimal' },
      { label: 'ROTATION', value: '360°', status: 'optimal' },
      { label: 'ARMOR', value: '98%', status: 'normal' },
    ],
  },
  arm_upperarm_left: {
    title: 'LEFT UPPER ARM',
    subtitle: 'Bicep Actuator 2L',
    stats: [
      { label: 'HYDRAULICS', value: 'NOMINAL', status: 'optimal' },
      { label: 'TORQUE', value: '2400 Nm', status: 'optimal' },
      { label: 'FLEX', value: 'ACTIVE', status: 'normal' },
    ],
  },
  arm_forearm_left: {
    title: 'LEFT FOREARM',
    subtitle: 'Repulsor Conduit 3L',
    stats: [
      { label: 'CHARGE', value: '100%', status: 'optimal' },
      { label: 'SHIELD', value: 'READY', status: 'optimal' },
      { label: 'ROTATION', value: '270°', status: 'normal' },
    ],
  },
  arm_hand_left: {
    title: 'LEFT GAUNTLET',
    subtitle: 'Repulsor Node 4L',
    stats: [
      { label: 'REPULSOR', value: 'ARMED', status: 'optimal' },
      { label: 'GRIP', value: '1850 PSI', status: 'optimal' },
      { label: 'CALIBRATION', value: '0.002%', status: 'normal' },
    ],
  },

  // RIGHT ARM
  arm_shoulder_right: {
    title: 'RIGHT SHOULDER PAD',
    subtitle: 'Pauldron Assembly 1R',
    stats: [
      { label: 'JOINT', value: 'SEALED', status: 'optimal' },
      { label: 'ROTATION', value: '360°', status: 'optimal' },
      { label: 'ARMOR', value: '99%', status: 'normal' },
    ],
  },
  arm_upperarm_right: {
    title: 'RIGHT UPPER ARM',
    subtitle: 'Bicep Actuator 2R',
    stats: [
      { label: 'HYDRAULICS', value: 'NOMINAL', status: 'optimal' },
      { label: 'TORQUE', value: '2400 Nm', status: 'optimal' },
      { label: 'FLEX', value: 'ACTIVE', status: 'normal' },
    ],
  },
  arm_forearm_right: {
    title: 'RIGHT FOREARM',
    subtitle: 'Missile Bay 3R',
    stats: [
      { label: 'CHARGE', value: '100%', status: 'optimal' },
      { label: 'MISSILES', value: 'LOADED', status: 'warning' },
      { label: 'ROTATION', value: '270°', status: 'normal' },
    ],
  },
  arm_hand_right: {
    title: 'RIGHT GAUNTLET',
    subtitle: 'Repulsor Node 4R',
    stats: [
      { label: 'REPULSOR', value: 'ARMED', status: 'optimal' },
      { label: 'GRIP', value: '1850 PSI', status: 'optimal' },
      { label: 'LASER', value: 'STANDBY', status: 'normal' },
    ],
  },

  // LEFT LEG
  leg_left_thigh: {
    title: 'LEFT THIGH PLATE',
    subtitle: 'Hip Actuator 5L',
    stats: [
      { label: 'HYDRAULICS', value: 'NOMINAL', status: 'optimal' },
      { label: 'THRUST AUX', value: 'READY', status: 'optimal' },
      { label: 'ROTATION', value: '180°', status: 'normal' },
    ],
  },
  leg_left_calf: {
    title: 'LEFT CALF GUARD',
    subtitle: 'Knee Servo 6L',
    stats: [
      { label: 'SHOCK ABS', value: 'ACTIVE', status: 'optimal' },
      { label: 'FLEX', value: '140°', status: 'optimal' },
      { label: 'ARMOR', value: '97%', status: 'normal' },
    ],
  },
  leg_left_feet: {
    title: 'LEFT BOOT',
    subtitle: 'Turbine Thruster 7L',
    stats: [
      { label: 'FUEL', value: 'HYBRID', status: 'normal' },
      { label: 'THRUST', value: 'IDLE', status: 'normal' },
      { label: 'FLAPS', value: 'LOCKED', status: 'optimal' },
    ],
  },

  // RIGHT LEG
  leg_right_thigh: {
    title: 'RIGHT THIGH PLATE',
    subtitle: 'Hip Actuator 5R',
    stats: [
      { label: 'HYDRAULICS', value: 'NOMINAL', status: 'optimal' },
      { label: 'THRUST AUX', value: 'READY', status: 'optimal' },
      { label: 'ROTATION', value: '180°', status: 'normal' },
    ],
  },
  leg_right_calf: {
    title: 'RIGHT CALF GUARD',
    subtitle: 'Knee Servo 6R',
    stats: [
      { label: 'SHOCK ABS', value: 'ACTIVE', status: 'optimal' },
      { label: 'FLEX', value: '140°', status: 'optimal' },
      { label: 'ARMOR', value: '98%', status: 'normal' },
    ],
  },
  leg_right_feet: {
    title: 'RIGHT BOOT',
    subtitle: 'Turbine Thruster 7R',
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
