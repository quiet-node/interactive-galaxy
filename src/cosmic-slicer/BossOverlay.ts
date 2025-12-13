import * as THREE from 'three';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export class BossOverlay {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  private sprite: THREE.Sprite;
  private material: THREE.SpriteMaterial;
  private texture: THREE.Texture;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private baseScale: number = 1.15;
  private desiredScale: number = 1;
  private pulse01: number = 0;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 512;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('[BossOverlay] 2D canvas not available');
    }
    this.ctx = ctx;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.needsUpdate = true;

    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
    });

    this.sprite = new THREE.Sprite(this.material);
    this.sprite.visible = false;
    this.sprite.renderOrder = 40;

    this.scene.add(this.sprite);
  }

  show(): void {
    this.sprite.visible = true;
    this.material.opacity = 1;
  }

  hide(): void {
    this.sprite.visible = false;
    this.material.opacity = 0;
  }

  dispose(): void {
    this.scene.remove(this.sprite);
    this.texture.dispose();
    this.material.dispose();
  }

  setAnchor(worldPosition: THREE.Vector3, bossScale: number): void {
    const offsetY = Math.max(6.3, bossScale * 0.85);
    const offsetZ = -Math.max(3, bossScale * 0.06);
    this.sprite.position.set(
      worldPosition.x,
      worldPosition.y + offsetY,
      worldPosition.z + offsetZ
    );

    const dist = this.camera.position.distanceTo(this.sprite.position);
    const size = this.baseScale * (0.85 + 0.065 * dist);
    this.desiredScale = size;
    this.sprite.scale.set(size, size, 1);
  }

  update(deltaTime: number): void {
    if (!this.sprite.visible) return;

    const pulse = this.pulse01;
    if (pulse > 0) {
      this.pulse01 = Math.max(0, pulse - deltaTime * 3.2);
    }

    const bump = 1 + 0.22 * easeOutCubic(this.pulse01);
    const size = this.desiredScale * bump;
    this.sprite.scale.set(size, size, 1);
  }

  pulse(intensity01: number): void {
    this.pulse01 = Math.max(this.pulse01, clamp01(intensity01));
  }

  setText(
    progressText: string,
    rewardText: string,
    excitement01: number
  ): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    const e = clamp01(excitement01);

    const progressSize = 148 + Math.round(28 * e);
    const rewardSize = 86 + Math.round(22 * e);

    const glowA = 0.22 + 0.18 * e;
    const glowB = 0.16 + 0.2 * e;

    const progressGlow = `rgba(0, 212, 255, ${glowA})`;
    const rewardGlow = `rgba(255, 95, 215, ${glowB})`;

    const progressColor =
      e >= 0.85 ? 'rgba(255, 255, 255, 0.98)' : 'rgba(220, 250, 255, 0.96)';
    const rewardColor =
      e >= 0.65 ? 'rgba(255, 215, 170, 0.98)' : 'rgba(170, 255, 230, 0.92)';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = progressGlow;
    ctx.shadowBlur = 34 + 26 * e;
    ctx.fillStyle = progressColor;
    ctx.font = `900 ${progressSize}px Nunito, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.fillText(progressText, w / 2, h * 0.42);

    ctx.shadowColor = rewardGlow;
    ctx.shadowBlur = 26 + 30 * e;
    ctx.fillStyle = rewardColor;
    ctx.font = `900 ${rewardSize}px Playfair Display, serif`;
    ctx.fillText(rewardText, w / 2, h * 0.72);

    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;

    this.texture.needsUpdate = true;
  }
}
