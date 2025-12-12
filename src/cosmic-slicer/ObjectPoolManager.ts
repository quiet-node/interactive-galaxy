/**
 * ObjectPoolManager Module
 * Manages spawning, movement, and recycling of cosmic objects
 */

import * as THREE from 'three';
import {
  ObjectPoolConfig,
  DEFAULT_OBJECT_POOL_CONFIG,
  CosmicObjectState,
  CosmicObjectInstance,
  COSMIC_OBJECT_CONFIGS,
} from './types';
import { CosmicObjectFactory } from './CosmicObject';

/**
 * ObjectPoolManager - Manages cosmic object lifecycle
 */
export class ObjectPoolManager {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private config: ObjectPoolConfig;
  private factory: CosmicObjectFactory;

  private readonly despawnFadeDistance: number = 1.6;

  private readonly baseSpawnRate: number;
  private readonly baseMaxActiveObjects: number;
  private objectScaleMultiplier: number = 0.6;

  private pool: CosmicObjectInstance[] = [];
  private nextId: number = 0;

  private lastSpawnTime: number = 0;
  private spawnInterval: number;
  private animationTime: number = 0;
  private totalSliced: number = 0;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    config: Partial<ObjectPoolConfig> = {},
    factory?: CosmicObjectFactory
  ) {
    this.scene = scene;
    this.camera = camera;
    this.config = { ...DEFAULT_OBJECT_POOL_CONFIG, ...config };
    this.factory = factory ?? new CosmicObjectFactory();
    this.spawnInterval = 1000 / this.config.spawnRate;

    this.baseSpawnRate = this.config.spawnRate;
    this.baseMaxActiveObjects = this.config.maxActiveObjects;

    this.initializePool();
  }

  private initializePool(): void {
    for (let i = 0; i < this.config.poolSize; i++) {
      const type = CosmicObjectFactory.getRandomType();
      const object = this.factory.createObject(type);
      const config = COSMIC_OBJECT_CONFIGS[type];

      object.visible = false;

      const instance: CosmicObjectInstance = {
        id: this.nextId++,
        state: CosmicObjectState.POOLED,
        config,
        mesh: object,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        rotationSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        ),
        activatedAt: 0,
        boundingSphere: new THREE.Sphere(
          new THREE.Vector3(),
          config.collisionRadius
        ),
      };

      this.pool.push(instance);
      this.scene.add(object);
    }

    console.log(
      `[ObjectPoolManager] Initialized pool with ${this.config.poolSize} objects`
    );
  }

  update(deltaTime: number, currentTime: number): void {
    this.animationTime += deltaTime;

    this.trySpawn(currentTime);

    // Sort active objects by z-depth (further = render first)
    // This prevents blending issues when objects overlap
    const activeObjects = this.pool.filter(
      (obj) => obj.state === CosmicObjectState.ACTIVE
    );
    activeObjects.sort((a, b) => b.position.z - a.position.z);

    // Update in sorted order and set renderOrder
    for (let i = 0; i < activeObjects.length; i++) {
      const instance = activeObjects[i];
      // Set renderOrder based on depth (closer = higher order)
      instance.mesh.renderOrder = 10 + i;
      this.updateActiveObject(instance, deltaTime);
    }
  }

  private trySpawn(currentTime: number): void {
    if (currentTime - this.lastSpawnTime < this.spawnInterval) {
      return;
    }

    const activeCount = this.getActiveCount();
    if (activeCount >= this.config.maxActiveObjects) {
      return;
    }

    const instance = this.getPooledObject();
    if (!instance) {
      return;
    }

    this.activateObject(instance);
    this.lastSpawnTime = currentTime;
  }

  private getPooledObject(): CosmicObjectInstance | null {
    for (const instance of this.pool) {
      if (instance.state === CosmicObjectState.POOLED) {
        return instance;
      }
    }
    return null;
  }

  private activateObject(instance: CosmicObjectInstance): void {
    const type = CosmicObjectFactory.getRandomType();
    const config = COSMIC_OBJECT_CONFIGS[type];

    // Replace object if type changed
    if (instance.config.type !== type) {
      this.scene.remove(instance.mesh);
      this.disposeObject(instance.mesh);

      instance.mesh = this.factory.createObject(type);
      instance.config = config;
      this.scene.add(instance.mesh);
    }

    // Spawn position with basic separation to reduce overlaps
    const spawnPos = this.pickSpawnPosition();
    instance.position.copy(spawnPos);
    instance.mesh.position.copy(instance.position);

    // Velocity toward camera
    const targetX = (Math.random() - 0.5) * 3.8;
    const targetY = (Math.random() - 0.5) * 2.6;
    const targetZ = this.config.despawnZPosition;

    const direction = new THREE.Vector3(targetX, targetY, targetZ)
      .sub(instance.position)
      .normalize();

    const speedVariation = 0.8 + Math.random() * 0.4;
    instance.velocity
      .copy(direction)
      .multiplyScalar(config.speed * speedVariation);

    // Random rotation
    instance.rotationSpeed.set(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    );

    instance.state = CosmicObjectState.ACTIVE;
    instance.activatedAt = performance.now();
    instance.mesh.visible = true;

    // Set proper render order and depth settings
    instance.mesh.renderOrder = 10;

    // Ensure depth testing is enabled for proper sorting
    instance.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.material instanceof THREE.Material) {
          child.material.depthTest = true;

          if (!child.material.transparent) child.material.depthWrite = true;
        }
      }
    });

    // Size jitter to keep the fleet feeling varied (and smaller by default)
    const sizeJitter = 0.82 + Math.random() * 0.25;
    const scale = config.scale * sizeJitter * this.objectScaleMultiplier;
    instance.mesh.scale.setScalar(scale);
    instance.mesh.userData.baseScale = scale;

    this.applyDespawnFade(instance.mesh, 1);

    instance.boundingSphere.center.copy(instance.position);
    instance.boundingSphere.radius = config.collisionRadius * scale;
  }

  private updateActiveObject(
    instance: CosmicObjectInstance,
    deltaTime: number
  ): void {
    // Update position
    instance.position.addScaledVector(instance.velocity, deltaTime);
    instance.mesh.position.copy(instance.position);

    const rotationRoot =
      (instance.mesh.userData.rotationRoot as THREE.Object3D | undefined) ??
      (instance.mesh.userData.coreMesh as THREE.Object3D | undefined) ??
      instance.mesh;

    rotationRoot.rotation.x += instance.rotationSpeed.x * deltaTime;
    rotationRoot.rotation.y += instance.rotationSpeed.y * deltaTime;
    rotationRoot.rotation.z += instance.rotationSpeed.z * deltaTime;

    // Update shader time and billboard glow sprites
    CosmicObjectFactory.updateObjectTime(
      instance.mesh,
      this.animationTime,
      this.camera
    );

    // Update bounding sphere
    instance.boundingSphere.center.copy(instance.position);

    // Check despawn
    const fadeStartZ = this.config.despawnZPosition - this.despawnFadeDistance;
    const fade =
      instance.position.z <= fadeStartZ
        ? 1
        : Math.max(
            0,
            Math.min(
              1,
              (this.config.despawnZPosition - instance.position.z) /
                this.despawnFadeDistance
            )
          );

    this.applyDespawnFade(instance.mesh, fade);

    const baseScale =
      (instance.mesh.userData.baseScale as number | undefined) ??
      instance.mesh.scale.x;
    const scaleFactor = 0.72 + 0.28 * fade;
    instance.mesh.scale.setScalar(baseScale * scaleFactor);

    if (instance.position.z > this.config.despawnZPosition + 0.15) {
      this.recycleObject(instance, CosmicObjectState.MISSED);
    }
  }

  private applyDespawnFade(object: THREE.Object3D, fade: number): void {
    const clamped = Math.max(0, Math.min(1, fade));

    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      for (const material of materials) {
        if (!(material instanceof THREE.Material)) continue;

        const userData = material.userData as Record<string, unknown>;
        const key = '__fadeOriginal';
        if (!userData[key]) {
          userData[key] = {
            transparent: material.transparent,
            opacity: material.opacity,
            depthWrite: material.depthWrite,
          };
        }

        const original = userData[key] as {
          transparent: boolean;
          opacity: number;
          depthWrite: boolean;
        };

        const uniforms = (material as THREE.ShaderMaterial).uniforms;
        if (uniforms && uniforms.uFade) {
          uniforms.uFade.value = clamped;
        }

        if (clamped >= 0.999) {
          material.transparent = original.transparent;
          material.opacity = original.opacity;
          material.depthWrite = original.depthWrite;
        } else {
          material.transparent = true;
          material.opacity = original.opacity * clamped;
          material.depthWrite = false;
        }

        material.needsUpdate = true;
      }
    });
  }

  private disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
  }

  sliceObject(instance: CosmicObjectInstance): void {
    if (instance.state !== CosmicObjectState.ACTIVE) {
      return;
    }

    instance.state = CosmicObjectState.SLICED;
    this.totalSliced++;
    instance.mesh.visible = false;

    setTimeout(() => {
      this.recycleObject(instance, CosmicObjectState.POOLED);
    }, 50);
  }

  private recycleObject(
    instance: CosmicObjectInstance,
    newState: CosmicObjectState
  ): void {
    instance.state =
      newState === CosmicObjectState.POOLED
        ? CosmicObjectState.POOLED
        : newState;

    if (newState === CosmicObjectState.MISSED) {
      instance.state = CosmicObjectState.POOLED;
    }

    instance.mesh.visible = false;
  }

  private pickSpawnPosition(): THREE.Vector3 {
    const spreadX = this.config.spawnSpread;
    const spreadY = this.config.spawnSpread * 0.55;
    const baseZ = this.config.spawnZPosition;
    const candidate = new THREE.Vector3();

    for (let attempt = 0; attempt < 6; attempt++) {
      candidate.set(
        (Math.random() - 0.5) * spreadX,
        (Math.random() - 0.5) * spreadY,
        baseZ
      );

      const tooClose = this.pool.some((obj) => {
        if (obj.state !== CosmicObjectState.ACTIVE) return false;
        return (
          Math.hypot(
            obj.position.x - candidate.x,
            obj.position.y - candidate.y
          ) < 1.25
        );
      });

      if (!tooClose) {
        return candidate;
      }
    }

    return candidate;
  }

  getActiveObjects(): CosmicObjectInstance[] {
    return this.pool.filter((obj) => obj.state === CosmicObjectState.ACTIVE);
  }

  getActiveCount(): number {
    return this.pool.filter((obj) => obj.state === CosmicObjectState.ACTIVE)
      .length;
  }

  getTotalSliced(): number {
    return this.totalSliced;
  }

  setSpawnRate(rate: number): void {
    this.config.spawnRate = rate;
    this.spawnInterval = 1000 / rate;
  }

  setMaxActiveObjects(max: number): void {
    this.config.maxActiveObjects = Math.min(max, this.config.poolSize);
  }

  setObjectScaleMultiplier(multiplier: number): void {
    this.objectScaleMultiplier = Math.max(0.1, Math.min(2.0, multiplier));
  }

  setQualityLevel(level: 'high' | 'medium' | 'low'): void {
    if (level === 'high') {
      this.setSpawnRate(this.baseSpawnRate);
      this.setMaxActiveObjects(this.baseMaxActiveObjects);
      this.setObjectScaleMultiplier(0.6);
      return;
    }

    if (level === 'medium') {
      this.setSpawnRate(this.baseSpawnRate * 0.8);
      this.setMaxActiveObjects(
        Math.max(3, Math.floor(this.baseMaxActiveObjects * 0.8))
      );
      this.setObjectScaleMultiplier(0.58);
      return;
    }

    this.setSpawnRate(this.baseSpawnRate * 0.6);
    this.setMaxActiveObjects(
      Math.max(2, Math.floor(this.baseMaxActiveObjects * 0.6))
    );
    this.setObjectScaleMultiplier(0.55);
  }

  reset(): void {
    for (const instance of this.pool) {
      instance.state = CosmicObjectState.POOLED;
      instance.mesh.visible = false;
    }
    this.totalSliced = 0;
    this.lastSpawnTime = 0;
    this.animationTime = 0;
  }

  dispose(): void {
    for (const instance of this.pool) {
      this.scene.remove(instance.mesh);
      this.disposeObject(instance.mesh);
    }

    this.pool = [];
    this.factory.dispose();
    console.log('[ObjectPoolManager] Disposed');
  }
}
