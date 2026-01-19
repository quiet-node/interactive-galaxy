/**
 * PowBarHud Module
 * Elegant vertical progress bar UI for the POW special ability
 *
 * Visual Design:
 * - Glass-morphism style matching existing cosmic theme
 * - Vertical orientation with gradient fill
 * - Pulsing glow effect when fully charged
 * - Smooth animations for charge/drain
 */

import { PowBarHudConfig, PowPhase, PowState } from './types';

/**
 * PowBarHud - Renders the POW charge bar UI
 */
export class PowBarHud {
  private container: HTMLElement;
  private element: HTMLElement | null = null;
  private barFillEl: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;
  private glowEl: HTMLElement | null = null;
  private particleContainerEl: HTMLElement | null = null;

  private config: Required<PowBarHudConfig>;
  private currentCharge: number = 0;
  private animationRaf: number | null = null;
  private particleInterval: number | null = null;

  constructor(container: HTMLElement, config: Partial<PowBarHudConfig> = {}) {
    this.container = container;
    this.config = {
      anchor: config.anchor ?? 'left',
    };
  }

  /**
   * Show the POW bar
   */
  show(): void {
    if (!this.element) this.createDOM();
    if (!this.element) return;
    this.element.style.display = 'flex';
    this.startParticleEffect();
  }

  /**
   * Hide the POW bar
   */
  hide(): void {
    if (!this.element) return;
    this.element.style.display = 'none';
    this.stopParticleEffect();
  }

  /**
   * Update the POW bar display
   */
  update(state: PowState): void {
    if (!this.element) this.createDOM();
    if (!this.element || !this.barFillEl || !this.labelEl || !this.glowEl) {
      return;
    }

    // Animate charge level
    this.animateChargeTo(state.charge);

    // Update visual state based on phase
    this.element.classList.remove(
      'pow-bar--charging',
      'pow-bar--ready',
      'pow-bar--active',
      'pow-bar--cooldown'
    );

    switch (state.phase) {
      case PowPhase.CHARGING:
        this.element.classList.add('pow-bar--charging');
        this.labelEl.textContent = 'POW';
        break;
      case PowPhase.READY:
        this.element.classList.add('pow-bar--ready');
        this.labelEl.textContent = 'READY!';
        break;
      case PowPhase.ACTIVE:
        this.element.classList.add('pow-bar--active');
        this.labelEl.textContent = 'ACTIVE';
        break;
      case PowPhase.COOLDOWN:
        this.element.classList.add('pow-bar--cooldown');
        this.labelEl.textContent = '...';
        break;
    }
  }

  /**
   * Trigger a pulse animation (for hit feedback)
   */
  pulse(_intensity: number = 1): void {
    if (!this.element) return;

    this.element.classList.remove('pow-bar--pulse');
    void this.element.offsetHeight; // Force reflow
    this.element.classList.add('pow-bar--pulse');
  }

  /**
   * Dispose the HUD
   */
  dispose(): void {
    this.stopParticleEffect();

    if (this.animationRaf !== null) {
      cancelAnimationFrame(this.animationRaf);
      this.animationRaf = null;
    }

    if (this.element?.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }

    this.element = null;
    this.barFillEl = null;
    this.labelEl = null;
    this.glowEl = null;
    this.particleContainerEl = null;
  }

  /**
   * Animate the charge bar smoothly
   */
  private animateChargeTo(targetCharge: number): void {
    if (!this.barFillEl || !this.glowEl) return;

    const target = Math.max(0, Math.min(1, targetCharge));

    // For small changes, snap immediately
    if (Math.abs(this.currentCharge - target) < 0.01) {
      this.currentCharge = target;
      this.setBarHeight(target);
      return;
    }

    // Cancel previous animation
    if (this.animationRaf !== null) {
      cancelAnimationFrame(this.animationRaf);
    }

    const startCharge = this.currentCharge;
    const startTime = performance.now();
    const duration = 200; // ms

    const tick = () => {
      const now = performance.now();
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

      this.currentCharge = startCharge + (target - startCharge) * eased;
      this.setBarHeight(this.currentCharge);

      if (t < 1) {
        this.animationRaf = requestAnimationFrame(tick);
      } else {
        this.animationRaf = null;
      }
    };

    this.animationRaf = requestAnimationFrame(tick);
  }

