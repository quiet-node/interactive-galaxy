/**
 * WipeToRevealController - Orchestrates wipe-to-reveal interaction mode
 * Coordinates HandTracker, BlurOverlay, and HandTrailTracker for seamless blur clearing
 */

import type { HandTracker } from '../shared/HandTracker';
import { BlurOverlay } from './BlurOverlay';
import { HandTrailTracker } from '../shared/HandTrailTracker';
import { WipeToRevealConfig, DEFAULT_WIPE_TO_REVEAL_CONFIG, WipeToRevealState } from './wipe-types';

/**
 * WipeToRevealController manages the wipe-to-reveal interaction mode
 * Users can wipe their hands to clear blur and reveal camera feed underneath
 */
export class WipeToRevealController {
  private readonly handTracker: HandTracker;
  private readonly blurOverlay: BlurOverlay;
  private readonly handTrailTracker: HandTrailTracker;
  private readonly config: WipeToRevealConfig;
  private readonly container: HTMLElement;

  private state: WipeToRevealState = 'uninitialized';
  private updateLoopId: number | null = null;

  /**
   * Create a new WipeToRevealController instance
   * @param handTracker - Hand tracking instance (shared with other modes)
   * @param container - Parent container element
   * @param config - Configuration options
   */
  constructor(
    handTracker: HandTracker,
    container: HTMLElement,
    config: Partial<WipeToRevealConfig> = {}
  ) {
    this.handTracker = handTracker;
    this.container = container;
    this.config = { ...DEFAULT_WIPE_TO_REVEAL_CONFIG, ...config };

    // Initialize blur overlay
    this.blurOverlay = new BlurOverlay(container, this.config.blurOverlay);

    // Initialize hand trail tracker
    this.handTrailTracker = new HandTrailTracker(this.config.handTrail);
  }

  /**
   * Initialize the wipe-to-reveal mode
   */
  initialize(): void {
    if (this.state !== 'uninitialized') {
      console.warn('[WipeToRevealController] Already initialized');
      return;
    }

    // Initialize blur overlay
    this.blurOverlay.initialize();

    // Set trail tracker dimensions based on container
    const rect = this.container.getBoundingClientRect();
    this.handTrailTracker.setDimensions(rect.width, rect.height);

    this.state = 'ready';
    console.log('[WipeToRevealController] Initialized');
  }

  /**
   * Start the wipe-to-reveal mode (begin tracking and rendering)
   */
  start(): void {
    if (this.state === 'disposed') {
      throw new Error('[WipeToRevealController] Cannot start after disposal');
    }

    if (this.state === 'uninitialized') {
      this.initialize();
    }

    if (this.state === 'active') {
      console.warn('[WipeToRevealController] Already active');
      return;
    }

    // Ensure blur overlay is visible
    this.blurOverlay.show();

    // Start update loop
    this.startUpdateLoop();

    this.state = 'active';
    console.log('[WipeToRevealController] Started');
  }

  /**
   * Stop the wipe-to-reveal mode (pause tracking and rendering)
   */
  stop(): void {
    if (this.state !== 'active') {
      return;
    }

    // Stop update loop
    this.stopUpdateLoop();

    // Hide blur overlay
    this.blurOverlay.hide();

    // Reset trail tracker
    this.handTrailTracker.reset();

    this.state = 'ready';
    console.log('[WipeToRevealController] Stopped');
  }

  /**
   * Start the update loop for hand tracking and blur clearing
   */
  private startUpdateLoop(): void {
    if (this.updateLoopId !== null) {
      return;
    }

    const update = (timestamp: number): void => {
      if (this.state !== 'active') {
        return;
      }

      // Detect hands
      const handResults = this.handTracker.detectHands(timestamp);

      // Update hand trail tracker
      const trackedHands = this.handTrailTracker.update(handResults);

      // Get all trail points
      const trailPoints = this.handTrailTracker.getAllTrailPoints();

      // Clear blur at trail points
      if (trailPoints.length > 0) {
        this.blurOverlay.clearAtPoints(trailPoints);
      }

      // Render the overlay (blurred video + mask)
      this.blurOverlay.render();

      // Debug logging if enabled
      if (this.config.debug && trackedHands.length > 0) {
        const blurPercentage = this.blurOverlay.getBlurPercentage();
        console.log('[WipeToRevealController] Update:', {
          hands: trackedHands.length,
          trailPoints: trailPoints.length,
          blurRemaining: `${blurPercentage.toFixed(1)}%`,
        });
      }

      // Schedule next update
      this.updateLoopId = requestAnimationFrame(update);
    };

    // Start the loop
    this.updateLoopId = requestAnimationFrame(update);
  }

  /**
   * Stop the update loop
   */
  private stopUpdateLoop(): void {
    if (this.updateLoopId !== null) {
      cancelAnimationFrame(this.updateLoopId);
      this.updateLoopId = null;
    }
  }

  /**
   * Reset the blur overlay to fully blurred state
   */
  reset(): void {
    if (this.state === 'disposed' || this.state === 'uninitialized') {
      return;
    }

    this.blurOverlay.reset();
    this.handTrailTracker.reset();
    console.log('[WipeToRevealController] Reset blur overlay');
  }

  /**
   * Handle window resize
   */
  handleResize(): void {
    if (this.state === 'disposed' || this.state === 'uninitialized') {
      return;
    }

    // Update blur overlay dimensions
    this.blurOverlay.handleResize();

    // Update trail tracker dimensions
    const rect = this.container.getBoundingClientRect();
    this.handTrailTracker.setDimensions(rect.width, rect.height);
  }

  /**
   * Get current state
   */
  getState(): WipeToRevealState {
    return this.state;
  }

  /**
   * Get percentage of blur remaining
   * @returns Percentage of canvas still blurred (0-100)
   */
  getBlurPercentage(): number {
    return this.blurOverlay.getBlurPercentage();
  }

  /**
   * Get number of currently tracked hands
   */
  getHandCount(): number {
    return this.handTrailTracker.getHandCount();
  }

  /**
   * Check if controller is active
   */
  isActive(): boolean {
    return this.state === 'active';
  }

  /**
   * Clean up resources and dispose controller
   */
  dispose(): void {
    if (this.state === 'disposed') {
      return;
    }

    // Stop update loop
    this.stopUpdateLoop();

    // Dispose modules
    this.blurOverlay.dispose();
    this.handTrailTracker.dispose();

    this.state = 'disposed';
    console.log('[WipeToRevealController] Disposed');
  }
}
