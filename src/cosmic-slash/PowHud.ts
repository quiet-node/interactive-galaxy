import { PowPhase, PowState } from './types';

/**
 * PowHud - Premium Holographic Power Gauge
 *
 * Design Philosophy:
 * - "Quantum Energy Cell" aesthetic
 * - High-fidelity glassmorphism and neon glows
 * - Smooth physics-based animations
 * - Sci-fi "Star Wars / Star Trek" data visualization vibes
 * - Mobile-first: horizontal at bottom, vertical on desktop
 */
export class PowHud {
  private container: HTMLElement;
  private element: HTMLElement | null = null;
  private fillEl: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;
  private valueEl: HTMLElement | null = null;
  private particlesEl: HTMLElement | null = null;

  private currentCharge: number = 0;
  private animationRaf: number | null = null;
  private particleInterval: number | null = null;
  private isVisible: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public show(): void {
    if (!this.element) this.createDOM();
    if (this.element) {
      this.element.classList.add('pow-hud--visible');
      this.isVisible = true;
      this.startParticleEffect();
    }
  }

  public hide(): void {
    if (this.element) {
      this.element.classList.remove('pow-hud--visible');
      this.isVisible = false;
      this.stopParticleEffect();
    }
  }

  public dispose(): void {
    this.stopParticleEffect();
    if (this.animationRaf !== null) {
      cancelAnimationFrame(this.animationRaf);
      this.animationRaf = null;
    }
    if (this.element?.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
  }

  public update(state: PowState): void {
    if (!this.element) this.createDOM();
    if (!this.element || !this.fillEl || !this.labelEl || !this.valueEl) return;

    // Smoothly animate charge
    this.animateChargeTo(state.charge);

    // Update numeric display
    const percent = Math.floor(state.charge * 100);
    this.valueEl.textContent = `${percent}%`;

    // Update Phase States
    this.element.classList.remove(
      'pow-hud--charging',
      'pow-hud--ready',
      'pow-hud--active',
      'pow-hud--cooldown'
    );

    switch (state.phase) {
      case PowPhase.CHARGING:
        this.element.classList.add('pow-hud--charging');
        this.labelEl.textContent = 'POW';
        this.labelEl.style.color = 'rgba(0, 242, 255, 0.8)';
        break;
      case PowPhase.READY:
        this.element.classList.add('pow-hud--ready');
        this.labelEl.textContent = 'READY';
        this.labelEl.style.color = '#ffd700';
        this.valueEl.textContent = 'MAX';
        break;
      case PowPhase.ACTIVE:
        this.element.classList.add('pow-hud--active');
        this.labelEl.textContent = 'DISCHARGE';
        this.labelEl.style.color = '#ff0055';
        this.valueEl.textContent = '!!!';
        break;
      case PowPhase.COOLDOWN:
        this.element.classList.add('pow-hud--cooldown');
        this.labelEl.textContent = 'COOLING';
        this.labelEl.style.color = 'rgba(255, 255, 255, 0.5)';
        break;
    }
  }

  private animateChargeTo(targetCharge: number): void {
    if (!this.fillEl) return;

    // Immediate snap for small deltas or if not visible
    if (
      !this.isVisible ||
      Math.abs(this.currentCharge - targetCharge) < 0.005
    ) {
      this.currentCharge = targetCharge;
      this.updateFillVisuals();
      return;
    }

    // Smooth interpolation
    const lerp = (start: number, end: number, t: number) =>
      start * (1 - t) + end * t;
    this.currentCharge = lerp(this.currentCharge, targetCharge, 0.1);
    this.updateFillVisuals();

    // Continue animation if needed
    if (Math.abs(this.currentCharge - targetCharge) > 0.001) {
      if (this.animationRaf) cancelAnimationFrame(this.animationRaf);
      this.animationRaf = requestAnimationFrame(() =>
        this.animateChargeTo(targetCharge)
      );
    }
  }

  private updateFillVisuals(): void {
    if (!this.fillEl) return;
    const percent = Math.max(0, Math.min(100, this.currentCharge * 100));

    // CSS custom property for fill percentage (used differently on mobile vs desktop)
    this.fillEl.style.setProperty('--fill-percent', `${percent}%`);

    // Dynamic glow intensity based on charge
    const intensity = 0.2 + this.currentCharge * 0.8;
    this.fillEl.style.filter = `drop-shadow(0 0 ${
      10 * intensity
    }px currentColor)`;
  }

  private startParticleEffect(): void {
    if (this.particleInterval !== null) return;
    this.particleInterval = window.setInterval(() => this.spawnParticle(), 150);
  }

  private stopParticleEffect(): void {
    if (this.particleInterval !== null) {
      clearInterval(this.particleInterval);
      this.particleInterval = null;
    }
  }

  private spawnParticle(): void {
    if (!this.particlesEl || !this.isVisible || this.currentCharge < 0.1) {
      return;
    }

    const p = document.createElement('div');
    p.className = 'pow-particle';

    // Random properties
    const size = 2 + Math.random() * 3;
    const pos = 10 + Math.random() * 80;
    const duration = 1 + Math.random() * 1.5;

    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.setProperty('--particle-pos', `${pos}%`);
    p.style.animationDuration = `${duration}s`;

    this.particlesEl.appendChild(p);

    // Cleanup
    setTimeout(() => p.remove(), duration * 1000);
  }

  private createDOM(): void {
    this.element = document.createElement('div');
    this.element.className = 'pow-hud';

    this.element.innerHTML = `
      <div class="pow-hud__frame">
        <div class="pow-hud__header">
          <div class="pow-hud__label">POW</div>
          <div class="pow-hud__value">0%</div>
        </div>
        <div class="pow-hud__track-container">
          <div class="pow-hud__track">
            <div class="pow-hud__grid"></div>
            <div class="pow-hud__particles"></div>
            <div class="pow-hud__fill"></div>
            <div class="pow-hud__scanline"></div>
          </div>
          <div class="pow-hud__ticks">
            ${Array(10)
              .fill(0)
              .map(() => `<div class="pow-tick"></div>`)
              .join('')}
          </div>
        </div>
      </div>
    `;

    this.fillEl = this.element.querySelector('.pow-hud__fill');
    this.labelEl = this.element.querySelector('.pow-hud__label');
    this.valueEl = this.element.querySelector('.pow-hud__value');
    this.particlesEl = this.element.querySelector('.pow-hud__particles');

    this.injectStyles();
    this.container.appendChild(this.element);
  }

  private injectStyles(): void {
    const styleId = 'pow-hud-premium-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* ===========================
         MOBILE-FIRST: Horizontal layout at bottom center
         =========================== */
      .pow-hud {
        position: absolute;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        opacity: 0;
        transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        z-index: 90;
        font-family: 'Orbitron', sans-serif;
        pointer-events: none;
      }

      .pow-hud--visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      .pow-hud__frame {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        width: auto;
        box-sizing: border-box;
        background: rgba(10, 12, 20, 0.6);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        box-shadow: 
          0 10px 30px rgba(0, 0, 0, 0.5),
          inset 0 0 20px rgba(0, 0, 0, 0.2);
      }

      .pow-hud__header {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        min-width: 50px;
      }

      .pow-hud__label {
        font-size: 8px;
        letter-spacing: 1.5px;
        font-weight: 700;
        color: rgba(0, 242, 255, 0.8);
        text-shadow: 0 0 5px rgba(0, 242, 255, 0.5);
        transition: color 0.3s ease;
        white-space: nowrap;
        text-align: center;
      }

      .pow-hud__value {
        font-size: 12px;
        font-weight: 900;
        color: #fff;
        font-variant-numeric: tabular-nums;
      }

      /* Mobile: Horizontal track */
      .pow-hud__track-container {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: 140px;
        height: auto;
      }

      .pow-hud__track {
        position: relative;
        width: 100%;
        height: 16px;
        background: rgba(0, 0, 0, 0.4);
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.05);
        box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.8);
      }