  /**
   * Set the bar fill height
   */
  private setBarHeight(charge: number): void {
    if (!this.barFillEl || !this.glowEl) return;

    const percent = Math.max(0, Math.min(100, charge * 100));
    this.barFillEl.style.height = `${percent}%`;

    // Glow intensity scales with charge
    const glowOpacity = 0.3 + charge * 0.7;
    this.glowEl.style.opacity = `${glowOpacity}`;
  }

  /**
   * Start the ambient particle effect
   */
  private startParticleEffect(): void {
    if (this.particleInterval !== null) return;
    if (!this.particleContainerEl) return;

    this.particleInterval = window.setInterval(() => {
      this.spawnParticle();
    }, 200);
  }

  /**
   * Stop the ambient particle effect
   */
  private stopParticleEffect(): void {
    if (this.particleInterval !== null) {
      clearInterval(this.particleInterval);
      this.particleInterval = null;
    }
  }

  /**
   * Spawn a single rising particle
   */
  private spawnParticle(): void {
    if (!this.particleContainerEl || this.currentCharge < 0.1) return;

    const particle = document.createElement('div');
    particle.className = 'pow-bar__particle';

    // Random horizontal position
    const x = 10 + Math.random() * 80;
    particle.style.left = `${x}%`;

    // Random size based on charge
    const size = 2 + Math.random() * 3 * this.currentCharge;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;

    // Random animation duration
    const duration = 1.5 + Math.random() * 1;
    particle.style.animationDuration = `${duration}s`;

    this.particleContainerEl.appendChild(particle);

    // Remove after animation
    setTimeout(() => {
      particle.remove();
    }, duration * 1000);
  }

  /**
   * Create the DOM structure
   */
  private createDOM(): void {
    this.element = document.createElement('div');
    this.element.className = `pow-bar pow-bar--${this.config.anchor}`;

    this.element.innerHTML = `
      <div class="pow-bar__container" aria-label="POW Charge">
        <div class="pow-bar__track">
          <div class="pow-bar__particles"></div>
          <div class="pow-bar__fill"></div>
          <div class="pow-bar__glow"></div>
        </div>
        <div class="pow-bar__label">POW</div>
      </div>
    `;

    this.barFillEl = this.element.querySelector('.pow-bar__fill');
    this.labelEl = this.element.querySelector('.pow-bar__label');
    this.glowEl = this.element.querySelector('.pow-bar__glow');
    this.particleContainerEl = this.element.querySelector('.pow-bar__particles');

    // Inject styles
    this.injectStyles();

    this.container.appendChild(this.element);
  }

  /**
   * Inject CSS styles
   */
  private injectStyles(): void {
    const styleId = 'pow-bar-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .pow-bar {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        z-index: 120;
        pointer-events: none;
        display: none;
        flex-direction: column;
        align-items: center;
        font-family: 'Nunito', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }

      .pow-bar--left {
        left: 20px;
      }

      .pow-bar--right {
        right: 20px;
      }

      @media (max-width: 768px) {
        .pow-bar--left {
          left: 10px;
        }
        .pow-bar--right {
          right: 10px;
        }
      }

