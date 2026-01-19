/**
 * PowManager Module
 * State machine for the POW special ability system
 *
 * POW charges up as the player slices cosmic objects. When fully charged,
 * the player can activate it by showing both hands, creating a laser beam
 * that destroys all objects it touches.
 */

import {
  CosmicObjectType,
  PowConfig,
  PowEvent,
  PowEventListener,
  PowPhase,
  PowState,
  DEFAULT_POW_CONFIG,
} from './types';

/**
 * Clamps a value between 0 and 1
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * PowManager - Manages POW charge, activation, and state transitions
 */
export class PowManager {
  private readonly config: PowConfig;
  private readonly listeners: Set<PowEventListener> = new Set();

  private state: PowState;
  private lastSliceTime: number = 0;

  constructor(config: Partial<PowConfig> = {}) {
    this.config = { ...DEFAULT_POW_CONFIG, ...config };

    this.state = {
      charge: 0,
      phase: PowPhase.CHARGING,
      phaseStartTime: performance.now(),
      destroyedCount: 0,
      destroyedScore: 0,
    };
  }

  /**
   * Add a listener for POW events
   */
  addListener(listener: PowEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: PowEvent): void {
    for (const listener of this.listeners) {
      listener(this.state, event);
    }
  }

  /**
   * Transition to a new phase
   */
  private setPhase(phase: PowPhase): void {
    if (this.state.phase === phase) return;

    const previousPhase = this.state.phase;
    this.state.phase = phase;
    this.state.phaseStartTime = performance.now();

    this.emit({ type: 'phaseChanged', phase, previousPhase });
  }

  /**
   * Add charge from slicing an object
   */
  addCharge(objectType: CosmicObjectType): void {
    const chargeAmount = this.config.chargePerSlice[objectType] ?? 0.05;
    this.addRawCharge(chargeAmount);
  }

  /**
   * Add a specific amount of charge (for boss hits, etc.)
   */
  addRawCharge(amount: number): void {
    // Can't charge during active or cooldown phases
    if (this.state.phase === PowPhase.ACTIVE || this.state.phase === PowPhase.COOLDOWN) {
      return;
    }

    const previousCharge = this.state.charge;
    this.state.charge = clamp01(this.state.charge + amount);
    this.lastSliceTime = performance.now();

    const delta = this.state.charge - previousCharge;
    if (delta > 0) {
      this.emit({ type: 'chargeChanged', charge: this.state.charge, delta });
    }

    // Check if we just became ready
    if (this.state.charge >= 1 && this.state.phase === PowPhase.CHARGING) {
      this.setPhase(PowPhase.READY);
    }
  }

  /**
   * Attempt to activate POW (called when two hands are detected)
   * Returns true if activation was successful
   */
  activate(): boolean {
    if (this.state.phase !== PowPhase.READY) {
      return false;
    }

    this.state.destroyedCount = 0;
    this.state.destroyedScore = 0;
    this.setPhase(PowPhase.ACTIVE);
    this.emit({ type: 'activated' });

    return true;
  }

  /**
   * Deactivate POW (called when duration expires or hands separate)
   */
  deactivate(): void {
    if (this.state.phase !== PowPhase.ACTIVE) {
      return;
    }

    const { destroyedCount, destroyedScore } = this.state;

    this.emit({
      type: 'deactivated',
      destroyedCount,
      totalScore: destroyedScore,
    });

    // Reset charge and enter cooldown
    this.state.charge = 0;
    this.emit({ type: 'chargeChanged', charge: 0, delta: -1 });
    this.setPhase(PowPhase.COOLDOWN);
  }

  /**
   * Record an object destroyed by the POW laser
   */
  recordDestruction(score: number): void {
    if (this.state.phase !== PowPhase.ACTIVE) return;

    this.state.destroyedCount += 1;
    this.state.destroyedScore += score;
    this.emit({ type: 'objectDestroyed', score });
  }

