/**
 * BlurOverlay - Manages canvas-based blur overlay with area clearing
 * Provides a blur effect over content that can be "wiped away" by clearing specific areas
 */

import { BlurOverlayConfig, DEFAULT_BLUR_OVERLAY_CONFIG, TrailPoint } from './wipe-types';

/**
 * BlurOverlay manages a canvas element that overlays content with a blur effect
 * Areas can be cleared by "wiping" to reveal the content underneath
 */
export class BlurOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly maskCanvas: HTMLCanvasElement;
  private readonly maskCtx: CanvasRenderingContext2D;
  private readonly config: BlurOverlayConfig;
  private readonly container: HTMLElement;
  private readonly videoElement: HTMLVideoElement | null;
  private isInitialized: boolean = false;

  /**
   * Create a new BlurOverlay instance
   * @param container - Parent container element
   * @param config - Configuration options
   */
  constructor(container: HTMLElement, config: Partial<BlurOverlayConfig> = {}) {
    this.container = container;
    this.config = { ...DEFAULT_BLUR_OVERLAY_CONFIG, ...config };

    // Find video element to apply blur filter to
    this.videoElement = container.querySelector('video');

    // Create canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'blur-overlay-canvas';

    // Get 2D context
    const ctx = this.canvas.getContext('2d', {
      alpha: true,
      willReadFrequently: false,
    });

    if (!ctx) {
      throw new Error('[BlurOverlay] Failed to get 2D canvas context');
    }

    this.ctx = ctx;

    // Create mask canvas (offscreen)
    this.maskCanvas = document.createElement('canvas');
    const maskCtx = this.maskCanvas.getContext('2d', {
      alpha: true,
    });

    if (!maskCtx) {
      throw new Error('[BlurOverlay] Failed to get mask canvas context');
    }

    this.maskCtx = maskCtx;
  }

  /**
   * Initialize the blur overlay
   */
  initialize(): void {
    if (this.isInitialized) {
      console.warn('[BlurOverlay] Already initialized');
      return;
    }

    // Setup canvas dimensions
    this.updateDimensions();

    // Apply canvas styles
    this.applyCanvasStyles();

    // Add canvas to container
    this.container.appendChild(this.canvas);

    // Initialize mask
    this.reset();

    this.isInitialized = true;
    console.log('[BlurOverlay] Initialized', {
      width: this.canvas.width,
      height: this.canvas.height,
      blur: this.config.blurAmount,
      hasVideo: !!this.videoElement,
    });
  }

  /**
   * Update canvas dimensions to match container
   */
  private updateDimensions(): void {
    const rect = this.container.getBoundingClientRect();
    const dpr = this.config.enableHighDPI ? window.devicePixelRatio || 1 : 1;

    // Set canvas resolution (actual pixels)
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.maskCanvas.width = rect.width * dpr;
    this.maskCanvas.height = rect.height * dpr;

    // Set canvas display size (CSS pixels)
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    // Scale context to account for device pixel ratio
    this.ctx.scale(dpr, dpr);
    this.maskCtx.scale(dpr, dpr);
  }

  /**
   * Apply CSS styles to canvas for positioning
   */
  private applyCanvasStyles(): void {
    const styles = {
      position: 'absolute',
      top: '0',
      left: '0',
      'z-index': '50', // Above video but below UI elements
      'pointer-events': 'none', // Allow clicks to pass through
      transform: 'scaleX(-1)', // Mirror to match video feed
    };

    Object.entries(styles).forEach(([key, value]) => {
      this.canvas.style.setProperty(key, value);
    });
  }

  /**
   * Reset the overlay (clear mask)
   */
  reset(): void {
    if (!this.isInitialized) {
      console.warn('[BlurOverlay] Cannot reset before initialization');
      return;
    }

    // Clear mask canvas
    this.maskCtx.save();
    this.maskCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    this.maskCtx.restore();

    console.log('[BlurOverlay] Reset mask');
  }

  /**
   * Clear blur at specific points (wipe effect)
   * @param points - Array of trail points to clear
   */
  clearAtPoints(points: readonly TrailPoint[]): void {
    if (!this.isInitialized || points.length === 0) {
      return;
    }

    // Draw on mask canvas
    // We draw opaque shapes where we want to "clear" the blur
    this.maskCtx.fillStyle = 'rgba(0, 0, 0, 1)'; // Color doesn't matter, just alpha

    for (const point of points) {
      this.maskCtx.beginPath();
      this.maskCtx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
      this.maskCtx.fill();
    }
  }

  /**
   * Render the blur overlay
   */
  render(): void {
    if (!this.isInitialized || !this.videoElement) {
      return;
    }

    const rect = this.container.getBoundingClientRect();

    // 1. Clear main canvas
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    // 2. Draw Blurred Video
    this.ctx.save();
    this.ctx.filter = `blur(${this.config.blurAmount}px)`;
    this.ctx.drawImage(this.videoElement, 0, 0, rect.width, rect.height);
    this.ctx.restore();

    // 3. Draw "Fog" Overlay (semi-transparent white)
    this.ctx.fillStyle = this.config.backgroundColor;
    this.ctx.fillRect(0, 0, rect.width, rect.height);

    // 4. Apply Mask (cut holes)
    // destination-out removes pixels from the canvas where the source (mask) overlaps
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-out';
    // Draw the mask canvas (which contains the trails)
    // Note: maskCanvas is physical size, so we draw it to cover the whole area
    // Since ctx is scaled, we draw to logical dimensions
    this.ctx.drawImage(this.maskCanvas, 0, 0, rect.width, rect.height);
    this.ctx.restore();
  }

  /**
   * Handle window resize
   */
  handleResize(): void {
    if (!this.isInitialized) {
      return;
    }

    // Store current mask data
    const maskData = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);

    // Update dimensions
    this.updateDimensions();

    // Restore mask data (scaled to new size)
    // Note: simple putImageData doesn't scale, but for now it's better than losing it
    // Ideally we would redraw or scale the bitmap
    this.maskCtx.putImageData(maskData, 0, 0);
  }

  /**
   * Get the current percentage of blur remaining
   * @returns Percentage of canvas still blurred (0-100)
   */
  getBlurPercentage(): number {
    if (!this.isInitialized) {
      return 100;
    }

    try {
      // Sample the canvas to estimate blur coverage
      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      const data = imageData.data;
      let opaquePixels = 0;
      const totalPixels = data.length / 4;

      // Sample every 10th pixel for performance
      for (let i = 0; i < data.length; i += 40) {
        // Alpha channel is every 4th value
        if (data[i + 3] > 128) {
          opaquePixels++;
        }
      }

      return (opaquePixels / (totalPixels / 10)) * 100;
    } catch (error) {
      console.warn('[BlurOverlay] Failed to calculate blur percentage:', error);
      return 100;
    }
  }

  /**
   * Show the overlay (make visible)
   */
  show(): void {
    this.canvas.style.display = 'block';
  }

  /**
   * Hide the overlay
   */
  hide(): void {
    this.canvas.style.display = 'none';
  }

  /**
   * Check if overlay is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Clean up resources and remove canvas
   */
  dispose(): void {
    if (!this.isInitialized) {
      return;
    }

    // Remove canvas from DOM
    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }

    this.isInitialized = false;
    console.log('[BlurOverlay] Disposed');
  }
}
