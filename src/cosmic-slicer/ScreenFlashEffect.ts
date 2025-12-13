/**
 * ScreenFlashEffect
 * Brief full-screen color flash for impactful moments
 * 
 * Use cases:
 * - Boss hit feedback (white flash)
 * - Critical events (red flash for damage, gold for rewards)
 * - Screen shake companion effect
 * 
 * Performance optimized with DOM overlay instead of Three.js rendering
 */

export interface ScreenFlashConfig {
  /** Flash color (CSS color) */
  color: string;
  /** Peak opacity (0-1) */
  intensity: number;
  /** Total flash duration in seconds */
  duration: number;
}

export class ScreenFlashEffect {
  private overlay: HTMLDivElement;
  private isActive: boolean = false;
  private age: number = 0;
  private config: ScreenFlashConfig = {
    color: '#ffffff',
    intensity: 0.6,
    duration: 0.25,
  };

  constructor(container: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      opacity: 0;
      z-index: 9999;
      mix-blend-mode: screen;
    `;
    container.appendChild(this.overlay);
  }

  /**
   * Trigger a screen flash
   */
  flash(config?: Partial<ScreenFlashConfig>): void {
    this.config = { ...this.config, ...config };
    this.isActive = true;
    this.age = 0;
    this.overlay.style.backgroundColor = this.config.color;
  }

  /**
   * Update animation state
   */
  update(deltaTime: number): void {
    if (!this.isActive) return;

    this.age += deltaTime;

    if (this.age >= this.config.duration) {
      this.isActive = false;
      this.overlay.style.opacity = '0';
      return;
    }

    // Quick fade in, slower fade out
    const t = this.age / this.config.duration;
    let opacity: number;

    if (t < 0.2) {
      // Fast rise
      opacity = (t / 0.2) * this.config.intensity;
    } else {
      // Exponential decay
      const decayT = (t - 0.2) / 0.8;
      opacity = this.config.intensity * Math.exp(-decayT * 4);
    }

    this.overlay.style.opacity = opacity.toString();
  }

  dispose(): void {
    this.overlay.remove();
  }
}
