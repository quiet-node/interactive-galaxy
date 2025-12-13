export class BossHud {
  private container: HTMLElement;
  private element: HTMLElement | null = null;
  private progressEl: HTMLElement | null = null;
  private rewardEl: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
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
    if (this.element?.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.progressEl = null;
    this.rewardEl = null;
  }

  update(progressText: string, rewardText: string): void {
    if (!this.element) this.createDOM();
    if (!this.element || !this.progressEl || !this.rewardEl) return;

    this.progressEl.textContent = progressText;
    this.rewardEl.textContent = rewardText;

    this.element.classList.remove('boss-hud--pulse');
    void this.element.offsetHeight;
    this.element.classList.add('boss-hud--pulse');
  }

  private createDOM(): void {
    this.element = document.createElement('div');
    this.element.className = 'boss-hud';

    this.element.innerHTML = `
      <div class="boss-hud__wrap" aria-label="Boss progress">
        <div class="boss-hud__progress" aria-label="Boss hit progress">0/0</div>
        <div class="boss-hud__reward" aria-label="Boss reward">0</div>
      </div>
    `;

    this.progressEl = this.element.querySelector('.boss-hud__progress');
    this.rewardEl = this.element.querySelector('.boss-hud__reward');

    const style = document.createElement('style');
    style.textContent = `
      .boss-hud {
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 140;
        pointer-events: none;
        display: none;
        font-family: 'Nunito', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }

      @media (max-width: 768px) {
        .boss-hud {
          top: 10px;
        }
      }

      .boss-hud__wrap {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(16, 16, 22, 0.52);
        border: 1px solid rgba(255, 255, 255, 0.10);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        box-shadow: 0 14px 50px rgba(0, 0, 0, 0.48);
        filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.35));
      }

      .boss-hud__progress {
        font-weight: 900;
        letter-spacing: 0.06em;
        color: rgba(255, 255, 255, 0.95);
        font-size: 0.92rem;
      }

      .boss-hud__reward {
        font-family: 'Playfair Display', serif;
        font-weight: 900;
        letter-spacing: 0.02em;
        color: rgba(255, 215, 170, 0.98);
        font-size: 0.98rem;
        text-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
      }

      .boss-hud.boss-hud--pulse .boss-hud__wrap {
        animation: bossPulse 360ms cubic-bezier(0.2, 0.9, 0.2, 1);
      }

      @keyframes bossPulse {
        0% { transform: translateY(-2px) scale(0.98); filter: brightness(1.0); }
        35% { transform: translateY(0px) scale(1.03); filter: brightness(1.12); }
        100% { transform: translateY(0px) scale(1.0); filter: brightness(1.0); }
      }
    `;

    this.element.appendChild(style);
    this.container.appendChild(this.element);
  }
}
