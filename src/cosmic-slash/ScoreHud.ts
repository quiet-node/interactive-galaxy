import type { ScoreChangeEvent, ScoreState } from './ScoreManager';

export interface ScoreHudConfig {
  anchor?: 'top-left' | 'top-right';
}

function formatInt(v: number): string {
  return Math.max(0, Math.floor(v)).toLocaleString();
}

export class ScoreHud {
  private container: HTMLElement;
  private element: HTMLElement | null = null;

  private scoreEl: HTMLElement | null = null;
  private deltaEl: HTMLElement | null = null;
  private comboEl: HTMLElement | null = null;
  private levelTextEl: HTMLElement | null = null;
  private progressCircleEl: SVGCircleElement | null = null;
  private progressCircumference: number = 1;

  private displayedScore: number = 0;
  private scoreAnimRaf: number | null = null;
  private deltaHideTimeout: number | null = null;
  private comboHideTimeout: number | null = null;

  private config: Required<ScoreHudConfig>;

  constructor(container: HTMLElement, config: ScoreHudConfig = {}) {
    this.container = container;
    this.config = {
      anchor: config.anchor ?? 'top-right',
    };
  }

  show(): void {
    if (!this.element) this.createDOM();
    if (!this.element) return;
    this.element.style.display = 'block';
  }

  hide(): void {
    if (!this.element) return;
    this.element.style.display = 'none';
  }

  dispose(): void {
    if (this.scoreAnimRaf !== null) {
      cancelAnimationFrame(this.scoreAnimRaf);
      this.scoreAnimRaf = null;
    }
    if (this.deltaHideTimeout !== null) {
      window.clearTimeout(this.deltaHideTimeout);
      this.deltaHideTimeout = null;
    }
    if (this.comboHideTimeout !== null) {
      window.clearTimeout(this.comboHideTimeout);
      this.comboHideTimeout = null;
    }

    if (this.element?.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }

    this.element = null;
    this.scoreEl = null;
    this.deltaEl = null;
    this.comboEl = null;
    this.levelTextEl = null;
    this.progressCircleEl = null;
  }

  update(state: ScoreState, event?: ScoreChangeEvent): void {
    if (!this.element) this.createDOM();
    if (
      !this.element ||
      !this.scoreEl ||
      !this.deltaEl ||
      !this.comboEl ||
      !this.levelTextEl ||
      !this.progressCircleEl
    ) {
      return;
    }

    if (event?.type === 'reset') {
      this.displayedScore = state.score;
      this.scoreEl.textContent = formatInt(state.score);
      this.levelTextEl.textContent = `${state.level}`;
      this.setProgress(state.progressToNextLevel01);
      this.deltaEl.textContent = '';
      this.deltaEl.classList.remove('delta-pop', 'delta-positive', 'delta-negative');
      return;
    }

    this.animateScoreTo(state.score);
    this.levelTextEl.textContent = `${state.level}`;
    this.setProgress(state.progressToNextLevel01);

    if (event?.type === 'scoreChanged') {
      if (event.reason !== 'boss') {
        this.showDelta(event.delta, event.reason);
      }
    }

    if (event?.type === 'levelChanged') {
      this.pulseLevelUp();
    }
  }

  private setProgress(progress01: number): void {
    const clamped = Math.max(0, Math.min(1, progress01));
    if (!this.progressCircleEl) return;
    const offset = this.progressCircumference * (1 - clamped);
    this.progressCircleEl.style.strokeDashoffset = `${offset}`;
  }

  private animateScoreTo(targetScore: number): void {
    if (!this.scoreEl) return;

    const start = this.displayedScore;
    const end = Math.max(0, Math.floor(targetScore));

    if (start === end) {
      this.scoreEl.textContent = formatInt(end);
      return;
    }

    if (this.scoreAnimRaf !== null) {
      cancelAnimationFrame(this.scoreAnimRaf);
      this.scoreAnimRaf = null;
    }

    const durationMs = 240;
    const startTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const t = Math.max(0, Math.min(1, (now - startTime) / durationMs));
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(start + (end - start) * eased);
      this.displayedScore = current;
      this.scoreEl!.textContent = formatInt(current);

      if (t < 1) {
        this.scoreAnimRaf = requestAnimationFrame(tick);
      } else {
        this.scoreAnimRaf = null;
      }
    };