  /**
   * Update the POW system (called each frame)
   */
  update(deltaTime: number): void {
    const now = performance.now();

    switch (this.state.phase) {
      case PowPhase.CHARGING:
        // Apply subtle decay if inactive for too long
        if (this.config.chargeDecayPerSecond > 0 && this.state.charge > 0) {
          const timeSinceSlice = (now - this.lastSliceTime) / 1000;
          if (timeSinceSlice > this.config.decayDelaySeconds) {
            const previousCharge = this.state.charge;
            this.state.charge = clamp01(
              this.state.charge - this.config.chargeDecayPerSecond * deltaTime
            );
            const delta = this.state.charge - previousCharge;
            if (delta !== 0) {
              this.emit({
                type: 'chargeChanged',
                charge: this.state.charge,
                delta,
              });
            }
          }
        }
        break;

      case PowPhase.READY:
        // Stay ready, waiting for activation
        break;

      case PowPhase.ACTIVE: {
        // Check if duration has expired
        const activeTime = (now - this.state.phaseStartTime) / 1000;
        if (activeTime >= this.config.activationDuration) {
          this.deactivate();
        }
        break;
      }

      case PowPhase.COOLDOWN: {
        // Check if cooldown has expired
        const cooldownTime = (now - this.state.phaseStartTime) / 1000;
        if (cooldownTime >= this.config.cooldownDuration) {
          this.lastSliceTime = now; // Reset decay timer
          this.setPhase(PowPhase.CHARGING);
        }
        break;
      }
    }
  }

  /**
   * Get the current state
   */
  getState(): Readonly<PowState> {
    return this.state;
  }

  /**
   * Get the current charge level (0-1)
   */
  getCharge(): number {
    return this.state.charge;
  }

  /**
   * Get the current phase
   */
  getPhase(): PowPhase {
    return this.state.phase;
  }

  /**
   * Check if POW is ready to activate
   */
  isReady(): boolean {
    return this.state.phase === PowPhase.READY;
  }

  /**
   * Check if POW is currently active (laser firing)
   */
  isActive(): boolean {
    return this.state.phase === PowPhase.ACTIVE;
  }

  /**
   * Get the remaining time for current phase (for active/cooldown)
   */
  getRemainingTime(): number {
    const elapsed = (performance.now() - this.state.phaseStartTime) / 1000;

    if (this.state.phase === PowPhase.ACTIVE) {
      return Math.max(0, this.config.activationDuration - elapsed);
    }

    if (this.state.phase === PowPhase.COOLDOWN) {
      return Math.max(0, this.config.cooldownDuration - elapsed);
    }

    return 0;
  }

  /**
   * Get the progress of current phase (0-1)
   */
  getPhaseProgress(): number {
    const elapsed = (performance.now() - this.state.phaseStartTime) / 1000;

    if (this.state.phase === PowPhase.ACTIVE) {
      return clamp01(elapsed / this.config.activationDuration);
    }

    if (this.state.phase === PowPhase.COOLDOWN) {
      return clamp01(elapsed / this.config.cooldownDuration);
    }

    return 0;
  }

  /**
   * Get the score multiplier for laser destruction
   */
  getLaserMultiplier(): number {
    return this.config.laserDestroyMultiplier;
  }

  /**
   * Get the activation debounce time in milliseconds
   */
  getActivationDebounceMs(): number {
    return this.config.activationDebounceMs;
  }

  /**
   * Get the minimum hand spread distance
   */
  getMinHandSpreadDistance(): number {
    return this.config.minHandSpreadDistance;
  }

  /**
   * Reset the POW system to initial state
   */
  reset(): void {
    const wasActive = this.state.phase === PowPhase.ACTIVE;

    this.state = {
      charge: 0,
      phase: PowPhase.CHARGING,
      phaseStartTime: performance.now(),
      destroyedCount: 0,
      destroyedScore: 0,
    };

    this.lastSliceTime = 0;

    if (wasActive) {
      this.emit({ type: 'deactivated', destroyedCount: 0, totalScore: 0 });
    }

    this.emit({ type: 'chargeChanged', charge: 0, delta: 0 });
    this.emit({
      type: 'phaseChanged',
      phase: PowPhase.CHARGING,
      previousPhase: PowPhase.CHARGING,
    });
  }

  /**
   * Dispose the manager
   */
  dispose(): void {
    this.listeners.clear();
  }
}