      .pow-bar__container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }

      .pow-bar__track {
        position: relative;
        width: 16px;
        height: 180px;
        border-radius: 10px;
        background: rgba(16, 16, 26, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.12);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        box-shadow: 
          0 8px 32px rgba(0, 0, 0, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.08);
        overflow: hidden;
      }

      @media (max-width: 768px) {
        .pow-bar__track {
          height: 140px;
          width: 14px;
        }
      }

      .pow-bar__fill {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 0%;
        border-radius: 8px;
        background: linear-gradient(
          to top,
          rgba(120, 80, 255, 0.95) 0%,
          rgba(0, 200, 255, 0.95) 50%,
          rgba(255, 255, 255, 0.98) 100%
        );
        box-shadow: 
          0 0 12px rgba(100, 180, 255, 0.6),
          0 0 24px rgba(120, 80, 255, 0.4);
        transition: height 0.15s ease-out;
      }

      .pow-bar__glow {
        position: absolute;
        top: -20%;
        left: -100%;
        right: -100%;
        bottom: -20%;
        background: radial-gradient(
          ellipse at center,
          rgba(100, 180, 255, 0.4) 0%,
          rgba(120, 80, 255, 0.2) 40%,
          transparent 70%
        );
        opacity: 0;
        pointer-events: none;
        filter: blur(8px);
      }

      .pow-bar__particles {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        overflow: hidden;
        pointer-events: none;
      }

      .pow-bar__particle {
        position: absolute;
        bottom: 0;
        background: rgba(180, 220, 255, 0.9);
        border-radius: 50%;
        animation: pow-particle-rise linear forwards;
        box-shadow: 0 0 4px rgba(100, 180, 255, 0.8);
      }

      @keyframes pow-particle-rise {
        0% {
          transform: translateY(0) scale(1);
          opacity: 0.8;
        }
        100% {
          transform: translateY(-200px) scale(0.3);
          opacity: 0;
        }
      }

      .pow-bar__label {
        font-size: 0.7rem;
        font-weight: 800;
        letter-spacing: 0.12em;
        color: rgba(255, 255, 255, 0.75);
        text-transform: uppercase;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
        white-space: nowrap;
      }

      /* Phase-specific styles */
      .pow-bar--charging .pow-bar__fill {
        background: linear-gradient(
          to top,
          rgba(100, 60, 180, 0.9) 0%,
          rgba(80, 140, 220, 0.9) 60%,
          rgba(160, 200, 255, 0.95) 100%
        );
      }

      .pow-bar--ready .pow-bar__track {
        animation: pow-ready-pulse 1.2s ease-in-out infinite;
      }

      .pow-bar--ready .pow-bar__fill {
        background: linear-gradient(
          to top,
          rgba(255, 180, 0, 0.95) 0%,
          rgba(255, 220, 100, 0.95) 50%,
          rgba(255, 255, 255, 1) 100%
        );
        box-shadow: 
          0 0 16px rgba(255, 200, 100, 0.8),
          0 0 32px rgba(255, 150, 0, 0.5);
      }

      .pow-bar--ready .pow-bar__glow {
        background: radial-gradient(
          ellipse at center,
          rgba(255, 200, 100, 0.5) 0%,
          rgba(255, 150, 0, 0.3) 40%,
          transparent 70%
        );
        animation: pow-glow-pulse 1.2s ease-in-out infinite;
      }

      .pow-bar--ready .pow-bar__label {
        color: rgba(255, 220, 150, 1);
        animation: pow-label-pulse 0.6s ease-in-out infinite;
      }

      @keyframes pow-ready-pulse {
        0%, 100% {
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 0 20px rgba(255, 200, 100, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        50% {
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 0 40px rgba(255, 200, 100, 0.6),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
      }

      @keyframes pow-glow-pulse {
        0%, 100% {
          opacity: 0.7;
        }
        50% {
          opacity: 1;
        }
      }

      @keyframes pow-label-pulse {
        0%, 100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.8;
          transform: scale(1.05);
        }
      }

      .pow-bar--active .pow-bar__track {
        border-color: rgba(255, 100, 200, 0.4);
      }

      .pow-bar--active .pow-bar__fill {
        background: linear-gradient(
          to top,
          rgba(255, 50, 150, 0.95) 0%,
          rgba(255, 120, 200, 0.95) 50%,
          rgba(255, 220, 255, 1) 100%
        );
        box-shadow: 
          0 0 20px rgba(255, 100, 200, 0.8),
          0 0 40px rgba(255, 50, 150, 0.5);
        animation: pow-active-drain 2.5s linear forwards;
      }

      @keyframes pow-active-drain {
        0% {
          height: 100%;
        }
        100% {
          height: 0%;
        }
      }

      .pow-bar--active .pow-bar__label {
        color: rgba(255, 180, 230, 1);
      }

      .pow-bar--cooldown .pow-bar__fill {
        opacity: 0.3;
      }

      .pow-bar--cooldown .pow-bar__label {
        opacity: 0.5;
      }

      /* Pulse animation for charge increase feedback */
      .pow-bar--pulse .pow-bar__track {
        animation: pow-hit-pulse 0.3s ease-out;
      }

      @keyframes pow-hit-pulse {
        0% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.08);
        }
        100% {
          transform: scale(1);
        }
      }
    `;

    document.head.appendChild(style);
  }
}
