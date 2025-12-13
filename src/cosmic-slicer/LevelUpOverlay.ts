/**
 * LevelUpOverlay
 * Premium, minimalist notification when player reaches a new level
 *
 * Design Philosophy:
 * - Ultra-subtle, luxury aesthetic
 * - Minimal visual elements
 * - Refined typography and spacing
 * - Gentle, elegant animations
 * - Non-intrusive yet noticeable
 */

import * as THREE from 'three';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  trackingPx: number
): void {
  // Canvas letterSpacing support is inconsistent; do manual tracking.
  const chars = Array.from(text);
  let totalWidth = 0;
  for (const ch of chars) {
    totalWidth += ctx.measureText(ch).width;
  }
  totalWidth += trackingPx * Math.max(0, chars.length - 1);

  let x = centerX - totalWidth / 2;
  for (const ch of chars) {
    ctx.fillText(ch, x + ctx.measureText(ch).width / 2, y);
    x += ctx.measureText(ch).width + trackingPx;
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInQuad(t: number): number {
  return t * t;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class LevelUpOverlay {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  private sprite: THREE.Sprite;
  private material: THREE.SpriteMaterial;
  private texture: THREE.Texture;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private isActive: boolean = false;
  private animationAge: number = 0;
  private readonly animationDuration: number = 2.8; // seconds - refined, unhurried pace

  private currentLevel: number = 1;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;

    // Higher resolution for crisp text rendering.
    // Slightly taller to allow more breathing room for a capsule layout.
    this.canvas = document.createElement('canvas');
    this.canvas.width = 768;
    this.canvas.height = 176;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('[LevelUpOverlay] 2D canvas not available');
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
      depthTest: false,
    });

    this.sprite = new THREE.Sprite(this.material);
    this.sprite.visible = false;
    this.sprite.renderOrder = 100;
    this.sprite.scale.set(2.75, 0.58, 1); // Subtle, less billboard-like

    this.scene.add(this.sprite);
  }

  /**
   * Show premium level-up notification
   */
  show(level: number): void {
    this.currentLevel = level;
    this.isActive = true;
    this.animationAge = 0;
    this.sprite.visible = true;
    this.renderLevel();
  }

  hide(): void {
    this.isActive = false;
    this.sprite.visible = false;
    this.material.opacity = 0;
  }

  update(deltaTime: number): void {
    if (!this.isActive) return;

    this.animationAge += deltaTime;

    if (this.animationAge >= this.animationDuration) {
      this.hide();
      return;
    }

    const t = this.animationAge / this.animationDuration;

    // Position at top of screen
    const cameraDir = new THREE.Vector3(0, 0, -1);
    cameraDir.applyQuaternion(this.camera.quaternion);
    const upDir = new THREE.Vector3(0, 1, 0);
    upDir.applyQuaternion(this.camera.quaternion);

    const centerPos = this.camera.position
      .clone()
      .add(cameraDir.multiplyScalar(2.5));

    // Ultra-smooth motion with refined easing
    let offsetY = 0;
    let scale = 1;

    if (t < 0.3) {
      // Gentle entrance with slight scale
      const enterT = t / 0.3;
      offsetY = (1 - easeOutCubic(enterT)) * 0.5;
      scale = 0.92 + easeOutCubic(enterT) * 0.08;
    } else if (t > 0.7) {
      // Graceful exit
      const exitT = (t - 0.7) / 0.3;
      offsetY = easeInOutCubic(exitT) * 0.5;
      scale = 1 - easeInQuad(exitT) * 0.08;
    }

    this.sprite.position
      .copy(centerPos)
      .add(upDir.multiplyScalar(1.15 + offsetY));

    // Apply subtle scale
    const baseScale = 3;
    this.sprite.scale.set(baseScale * scale, 0.6 * scale, 1);

    // Ultra-refined opacity curve (slightly softer peak)
    let opacity = 0.9;
    if (t < 0.2) {
      // Gentle fade in
      const fadeT = t / 0.2;
      opacity = easeOutCubic(fadeT) * 0.9;
    } else if (t > 0.75) {
      // Smooth fade out
      const fadeT = (t - 0.75) / 0.25;
      opacity = (1 - easeInOutCubic(fadeT)) * 0.9;
    }

    this.material.opacity = opacity;
  }

  dispose(): void {
    this.scene.remove(this.sprite);
    this.texture.dispose();
    this.material.dispose();
  }

  private renderLevel(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    const isBonusRound = this.currentLevel % 5 === 0;

    // Premium, subtle capsule background (aligned with ScoreHud glass look)
    const insetX = 34;
    const insetY = 20;
    const capsuleW = w - insetX * 2;
    const capsuleH = h - insetY * 2;
    const radius = 28;

    // Soft shadow baked into texture for depth
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 12;
    drawRoundedRect(ctx, insetX, insetY, capsuleW, capsuleH, radius);
    const bgGrad = ctx.createLinearGradient(0, insetY, 0, insetY + capsuleH);
    bgGrad.addColorStop(0, 'rgba(20, 20, 25, 0.72)');
    bgGrad.addColorStop(1, 'rgba(10, 10, 14, 0.48)');
    ctx.fillStyle = bgGrad;
    ctx.fill();
    ctx.restore();

    // Border + subtle inner highlight
    drawRoundedRect(ctx, insetX, insetY, capsuleW, capsuleH, radius);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    ctx.stroke();

    drawRoundedRect(
      ctx,
      insetX + 1.5,
      insetY + 1.5,
      capsuleW - 3,
      capsuleH - 3,
      radius - 1
    );
    const innerGrad = ctx.createLinearGradient(0, insetY, 0, insetY + capsuleH);
    innerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
    innerGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.015)');
    innerGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.strokeStyle = innerGrad;
    ctx.stroke();

    // Accent line (very subtle cyan glow, consistent with slicer trail)
    const accentY = insetY + capsuleH - 6;
    const accentGrad = ctx.createLinearGradient(
      insetX,
      0,
      insetX + capsuleW,
      0
    );
    accentGrad.addColorStop(0, 'rgba(0, 212, 255, 0)');
    accentGrad.addColorStop(0.18, 'rgba(0, 212, 255, 0.14)');
    accentGrad.addColorStop(0.5, 'rgba(0, 212, 255, 0.22)');
    accentGrad.addColorStop(0.82, 'rgba(0, 212, 255, 0.14)');
    accentGrad.addColorStop(1, 'rgba(0, 212, 255, 0)');
    ctx.fillStyle = accentGrad;
    ctx.fillRect(insetX + 18, accentY, capsuleW - 36, 1);

    // Micro "stardust" noise (deterministic per level so it doesn't flicker)
    const seedBase = (this.currentLevel * 9301 + 49297) % 233280;
    let seed = seedBase;
    const rand01 = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const dotCount = 36;
    for (let i = 0; i < dotCount; i++) {
      const rx = insetX + 18 + rand01() * (capsuleW - 36);
      const ry = insetY + 16 + rand01() * (capsuleH - 32);
      const r = 0.6 + rand01() * 1.2;
      const a = 0.02 + 0.05 * rand01();
      ctx.fillStyle = `rgba(255, 255, 255, ${clamp01(a)})`;
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Typography aligned with the rest of the app (Nunito + Playfair Display)
    const labelSize = 14;
    const numSize = 54;
    const bonusSize = 12;

    // Label (tracked, crisp, understated)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.66)';
    ctx.font = `800 ${labelSize}px Nunito, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    drawTrackedText(ctx, `LEVEL ${this.currentLevel}`, w / 2, h / 2 - 36, 3.25);

    if (isBonusRound) {
      ctx.shadowColor = 'rgba(0, 212, 255, 0.14)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = 'rgba(0, 212, 255, 0.68)';
      ctx.font = `900 ${bonusSize}px Nunito, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      drawTrackedText(ctx, 'BONUS ROUND', w / 2, h / 2 - 18, 2.6);
    }

    // Number (premium serif with a faint cyan glow)
    ctx.shadowColor = 'rgba(0, 212, 255, 0.16)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.font = `800 ${numSize}px Playfair Display, serif`;
    ctx.fillText(`${this.currentLevel}`, w / 2, h / 2 + 26);

    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.shadowBlur = 0;

    this.texture.needsUpdate = true;
  }
}
