/**
 * @fileoverview Cinematic loading overlay with JARVIS-style aesthetics.
 *
 * Creates a DOM-based overlay with:
 * - Rotating holographic rings
 * - Incrementing percentage counter
 * - System initialization text
 * - Premium blurry glass/hologram effects
 */

export class LoadingOverlay {
  private container: HTMLElement;
  private overlay: HTMLDivElement;
  private percentageText: HTMLDivElement;
  private subText: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.overlay = document.createElement('div');
    this.percentageText = document.createElement('div');
    this.subText = document.createElement('div');

    this.setupStyles();
    this.createDOM();
  }

  private setupStyles(): void {
    const styleId = 'iron-man-loading-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes spin-cw {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes spin-ccw {
          0% { transform: rotate(360deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        
        .im-loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.2); /* Very subtle tint */
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          font-family: 'Segoe UI', 'Roboto', sans-serif;
          pointer-events: none;
        }
        
        .im-spinner-container {
          position: relative;
          width: 120px;
          height: 120px;
          margin-bottom: 20px;
        }
        
        .im-spinner-ring {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          border: 2px solid transparent;
          border-top-color: #00ffff;
          border-left-color: rgba(0, 255, 255, 0.3);
          box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
        }
        
        .im-spinner-ring:nth-child(1) {
          animation: spin-cw 2s linear infinite;
        }
        
        .im-spinner-ring:nth-child(2) {
          width: 70%;
          height: 70%;
          top: 15%;
          left: 15%;
          border: 2px solid transparent;
          border-bottom-color: #0088ff;
          border-right-color: rgba(0, 136, 255, 0.3);
          animation: spin-ccw 1.5s linear infinite;
        }
        
        .im-percentage {
          font-size: 32px;
          font-weight: bold;
          color: #00ffff;
          text-shadow: 0 0 10px rgba(0, 255, 255, 0.8);
          letter-spacing: 2px;
        }
        
        .im-subtext {
          margin-top: 10px;
          font-size: 14px;
          color: rgba(0, 255, 255, 0.7);
          letter-spacing: 3px;
          text-transform: uppercase;
          animation: blink 2s infinite;
        }
      `;
      document.head.appendChild(style);
    }
  }

  private createDOM(): void {
    this.overlay.className = 'im-loading-overlay';

    // Spinner Rings
    const spinnerContainer = document.createElement('div');
    spinnerContainer.className = 'im-spinner-container';

    const ring1 = document.createElement('div');
    ring1.className = 'im-spinner-ring';

    const ring2 = document.createElement('div');
    ring2.className = 'im-spinner-ring';

    spinnerContainer.appendChild(ring1);
    spinnerContainer.appendChild(ring2);

    // Text
    this.percentageText.className = 'im-percentage';
    this.percentageText.innerText = '0%';

    this.subText.className = 'im-subtext';
    this.subText.innerText = 'Initializing Systems...';

    this.overlay.appendChild(spinnerContainer);
    this.overlay.appendChild(this.percentageText);
    this.overlay.appendChild(this.subText);

    this.container.appendChild(this.overlay);
  }

  /**
   * Starts the loading sequence.
   * @param durationMs Duration in milliseconds (default 1000)
   * @returns Promise that resolves when loading is complete
   */
  startLoading(durationMs: number = 1000): Promise<void> {
    return new Promise((resolve) => {
      let progress = 0;
      const intervalMs = 16; // ~60fps
      const increment = 100 / (durationMs / intervalMs);

      const timer = setInterval(() => {
        progress += increment;

        if (progress >= 100) {
          progress = 100;
          this.percentageText.innerText = '100%';
          this.subText.innerText = 'System Online';
          clearInterval(timer);

          // Brief pause on 100% before resolving
          setTimeout(() => {
            this.hide();
            resolve();
          }, 200);
        } else {
          this.percentageText.innerText = `${Math.floor(progress)}%`;
        }
      }, intervalMs);
    });
  }

  hide(): void {
    // Fade out
    this.overlay.style.transition = 'opacity 0.5s ease-out';
    this.overlay.style.opacity = '0';

    // Remove from DOM after fade
    setTimeout(() => {
      if (this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
    }, 500);
  }
}
