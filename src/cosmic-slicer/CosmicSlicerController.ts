/**
 * CosmicSlicerController Module
 * Main orchestrator for the cosmic slicer game mode
 *
 * Architecture:
 * - 2D Canvas trail rendering (fast, premium look)
 * - 3D objects with custom shaders (stunning visuals)
 * - Screen-space collision detection (reliable)
 * - GPU particle explosions (performant)
 */

import * as THREE from 'three';
import type { HandTracker } from '../shared/HandTracker';
import { PostProcessingManager } from '../shared/PostProcessingManager';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { HandTrailRenderer } from './HandTrailRenderer';
import { ObjectPoolManager } from './ObjectPoolManager';
import { CollisionDetector, CollisionEvent } from './CollisionDetector';
import { SliceEffect } from './SliceEffect';
import { CosmicBackground } from './CosmicBackground';
import { CosmicAssetLibrary } from './CosmicAssetLibrary';
import { HybridCosmicObjectFactory } from './HybridCosmicObjectFactory';
import { createCosmicEnvironment } from './CosmicEnvironment';
import {
  CosmicSlicerConfig,
  DEFAULT_COSMIC_SLICER_CONFIG,
  CosmicSlicerDebugInfo,
} from './types';

/**
 * CosmicSlicerController - Main game controller
 */
export class CosmicSlicerController {
  private handTracker: HandTracker;
  private container: HTMLElement;
  private config: CosmicSlicerConfig;

  // Three.js core
  private scene: THREE.Scene;
  private overlayScene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private postProcessing: PostProcessingManager | null = null;

  private assetLibrary: CosmicAssetLibrary | null = null;

  // Game subsystems
  private trailRenderer: HandTrailRenderer | null = null;
  private objectPool: ObjectPoolManager | null = null;
  private collisionDetector: CollisionDetector | null = null;
  private sliceEffect: SliceEffect | null = null;
  private background: CosmicBackground | null = null;

  // Animation
  private animationId: number | null = null;
  private lastFrameTime: number = 0;
  private isRunning: boolean = false;

  private lastHandResults: ReturnType<HandTracker['detectHands']> = null;
  private lastHandsDetected: number = 0;

  private adaptivePerfEnabled: boolean = true;
  private trailRenderMode: 'on-top' | 'depth-aware' = 'on-top';
  private lastPerfTuningTime: number = 0;

  // Debug
  private debugCallback: ((info: CosmicSlicerDebugInfo) => void) | null = null;
  private fpsCounter: FpsCounter;

  // Lighting
  private ambientLight: THREE.AmbientLight | null = null;
  private pointLight: THREE.PointLight | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private pmremGenerator: THREE.PMREMGenerator | null = null;
  private environmentMap: THREE.Texture | null = null;

