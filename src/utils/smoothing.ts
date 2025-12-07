/**
 * Smoothing and interpolation utilities for stable hand tracking
 * Uses exponential moving average (EMA) for smooth transitions
 */

import * as THREE from 'three';

/**
 * Exponential moving average smoother for scalar values
 */
export class ScalarSmoother {
  private currentValue: number;
  private smoothingFactor: number;

  /**
   * @param initialValue - Starting value
   * @param smoothingFactor - Smoothing factor (0 = instant, 1 = no movement). Typical: 0.1-0.3
   */
  constructor(initialValue: number = 0, smoothingFactor: number = 0.15) {
    this.currentValue = initialValue;
    this.smoothingFactor = smoothingFactor;
  }

  /**
   * Update with new target value and return smoothed result
   */
  update(targetValue: number): number {
    this.currentValue +=
      (targetValue - this.currentValue) * this.smoothingFactor;
    return this.currentValue;
  }

  /**
   * Get current smoothed value without updating
   */
  get value(): number {
    return this.currentValue;
  }

  /**
   * Reset to a specific value immediately
   */
  reset(value: number): void {
    this.currentValue = value;
  }

  /**
   * Update smoothing factor
   */
  setSmoothingFactor(factor: number): void {
    this.smoothingFactor = Math.max(0, Math.min(1, factor));
  }
}

/**
 * Exponential moving average smoother for 3D vectors
 */
export class Vector3Smoother {
  private currentValue: THREE.Vector3;
  private smoothingFactor: number;

  constructor(
    initialValue: THREE.Vector3 = new THREE.Vector3(),
    smoothingFactor: number = 0.15
  ) {
    this.currentValue = initialValue.clone();
    this.smoothingFactor = smoothingFactor;
  }

  /**
   * Update with new target value and return smoothed result
   */
  update(targetValue: THREE.Vector3): THREE.Vector3 {
    this.currentValue.lerp(targetValue, this.smoothingFactor);
    return this.currentValue.clone();
  }

  /**
   * Get current smoothed value without updating
   */
  get value(): THREE.Vector3 {
    return this.currentValue.clone();
  }

  /**
   * Reset to a specific value immediately
   */
  reset(value: THREE.Vector3): void {
    this.currentValue.copy(value);
  }

  /**
   * Update smoothing factor
   */
  setSmoothingFactor(factor: number): void {
    this.smoothingFactor = Math.max(0, Math.min(1, factor));
  }
}

/**
 * Exponential moving average smoother for quaternions
 * Uses SLERP for proper rotation interpolation
 */
export class QuaternionSmoother {
  private currentValue: THREE.Quaternion;
  private smoothingFactor: number;

  constructor(
    initialValue: THREE.Quaternion = new THREE.Quaternion(),
    smoothingFactor: number = 0.15
  ) {
    this.currentValue = initialValue.clone();
    this.smoothingFactor = smoothingFactor;
  }

  /**
   * Update with new target value and return smoothed result
   */
  update(targetValue: THREE.Quaternion): THREE.Quaternion {
    // Handle quaternion double-cover for shortest path
    if (this.currentValue.dot(targetValue) < 0) {
      targetValue = targetValue.clone();
      targetValue.set(
        -targetValue.x,
        -targetValue.y,
        -targetValue.z,
        -targetValue.w
      );
    }
    this.currentValue.slerp(targetValue, this.smoothingFactor);
    return this.currentValue.clone();
  }

  /**
   * Get current smoothed value without updating
   */
  get value(): THREE.Quaternion {
    return this.currentValue.clone();
  }

  /**
   * Reset to a specific value immediately
   */
  reset(value: THREE.Quaternion): void {
    this.currentValue.copy(value);
  }

  /**
   * Update smoothing factor
   */
  setSmoothingFactor(factor: number): void {
    this.smoothingFactor = Math.max(0, Math.min(1, factor));
  }
}

/**
 * Exponential moving average smoother for Euler angles
 * Converts to quaternion internally for proper interpolation
 */
export class EulerSmoother {
  private quaternionSmoother: QuaternionSmoother;

  constructor(
    initialValue: THREE.Euler = new THREE.Euler(),
    smoothingFactor: number = 0.15
  ) {
    const quat = new THREE.Quaternion().setFromEuler(initialValue);
    this.quaternionSmoother = new QuaternionSmoother(quat, smoothingFactor);
  }