      .pow-hud__grid {
        position: absolute;
        inset: 0;
        background-image: 
          linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
        background-size: 4px 4px;
        opacity: 0.5;
        z-index: 1;
      }

      /* Mobile: Fill left-to-right */
      .pow-hud__fill {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 100%;
        width: var(--fill-percent, 0%);
        background: linear-gradient(to right, #0066ff, #00f2ff);
        transition: width 0.1s linear;
        z-index: 2;
        color: #00f2ff;
      }

      .pow-hud__scanline {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: 20%;
        background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.1), transparent);
        animation: pow-scan-h 3s linear infinite;
        z-index: 3;
        pointer-events: none;
      }

      @keyframes pow-scan-h {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(500%); }
      }

      .pow-hud__particles {
        position: absolute;
        inset: 0;
        z-index: 4;
        pointer-events: none;
      }

      /* Mobile: particles move right */
      .pow-particle {
        position: absolute;
        left: 0;
        top: var(--particle-pos, 50%);
        transform: translateY(-50%);
        background: #fff;
        border-radius: 50%;
        opacity: 0;
        animation: pow-drift-h linear forwards;
        box-shadow: 0 0 4px #fff;
      }

      @keyframes pow-drift-h {
        0% { transform: translateX(0) translateY(-50%); opacity: 0.8; }
        100% { transform: translateX(140px) translateY(-50%); opacity: 0; }
      }

      /* Mobile: Horizontal ticks */
      .pow-hud__ticks {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        padding: 0 2px;
        width: 100%;
      }

      .pow-tick {
        width: 2px;
        height: 6px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 1px;
      }

      .pow-tick:nth-child(5n) {
        height: 8px;
        background: rgba(255, 255, 255, 0.4);
      }

      /* ===========================
         DESKTOP: Vertical layout on left side
         =========================== */
      @media (min-width: 768px) {
        .pow-hud {
          left: 40px;
          bottom: auto;
          top: 50%;
          transform: translateY(-50%) translateX(-20px);
        }

        .pow-hud--visible {
          transform: translateY(-50%) translateX(0);
        }

        .pow-hud__frame {
          flex-direction: column;
          gap: 12px;
          padding: 16px;
          width: 100px;
        }

        .pow-hud__header {
          gap: 4px;
          margin-bottom: 4px;
          min-width: auto;
        }

        .pow-hud__label {
          font-size: 10px;
          letter-spacing: 2px;
          width: 100%;
        }

        .pow-hud__value {
          font-size: 14px;
        }

        /* Desktop: Vertical track */
        .pow-hud__track-container {
          flex-direction: row;
          gap: 12px;
          width: auto;
          height: 240px;
        }

        .pow-hud__track {
          width: 24px;
          height: 100%;
          border-radius: 12px;
        }

        /* Desktop: Fill bottom-to-top */
        .pow-hud__fill {
          width: 100%;
          height: var(--fill-percent, 0%);
          bottom: 0;
          left: 0;
          background: linear-gradient(to top, #0066ff, #00f2ff);
          transition: height 0.1s linear;
        }

        .pow-hud__scanline {
          width: 100%;
          height: 20%;
          background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.1), transparent);
          animation: pow-scan-v 3s linear infinite;
        }

        @keyframes pow-scan-v {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(500%); }
        }

        /* Desktop: particles move up */
        .pow-particle {
          left: var(--particle-pos, 50%);
          top: auto;
          bottom: 0;
          transform: translateX(-50%);
          animation: pow-rise linear forwards;
        }

        @keyframes pow-rise {
          0% { transform: translateX(-50%) translateY(0); opacity: 0.8; }
          100% { transform: translateX(-50%) translateY(-240px); opacity: 0; }
        }

        /* Desktop: Vertical ticks */
        .pow-hud__ticks {
          flex-direction: column;
          justify-content: space-between;
          padding: 4px 0;
          width: auto;
          height: 100%;
        }

        .pow-tick {
          width: 8px;
          height: 2px;
        }

        .pow-tick:nth-child(5n) {
          width: 12px;
          height: 2px;
        }
      }

      /* --- STATES --- */

      /* READY STATE */
      .pow-hud--ready .pow-hud__frame {
        border-color: rgba(255, 215, 0, 0.5);
        box-shadow: 0 0 20px rgba(255, 215, 0, 0.2);
        animation: pow-pulse-frame 2s infinite;
      }

      .pow-hud--ready .pow-hud__fill {
        background: linear-gradient(to top, #ff8c00, #ffd700);
        color: #ffd700;
      }

      .pow-hud--ready .pow-tick {
        background: rgba(255, 215, 0, 0.6);
      }

      @keyframes pow-pulse-frame {
        0%, 100% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.2); }
        50% { box-shadow: 0 0 40px rgba(255, 215, 0, 0.4); }
      }

      /* ACTIVE STATE */
      .pow-hud--active .pow-hud__frame {
        border-color: rgba(255, 0, 85, 0.8);
        box-shadow: 0 0 30px rgba(255, 0, 85, 0.4);
      }

      .pow-hud--active .pow-hud__fill {
        background: linear-gradient(to top, #ff0055, #ffcc00);
        color: #ff0055;
        animation: pow-strobe 0.1s infinite;
      }

      @keyframes pow-strobe {
        0% { opacity: 1; }
        50% { opacity: 0.8; }
        100% { opacity: 1; }
      }

      /* COOLDOWN STATE */
      .pow-hud--cooldown .pow-hud__fill {
        background: #333;
        color: #555;
      }
      
      .pow-hud--cooldown .pow-hud__frame {
        opacity: 0.7;
      }

      /* Mobile-specific ready state gradient direction */
      @media (max-width: 767px) {
        .pow-hud--ready .pow-hud__fill {
          background: linear-gradient(to right, #ff8c00, #ffd700);
        }
        .pow-hud--active .pow-hud__fill {
          background: linear-gradient(to right, #ff0055, #ffcc00);
        }
      }
    `;
    document.head.appendChild(style);
  }
}
