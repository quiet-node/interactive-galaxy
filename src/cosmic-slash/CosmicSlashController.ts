/**
 * CosmicSlashController Module
 * Main orchestrator for the cosmic slash game mode
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
import { ScoreManager } from './ScoreManager';
import { ScoreHud } from './ScoreHud';
import { FloatingScoreEffect } from './FloatingScoreEffect';
import {
  CosmicSlashConfig,
  DEFAULT_COSMIC_SLASH_CONFIG,
  CosmicSlashDebugInfo,
  CosmicObjectInstance,
  CosmicObjectState,
  CosmicObjectType,
  COSMIC_OBJECT_CONFIGS,
} from './types';
import { BossOverlay } from './BossOverlay';
import { BossWarningOverlay } from './BossWarningOverlay';
import { LevelUpOverlay } from './LevelUpOverlay';
import { ScreenFlashEffect } from './ScreenFlashEffect';
import { PowHud } from './PowHud';
import { PowLaserEffect } from './PowLaserEffect';
import { PowManager } from './PowManager';

/**
 * CosmicSlashController - Main game controller
 */
export class CosmicSlashController {
  private handTracker: HandTracker;
  private container: HTMLElement;
  private config: CosmicSlashConfig;

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

  private floatingScoreEffect: FloatingScoreEffect | null = null;

  // Combo scoring
  private comboWindowMs: number = 450;
  private comboStartMs: number | null = null;
  private comboCount: number = 0;
  private comboBaseSum: number = 0;
  private comboLastPos: THREE.Vector3 | null = null;
  private comboResolveTimeout: number | null = null;

  // Boss fights
  private bossOverlay: BossOverlay | null = null;
  private bossWarningOverlay: BossWarningOverlay | null = null;
  private bossState: 'idle' | 'warning' | 'active' = 'idle';
  private bossWarningStartTime: number = 0;
  private readonly bossWarningDuration: number = 3500;
  private pendingBossLevel: number = 0;

  private bossInstance: CosmicObjectInstance | null = null;
  private bossType: CosmicObjectType | null = null;
  private bossRequiredHits: number = 0;
  private bossHits: number = 0;
  private bossRewardAccrued: number = 0;
  private bossRewardTotal: number = 0;
  private bossSpeed: number = 0;
  private bossSpawnTimeMs: number = 0;
  private nextBossLevel: number = 5;

  // Visual effects
  private levelUpOverlay: LevelUpOverlay | null = null;
  private screenFlash: ScreenFlashEffect | null = null;
  private bloomBoostAge: number = 0;
  private bloomBoostDuration: number = 0;
  private baseBloomIntensity: number = 1.15;
  private bossFlashAge: number = 0;
  private bossFlashDuration: number = 0;

  // POW Mechanic
  private powManager: PowManager | null = null;
  private powHud: PowHud | null = null;
  private powLaserEffect: PowLaserEffect | null = null;
  private powTwoHandDebounceStart: number | null = null;

  // Scoring
  private scoreManager: ScoreManager | null = null;
  private scoreHud: ScoreHud | null = null;
  private removeScoreListener: (() => void) | null = null;
  private previousLevel: number = 1; // Track previous level to detect increases only

  // Animation
  private animationId: number | null = null;
  private lastFrameTime: number = 0;
  private isRunning: boolean = false;
  private isPaused: boolean = false;

  private lastHandResults: ReturnType<HandTracker['detectHands']> = null;
  private lastHandsDetected: number = 0;

  private adaptivePerfEnabled: boolean = true;
  private trailRenderMode: 'on-top' | 'depth-aware' = 'on-top';
  private lastPerfTuningTime: number = 0;

