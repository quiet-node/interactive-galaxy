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
import { HandTrailRenderer } from './HandTrailRenderer';
import { ObjectPoolManager } from './ObjectPoolManager';
import { CollisionDetector, CollisionEvent } from './CollisionDetector';
import { SliceEffect } from './SliceEffect';
import { CosmicBackground } from './CosmicBackground';
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

  // Debug
  private debugCallback: ((info: CosmicSlicerDebugInfo) => void) | null = null;
  private fpsCounter: FpsCounter;

  // Lighting
  private ambientLight: THREE.AmbientLight | null = null;
  private pointLight: THREE.PointLight | null = null;

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
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

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

    // Initialize background (star field)
    this.background = new CosmicBackground(this.scene, this.config.background);

    // Initialize elegant ribbon trail renderer (rendered as overlay pass)
    this.trailRenderer = new HandTrailRenderer(
      this.overlayScene,
      this.camera,
      this.container,
      {
        maxPoints: 72,
        ribbonWidth: 0.1,
        trailLength: 28,
        fadeDurationMs: 460,
        coreColor: new THREE.Color(0xc8f4ff), // Icy-white core
        glowColor: new THREE.Color(0x5bc8ff), // Cyan halo
      }
    );

    // Initialize object pool (pass camera for glow billboarding)
    this.objectPool = new ObjectPoolManager(this.scene, this.camera, {
      ...this.config.objectPool,
      maxActiveObjects: 5,
      spawnRate: 1.0,
      spawnZPosition: -10,
      despawnZPosition: 3,
      spawnSpread: 6,
    });

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
        bloomIntensity: 1.35,
        bloomLuminanceThreshold: 0.24,
        bloomRadius: 0.75,
        enableChromaticAberration: false,
        enableColorGrading: false,
        enableGravitationalLensing: false,
      }
    );

    console.log('[CosmicSlicerController] Initialized');
  }

  private setupLighting(): void {
    // Ambient light
    this.ambientLight = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(this.ambientLight);

    // Point light from camera
    this.pointLight = new THREE.PointLight(0xffffff, 0.8, 30);
    this.pointLight.position.set(0, 0, 5);
    this.scene.add(this.pointLight);
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
    // Get hand tracking results
    const handResults = this.handTracker.detectHands(timestamp);

    // Update GPU particle trail renderer
    this.trailRenderer?.update(handResults, deltaTime);

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
    this.sliceEffect?.trigger(
      object.position.clone(),
      object.config.emissiveColor,
      velocityMultiplier
    );
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
      this.renderer.clearDepth();
      this.renderer.render(this.overlayScene, this.camera);
      this.renderer.autoClear = prevAutoClear;
    }
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
      handsDetected: this.handTracker.isReady()
        ? this.handTracker.detectHands(performance.now())?.landmarks?.length ??
          0
        : 0,
      activeObjects: this.objectPool?.getActiveCount() ?? 0,
      totalSliced: this.objectPool?.getTotalSliced() ?? 0,
      trailPointCounts: this.trailRenderer?.getTrailPointCounts() ?? {},
      activeExplosions: this.sliceEffect?.getActiveCount() ?? 0,
    };

    this.debugCallback(info);
  }

  /**
   * Get number of detected hands
   */
  getHandCount(): number {
    return (
      this.handTracker.detectHands(performance.now())?.landmarks?.length ?? 0
    );
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

    if (this.ambientLight) this.scene.remove(this.ambientLight);
    if (this.pointLight) this.scene.remove(this.pointLight);

    this.renderer.dispose();

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
