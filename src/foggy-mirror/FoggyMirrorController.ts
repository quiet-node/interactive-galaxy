/**
 * FoggyMirrorController - Orchestrates foggy mirror interaction mode
 * Coordinates HandTracker, FogOverlay, and HandTrailTracker for seamless fog clearing
 */

import type { HandTracker } from '../shared/HandTracker';
import { FogOverlay } from './FogOverlay';
import { HandTrailTracker } from '../shared/HandTrailTracker';
import {
  FoggyMirrorConfig,
  DEFAULT_FOGGY_MIRROR_CONFIG,
  FoggyMirrorState,
  FoggyMirrorDebugInfo,
} from './types';

/**
 * FoggyMirrorController manages the foggy mirror interaction mode
 * Users can wipe their hands to clear fog and reveal camera feed underneath
 */
export class FoggyMirrorController {
  private readonly handTracker: HandTracker;
  private readonly fogOverlay: FogOverlay;
  private readonly handTrailTracker: HandTrailTracker;
  private readonly config: FoggyMirrorConfig;
  private readonly container: HTMLElement;

  private state: FoggyMirrorState = 'uninitialized';
  private updateLoopId: number | null = null;

  // Debug state
  private debugEnabled: boolean = false;
  private debugCallback: ((info: FoggyMirrorDebugInfo) => void) | null = null;

  // FPS calculation
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private currentFps: number = 0;
  private lastFpsUpdate: number = 0;

  // Fog percentage calculation throttling
  private lastFogPercentageUpdate: number = 0;
  private cachedFogPercentage: number = 100;

  /**
   * Create a new FoggyMirrorController instance
   * @param handTracker - Hand tracking instance (shared with other modes)
   * @param container - Parent container element
   * @param config - Configuration options
   */
  constructor(
    handTracker: HandTracker,
    container: HTMLElement,
    config: Partial<FoggyMirrorConfig> = {}
  ) {
    this.handTracker = handTracker;
    this.container = container;
    this.config = { ...DEFAULT_FOGGY_MIRROR_CONFIG, ...config };

    // Initialize fog overlay
    this.fogOverlay = new FogOverlay(container, this.config.fogOverlay);

    // Initialize hand trail tracker
    this.handTrailTracker = new HandTrailTracker(this.config.handTrail);
  }

  /**
   * Initialize the foggy mirror mode
   */
  initialize(): void {
    if (this.state !== 'uninitialized') {
      console.warn('[FoggyMirrorController] Already initialized');
      return;
    }

    // Initialize fog overlay
    this.fogOverlay.initialize();

    // Set trail tracker dimensions based on container
    const rect = this.container.getBoundingClientRect();
    this.handTrailTracker.setDimensions(rect.width, rect.height);

    this.state = 'ready';
    console.log('[FoggyMirrorController] Initialized');
  }

  /**
   * Enable debug mode with callback
   */
  enableDebug(callback: (info: FoggyMirrorDebugInfo) => void): void {
    this.debugEnabled = true;
    this.debugCallback = callback;
  }

  /**
   * Disable debug mode
   */
  disableDebug(): void {
    this.debugEnabled = false;
    this.debugCallback = null;
  }

  /**
   * Start the foggy mirror mode (begin tracking and rendering)
   */
  start(): void {
    if (this.state === 'disposed') {
      throw new Error('[FoggyMirrorController] Cannot start after disposal');
    }

    if (this.state === 'uninitialized') {
      this.initialize();
    }

    if (this.state === 'active') {
      console.warn('[FoggyMirrorController] Already active');
      return;
    }

    // Ensure fog overlay is visible
    this.fogOverlay.show();

    // Start update loop
    this.startUpdateLoop();

    this.state = 'active';
    console.log('[FoggyMirrorController] Started');
  }

  /**
   * Stop the foggy mirror mode (pause tracking and rendering)
   */
  stop(): void {
    if (this.state !== 'active') {
      return;
    }

    // Stop update loop
    this.stopUpdateLoop();

    // Hide fog overlay
    this.fogOverlay.hide();

    // Reset trail tracker
    this.handTrailTracker.reset();

    this.state = 'ready';
    console.log('[FoggyMirrorController] Stopped');
  }