  // Debug
  private debugCallback: ((info: CosmicSlashDebugInfo) => void) | null = null;
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
    config: Partial<CosmicSlashConfig> = {}
  ) {
    this.handTracker = handTracker;
    this.container = container;
    this.config = { ...DEFAULT_COSMIC_SLASH_CONFIG, ...config };
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

    const hdriUrl = '/assets/cosmic-slash/hdri/space.hdr';
    new RGBELoader().load(
      hdriUrl,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        const nextEnv = this.pmremGenerator!.fromEquirectangular(texture).texture;
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
    this.trailRenderer = new HandTrailRenderer(this.overlayScene, this.camera, this.container, {
      maxPoints: 72,
      ribbonWidth: 0.2,
      trailLength: 28,
      coreColor: new THREE.Color(0xffffff), // Pure white core
      glowColor: new THREE.Color(0x00d4ff), // Electric cyan glow
      smoothingFactor: 0.35,
      velocityScale: 2.5,
      intensityBoost: 1.2,
    });

    this.trailRenderer.setRenderMode(this.trailRenderMode);

    // Initialize object pool (pass camera for glow billboarding)
    const factory = new HybridCosmicObjectFactory(this.assetLibrary);
    this.objectPool = new ObjectPoolManager(
      this.scene,
      this.camera,
      {
        ...this.config.objectPool,
        maxActiveObjects: 6,
        spawnRate: 1.15,
        spawnZPosition: -10,
        despawnZPosition: 3,
        spawnSpread: 9,
      },
      factory
    );

    this.bossOverlay = new BossOverlay(this.scene, this.camera);
    this.bossWarningOverlay = new BossWarningOverlay(this.scene, this.camera);

    this.setupScoring();

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

    this.floatingScoreEffect = new FloatingScoreEffect(this.scene, {
      poolSize: 28,
      baseDurationSec: 1.0,
    });

    // Initialize HDR-aware post-processing with bloom
    this.postProcessing = new PostProcessingManager(this.renderer, this.scene, this.camera, {
      enableBloom: true,
      bloomIntensity: 1.15,
      bloomLuminanceThreshold: 0.26,
      bloomRadius: 0.65,
      enableChromaticAberration: true,
      chromaticAberrationOffset: 0.00065,
      enableColorGrading: true,
      colorGradingIntensity: 0.6,
      enableGravitationalLensing: false,
    });

    // Initialize visual effect overlays
    this.levelUpOverlay = new LevelUpOverlay(this.scene, this.camera);
    this.screenFlash = new ScreenFlashEffect(this.container);

    // Initialize POW system
    this.powManager = new PowManager();
    this.powHud = new PowHud(this.container);
    this.powHud.show();
    this.powManager.addListener((state) => this.powHud?.update(state));
    this.powLaserEffect = new PowLaserEffect(this.scene, this.camera);

    console.log('[CosmicSlashController] Initialized');
  }

  private setupScoring(): void {
    if (!this.objectPool) return;

    this.scoreManager?.reset();
    this.removeScoreListener?.();
    this.removeScoreListener = null;

    const pointsByType: Record<CosmicObjectType, number> = {
      [CosmicObjectType.STAR]: 9,
      [CosmicObjectType.CRYSTAL]: 12,
      [CosmicObjectType.METEOR]: 14,
      [CosmicObjectType.VOID_PEARL]: 16,
      [CosmicObjectType.NEBULA_CORE]: 18,
      [CosmicObjectType.ANCIENT_RELIC]: 20,
      [CosmicObjectType.COMET_EMBER]: 22,
    };

    const missPenaltyByType: Partial<Record<CosmicObjectType, number>> = {
      [CosmicObjectType.STAR]: 6,
      [CosmicObjectType.CRYSTAL]: 7,
      [CosmicObjectType.METEOR]: 8,
      [CosmicObjectType.VOID_PEARL]: 9,
      [CosmicObjectType.NEBULA_CORE]: 10,
      [CosmicObjectType.ANCIENT_RELIC]: 11,
      [CosmicObjectType.COMET_EMBER]: 12,
    };

    this.scoreManager = new ScoreManager({
      pointsByType,
      missPenaltyByType,
      maxLevel: 50,
    });

    this.scoreHud =
      this.scoreHud ??
      new ScoreHud(this.container, {
        anchor: 'top-right',
      });
    this.scoreHud.show();

    this.removeScoreListener = this.scoreManager.addListener((state, event) => {
      this.scoreHud?.update(state, event);

      if (event.type !== 'levelChanged') return;

      // Difficulty scaling should meaningfully begin after level 3.
      const k = Math.max(0, state.level - 3);

      const speedMultiplier =
        state.level <= 3 ? 1 : Math.min(3.75, state.speedMultiplier * Math.min(1.65, 1 + 0.06 * k));
      this.objectPool?.setSpeedMultiplier(speedMultiplier);

      const spawnRateMultiplier = state.level <= 3 ? 1 : Math.min(5.4, 1 + 0.34 * k);
      const maxActiveMultiplier = state.level <= 3 ? 1 : Math.min(4.8, 1 + 0.32 * k);

      this.objectPool?.setDifficultyScaling({
        spawnRateMultiplier,
        maxActiveMultiplier,
      });

      // Boss fights every 5 levels (5, 10, 15, ...).
      // If the player skips past the threshold, still trigger the boss.
      while (state.level >= this.nextBossLevel && !this.bossInstance) {
        this.initiateBossSequence(this.nextBossLevel);
        this.nextBossLevel += 5;
      }

      // Trigger level-up celebration ONLY on level increase (not decrease)
      if (event?.type === 'levelChanged' && state.level > this.previousLevel) {
        this.triggerLevelUpCelebration(state.level);
      }
      this.previousLevel = state.level;
    });

    this.objectPool.onObjectMissed((instance) => {
      const appliedDelta = this.scoreManager?.applyMiss(instance.config.type) ?? 0;
      this.floatingScoreEffect?.trigger(instance.position.clone(), appliedDelta, {
        intensity01: 0.35,
        durationSec: 0.85,
      });
    });

    // Baseline difficulty at level 1.
    this.objectPool.setSpeedMultiplier(1);
    this.objectPool.setDifficultyScaling({
      spawnRateMultiplier: 1,
      maxActiveMultiplier: 1,
    });
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

    this.isPaused = false;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.animate();

    console.log('[CosmicSlashController] Started');
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

    console.log('[CosmicSlashController] Stopped');
  }

  pause(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    this.stop();
  }

  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.start();
  }

  togglePause(): boolean {
    if (this.isPaused) {
      this.resume();
      return false;
    }
    this.pause();
    return true;
  }

  getIsPaused(): boolean {
    return this.isPaused;
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

    // Update boss logic
    if (this.bossState === 'warning') {
      this.updateBossWarning(timestamp, deltaTime);
    } else if (this.bossState === 'active') {
      this.updateBoss(deltaTime, timestamp);
    }

    // Update POW Mechanic
    if (this.powManager) {
      this.powManager.update(deltaTime);

      const hands = this.lastHandResults?.landmarks;
      const hasTwoHands = hands && hands.length >= 2;

      // Check for two-hand detection with debounce for activation
      if (hasTwoHands && this.powManager.isReady()) {
        const now = performance.now();
        if (this.powTwoHandDebounceStart === null) {
          this.powTwoHandDebounceStart = now;
        } else if (
          now - this.powTwoHandDebounceStart >=
          this.powManager.getActivationDebounceMs()
        ) {
          // Activate POW!
          this.powManager.activate();
          this.powLaserEffect?.activate();
          this.trailRenderer?.setEnabled(false); // Hide hand trails during POW
          this.powTwoHandDebounceStart = null;
        }
      } else if (!hasTwoHands) {
        this.powTwoHandDebounceStart = null;
      }

      // Update laser beam if active
      if (this.powManager.isActive() && hasTwoHands) {
        // Use index 9 (Middle Finger MCP) as hand center
        const h1 = hands[0][9];
        const h2 = hands[1][9];

        // Unproject to Z=-5 (approx middle of play area)
        // Mirror x-coordinate (1 - x) to match trail rendering behavior
        const p1 = this.unproject(1 - h1.x, h1.y, -5);
        const p2 = this.unproject(1 - h2.x, h2.y, -5);

        this.powLaserEffect?.setHandPositions(p1, p2);
        this.powLaserEffect?.update(deltaTime);

        // Collisions (Screen Space)
        // Mirror x-coordinates to match rendering behavior
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        const s1 = new THREE.Vector2((1 - h1.x) * width, h1.y * height);
        const s2 = new THREE.Vector2((1 - h2.x) * width, h2.y * height);
        this.checkBeamCollisions(s1, s2);
      } else if (this.powManager.isActive() && !hasTwoHands) {
        // Hands separated while POW active - deactivate early
        this.powManager.deactivate();
        this.powLaserEffect?.deactivate();
        this.trailRenderer?.setEnabled(true); // Restore hand trails
      } else if (!this.powManager.isActive()) {
        this.powLaserEffect?.deactivate();
        // Ensure trails are visible when POW is not active
        if (this.trailRenderer && !this.trailRenderer.isEnabled()) {
          this.trailRenderer.setEnabled(true);
        }
      }
    }

    // Update background
    this.background?.update(deltaTime);

    // Check collisions in screen space
    this.checkCollisions();

    // Update explosions
    this.sliceEffect?.update(deltaTime);

    // Update floating score labels
    this.floatingScoreEffect?.update(deltaTime);

    // Update visual effect overlays
    this.levelUpOverlay?.update(deltaTime);
    this.screenFlash?.update(deltaTime);

    // Update bloom boost animation (subtle intensity for boss hits)
    if (this.bloomBoostAge < this.bloomBoostDuration) {
      this.bloomBoostAge += deltaTime;
      const t = this.bloomBoostAge / this.bloomBoostDuration;
      const boost = Math.max(0, 1 - t) * 0.4; // Reduced from 0.8 for subtlety
      this.postProcessing?.setBloomIntensity(this.baseBloomIntensity + boost);
    }

    // Update boss flash animation
    if (this.bossFlashAge < this.bossFlashDuration) {
      this.bossFlashAge += deltaTime;
      const t = this.bossFlashAge / this.bossFlashDuration;
      const intensity = Math.max(0, 1 - t * t);
      this.flashBossMaterial(intensity);
    }
  }

  /**
   * Check collisions between trails and objects
   */
  private checkCollisions(): void {
    if (!this.trailRenderer || !this.objectPool || !this.collisionDetector || !this.sliceEffect) {
      return;
    }

    // Get 2D trail segments
    const trailSegments = this.trailRenderer.getTrailSegments();

    // Get active objects
    const activeObjects = this.objectPool.getActiveObjects();
    if (this.bossInstance) {
      activeObjects.push(this.bossInstance);
    }

    // Detect collisions
    const collisions = this.collisionDetector.detectCollisions(trailSegments, activeObjects);

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

    if (this.bossInstance && object.id === this.bossInstance.id) {
      this.handleBossHit(velocity);
      return;
    }

    // Mark object as sliced
    this.objectPool?.sliceObject(object);

    // Add POW charge based on object type
    this.powManager?.addCharge(object.config.type);

    const appliedDelta = this.scoreManager?.applySlice(object.config.type) ?? 0;

    this.registerComboSlice(appliedDelta, object.position.clone());

    // Trigger explosion at object's 3D position
    const velocityMultiplier = Math.min(2.5, Math.max(0.7, velocity / 300));

    const intensity01 = Math.max(0, Math.min(1, (velocityMultiplier - 0.7) / (2.5 - 0.7)));

    this.floatingScoreEffect?.trigger(object.position.clone(), appliedDelta, {
      intensity01,
      durationSec: 1.0,
    });

    this.sliceEffect?.trigger(object.position.clone(), {
      type: object.config.type,
      baseColor: object.config.color,
      glowColor: object.config.emissiveColor,
      velocityMultiplier,
    });
  }

  private registerComboSlice(appliedDelta: number, position: THREE.Vector3): void {
    if (!Number.isFinite(appliedDelta) || appliedDelta <= 0) return;

    const now = performance.now();
    if (this.comboStartMs === null || now - this.comboStartMs > this.comboWindowMs) {
      this.flushCombo();
      this.comboStartMs = now;
      this.comboCount = 0;
      this.comboBaseSum = 0;
    }

    this.comboCount += 1;
    this.comboBaseSum += appliedDelta;
    this.comboLastPos = position;

    if (this.comboResolveTimeout !== null) {
      window.clearTimeout(this.comboResolveTimeout);
      this.comboResolveTimeout = null;
    }

    const remaining = Math.max(0, this.comboWindowMs - (now - (this.comboStartMs ?? now)));
    this.comboResolveTimeout = window.setTimeout(() => {
      this.flushCombo();
    }, remaining);
  }

  private flushCombo(): void {
    if (this.comboResolveTimeout !== null) {
      window.clearTimeout(this.comboResolveTimeout);
      this.comboResolveTimeout = null;
    }

    const count = this.comboCount;
    const base = this.comboBaseSum;
    const lastPos = this.comboLastPos?.clone() ?? null;

    this.comboStartMs = null;
    this.comboCount = 0;
    this.comboBaseSum = 0;
    this.comboLastPos = null;

    if (!this.scoreManager || !this.scoreHud) return;
    if (count < 2 || base <= 0) return;

    const multiplier = Math.max(2, Math.min(5, count));
    const bonus = Math.floor(base * (multiplier - 1));
    if (bonus <= 0) return;

    this.scoreManager.applyBonus(bonus, 'combo');
    this.scoreHud.showCombo(multiplier);

    if (lastPos) {
      const intensity01 = Math.max(0.45, Math.min(1, 0.55 + 0.12 * (multiplier - 2)));
      this.floatingScoreEffect?.trigger(lastPos, bonus, {
        intensity01,
        durationSec: 1.15,
      });
    }
  }

  private initiateBossSequence(level: number): void {
    if (!this.objectPool || this.bossInstance || !this.assetLibrary) return;

    this.flushCombo();

    // Freeze regular spawns while boss is active.
    this.objectPool.setSpawningEnabled(false);
    this.objectPool.clearActiveObjects();

    // Start Warning Phase
    this.bossState = 'warning';
    this.bossWarningStartTime = performance.now();
    this.pendingBossLevel = level;
    this.bossWarningOverlay?.trigger();
  }

  private updateBossWarning(timestamp: number, deltaTime: number): void {
    this.bossWarningOverlay?.update(deltaTime);

    if (timestamp - this.bossWarningStartTime > this.bossWarningDuration) {
      this.spawnBoss(this.pendingBossLevel);
    }
  }

  private spawnBoss(level: number): void {
    if (!this.objectPool || this.bossInstance || !this.assetLibrary) return;

    this.bossState = 'active';

    const bossIndex = Math.max(1, Math.floor(level / 5));
    this.bossRequiredHits = 10 * bossIndex;
    this.bossHits = 0;
    this.bossRewardAccrued = 0;
    this.bossRewardTotal = Math.round(360 * bossIndex * bossIndex + 220 * bossIndex);

    // Faster early bosses; more-hit bosses are slower (gives time to slice).
    // Level 5 should feel urgent.
    this.bossSpeed = Math.max(0.28, 1.05 - 0.18 * (bossIndex - 1));
    this.bossSpawnTimeMs = performance.now();

    const bossTypes: CosmicObjectType[] = [
      CosmicObjectType.STAR,
      CosmicObjectType.CRYSTAL,
      CosmicObjectType.METEOR,
      CosmicObjectType.VOID_PEARL,
      CosmicObjectType.NEBULA_CORE,
      CosmicObjectType.ANCIENT_RELIC,
      CosmicObjectType.COMET_EMBER,
    ];
    const type = bossTypes[Math.floor(Math.random() * bossTypes.length)];
    this.bossType = type;

    const baseConfig = COSMIC_OBJECT_CONFIGS[type];
    // Noticeably larger than normal objects (0.58-0.72 scale range).
    // Bosses scale from 5x to 7x regular size based on difficulty progression.
    const scaleMult = 5.0 + 0.6 * (bossIndex - 1);
    const bossConfig = {
      ...baseConfig,
      scale: baseConfig.scale * scaleMult,
      collisionRadius: baseConfig.collisionRadius,
    };

    const bossFactory = new HybridCosmicObjectFactory(this.assetLibrary);
    const mesh = bossFactory.createObject(type);

    const startZ = -22 - bossIndex * 2.0; // Start further back
    mesh.position.set(0, 0, startZ);
    mesh.scale.setScalar(bossConfig.scale);
    mesh.visible = true;
    mesh.renderOrder = 12;
    this.scene.add(mesh);

    const instance: CosmicObjectInstance = {
      id: -Math.floor(Math.random() * 1_000_000) - 1,
      state: CosmicObjectState.ACTIVE,
      config: bossConfig,
      mesh,
      position: new THREE.Vector3(0, 0, startZ),
      velocity: new THREE.Vector3(0, 0, this.bossSpeed),
      rotationSpeed: new THREE.Vector3(0.15, 0.22, 0.12),
      activatedAt: performance.now(),
      boundingSphere: new THREE.Sphere(new THREE.Vector3(0, 0, startZ), 1),
    };

    instance.boundingSphere.center.copy(instance.position);
    instance.boundingSphere.radius = bossConfig.collisionRadius * bossConfig.scale;

    this.bossInstance = instance;

    this.bossOverlay?.show();
    this.bossOverlay?.setAnchor(instance.position, instance.mesh.scale.x);
    this.bossOverlay?.setText(`0/${this.bossRequiredHits}`, `0`, 0.35);
    this.bossOverlay?.pulse(0.55);

    // Spawn Effect (Screen Flash + Particles)
    this.screenFlash?.flash({
      color: '#ff3300',
      duration: 0.8,
      intensity: 0.6,
    });

    // Particle burst at spawn location
    this.sliceEffect?.trigger(instance.position.clone(), {
      type: type,
      baseColor: new THREE.Color(0xffffff),
      glowColor: new THREE.Color(0xff3300),
      velocityMultiplier: 5.0,
    });
  }

  private updateBoss(deltaTime: number, timestamp: number): void {
    if (!this.bossInstance) return;

    const t = (timestamp - this.bossSpawnTimeMs) * 0.001;

    // Slow approach from the center with a subtle drift.
    this.bossInstance.position.z += this.bossSpeed * deltaTime;
    this.bossInstance.position.x = Math.sin(t * 0.75) * 0.55;
    this.bossInstance.position.y = Math.cos(t * 0.62) * 0.26;
    this.bossInstance.mesh.position.copy(this.bossInstance.position);

    const rotationRoot =
      (this.bossInstance.mesh.userData.rotationRoot as THREE.Object3D | undefined) ??
      (this.bossInstance.mesh.userData.coreMesh as THREE.Object3D | undefined) ??
      this.bossInstance.mesh;

    rotationRoot.rotation.x += this.bossInstance.rotationSpeed.x * deltaTime;
    rotationRoot.rotation.y += this.bossInstance.rotationSpeed.y * deltaTime;
    rotationRoot.rotation.z += this.bossInstance.rotationSpeed.z * deltaTime;

    this.bossInstance.boundingSphere.center.copy(this.bossInstance.position);

    this.bossOverlay?.setAnchor(this.bossInstance.position, this.bossInstance.mesh.scale.x);
    this.bossOverlay?.update(deltaTime);

    // Escaped: no penalty, resume normal spawning.
    if (this.bossInstance.position.z > 3.2) {
      this.endBossFight(false);
    }
  }

  private handleBossHit(velocity: number): void {
    if (!this.bossInstance || !this.bossType || !this.scoreManager || this.bossState !== 'active') {
      return;
    }

    this.bossHits += 1;
    this.bossHits = Math.min(this.bossRequiredHits, this.bossHits);

    // Add POW charge for boss hit (bosses give 12% charge per hit - higher than regular objects!)
    this.powManager?.addRawCharge(0.12);

    // Visual feedback: subtle bloom boost only (no screen flash - too jarring)
    this.bloomBoostAge = 0;
    this.bloomBoostDuration = 0.2;

    // Flash boss material for clear hit confirmation
    this.bossFlashAge = 0;
    this.bossFlashDuration = 0.2;
    this.flashBossMaterial(1.0);

    // Per-hit reward increases as you get closer to the final burst.
    const progress01 = this.bossRequiredHits > 0 ? this.bossHits / this.bossRequiredHits : 1;
    const targetAccrued = Math.round(this.bossRewardTotal * Math.pow(progress01, 2.05));
    const delta = Math.max(0, targetAccrued - this.bossRewardAccrued);
    this.bossRewardAccrued = targetAccrued;
    // Note: Score accumulates but is NOT added to main score during fight
    // It will be awarded only when boss is defeated
    if (delta > 0) {
      this.floatingScoreEffect?.trigger(this.bossInstance.position.clone(), delta, {
        intensity01: 0.6,
        durationSec: 1.05,
      });
    }

    const excitement01 = Math.max(
      0,
      Math.min(1, this.bossRequiredHits > 0 ? this.bossHits / this.bossRequiredHits : 1)
    );

    this.bossOverlay?.setText(
      `${this.bossHits}/${this.bossRequiredHits}`,
      `${Math.max(0, Math.floor(this.bossRewardAccrued)).toLocaleString()}`,
      excitement01
    );
    this.bossOverlay?.pulse(Math.min(1, 0.6 + 0.6 * excitement01));

    const velMult = Math.min(1.35, Math.max(0.8, velocity / 350));
    const cfg = COSMIC_OBJECT_CONFIGS[this.bossType];
    this.sliceEffect?.trigger(this.bossInstance.position.clone(), {
      type: this.bossType,
      baseColor: cfg.color,
      glowColor: cfg.emissiveColor,
      velocityMultiplier: velMult,
    });

    if (this.bossHits >= this.bossRequiredHits) {
      this.endBossFight(true);
    }
  }

  private endBossFight(defeated: boolean): void {
    if (!this.bossInstance) {
      this.bossOverlay?.hide();
      this.objectPool?.setSpawningEnabled(true);
      return;
    }

    if (defeated) {
      // Award the full accumulated reward on boss defeat
      const totalReward = this.bossRewardAccrued;
      if (totalReward > 0) {
        this.scoreManager?.applyBonus(totalReward, 'boss');
        // Position main score well above boss center to be visible above explosion
        const scorePos = this.bossInstance.position.clone();
        scorePos.y += 2.5;
        this.floatingScoreEffect?.trigger(scorePos, totalReward, {
          intensity01: 1,
          durationSec: 2.0,
        });

        const pos = this.bossInstance.position.clone();
        for (let i = 0; i < 4; i++) {
          const jitter = new THREE.Vector3(
            (Math.random() - 0.5) * 0.6,
            (Math.random() - 0.5) * 0.45,
            (Math.random() - 0.5) * 0.35
          );
          this.floatingScoreEffect?.trigger(pos.clone().add(jitter), Math.round(totalReward / 4), {
            intensity01: 1,
            durationSec: 1.75,
          });
        }
      }

      const cfg =
        this.bossType !== null
          ? COSMIC_OBJECT_CONFIGS[this.bossType]
          : COSMIC_OBJECT_CONFIGS[CosmicObjectType.METEOR];

      const basePos = this.bossInstance.position.clone();
      const burstCount = 18;
      for (let i = 0; i < burstCount; i++) {
        const ring = i < 10;
        const theta = (i / Math.max(1, burstCount - 1)) * Math.PI * 2;
        const radius = ring ? 2.15 + Math.random() * 0.7 : Math.random() * 1.4;
        const offset = new THREE.Vector3(
          Math.cos(theta) * radius + (Math.random() - 0.5) * 0.35,
          Math.sin(theta) * radius + (Math.random() - 0.5) * 0.35,
          (Math.random() - 0.5) * 0.65
        );

        const mult = 5.0 + i * 0.42;
        this.sliceEffect?.trigger(basePos.clone().add(offset), {
          type: cfg.type,
          baseColor: cfg.color,
          glowColor: cfg.emissiveColor,
          velocityMultiplier: mult,
        });
      }

      // A couple of core bursts to sell the "boss shattered" moment.
      this.sliceEffect?.trigger(basePos.clone(), {
        type: cfg.type,
        baseColor: cfg.color,
        glowColor: cfg.emissiveColor,
        velocityMultiplier: 7.2,
      });
      this.sliceEffect?.trigger(basePos.clone(), {
        type: cfg.type,
        baseColor: cfg.color,
        glowColor: cfg.emissiveColor,
        velocityMultiplier: 8.4,
      });
    }

    this.scene.remove(this.bossInstance.mesh);
    this.disposeThreeObject(this.bossInstance.mesh);

    this.bossInstance = null;
    this.bossType = null;
    this.bossRequiredHits = 0;
    this.bossHits = 0;
    this.bossRewardAccrued = 0;
    this.bossRewardTotal = 0;
    this.bossSpeed = 0;

    this.bossOverlay?.hide();
    this.bossState = 'idle';

    // Resume regular spawns.
    this.objectPool?.setSpawningEnabled(true);
  }

  /**
   * Trigger subtle level-up celebration
   */
  private triggerLevelUpCelebration(level: number): void {
    // Show subtle level-up banner at top
    this.levelUpOverlay?.show(level);

    // Gentle bloom pulse (reduced from 1.2s)
    this.bloomBoostAge = 0;
    this.bloomBoostDuration = 0.6;

    // No screen flash - too distracting during gameplay

    // Small particle burst at camera center (subtle celebration)
    const cameraDir = new THREE.Vector3(0, 0, -1);
    cameraDir.applyQuaternion(this.camera.quaternion);
    const celebrationPos = this.camera.position.clone().add(cameraDir.multiplyScalar(2.5));

    // Reduced particle count from 12 to 6 for subtlety
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const radius = 1.0;
      const offset = new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        (Math.random() - 0.5) * 0.3
      );

      const types = Object.values(CosmicObjectType);
      const type = types[Math.floor(Math.random() * types.length)];
      const cfg = COSMIC_OBJECT_CONFIGS[type];

      this.sliceEffect?.trigger(celebrationPos.clone().add(offset), {
        type,
        baseColor: cfg.color,
        glowColor: cfg.emissiveColor,
        velocityMultiplier: 2.5, // Reduced from 3.5
      });
    }
  }

  /**
   * Flash boss material for hit feedback
   * Works consistently across all boss types by modifying both emissive and base color
   */
  private flashBossMaterial(intensity: number): void {
    if (!this.bossInstance || !this.bossType) return;

    const cfg = COSMIC_OBJECT_CONFIGS[this.bossType];
    const mesh = this.bossInstance.mesh;

    mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const materials = Array.isArray(child.material) ? child.material : [child.material];

      for (const mat of materials) {
        if (!mat) continue;

        // Flash emissive intensity if available
        if ('emissiveIntensity' in mat) {
          const baseIntensity = cfg.emissiveIntensity;
          const flashBoost = intensity * 2.8;
          (mat as THREE.MeshStandardMaterial).emissiveIntensity = baseIntensity + flashBoost;
        }

        // Flash emissive color brightness if available
        if ('emissive' in mat && mat.emissive instanceof THREE.Color) {
          const flashFactor = 1 + intensity * 1.5;
          const baseBrightness = cfg.emissiveColor.r + cfg.emissiveColor.g + cfg.emissiveColor.b;
          const targetBrightness = Math.min(3, baseBrightness * flashFactor);
          const scale = baseBrightness > 0 ? targetBrightness / baseBrightness : 1;
          (mat as THREE.MeshStandardMaterial).emissive
            .copy(cfg.emissiveColor)
            .multiplyScalar(scale);
        }

        // For materials without emissive, flash the base color
        if ('color' in mat && mat.color instanceof THREE.Color) {
          const flashFactor = 1 + intensity * 0.4;
          (mat as THREE.MeshStandardMaterial).color.copy(cfg.color).multiplyScalar(flashFactor);
        }
      }
    });
  }

  private unproject(x: number, y: number, z: number): THREE.Vector3 {
    const vec = new THREE.Vector3();
    vec.set(x * 2 - 1, -(y * 2) + 1, 0.5);
    vec.unproject(this.camera);
    vec.sub(this.camera.position).normalize();
    const distance = (z - this.camera.position.z) / vec.z;
    return new THREE.Vector3().copy(this.camera.position).add(vec.multiplyScalar(distance));
  }

  private checkBeamCollisions(p1: THREE.Vector2, p2: THREE.Vector2): void {
    if (!this.objectPool || !this.powManager) return;

    const activeObjects = this.objectPool.getActiveObjects();
    const effectiveBeamRadius = 40;

    const lineDir = new THREE.Vector2().subVectors(p2, p1);
    const lineLenSq = lineDir.lengthSq();

    // Helper function to calculate distance from a point to the beam line segment
    const getDistToBeam = (objPos: THREE.Vector2): number => {
      let t = 0;
      if (lineLenSq > 0) {
        t = Math.max(
          0,
          Math.min(1, new THREE.Vector2().subVectors(objPos, p1).dot(lineDir) / lineLenSq)
        );
      }
      const closest = new THREE.Vector2().copy(p1).add(lineDir.clone().multiplyScalar(t));
      return objPos.distanceTo(closest);
    };

    // Check regular cosmic objects
    for (const obj of activeObjects) {
      // Project object to screen space
      const screenPos = obj.position.clone().project(this.camera);
      const x = (screenPos.x * 0.5 + 0.5) * this.container.clientWidth;
      const y = (-(screenPos.y * 0.5) + 0.5) * this.container.clientHeight;
      const objPos = new THREE.Vector2(x, y);

      const dist = getDistToBeam(objPos);

      // Check collision
      const scale = Math.max(0.1, 5 / (5 - obj.position.z)); // Perspective scale
      const objRadius = 50 * scale * obj.config.scale;

      if (dist < effectiveBeamRadius + objRadius) {
        // POW laser hit - destroy with bonus score!
        this.handlePowLaserHit(obj);
      }
    }

    // Check boss collision if there's an active boss fight
    if (this.bossInstance) {
      const bossScreenPos = this.bossInstance.position.clone().project(this.camera);
      const bossX = (bossScreenPos.x * 0.5 + 0.5) * this.container.clientWidth;
      const bossY = (-(bossScreenPos.y * 0.5) + 0.5) * this.container.clientHeight;
      const bossPos = new THREE.Vector2(bossX, bossY);

      const bossDist = getDistToBeam(bossPos);

      // Boss is larger, use bigger radius
      const bossScale = Math.max(0.1, 5 / (5 - this.bossInstance.position.z));
      const bossRadius = 80 * bossScale * this.bossInstance.config.scale;

      if (bossDist < effectiveBeamRadius + bossRadius) {
        // POW laser hit on boss - counts as a boss hit!
        this.handlePowLaserBossHit();
      }
    }
  }

  /**
   * Handle an object destroyed by the POW laser
   */
  private handlePowLaserHit(object: CosmicObjectInstance): void {
    // Mark object as sliced
    this.objectPool?.sliceObject(object);

    // Calculate score with laser multiplier
    const baseScore = this.scoreManager?.applySlice(object.config.type) ?? 0;
    const multiplier = this.powManager?.getLaserMultiplier() ?? 2.0;
    const bonusScore = Math.floor(baseScore * (multiplier - 1));

    // Apply bonus if any
    if (bonusScore > 0) {
      this.scoreManager?.applyBonus(bonusScore, 'combo');
    }

    // Record destruction in POW manager
    this.powManager?.recordDestruction(baseScore + bonusScore);

    // Show floating score effect with high intensity
    const totalScore = baseScore + bonusScore;
    this.floatingScoreEffect?.trigger(object.position.clone(), totalScore, {
      intensity01: 1.0,
      durationSec: 1.2,
    });

    // Trigger explosion at object's 3D position with high velocity
    const velocityMultiplier = 2.5;

    this.sliceEffect?.trigger(object.position.clone(), {
      type: object.config.type,
      baseColor: object.config.color,
      glowColor: object.config.emissiveColor,
      velocityMultiplier,
    });
  }

  /**
   * Handle boss being hit by the POW laser
   * The laser deals multiple hits rapidly and applies the score multiplier
   */
  private handlePowLaserBossHit(): void {
    if (!this.bossInstance || !this.bossType || !this.scoreManager) return;

    // POW laser deals stronger damage - count as multiple hits
    const laserHitsPerFrame = 2; // Each frame the laser touches boss counts as 2 hits
    this.bossHits = Math.min(this.bossRequiredHits, this.bossHits + laserHitsPerFrame);

    // Visual feedback
    this.bloomBoostAge = 0;
    this.bloomBoostDuration = 0.15;
    this.bossFlashAge = 0;
    this.bossFlashDuration = 0.15;
    this.flashBossMaterial(1.0);

    // Calculate score reward with laser multiplier
    const progress01 = this.bossRequiredHits > 0 ? this.bossHits / this.bossRequiredHits : 1;
    const targetAccrued = Math.round(this.bossRewardTotal * Math.pow(progress01, 2.05));
    const baseReward = Math.max(0, targetAccrued - this.bossRewardAccrued);

    // Apply laser multiplier to the reward
    const multiplier = this.powManager?.getLaserMultiplier() ?? 2.0;
    const boostedReward = Math.floor(baseReward * multiplier);
    this.bossRewardAccrued = targetAccrued + (boostedReward - baseReward);

    // Show floating score with high intensity (laser hit!)
    if (boostedReward > 0) {
      this.floatingScoreEffect?.trigger(this.bossInstance.position.clone(), boostedReward, {
        intensity01: 1.0,
        durationSec: 1.0,
      });
    }

    // Record destruction in POW manager
    this.powManager?.recordDestruction(boostedReward);

    // Update boss HUD
    const excitement01 = Math.max(0, Math.min(1, progress01));
    this.bossOverlay?.setText(
      `${this.bossHits}/${this.bossRequiredHits}`,
      `${Math.max(0, Math.floor(this.bossRewardAccrued)).toLocaleString()}`,
      excitement01
    );
    this.bossOverlay?.pulse(Math.min(1, 0.8 + 0.4 * excitement01));

    // Trigger explosion effect
    const cfg = COSMIC_OBJECT_CONFIGS[this.bossType];
    this.sliceEffect?.trigger(this.bossInstance.position.clone(), {
      type: this.bossType,
      baseColor: cfg.color,
      glowColor: cfg.emissiveColor,
      velocityMultiplier: 2.0, // High velocity for laser hit
    });

    // Check if boss is defeated
    if (this.bossHits >= this.bossRequiredHits) {
      this.endBossFight(true);
    }
  }

  private disposeThreeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry?.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m instanceof THREE.Material) m.dispose();
      }
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
  enableDebug(callback: (info: CosmicSlashDebugInfo) => void): void {
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

    const info: CosmicSlashDebugInfo = {
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
    this.floatingScoreEffect?.clear();
    this.scoreManager?.reset();
    this.powManager?.reset();
    this.powLaserEffect?.deactivate();
    this.powTwoHandDebounceStart = null;
    this.objectPool?.setSpeedMultiplier(1);
    this.objectPool?.setDifficultyScaling({
      spawnRateMultiplier: 1,
      maxActiveMultiplier: 1,
    });

    this.flushCombo();
    this.endBossFight(false);
    this.nextBossLevel = 5;
    this.previousLevel = 1; // Reset level tracking
    this.isPaused = false;
    console.log('[CosmicSlashController] Reset');
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
    this.floatingScoreEffect?.dispose();
    this.background?.dispose();
    this.postProcessing?.dispose();
    this.assetLibrary?.dispose();
    this.levelUpOverlay?.dispose();
    this.screenFlash?.dispose();
    this.bossOverlay?.dispose();

    // Dispose POW system
    this.powManager?.dispose();
    this.powHud?.dispose();
    this.powLaserEffect?.dispose();
    this.powManager = null;
    this.powHud = null;
    this.powLaserEffect = null;

    this.removeScoreListener?.();
    this.removeScoreListener = null;
    this.scoreHud?.dispose();
    this.scoreHud = null;
    this.bossOverlay?.dispose();
    this.bossOverlay = null;

    this.flushCombo();
    this.endBossFight(false);
    this.scoreManager = null;
    this.floatingScoreEffect = null;

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

    console.log('[CosmicSlashController] Disposed');
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
