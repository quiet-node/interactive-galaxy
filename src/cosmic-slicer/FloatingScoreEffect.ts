import * as THREE from 'three';

export interface FloatingScoreEffectConfig {
  poolSize?: number;
  baseDurationSec?: number;
}

interface FloatingScoreInstance {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.Texture;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  active: boolean;
  age: number;
  duration: number;
  velocity: THREE.Vector3;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export class FloatingScoreEffect {
  private readonly scene: THREE.Scene;
  private readonly config: Required<FloatingScoreEffectConfig>;
  private readonly pool: FloatingScoreInstance[] = [];
  private poolIndex: number = 0;

  constructor(scene: THREE.Scene, config: FloatingScoreEffectConfig = {}) {
    this.scene = scene;
    this.config = {
      poolSize: Math.max(8, Math.min(64, config.poolSize ?? 24)),
      baseDurationSec: Math.max(
        0.2,
        Math.min(3.0, config.baseDurationSec ?? 1.0)
      ),
    };

    for (let i = 0; i < this.config.poolSize; i++) {
      this.pool.push(this.createInstance());
    }
  }

  trigger(
    position: THREE.Vector3,
    value: number,
    options: {
      intensity01?: number;
      durationSec?: number;
    } = {}
  ): void {
    if (!Number.isFinite(value) || value === 0) return;

    const instance = this.pool[this.poolIndex];
    this.poolIndex = (this.poolIndex + 1) % this.pool.length;

    const intensity01 = clamp01(options.intensity01 ?? 0.5);
    const duration = Math.max(
      0.2,
      options.durationSec ?? this.config.baseDurationSec
    );

    instance.active = true;
    instance.age = 0;
    instance.duration = duration;

    instance.sprite.position.copy(position);
    instance.sprite.visible = true;

    const up = 0.55 + 0.45 * intensity01;
    const drift = (Math.random() - 0.5) * 0.25;
    instance.velocity.set(drift, up, 0);

    const abs = Math.abs(Math.floor(value));
    const sign = value > 0 ? '+' : '-';
    const label = `${sign}${abs}`;

    const color =
      value > 0 ? 'rgba(140, 255, 220, 0.92)' : 'rgba(255, 160, 170, 0.92)';
    const glow =
      value > 0 ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255, 95, 215, 0.12)';

    const scale = 0.34 + 0.38 * intensity01;
    instance.sprite.scale.setScalar(scale);

    this.drawLabel(instance, label, color, glow);
  }

  update(deltaTime: number): void {
    for (const instance of this.pool) {
      if (!instance.active) continue;

      instance.age += deltaTime;
      const t = clamp01(instance.age / instance.duration);

      instance.sprite.position.addScaledVector(instance.velocity, deltaTime);

      const fade = 1 - easeOutCubic(t);
      instance.material.opacity = 0.92 * fade;

      if (t >= 1) {
        instance.active = false;
        instance.sprite.visible = false;
      }
    }
  }

  clear(): void {
    for (const instance of this.pool) {
      instance.active = false;
      instance.sprite.visible = false;
    }
  }

  dispose(): void {
    for (const instance of this.pool) {
      this.scene.remove(instance.sprite);
      instance.texture.dispose();
      instance.material.dispose();
    }
    this.pool.length = 0;
  }

  private createInstance(): FloatingScoreInstance {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('[FloatingScoreEffect] 2D canvas not available');
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
    });

    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.renderOrder = 30;

    this.scene.add(sprite);

    return {
      sprite,
      material,
      texture,
      canvas,
      ctx,
      active: false,
      age: 0,
      duration: this.config.baseDurationSec,
      velocity: new THREE.Vector3(),
    };
  }

  private drawLabel(
    instance: FloatingScoreInstance,
    label: string,
    fill: string,
    glow: string
  ): void {
    const ctx = instance.ctx;
    const w = instance.canvas.width;
    const h = instance.canvas.height;

    ctx.clearRect(0, 0, w, h);

    const fontSize = 68;
    ctx.font = `900 ${fontSize}px Nunito, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = glow;
    ctx.shadowBlur = 18;
    ctx.fillStyle = fill;
    ctx.fillText(label, w / 2, h / 2);

    ctx.shadowColor = 'rgba(0,0,0,0.0)';
    ctx.shadowBlur = 0;

    instance.texture.needsUpdate = true;
    instance.material.opacity = 0.92;
  }
}