    this.scoreAnimRaf = requestAnimationFrame(tick);
  }

  private showDelta(delta: number, reason: 'slice' | 'miss' | 'combo' | 'boss'): void {
    if (!this.deltaEl) return;

    if (this.deltaHideTimeout !== null) {
      window.clearTimeout(this.deltaHideTimeout);
      this.deltaHideTimeout = null;
    }

    const sign = delta >= 0 ? '+' : '';
    this.deltaEl.textContent = `${sign}${delta}`;
    this.deltaEl.classList.remove('delta-positive', 'delta-negative');
    this.deltaEl.classList.add(delta >= 0 ? 'delta-positive' : 'delta-negative');

    this.deltaEl.setAttribute('data-reason', reason);

    this.deltaEl.classList.remove('delta-pop');
    // force reflow
    void this.deltaEl.offsetHeight;
    this.deltaEl.classList.add('delta-pop');

    this.deltaHideTimeout = window.setTimeout(() => {
      this.deltaEl?.classList.remove('delta-pop');
      this.deltaHideTimeout = null;
    }, 520);
  }

  private pulseLevelUp(): void {
    if (!this.element) return;
    this.element.classList.remove('level-up');
    void this.element.offsetHeight;
    this.element.classList.add('level-up');
  }

  showCombo(multiplier: number): void {
    if (!this.comboEl) return;
    const m = Math.max(2, Math.min(5, Math.floor(multiplier)));

    if (this.comboHideTimeout !== null) {
      window.clearTimeout(this.comboHideTimeout);
      this.comboHideTimeout = null;
    }

    this.comboEl.textContent = `x${m}`;
    this.comboEl.classList.remove('combo-pop', 'combo--2', 'combo--3', 'combo--4', 'combo--5');
    void this.comboEl.offsetHeight;
    this.comboEl.classList.add('combo-pop', `combo--${m}`);

    const lifetime = m >= 5 ? 980 : m === 4 ? 880 : m === 3 ? 760 : 640;
    this.comboHideTimeout = window.setTimeout(() => {
      this.comboEl?.classList.remove('combo-pop', `combo--${m}`);
      this.comboHideTimeout = null;
    }, lifetime);
  }

  private createDOM(): void {
    this.element = document.createElement('div');
    this.element.className = `score-hud score-hud--${this.config.anchor}`;

    this.element.innerHTML = `
      <div class="score-hud__wrap" aria-label="Score HUD">
        <div class="score-hud__scoreWrap">
          <div class="score-hud__score" aria-label="Score">0</div>
          <div class="score-hud__delta" aria-label="Score change"></div>
          <div class="score-hud__combo" aria-label="Combo multiplier"></div>
        </div>

        <div class="score-hud__levelWrap" aria-label="Level">
          <svg class="score-hud__ring" viewBox="0 0 44 44" aria-hidden="true">
            <circle class="score-hud__ringTrack" cx="22" cy="22" r="18" />
            <circle class="score-hud__ringProgress" cx="22" cy="22" r="18" />
          </svg>
          <div class="score-hud__levelText">1</div>
        </div>
      </div>
    `;

    this.scoreEl = this.element.querySelector('.score-hud__score');
    this.deltaEl = this.element.querySelector('.score-hud__delta');
    this.comboEl = this.element.querySelector('.score-hud__combo');
    this.levelTextEl = this.element.querySelector('.score-hud__levelText');
    this.progressCircleEl = this.element.querySelector('.score-hud__ringProgress');

    const radius = 18;
    this.progressCircumference = 2 * Math.PI * radius;
    if (this.progressCircleEl) {
      this.progressCircleEl.style.strokeDasharray = `${this.progressCircumference}`;
      this.progressCircleEl.style.strokeDashoffset = `${this.progressCircumference}`;
    }

    const style = document.createElement('style');
    style.textContent = `
      .score-hud {
        position: absolute;
        top: 20px;
        z-index: 120;
        pointer-events: none;
        font-family: 'Nunito', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        color: rgba(255, 255, 255, 0.92);
      }

      .score-hud--top-right { right: 20px; }
      .score-hud--top-left { left: 20px; }

      @media (max-width: 768px) {
        .score-hud {
          top: 10px;
        }
        .score-hud--top-right { right: 10px; }
        .score-hud--top-left { left: 10px; }
      }

      .score-hud__wrap {
        display: flex;
        align-items: center;
        gap: 12px;
        filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.45));
      }

      .score-hud__scoreWrap {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        line-height: 1;
      }

      .score-hud__score {
        font-family: 'Playfair Display', serif;
        font-weight: 800;
        font-size: 1.35rem;
        letter-spacing: 0.02em;
        color: rgba(255, 255, 255, 0.97);
        text-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
      }

      .score-hud__delta {
        margin-top: 4px;
        font-size: 0.82rem;
        font-weight: 900;
        opacity: 0;
        transform: translateY(-3px);
        transition: opacity 170ms ease, transform 170ms ease;
        text-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
      }

      .score-hud__delta.delta-positive { color: rgba(140, 255, 220, 0.95); }
      .score-hud__delta.delta-negative { color: rgba(255, 160, 170, 0.95); }

      .score-hud__delta.delta-pop {
        opacity: 1;
        transform: translateY(0px);
      }

      .score-hud__combo {
        margin-top: 6px;
        font-size: 0.85rem;
        font-weight: 900;
        letter-spacing: 0.06em;
        opacity: 0;
        transform: translateY(-4px) scale(0.98);
        color: rgba(255, 255, 255, 0.92);
        text-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
        filter: drop-shadow(0 0 0 rgba(255, 255, 255, 0));
        transition: opacity 150ms ease, transform 150ms ease, filter 200ms ease;
      }

      .score-hud__combo.combo-pop {
        opacity: 1;
        transform: translateY(0px) scale(1);
      }

      .score-hud__combo.combo--2 {
        color: rgba(180, 255, 235, 0.96);
        filter: drop-shadow(0 0 10px rgba(0, 212, 255, 0.22));
      }

      .score-hud__combo.combo--3 {
        color: rgba(210, 190, 255, 0.98);
        filter: drop-shadow(0 0 14px rgba(255, 95, 215, 0.22));
        transform: translateY(0px) scale(1.05);
      }

      .score-hud__combo.combo--4 {
        color: rgba(255, 215, 170, 0.98);
        filter: drop-shadow(0 0 18px rgba(255, 180, 70, 0.26));
        transform: translateY(0px) scale(1.08);
      }

      .score-hud__combo.combo--5 {
        color: rgba(255, 255, 255, 0.99);
        filter: drop-shadow(0 0 24px rgba(255, 255, 255, 0.22));
        transform: translateY(0px) scale(1.12);
      }

      .score-hud__levelWrap {
        position: relative;
        width: 44px;
        height: 44px;
        display: grid;
        place-items: center;
      }

      .score-hud__levelWrap::before {
        content: '';
        position: absolute;
        inset: 6px;
        border-radius: 999px;
        background: rgba(20, 20, 25, 0.55);
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
      }

      .score-hud__ring {
        position: absolute;
        inset: 0;
        transform: rotate(-90deg);
      }

      .score-hud__ringTrack {
        fill: none;
        stroke: rgba(255, 255, 255, 0.16);
        stroke-width: 3;
      }

      .score-hud__ringProgress {
        fill: none;
        stroke: rgba(0, 212, 255, 0.9);
        stroke-width: 3;
        stroke-linecap: round;
        transition: stroke-dashoffset 260ms cubic-bezier(0.2, 0.9, 0.2, 1);
        filter: drop-shadow(0 0 10px rgba(0, 212, 255, 0.25));
      }

      .score-hud.level-up .score-hud__ringProgress {
        filter: drop-shadow(0 0 14px rgba(255, 95, 215, 0.28));
      }

      .score-hud__levelText {
        position: relative;
        font-family: 'Nunito', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        font-weight: 900;
        font-size: 0.92rem;
        letter-spacing: 0.02em;
        color: rgba(255, 255, 255, 0.92);
        text-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
      }
    `;

    this.element.appendChild(style);
    this.container.appendChild(this.element);
  }
}
