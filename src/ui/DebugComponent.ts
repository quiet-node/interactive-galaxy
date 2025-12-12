/**
 * DebugComponent
 * Displays debug information
 */

export class DebugComponent {
  private container: HTMLElement;
  private element: HTMLElement | null = null;
  private isVisible: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.createDOM();
  }

  update(content: string): void {
    if (!this.element) return;
    const contentDiv = this.element.querySelector('.debug-content');
    if (contentDiv) {
      contentDiv.innerHTML = content;
    }
  }

  show(): void {
    this.isVisible = true;
    this.updateVisibility();
  }

  hide(): void {
    this.isVisible = false;
    this.updateVisibility();
  }

  toggle(): boolean {
    this.isVisible = !this.isVisible;
    this.updateVisibility();
    return this.isVisible;
  }

  isVisibleState(): boolean {
    return this.isVisible;
  }

  private updateVisibility(): void {
    if (this.element) {
      this.element.style.display = this.isVisible ? 'block' : 'none';
    }
  }

  private createDOM(): void {
    this.element = document.createElement('div');
    this.element.className = 'debug-component';
    this.element.innerHTML = '<div class="debug-content"></div>';

    const style = document.createElement('style');
    style.textContent = `
      .debug-component {
        position: absolute;
        bottom: 78px;
        left: 20px;
        padding: 12px 16px;
        background: rgba(20, 20, 25, 0.6);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: #00ff9d;
        font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
        font-size: 0.75rem;
        border-radius: 16px;
        z-index: 2000;
        display: none;
        min-width: 180px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        line-height: 1.5;
      }

      @media (max-width: 768px) {
        .debug-component {
          bottom: 96px;
          left: 10px;
        }
      }
      
      .debug-component .debug-content div {
        white-space: nowrap;
      }
    `;

    this.element.appendChild(style);
    this.container.appendChild(this.element);
  }
}
