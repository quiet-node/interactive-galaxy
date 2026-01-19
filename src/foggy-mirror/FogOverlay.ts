/**
 * FogOverlay - Manages canvas-based fog overlay with area clearing
 * Provides a fog effect over content that can be "wiped away" by clearing specific areas
 */

import { FogOverlayConfig, DEFAULT_FOG_OVERLAY_CONFIG, TrailPoint } from './types';

/**
 * FogOverlay manages a canvas element that overlays content with a fog effect
 * Areas can be cleared by "wiping" to reveal the content underneath
 */
export class FogOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly maskCanvas: HTMLCanvasElement;
  private readonly maskCtx: CanvasRenderingContext2D;
  private readonly blurCanvas: HTMLCanvasElement;
  private readonly blurCtx: CanvasRenderingContext2D;
  private noisePattern: CanvasPattern | null = null;
  private readonly config: FogOverlayConfig;
  private readonly container: HTMLElement;
  private readonly videoElement: HTMLVideoElement | null;
  private isInitialized: boolean = false;

  /**
   * Create a new FogOverlay instance
   * @param container - Parent container element
   * @param config - Configuration options
   */
  constructor(container: HTMLElement, config: Partial<FogOverlayConfig> = {}) {
    this.container = container;
    this.config = { ...DEFAULT_FOG_OVERLAY_CONFIG, ...config };

    // Find video element to apply blur filter to
    this.videoElement = container.querySelector('video');

    // Create canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'fog-overlay-canvas';

    // Get 2D context
    const ctx = this.canvas.getContext('2d', {
      alpha: true,
      willReadFrequently: false,
    });

    if (!ctx) {
      throw new Error('[FogOverlay] Failed to get 2D canvas context');
    }

    this.ctx = ctx;

    // Create mask canvas (offscreen)
    this.maskCanvas = document.createElement('canvas');
    const maskCtx = this.maskCanvas.getContext('2d', {
      alpha: true,
    });

    if (!maskCtx) {
      throw new Error('[FogOverlay] Failed to get mask canvas context');
    }

    this.maskCtx = maskCtx;

    // Create blur canvas (offscreen, small for performance)
    this.blurCanvas = document.createElement('canvas');
    const blurCtx = this.blurCanvas.getContext('2d', {
      alpha: false, // No alpha needed for video frame
      willReadFrequently: false,
    });

    if (!blurCtx) {
      throw new Error('[FogOverlay] Failed to get blur canvas context');
    }

    this.blurCtx = blurCtx;
  }

  /**
   * Initialize the fog overlay
   */
  initialize(): void {
    if (this.isInitialized) {
      console.warn('[FogOverlay] Already initialized');
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

    // Generate noise pattern
    this.generateNoisePattern();

    console.log('[FogOverlay] Initialized', {
      width: this.canvas.width,
      height: this.canvas.height,
      blur: this.config.blurAmount,
      hasVideo: !!this.videoElement,
    });
  }

  /**
   * Generate a noise pattern for realistic fog texture
   */
  private generateNoisePattern(): void {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Random grayscale noise
      const val = Math.floor(Math.random() * 255);
      data[i] = val; // R
      data[i + 1] = val; // G
      data[i + 2] = val; // B
      // Vary alpha for more natural look (10-40)
      data[i + 3] = 10 + Math.floor(Math.random() * 30);
    }

    ctx.putImageData(imageData, 0, 0);
    this.noisePattern = this.ctx.createPattern(canvas, 'repeat');
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

    // Set blur canvas resolution (downscaled for performance)
    // A scale of 0.1 means 1/10th width and height, which gives a strong blur when upscaled
    // Adjust scale based on blur amount: higher blur = smaller canvas
    const blurScale = Math.max(0.05, Math.min(0.2, 10 / this.config.blurAmount));
    this.blurCanvas.width = Math.floor(rect.width * blurScale);
    this.blurCanvas.height = Math.floor(rect.height * blurScale);

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
      console.warn('[FogOverlay] Cannot reset before initialization');
      return;
    }

    // Clear mask canvas
    this.maskCtx.save();
    this.maskCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    this.maskCtx.restore();

    console.log('[FogOverlay] Reset mask');
  }

  /**
   * Clear fog at specific points (wipe effect)
   * @param points - Array of trail points to clear
   */
  clearAtPoints(points: readonly TrailPoint[]): void {
    if (!this.isInitialized || points.length === 0) {
      return;
    }

    // Draw on mask canvas
    // Use radial gradient for soft edges (more realistic wipe)
    for (const point of points) {
      const gradient = this.maskCtx.createRadialGradient(
        point.x,
        point.y,
        0,
        point.x,
        point.y,
        point.radius
      );

      // Inner circle (fully cleared)
      gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
      gradient.addColorStop(0.4, 'rgba(0, 0, 0, 1)');
      // Outer edge (fade to fog)
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      this.maskCtx.fillStyle = gradient;
      this.maskCtx.beginPath();
      this.maskCtx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
      this.maskCtx.fill();
    }
  }

  /**
   * Render the fog overlay
   */
  render(): void {
    if (!this.isInitialized || !this.videoElement) {
      return;
    }

    const rect = this.container.getBoundingClientRect();

    // 1. Clear main canvas
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    // 2. Draw Blurred Video (Optimized)
    // Step A: Draw video to small offscreen canvas
    this.blurCtx.drawImage(this.videoElement, 0, 0, this.blurCanvas.width, this.blurCanvas.height);

    // Step B: Draw small canvas to main canvas (upscaling creates blur)
    // We disable image smoothing on the context if we wanted pixelated look,
    // but here we WANT smoothing (bilinear interpolation) for the blur effect.
    this.ctx.drawImage(this.blurCanvas, 0, 0, rect.width, rect.height);

    // 3. Draw "Fog" Overlay (semi-transparent white)
    this.ctx.fillStyle = this.config.backgroundColor;
    this.ctx.fillRect(0, 0, rect.width, rect.height);

    // 3b. Draw Noise Texture
    if (this.noisePattern) {
      this.ctx.fillStyle = this.noisePattern;
      this.ctx.fillRect(0, 0, rect.width, rect.height);
    }

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
   * Get the current percentage of fog remaining
   * @returns Percentage of canvas still foggy (0-100)
   */
  getFogPercentage(): number {
    if (!this.isInitialized) {
      return 100;
    }

    try {
      // Sample the canvas to estimate fog coverage
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
      console.warn('[FogOverlay] Failed to calculate fog percentage:', error);
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
    console.log('[FogOverlay] Disposed');
  }
}