  constructor(
    handTracker: HandTracker,
    container: HTMLElement,
    config: Partial<CosmicSlicerConfig> = {}
  ) {
    this.handTracker = handTracker;
    this.container = container;
    this.config = { ...DEFAULT_COSMIC_SLICER_CONFIG, ...config };
    this.fpsCounter = new FpsCounter();

    // Initialize Three.js
    this.scene = new THREE.Scene();
    this.overlayScene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    this.camera.position.z = 5;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      depth: true, // Enable depth buffer for proper sorting
      stencil: false,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Enable HDR rendering with tone mapping
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.renderer.transmissionResolutionScale = 0.75;

    // Ensure depth sorting is enabled
    this.renderer.sortObjects = true;

    // Position canvas
    this.renderer.domElement.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 10;
    `;

    container.appendChild(this.renderer.domElement);

    // Handle resize
    window.addEventListener('resize', this.handleResize);
  }

  private setupEnvironment(): void {
    if (this.pmremGenerator) return;

    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.pmremGenerator.compileEquirectangularShader();

    const environment = createCosmicEnvironment();
    const envMap = this.pmremGenerator.fromScene(environment.scene).texture;
    environment.dispose();
    this.environmentMap = envMap;
    this.scene.environment = this.environmentMap;

    const hdriUrl = '/assets/cosmic-slicer/hdri/space.hdr';
    new RGBELoader().load(
      hdriUrl,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        const nextEnv =
          this.pmremGenerator!.fromEquirectangular(texture).texture;
        this.environmentMap?.dispose();
        this.environmentMap = nextEnv;
        this.scene.environment = this.environmentMap;
        texture.dispose();
      },
      undefined,
      () => {
        // Keep RoomEnvironment fallback.
      }
    );
  }

  private handleResize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    this.postProcessing?.resize(width, height);
    this.collisionDetector?.setScreenSize(width, height);
  };

  /**
   * Initialize all subsystems
   */
  initialize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // Setup lighting
    this.setupLighting();

    // Setup environment lighting (IBL)
    this.setupEnvironment();

    // Optional local-only model assets (must be user-provided CC0)
    this.assetLibrary = new CosmicAssetLibrary(this.renderer, {
      enableKtx2: false,
    });
    this.assetLibrary.preload([]);

    // Initialize background (star field)
    this.background = new CosmicBackground(this.scene, this.config.background);

    // Initialize elegant ribbon trail renderer (rendered as overlay pass)
    this.trailRenderer = new HandTrailRenderer(
      this.overlayScene,
      this.camera,
      this.container,
      {
        maxPoints: 72,
        ribbonWidth: 0.2,
        trailLength: 28,
        coreColor: new THREE.Color(0xffffff), // Pure white core
        glowColor: new THREE.Color(0x00d4ff), // Electric cyan glow
        smoothingFactor: 0.35,
        velocityScale: 2.5,
        intensityBoost: 1.2,
      }
    );

    this.trailRenderer.setRenderMode(this.trailRenderMode);

    // Initialize object pool (pass camera for glow billboarding)
    const factory = new HybridCosmicObjectFactory(this.assetLibrary);
    this.objectPool = new ObjectPoolManager(
      this.scene,
      this.camera,
      {
        ...this.config.objectPool,
        maxActiveObjects: 5,
        spawnRate: 1.0,
        spawnZPosition: -10,
        despawnZPosition: 3,
        spawnSpread: 6,
      },
      factory
    );

    // Initialize precise collision detector (smaller radius = must actually touch)
    this.collisionDetector = new CollisionDetector(this.camera, width, height);
    this.collisionDetector.setCollisionRadius(30);

    // Initialize slice effect
    this.sliceEffect = new SliceEffect(this.scene, {
      ...this.config.sliceEffect,
      particleCount: 100,
      duration: 1.0,
      initialVelocity: 6.0,
      velocityDecay: 0.91,
      particleSize: 1.2,
    });

    // Initialize HDR-aware post-processing with bloom
    this.postProcessing = new PostProcessingManager(
      this.renderer,
      this.scene,
      this.camera,
      {
        enableBloom: true,
        bloomIntensity: 1.15,
        bloomLuminanceThreshold: 0.26,
        bloomRadius: 0.65,
        enableChromaticAberration: true,
        chromaticAberrationOffset: 0.00065,
        enableColorGrading: true,
        colorGradingIntensity: 0.6,
        enableGravitationalLensing: false,
      }
    );

    console.log('[CosmicSlicerController] Initialized');
  }

  private setupLighting(): void {
    // Ambient light
    this.ambientLight = new THREE.AmbientLight(0x222244, 0.35);
    this.scene.add(this.ambientLight);

    // Point light from camera
    this.pointLight = new THREE.PointLight(0xffffff, 0.35, 30);
    this.pointLight.position.set(0, 0, 5);
    this.scene.add(this.pointLight);

    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.55);
    this.keyLight.position.set(4, 6, 4);
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight(0x7aa7ff, 0.55);
    this.fillLight.position.set(-5, 2, 3);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.DirectionalLight(0x86fff3, 1.25);
    this.rimLight.position.set(-2, 3, -6);
    this.scene.add(this.rimLight);
  }

  /**
   * Start the game loop
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.animate();

    console.log('[CosmicSlicerController] Started');
  }

  /**
   * Stop the game loop
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    console.log('[CosmicSlicerController] Stopped');
  }

  /**
   * Animation loop
   */
  private animate = (): void => {
    if (!this.isRunning) return;

    this.animationId = requestAnimationFrame(this.animate);

    const currentTime = performance.now();
    const deltaTime = Math.min((currentTime - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = currentTime;

    this.fpsCounter.update();
    this.update(currentTime, deltaTime);
    this.render();
    this.updateDebugInfo();
  };

  /**
   * Update game logic
   */
  private update(timestamp: number, deltaTime: number): void {
    if (this.adaptivePerfEnabled) {
      this.updateAdaptivePerformance(timestamp);
    }

    // Get hand tracking results (expensive; must be called once per frame)
    this.lastHandResults = this.handTracker.detectHands(timestamp);
    this.lastHandsDetected = this.lastHandResults?.landmarks?.length ?? 0;

    // Update GPU particle trail renderer
    this.trailRenderer?.update(this.lastHandResults, deltaTime);

    // Update 3D object pool
    this.objectPool?.update(deltaTime, timestamp);

    // Update background
    this.background?.update(deltaTime);

    // Check collisions in screen space
    this.checkCollisions();

    // Update explosions
    this.sliceEffect?.update(deltaTime);
  }

  /**
   * Check collisions between trails and objects
   */
  private checkCollisions(): void {
    if (
      !this.trailRenderer ||
      !this.objectPool ||
      !this.collisionDetector ||
      !this.sliceEffect
    ) {
      return;
    }

    // Get 2D trail segments
    const trailSegments = this.trailRenderer.getTrailSegments();

    // Get active objects
    const activeObjects = this.objectPool.getActiveObjects();

    // Detect collisions
    const collisions = this.collisionDetector.detectCollisions(
      trailSegments,
      activeObjects
    );

    // Handle each collision
    for (const collision of collisions) {
      this.handleSlice(collision);
    }
  }

  /**
   * Handle a slice collision
   */
  private handleSlice(collision: CollisionEvent): void {
    const { object, velocity } = collision;

    // Mark object as sliced
    this.objectPool?.sliceObject(object);

    // Trigger explosion at object's 3D position
    const velocityMultiplier = Math.min(2.5, Math.max(0.7, velocity / 300));
    this.sliceEffect?.trigger(object.position.clone(), {
      type: object.config.type,
      baseColor: object.config.color,
      glowColor: object.config.emissiveColor,
      velocityMultiplier,
    });
  }

  /**
   * Render the scene
   */
  private render(): void {
    if (this.postProcessing) {
      this.postProcessing.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // Overlay render pass for the hand trail.
    // This keeps the ribbon crisp and guarantees it never gets visually buried
    // under opaque meshes + bloom.
    if (this.trailRenderer) {
      const prevAutoClear = this.renderer.autoClear;
      this.renderer.autoClear = false;
      if (this.trailRenderMode === 'on-top') {
        this.renderer.clearDepth();
      }
      this.renderer.render(this.overlayScene, this.camera);
      this.renderer.autoClear = prevAutoClear;
    }
  }

  setTrailRenderMode(mode: 'on-top' | 'depth-aware'): void {
    this.trailRenderMode = mode;
    this.trailRenderer?.setRenderMode(mode);
  }

  setAdaptivePerformanceEnabled(enabled: boolean): void {
    this.adaptivePerfEnabled = enabled;
    if (!enabled) {
      this.handTracker.setDetectionIntervalMs(0);
    }
  }

  private updateAdaptivePerformance(timestamp: number): void {
    // Don’t retune too frequently.
    if (timestamp - this.lastPerfTuningTime < 500) return;
    this.lastPerfTuningTime = timestamp;

    const fps = this.fpsCounter.getFps();

    // Quality ladder:
    // - >= 52fps: full
    // - 38-52fps: mild throttle
    // - < 38fps: aggressive throttle
    if (fps >= 52) {
      this.handTracker.setDetectionIntervalMs(0);
      this.trailRenderer?.setQualityLevel('high');
      this.postProcessing?.setBloomIntensity(1.35);
      this.objectPool?.setQualityLevel('high');
      return;
    }

    if (fps >= 38) {
      this.handTracker.setDetectionIntervalMs(33);
      this.trailRenderer?.setQualityLevel('medium');
      this.postProcessing?.setBloomIntensity(1.0);
      this.objectPool?.setQualityLevel('medium');
      return;
    }

    this.handTracker.setDetectionIntervalMs(66);
    this.trailRenderer?.setQualityLevel('low');
    this.postProcessing?.setBloomIntensity(0.65);
    this.objectPool?.setQualityLevel('low');
  }

  /**
   * Enable debug mode
   */
  enableDebug(callback: (info: CosmicSlicerDebugInfo) => void): void {
    this.debugCallback = callback;
  }

  /**
   * Disable debug mode
   */
  disableDebug(): void {
    this.debugCallback = null;
  }

  /**
   * Update debug info
   */
  private updateDebugInfo(): void {
    if (!this.debugCallback) return;

    const info: CosmicSlicerDebugInfo = {
      fps: this.fpsCounter.getFps(),
      handsDetected: this.lastHandsDetected,
      activeObjects: this.objectPool?.getActiveCount() ?? 0,
      totalSliced: this.objectPool?.getTotalSliced() ?? 0,
      trailPointCounts: this.trailRenderer?.getTrailPointCounts() ?? {},
      activeExplosions: this.sliceEffect?.getActiveCount() ?? 0,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      trailRenderMode: this.trailRenderMode,
      detectionIntervalMs: this.handTracker.getDetectionIntervalMs(),
    };

    this.debugCallback(info);
  }

  /**
   * Get number of detected hands
   */
  getHandCount(): number {
    return this.lastHandsDetected;
  }

  /**
   * Reset the game state
   */
  reset(): void {
    this.objectPool?.reset();
    this.collisionDetector?.reset();
    this.sliceEffect?.clear();
    this.trailRenderer?.clear();
    console.log('[CosmicSlicerController] Reset');
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.stop();

    window.removeEventListener('resize', this.handleResize);

    this.trailRenderer?.dispose();
    this.objectPool?.dispose();
    this.collisionDetector?.dispose();
    this.sliceEffect?.dispose();
    this.background?.dispose();
    this.postProcessing?.dispose();
    this.assetLibrary?.dispose();

    if (this.ambientLight) this.scene.remove(this.ambientLight);
    if (this.pointLight) this.scene.remove(this.pointLight);
    if (this.keyLight) this.scene.remove(this.keyLight);
    if (this.fillLight) this.scene.remove(this.fillLight);
    if (this.rimLight) this.scene.remove(this.rimLight);

    this.keyLight = null;
    this.fillLight = null;
    this.rimLight = null;

    this.renderer.dispose();

    this.pmremGenerator?.dispose();
    this.pmremGenerator = null;

    this.environmentMap?.dispose();
    this.environmentMap = null;

    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    console.log('[CosmicSlicerController] Disposed');
  }
}

/**
 * Simple FPS counter
 */
class FpsCounter {
  private frames: number = 0;
  private lastTime: number = performance.now();
  private fps: number = 0;

  update(): void {
    this.frames++;
    const now = performance.now();
    const delta = now - this.lastTime;

    if (delta >= 1000) {
      this.fps = (this.frames * 1000) / delta;
      this.frames = 0;
      this.lastTime = now;
    }
  }

  getFps(): number {
    return this.fps;
  }
}
