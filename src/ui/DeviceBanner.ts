/**
 * DeviceBanner Component
 * Displays a polite, non-intrusive banner recommending laptop/desktop usage
 * Only shown on screens smaller than typical laptop (< 1024px)
 */

export class DeviceBanner {
  private element: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  // private autoHideTimeout: number | null = null; // Removed

  private static readonly STORAGE_KEY = 'gesture-lab-banner-dismissed-v4';
  private static readonly LAPTOP_MIN_WIDTH = 1024;

  private onResizeBound: () => void;

  constructor() {
    this.onResizeBound = this.onResize.bind(this);
    window.addEventListener('resize', this.onResizeBound);
  }

  private onResize(): void {
    if (window.innerWidth < DeviceBanner.LAPTOP_MIN_WIDTH) {
      this.show();
    } else {
      this.hide();
    }
  }

  /**
   * Show the banner if conditions are met
   */
  show(): void {
    // Don't show if already dismissed this session
    // Don't show if already dismissed this session
    if (sessionStorage.getItem(DeviceBanner.STORAGE_KEY) === 'true') {
      return;
    }

    // Don't show on laptop-size or larger screens
    if (window.innerWidth >= DeviceBanner.LAPTOP_MIN_WIDTH) {
      return;
    }

    // Don't show if already visible
    if (this.element) {
      return;
    }

    this.createDOM();
    // this.startAutoHideTimer();
  }

  /**
   * Hide and remove the banner
   */
  hide(): void {
    // this.clearAutoHideTimer(); // Removed

    if (this.element) {
      this.element.classList.add('device-banner--hiding');

      setTimeout(() => {
        if (this.element?.parentNode) {
          this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
      }, 300);
    }
  }

  /**
   * Dismiss the banner permanently (for this session)
   */
  dismiss(): void {
    sessionStorage.setItem(DeviceBanner.STORAGE_KEY, 'true');
    this.hide();
  }

  /**
   * Dispose of the component
   */
  dispose(): void {
    // this.clearAutoHideTimer(); // Removed

    if (this.element?.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;

    if (this.styleElement?.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
    }
    this.styleElement = null;

    window.removeEventListener('resize', this.onResizeBound);
  }

  /*
  private startAutoHideTimer(): void {
    // Disabled auto-hide to ensure visibility
    this.clearAutoHideTimer();
    // ...
  }

  private clearAutoHideTimer(): void {
    if (this.autoHideTimeout !== null) {
      clearTimeout(this.autoHideTimeout);
      this.autoHideTimeout = null;
    }
  }
  */

  private createDOM(): void {
    this.element = document.createElement('div');
    this.element.className = 'device-banner';
    this.element.setAttribute('role', 'alert');
    this.element.setAttribute('aria-live', 'polite');

    this.element.innerHTML = `
      <div class="device-banner__content">
        <span class="device-banner__text">Works best on a laptop or desktop.</span>
        <button class="device-banner__close" aria-label="Dismiss">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>
    `;

    // Attach close button handler
    const closeBtn = this.element.querySelector('.device-banner__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dismiss();
      });
    }

    // Allow clicking anywhere on banner to dismiss (easier for touch)
    this.element.addEventListener('click', () => this.dismiss());

    this.injectStyles();
    document.body.appendChild(this.element);

    // Trigger entrance animation with double RAF
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.element?.classList.add('device-banner--visible');
      });
    });
  }

  private injectStyles(): void {
    const styleId = 'device-banner-styles';
    if (document.getElementById(styleId)) return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = styleId;
    this.styleElement.textContent = `
      .device-banner {
        position: fixed;
        top: 24px;
        left: 0;
        right: 0;
        z-index: 99999;
        display: flex;
        justify-content: center;
        pointer-events: none;
        transform: translateY(-150%);
        opacity: 0;
        transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
      }

      .device-banner--visible {
        transform: translateY(0);
        opacity: 1;
      }

      .device-banner--hiding {
        transform: translateY(-150%);
        opacity: 0;
      }

      .device-banner__content {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 20px;
        background: rgba(15, 20, 28, 0.95);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        box-shadow: 
          0 10px 30px -5px rgba(0, 0, 0, 0.5),
          0 0 0 1px rgba(255, 255, 255, 0.05);
        max-width: 90vw;
      }

      .device-banner__text {
        font-family: 'Nunito', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 0.95rem;
        font-weight: 600;
        color: rgba(255, 255, 255, 1);
        white-space: nowrap;
        letter-spacing: 0.01em;
        text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      }

      .device-banner__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        background: rgba(255, 255, 255, 0.15);
        border: none;
        border-radius: 50%;
        color: rgba(255, 255, 255, 0.8);
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .device-banner__close:hover {
        background: rgba(255, 255, 255, 0.3);
        color: #fff;
        transform: scale(1.05);
      }

      .device-banner__close:active {
        transform: scale(0.95);
      }

      .device-banner__close:focus {
        outline: none;
        box-shadow: 0 0 0 2px rgba(0, 242, 255, 0.5);
      }

      @media (max-width: 480px) {
        .device-banner {
          top: 16px;
        }
        
        .device-banner__content {
          padding: 8px 16px;
          gap: 10px;
        }

        .device-banner__text {
          font-size: 0.85rem;
        }
      }

      @media (min-width: 1024px) {
        .device-banner {
          display: none;
        }
      }
    `;
    document.head.appendChild(this.styleElement);
  }
}