  /**
   * Update with new target value and return smoothed result
   */
  update(targetValue: THREE.Euler): THREE.Euler {
    const targetQuat = new THREE.Quaternion().setFromEuler(targetValue);
    const smoothedQuat = this.quaternionSmoother.update(targetQuat);
    return new THREE.Euler().setFromQuaternion(smoothedQuat);
  }

  /**
   * Get current smoothed value without updating
   */
  get value(): THREE.Euler {
    return new THREE.Euler().setFromQuaternion(this.quaternionSmoother.value);
  }

  /**
   * Reset to a specific value immediately
   */
  reset(value: THREE.Euler): void {
    const quat = new THREE.Quaternion().setFromEuler(value);
    this.quaternionSmoother.reset(quat);
  }

  /**
   * Update smoothing factor
   */
  setSmoothingFactor(factor: number): void {
    this.quaternionSmoother.setSmoothingFactor(factor);
  }
}

/**
 * Moving average filter for reducing noise
 * Useful for very noisy signals where EMA isn't enough
 */
export class MovingAverageFilter {
  private buffer: number[];
  private index: number;
  private windowSize: number;
  private sum: number;

  constructor(windowSize: number = 5) {
    this.windowSize = windowSize;
    this.buffer = new Array(windowSize).fill(0);
    this.index = 0;
    this.sum = 0;
  }

  /**
   * Add a new value and return the moving average
   */
  update(value: number): number {
    // Subtract old value from sum
    this.sum -= this.buffer[this.index];
    // Add new value
    this.buffer[this.index] = value;
    this.sum += value;
    // Move index
    this.index = (this.index + 1) % this.windowSize;
    // Return average
    return this.sum / this.windowSize;
  }

  /**
   * Reset the filter
   */
  reset(initialValue: number = 0): void {
    this.buffer.fill(initialValue);
    this.sum = initialValue * this.windowSize;
    this.index = 0;
  }
}

/**
 * One Euro Filter - adaptive low-pass filter
 * Better for tracking tasks as it adapts based on speed
 * @see https://cristal.univ-lille.fr/~casiez/1euro/
 */
export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilter: LowPassFilter;
  private dxFilter: LowPassFilter;
  private lastTime: number | null;

  /**
   * @param minCutoff - Minimum cutoff frequency (Hz). Lower = more smoothing.
   * @param beta - Speed coefficient. Higher = less lag when moving fast.
   * @param dCutoff - Derivative cutoff frequency (Hz).
   */
  constructor(
    minCutoff: number = 1.0,
    beta: number = 0.0,
    dCutoff: number = 1.0
  ) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
    this.lastTime = null;
  }

  /**
   * Filter a value
   * @param value - Raw input value
   * @param timestamp - Current timestamp in seconds
   */
  filter(value: number, timestamp: number): number {
    if (this.lastTime === null) {
      this.lastTime = timestamp;
      this.xFilter.setAlpha(1.0);
      this.xFilter.filter(value);
      this.dxFilter.setAlpha(1.0);
      this.dxFilter.filter(0.0);
      return value;
    }

    const dt = timestamp - this.lastTime;
    this.lastTime = timestamp;

    if (dt <= 0) return this.xFilter.lastValue;

    // Estimate velocity
    const dx = (value - this.xFilter.lastValue) / dt;
    const edx = this.dxFilter.filterWithAlpha(dx, this.alpha(this.dCutoff, dt));

    // Adaptive cutoff based on velocity
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filterWithAlpha(value, this.alpha(cutoff, dt));
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  reset(): void {
    this.lastTime = null;
    this.xFilter.reset();
    this.dxFilter.reset();
  }
}

/**
 * Simple low-pass filter helper for OneEuroFilter
 */
class LowPassFilter {
  private _lastValue: number = 0;
  private _alpha: number = 1.0;
  private initialized: boolean = false;

  get lastValue(): number {
    return this._lastValue;
  }

  setAlpha(alpha: number): void {
    this._alpha = alpha;
  }

  filter(value: number): number {
    if (!this.initialized) {
      this._lastValue = value;
      this.initialized = true;
    } else {
      this._lastValue =
        this._alpha * value + (1 - this._alpha) * this._lastValue;
    }
    return this._lastValue;
  }

  filterWithAlpha(value: number, alpha: number): number {
    this.setAlpha(alpha);
    return this.filter(value);
  }

  reset(): void {
    this._lastValue = 0;
    this.initialized = false;
  }
}