  /**
   * Start the update loop for hand tracking and fog clearing
   */
  private startUpdateLoop(): void {
    if (this.updateLoopId !== null) {
      return;
    }

    const update = (timestamp: number): void => {
      if (this.state !== 'active') {
        return;
      }

      // Calculate FPS
      if (this.lastFrameTime === 0) {
        this.lastFrameTime = timestamp;
      }
      // const delta = timestamp - this.lastFrameTime; // Unused
      this.frameCount++;

      if (timestamp - this.lastFpsUpdate >= 1000) {
        this.currentFps = (this.frameCount * 1000) / (timestamp - this.lastFpsUpdate);
        this.frameCount = 0;
        this.lastFpsUpdate = timestamp;
      }
      this.lastFrameTime = timestamp;

      // Detect hands
      const handResults = this.handTracker.detectHands(timestamp);

      // Update hand trail tracker
      const trackedHands = this.handTrailTracker.update(handResults);

      // Get new trail points (optimization: only draw new points to mask)
      const newTrailPoints = this.handTrailTracker.getNewTrailPoints();

      // Clear fog at new trail points
      if (newTrailPoints.length > 0) {
        this.fogOverlay.clearAtPoints(newTrailPoints);
      }

      // Render the overlay (blurred video + mask)
      this.fogOverlay.render();

      // Debug callback
      if (this.debugEnabled && this.debugCallback) {
        // Get all trail points for debug stats
        const allTrailPoints = this.handTrailTracker.getAllTrailPoints();

        // Throttle fog percentage calculation (expensive CPU readback)
        if (timestamp - this.lastFogPercentageUpdate >= 500) {
          this.cachedFogPercentage = this.fogOverlay.getFogPercentage();
          this.lastFogPercentageUpdate = timestamp;
        }

        // Calculate average velocity and brush size
        let totalVelocity = 0;
        let totalBrushSize = 0;

        if (trackedHands.length > 0) {
          for (const hand of trackedHands) {
            totalVelocity += hand.velocity;
            // Estimate brush size from the last trail point radius, or default
            const lastPoint = hand.trail[hand.trail.length - 1];
            totalBrushSize += lastPoint ? lastPoint.radius : 0;
          }
        }

        const avgVelocity = trackedHands.length > 0 ? totalVelocity / trackedHands.length : 0;
        const avgBrushSize = trackedHands.length > 0 ? totalBrushSize / trackedHands.length : 0;

        this.debugCallback({
          handsDetected: trackedHands.length,
          fps: this.currentFps,
          trailPoints: allTrailPoints.length,
          clearedPercentage: 100 - this.cachedFogPercentage,
          avgVelocity,
          avgBrushSize,
        });
      }

      // Legacy debug logging
      if (this.config.debug && trackedHands.length > 0) {
        const fogPercentage = this.fogOverlay.getFogPercentage();
        console.log('[FoggyMirrorController] Update:', {
          hands: trackedHands.length,
          trailPoints: this.handTrailTracker.getAllTrailPoints().length,
          fogRemaining: `${fogPercentage.toFixed(1)}%`,
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
   * Reset the fog overlay to fully foggy state
   */
  reset(): void {
    if (this.state === 'disposed' || this.state === 'uninitialized') {
      return;
    }

    this.fogOverlay.reset();
    this.handTrailTracker.reset();
    console.log('[FoggyMirrorController] Reset fog overlay');
  }

  /**
   * Handle window resize
   */
  handleResize(): void {
    if (this.state === 'disposed' || this.state === 'uninitialized') {
      return;
    }

    // Update fog overlay dimensions
    this.fogOverlay.handleResize();

    // Update trail tracker dimensions
    const rect = this.container.getBoundingClientRect();
    this.handTrailTracker.setDimensions(rect.width, rect.height);
  }

  /**
   * Get current state
   */
  getState(): FoggyMirrorState {
    return this.state;
  }

  /**
   * Get percentage of fog remaining
   * @returns Percentage of canvas still foggy (0-100)
   */
  getFogPercentage(): number {
    return this.fogOverlay.getFogPercentage();
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
    this.fogOverlay.dispose();
    this.handTrailTracker.dispose();

    this.state = 'disposed';
    console.log('[FoggyMirrorController] Disposed');
  }
}
