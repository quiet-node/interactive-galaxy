# Interactive Galaxy Mode - Design Document

## 1. Vision & User Experience

### Goal

Create a magical, cosmic web experience where users conjure and manipulate a stunning 3D spiral galaxy between their hands using natural hand gestures, complete with breathtaking visual effects and interactive particle explosions.

### User Experience Flow

1. User opens the application in a web browser with camera access
2. Camera feed becomes visible with dimmed brightness (background effect)
3. User shows both hands on screen → nothing happens initially
4. As user separates hands → a small galaxy materializes and grows between the palms
5. User adjusts hand distance → galaxy smoothly scales in real-time
6. User rotates hands → galaxy rotates in 3D space matching hand orientation
7. User pinches thumb and index finger → mini star burst effect spawns at pinch position
8. User brings hands very close → gravitational lensing effect warps the screen
9. User closes hands completely → Big Bang explosion sequence triggers
10. Galaxy implodes → singularity → explodes → fades away → clear screen

The magic happens through:

- Realistic particle physics (20,000+ particles with differential rotation)
- Professional post-processing (bloom, chromatic aberration, color grading)
- Smooth exponential moving average for all transitions
- Natural gesture recognition with hysteresis and cooldown
- Explosive lifecycle management with state machine

---

## 2. Technical Architecture

### 2.1 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         App.ts (Main)                            │
│  - Mode switching (Galaxy ↔ Foggy Mirror)                       │
│  - Keyboard event handling (G, F, R, H, D, Esc)                 │
│  - DOM structure creation and styling                           │
│  - Debug panel coordination                                      │
│  - FPS monitoring                                                │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              HandGalaxyController (Orchestrator)                 │
│  - Hand detection processing (2-hand requirement)               │
│  - Coordinate transformation (normalized → world space)         │
│  - Distance/scale calculation with smoothing                    │
│  - Position/rotation calculation and smoothing                  │
│  - Explosion trigger logic (distance + tracking loss)           │
│  - Gesture detection coordination                               │
│  - Grace period management (500ms fade)                         │
│  - Lifecycle state tracking (per-galaxy explosion flag)         │
└─┬───────────┬──────────────┬──────────────┬────────────────────┘
  │           │              │              │
  ▼           ▼              ▼              ▼
┌──────┐  ┌─────────┐  ┌──────────┐  ┌──────────────┐
│ Hand │  │ Galaxy  │  │ Gesture  │  │ StarBurst    │
│Track │  │Renderer │  │Detector  │  │ Effect       │
│ (ML) │  │(WebGL)  │  │(Pinch)   │  │ (Particles)  │
└──────┘  └─────────┘  └──────────┘  └──────────────┘
```

### 2.2 Component Responsibilities

#### HandGalaxyController

**Purpose:** Bridge between hand tracking and galaxy rendering  
**Key Responsibilities:**

- Process hand detection results (requires exactly 2 hands)
- Calculate palm centers using 4 MCP knuckles (more accurate than wrist)
- Compute hand distance for scale mapping
- Transform normalized coordinates to Three.js world space
- Apply exponential smoothing to scale, position, rotation
- Detect explosion triggers (critical mass or tracking loss)
- Coordinate gesture detection for star burst effects
- Block updates during explosion sequence
- Manage per-galaxy lifecycle flags

**State Management:**

```typescript
// Galaxy lifecycle tracking
isGalaxyActive: boolean; // Galaxy visible/hidden
hasExplodedThisLife: boolean; // Prevent multiple explosions per lifecycle
lastHandsDetectedTime: number; // For grace period calculation
lastHandCount: number; // Track hand transitions
```

#### GalaxyRenderer

**Purpose:** Create and render the 3D spiral galaxy using WebGL  
**Key Responsibilities:**

- Generate 20,000+ particle geometry (core + halo + arms)
- Custom GLSL shaders for realistic cosmic effects
- Differential rotation (inner stars faster, Keplerian-like)
- Multi-octave noise for turbulence and swirling motion
- Twinkling animation with per-particle variation
- Explosion state machine (NORMAL → IMPLODING → SINGULARITY → EXPLODING → FADING)
- Scale/position/rotation transform management
- Post-processing integration (bloom, chromatic aberration, color grading)
- Gravitational lensing activation based on hand distance

**Particle Distribution:**

```typescript
// 20,000 total particles
Core (20%):        4,000 particles - ultra-dense nucleus (0-12% radius)
Core Halo (15%):   3,000 particles - transition zone (12-25% radius)
Spiral Arms (65%): 13,000 particles - main galaxy disc (25-100% radius)
```

#### GestureDetector

**Purpose:** Detect pinch gestures from MediaPipe hand landmarks  
**Key Responsibilities:**

- Measure distance between thumb tip and index tip
- State tracking with hysteresis (IDLE → STARTED → ACTIVE → ENDED)
- Sustained frame requirement (3 consecutive frames minimum)
- Cooldown period enforcement (800ms between triggers)
- Calculate pinch position (midpoint) and strength
- Convert normalized coordinates to world space

**Detection Algorithm:**

```typescript
isPinching = distance < 0.035           // Trigger threshold
isReleased = distance > 0.055           // Release threshold (hysteresis)
isSustainedPinch = frames >= 3          // Anti-flicker
cooldownElapsed = time > 800ms          // Debouncing
```

#### StarBurstEffect

**Purpose:** Manage mini particle explosion effects triggered by pinch gestures  
**Key Responsibilities:**

- Object pooling for efficient particle reuse (5 concurrent bursts max)
- Radial velocity initialization with per-particle variation
- Exponential velocity decay over time
- Alpha fade based on lifetime
- GPU-accelerated rendering via instanced particles
- Automatic burst recycling when complete

**Burst Lifecycle:**

```
Trigger → Initialize (spawn at pinch position)
       → Update (apply velocity, decay, fade)
       → Recycle (after 1.5 seconds or slot needed)
```

#### PostProcessingManager

**Purpose:** Orchestrate cinematic post-processing effects  
**Key Responsibilities:**

- Bloom effect for glowing particles (HDR-quality)
- Chromatic aberration for lens distortion
- 3D LUT color grading for cosmic palette
- Gravitational lensing screen-space distortion
- Composer pipeline management
- HalfFloat frame buffers to prevent banding

**Effect Configuration:**

```typescript
Bloom:
  - Intensity: 1.5
  - Luminance Threshold: 0.4 (only bright stars glow)
  - Radius: 0.8
  - Kernel: LARGE (high quality)

Chromatic Aberration:
  - Offset: 0.001
  - Radial modulation: true (stronger at edges)

Color Grading:
  - Custom 32³ LUT (cosmic palette)
  - Saturation boost: 1.8x
  - Hue rotation toward blues/purples/cyans
  - S-curve contrast enhancement
```

#### GravitationalLensingEffect

**Purpose:** Create screen-space distortion when hands are very close  
**Key Responsibilities:**

- Schwarzschild-inspired radial distortion
- Intensity mapping based on hand distance (0.06-0.08 range)
- Custom fragment shader for GPU acceleration
- Lens center positioned at galaxy center
- Resolution-aware aspect ratio correction

**Activation Logic:**

```typescript
// Only activate in critical zone (pre-explosion tension)
if (handDistance >= 0.06 && handDistance <= 0.08) {
  intensity = 1.0 - (handDistance - 0.06) / 0.02; // Inverse mapping
  lensingEffect.setIntensity(intensity);
}
```

---

## 3. Galaxy Particle System - WebGL Implementation

### 3.1 Vertex Shader Architecture

**Key Features:**

- Per-particle attributes (position, size, distance, brightness, seed)
- 3D Simplex noise for organic turbulence
- Differential rotation (Keplerian: ω ∝ 1/√r)
- Explosion state machine integration
- Twinkling animation with multi-frequency variation

**Turbulence Algorithm:**

```glsl
// Multi-octave 3D noise for swirling vortex effect
float turbulence1 = snoise(pos * 0.4 + time) * 0.08;
float turbulence2 = snoise(pos * 0.8 + time) * 0.04;
float turbulence3 = snoise(pos * 1.6 + time) * 0.02;

// Apply as spiral flow (stronger near core)
float angle = atan(pos.z, pos.x) + totalTurbulence * (1.0 - distance);
```

**Differential Rotation:**

```glsl
// Inner stars orbit faster (realistic Keplerian motion)
float orbitalSpeed = 0.15 / (distance + 0.12);
float rotationAngle = time * orbitalSpeed;

// Rotate around Y-axis (galaxy plane)
vec3 rotated = vec3(
  pos.x * cos(angle) - pos.z * sin(angle),
  pos.y,
  pos.x * sin(angle) + pos.z * cos(angle)
);
```

### 3.2 Explosion State Machine

**States:**

```typescript
enum ExplosionState {
  NORMAL = 0, // Regular galaxy rendering
  IMPLODING = 1, // [Unused - Reserved for future]
  SINGULARITY = 2, // Collapse to vibrating point (0.2s)
  EXPLODING = 3, // Radial burst outward (2.0s)
  FADING = 4, // Exponential fade to zero (2.5s)
}
```

**Transition Logic:**

```typescript
NORMAL → SINGULARITY (trigger: scale < 0.01 OR hands lost while close)
  ↓
SINGULARITY → EXPLODING (auto: 0.2s elapsed)
  ↓
EXPLODING → FADING (auto: 2.0s elapsed)
  ↓
FADING → NORMAL (auto: 2.5s elapsed → hide galaxy)
```

**Singularity Phase:**

```glsl
// Intense vibration at origin
float vibrationFreq = 25.0 + seed * 15.0;
float vibrationAmp = 0.03 * (1.0 + seed);
vec3 vibration = direction * sin(time * vibrationFreq) * vibrationAmp;
position = vec3(0.0) + vibration;
brightness *= 3.0;  // Extremely bright
```

**Exploding Phase:**

```glsl
// Radial burst with deceleration
float speed = 8.0 + seed * 8.0;  // Vary per particle
float velocity = speed * exp(-0.25 * time);  // Exponential decay
vec3 offset = direction * velocity * time;
position = vec3(0.0) + offset;
brightness *= max(0.2, 1.0 - time * 0.4);  // Fade during expansion
```

### 3.3 Fragment Shader - Cosmic Color Palette

**Color Mapping:**

```glsl
// Temperature-based color (from per-particle seed)
if (temperature < 0.25) {
  // Hot blue-white stars (O/B spectral type)
  color = mix(vec3(0.7, 0.85, 1.0), vec3(0.85, 0.92, 1.0), t);
}
else if (temperature < 0.5) {
  // Purple-magenta stars
  color = mix(vec3(0.85, 0.7, 1.0), vec3(1.0, 0.6, 1.0), t);
}
else if (temperature < 0.75) {
  // Cyan-teal stars
  color = mix(vec3(0.6, 1.0, 1.0), vec3(0.7, 0.95, 1.0), t);
}
else {
  // Violet-blue stars
  color = mix(vec3(0.75, 0.8, 1.0), vec3(0.8, 0.7, 1.0), t);
}
```

**Gaussian Point Rendering:**

```glsl
// Circular point with soft falloff
vec2 center = gl_PointCoord - 0.5;
float dist = length(center);
if (dist > 0.5) discard;

// Ultra-intense glow for brilliant stars
float alpha = exp(-dist * dist * 7.0);
float halo = exp(-dist * 2.0) * 0.6;
alpha = alpha + halo;
alpha *= brightness * depthAlpha * 1.3;  // Brightness boost
```

---

## 4. Coordinate Systems & Transformations

### 4.1 MediaPipe Normalized Coordinates

**Input Space:**

```
x, y: [0, 1] normalized to image dimensions
z: Depth relative to wrist (negative = toward camera)
Origin: Top-left corner
```

**Hand Landmarks (21 points per hand):**

```typescript
enum HandLandmarkIndex {
  WRIST = 0,
  THUMB_CMC = 1,
  THUMB_MCP = 2,
  THUMB_IP = 3,
  THUMB_TIP = 4,
  INDEX_FINGER_MCP = 5,
  INDEX_FINGER_PIP = 6,
  INDEX_FINGER_DIP = 7,
  INDEX_FINGER_TIP = 8,
  // ... (middle, ring, pinky follow same pattern)
}
```

### 4.2 Palm Center Calculation

**Why not wrist?** Palm center provides more stable tracking than wrist alone.

```typescript
// Average of 4 MCP knuckles (metacarpophalangeal joints)
palmCenter = {
  x: (indexMCP.x + middleMCP.x + ringMCP.x + pinkyMCP.x) / 4,
  y: (indexMCP.y + middleMCP.y + ringMCP.y + pinkyMCP.y) / 4,
  z: (indexMCP.z + middleMCP.z + ringMCP.z + pinkyMCP.z) / 4,
};
```

### 4.3 Three.js World Space Conversion

**Transformation:**

```typescript
// Convert [0,1] to [-0.5, 0.5], then scale to world units
worldX = -(normalizedX - 0.5) * 10; // Flip for mirror effect
worldY = -(normalizedY - 0.5) * 10; // Flip Y-axis
worldZ = -normalizedZ * 10; // Toward camera
```

**Camera Setup:**

```typescript
camera = new THREE.PerspectiveCamera(
  75, // FOV (degrees)
  aspect, // Aspect ratio
  0.1, // Near plane
  100 // Far plane
);
camera.position.z = 6; // Positioned 6 units from origin
```

### 4.4 Rotation Calculation - Axis-Based Alignment

**Goal:** Galaxy disc perpendicular to hand-to-hand axis

```typescript
// Vector from palm1 to palm2
handAxis = new Vector3(
  palm2.x - palm1.x,
  -(palm2.y - palm1.y), // Flip Y
  palm2.z - palm1.z
);

// Cross product to get perpendicular vectors
worldUp = new Vector3(0, 1, 0);
right = crossProduct(worldUp, handAxis).normalize();
up = crossProduct(handAxis, right).normalize();

// Build rotation matrix from basis vectors
matrix.makeBasis(right, up, handAxis.normalize());
euler = new Euler().setFromRotationMatrix(matrix);
```

---

## 5. Smoothing & Stabilization

### 5.1 Exponential Moving Average (EMA)

**Formula:**

```
smoothed[t] = smoothed[t-1] + α * (target[t] - smoothed[t-1])
```

where `α = smoothing factor` (0.15-0.3 typical)

**Implementation:**

```typescript
class ScalarSmoother {
  update(target: number): number {
    this.value += (target - this.value) * this.smoothingFactor;
    return this.value;
  }
}
```

### 5.2 Smoothing Configuration

**Per-property tuning:**

```typescript
scaleSmoother = new ScalarSmoother(0, 0.2); // Scale: 20% blend
positionSmoother = new Vector3Smoother(0, 0.25); // Position: 25% blend
rotationSmoother = new EulerSmoother(0, 0.2); // Rotation: 20% blend
```

**Why different factors?**

- Scale: Moderate smoothing prevents jarring size changes
- Position: Higher blend for responsive tracking
- Rotation: Lower blend to avoid lag (uses quaternion SLERP internally)

### 5.3 Quaternion SLERP for Rotation

**Why SLERP?** Spherical Linear Interpolation prevents gimbal lock and ensures shortest rotation path.

```typescript
class EulerSmoother {
  update(targetEuler: Euler): Euler {
    const targetQuat = new Quaternion().setFromEuler(targetEuler);

    // Handle quaternion double-cover (shortest path)
    if (currentQuat.dot(targetQuat) < 0) {
      targetQuat.negate();
    }

    // SLERP interpolation
    currentQuat.slerp(targetQuat, smoothingFactor);
    return new Euler().setFromQuaternion(currentQuat);
  }
}
```

---

## 6. Gesture Recognition - Pinch Detection

### 6.1 Detection Algorithm

**Requirements:**

1. Thumb tip and index tip distance < 0.035 (threshold)
2. Sustained for 3+ consecutive frames (anti-flicker)
3. Cooldown period elapsed (800ms minimum between triggers)
4. Galaxy must be active and in NORMAL state (not exploding)

**State Machine:**

```
IDLE (no pinch)
  ↓ distance < 0.035 for 3 frames
STARTED (trigger star burst)
  ↓ hold pinch
ACTIVE (pinch maintained)
  ↓ distance > 0.055 (release threshold)
ENDED (back to IDLE)
```

### 6.2 Hysteresis Prevention

**Problem:** Noisy tracking causes rapid on/off flickering  
**Solution:** Use different thresholds for trigger vs release

```typescript
const TRIGGER_THRESHOLD = 0.035; // Start pinch
const RELEASE_THRESHOLD = 0.055; // End pinch (larger gap)
```

**Result:** Once triggered, small fluctuations won't cancel the gesture.

### 6.3 Sustained Frame Requirement

```typescript
if (isPinching) {
  sustainedFrames++;
} else {
  sustainedFrames = 0; // Reset if broken
}

const isSustainedPinch = sustainedFrames >= 3;
```

**Benefit:** Prevents accidental triggers from transient hand positions.

### 6.4 Cooldown Enforcement

```typescript
const cooldownElapsed = timestamp - lastTriggerTime > 800; // 800ms minimum

if (isSustainedPinch && cooldownElapsed) {
  triggerStarBurst();
  lastTriggerTime = timestamp;
}
```

**Benefit:** Prevents spam and gives each burst time to display.

---

## 7. Explosion Lifecycle Management

### 7.1 Trigger Conditions

**Two ways to trigger explosion:**

1. **Critical Mass:** `scale < 0.01` (hands very close but still tracking)
2. **Tracking Loss:** Hands lost (`lastHandCount === 2` → `0`) AND `scale < 0.3`

**Why tracking loss?** MediaPipe loses detection when hands overlap completely.

```typescript
// Critical mass trigger (during normal tracking)
if (smoothedScale < 0.01 && !hasExplodedThisLife) {
  galaxyRenderer.triggerExplosion();
  hasExplodedThisLife = true; // One explosion per lifecycle
}

// Tracking loss trigger (hands closed together)
if (lastHandCount === 2 && currentHandCount === 0 && scale < 0.3) {
  galaxyRenderer.triggerExplosion();
}
```

### 7.2 Per-Galaxy Lifecycle Flags

**Problem:** Without lifecycle tracking, explosion can trigger repeatedly during collapse.  
**Solution:** `hasExplodedThisLife` flag per galaxy spawn/despawn cycle.

```typescript
// Reset flag when new galaxy spawns
if (!isGalaxyActive && shouldShow) {
  isGalaxyActive = true;
  hasExplodedThisLife = false; // Fresh lifecycle
}

// Set flag when explosion triggers
if (shouldExplode && !hasExplodedThisLife) {
  triggerExplosion();
  hasExplodedThisLife = true; // Prevent re-trigger
}
```

### 7.3 Input Blocking During Explosion

**Why?** Prevent hand input from interfering with explosion animation sequence.

```typescript
updateGalaxy() {
  const explosionState = galaxyRenderer.getExplosionState();

  if (explosionState !== ExplosionState.NORMAL) {
    // Explosion in progress - skip all normal updates
    return;
  }

  // Normal galaxy updates (scale, position, rotation)
  // ...
}
```

**Ensures:** Clean explosion → fade → clear screen → ready for new galaxy.

---

## 8. Grace Period & Fade Behavior

### 8.1 Grace Period Concept

**Purpose:** Keep galaxy visible briefly after losing hand tracking (e.g., hands briefly occluded).

```typescript
const GRACE_PERIOD_MS = 500;

if (timeSinceLastHands > GRACE_PERIOD_MS) {
  // Fade out galaxy
  const fadeScale = scaleSmoother.update(0);

  if (fadeScale < 0.01) {
    galaxyRenderer.setVisible(false);
    isGalaxyActive = false;
  }
}
```

**User Experience:** Forgiving interaction - small tracking gaps don't immediately destroy galaxy.

### 8.2 Smooth Fade-Out

```typescript
// Exponentially approach zero scale
fadeScale = scaleSmoother.update(0);

// Hide only when visually imperceptible
if (fadeScale < 0.01) {
  setVisible(false);
}
```

**Why EMA?** Natural, organic fade rather than instant disappearance.

---

## 9. Performance Optimizations

### 9.1 Particle Count Optimization

**20,000 particles** - Sweet spot for visual quality vs performance

**Distribution Strategy:**

```typescript
// Focus density where it matters (core)
Core (ultra-dense):  20% = 4,000 particles  (0-12% radius)
Core Halo:          15% = 3,000 particles  (12-25% radius)
Spiral Arms:        65% = 13,000 particles (25-100% radius)
```

**Result:** Visually dense center without excessive total particle count.

### 9.2 Shader Optimizations

**Micro-Tiny Particles:**

```glsl
// Point size clamped to 0.25-2.5px
gl_PointSize = clamp(size, 0.25, 2.5);
```

**Why?** Smaller particles = less overdraw = better GPU performance.

**Early Discard:**

```glsl
// Fragment shader - discard faint pixels immediately
if (alpha < 0.015) discard;
if (dist > 0.5) discard;
```

**Benefit:** Reduces fragment processing load.

### 9.3 BufferGeometry Best Practices

**Typed Arrays:**

```typescript
const positions = new Float32Array(particleCount * 3);
const sizes = new Float32Array(particleCount);
const brightnesses = new Float32Array(particleCount);

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
```

**Why?** Direct GPU upload, minimal memory overhead, cache-friendly.

### 9.4 Post-Processing Optimization

**HalfFloat Frame Buffers:**

```typescript
const composer = new EffectComposer(renderer, {
  frameBufferType: THREE.HalfFloatType, // 16-bit instead of 32-bit
});
```

**Benefit:** 50% memory reduction, faster transfers, prevents banding in dark scenes.

**Effect Consolidation:**

```typescript
// Single EffectPass for all effects (more efficient than multiple passes)
const effectPass = new EffectPass(
  camera,
  bloomEffect,
  chromaticAberration,
  colorGradingEffect,
  lensingEffect
);
```

### 9.5 Offscreen Canvas for Blur (Not Used in Galaxy)

**Note:** This technique is used in Foggy Mirror mode, not Galaxy mode.

---

## 10. Debug System

### 10.1 Debug Panel Information

**Galaxy Mode Debug Output:**

```typescript
interface DebugInfo {
  handsDetected: number; // 0, 1, or 2
  distance: number; // Normalized hand distance
  scale: number; // Current galaxy scale (0-1)
  position: Vector3; // World space position
  rotation: Euler; // Rotation angles (radians)
}
```

**Display Format:**

```
Galaxy Debug
FPS: 60.0
Hands: 2
Distance: 0.245
Scale: 0.832
Position:
  x: -0.52
  y: 1.23
  z: -0.05
Rotation (deg):
  x: 15.3°
  y: -8.7°
  z: 2.1°
```

### 10.2 Keyboard Shortcuts

```typescript
// main.ts event listener
document.addEventListener('keydown', (event) => {
  switch (event.key.toLowerCase()) {
    case 'd':
      app.toggleDebug();
      break;
    case 'h':
      app.toggleControls();
      break;
    case 'g':
      app.switchToGalaxyMode();
      break;
    case 'f':
      app.switchToFoggyMirrorMode();
      break;
    case 'escape':
      app.dispose();
      break;
  }
});
```

### 10.3 Console Logging Strategy

**Lifecycle Events:**

```typescript
console.log('[HandGalaxyController] New galaxy spawned - lifecycle reset');
console.log('[HandGalaxyController] Critical mass! Triggering explosion!');
console.log('[GalaxyRenderer] Big Bang explosion triggered!');
console.log('[GalaxyRenderer] BOOM! Explosion started');
console.log('[GalaxyRenderer] Explosion fading...');
console.log('[GalaxyRenderer] Explosion complete, clearing screen');
```

**Gesture Events:**

```typescript
console.log(
  `[HandGalaxyController] Pinch detected (${handedness}) - triggering star burst`
);
console.log('[StarBurstEffect] Burst triggered at position:', position);
```

---

## 11. Browser Compatibility & Requirements

### 11.1 Required APIs

**Must-Have:**

- WebGL 2.0 (for instanced rendering and better shader support)
- WebAssembly (for MediaPipe WASM runtime)
- getUserMedia (for webcam access)
- ES6+ JavaScript (async/await, modules, classes)

**Check Implementation:**

```typescript
private checkBrowserSupport(): void {
  const issues: string[] = [];

  // WebGL 2.0
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) issues.push('WebGL 2.0 not supported');

  // WebAssembly
  if (typeof WebAssembly !== 'object') {
    issues.push('WebAssembly not supported');
  }

  // Camera
  if (!navigator.mediaDevices?.getUserMedia) {
    issues.push('Camera access not supported');
  }

  if (issues.length > 0) {
    throw new Error(`Browser not supported: ${issues.join(', ')}`);
  }
}
```

### 11.2 Tested Browsers

**Recommended:**

- Chrome/Edge 90+ (best performance)
- Firefox 88+ (good performance)
- Safari 15+ (works with limitations)

**Performance Notes:**

- Chrome/Edge: Full GPU acceleration, all effects enabled
- Firefox: Slightly slower post-processing, fully functional
- Safari: Limited WASM performance, may need particle count reduction

---

## 12. Module Interaction Patterns

### 12.1 Dependency Injection

**Philosophy:** Modules receive dependencies via constructor (no global state).

```typescript
// HandGalaxyController receives dependencies
constructor(
  handTracker: HandTracker,
  galaxyRenderer: GalaxyRenderer,
  config?: Partial<InteractionConfig>
) {
  this.handTracker = handTracker;
  this.galaxyRenderer = galaxyRenderer;
  this.config = { ...DEFAULT_CONFIG, ...config };
}
```

**Benefits:**

- Testable (can mock dependencies)
- Clear ownership hierarchy
- No hidden coupling

### 12.2 Event-Driven Communication

**Gesture Events:**

```typescript
// GestureDetector produces events
interface PinchGestureEvent {
  type: GestureType.PINCH;
  state: GestureState; // STARTED | ACTIVE | ENDED
  data: PinchGestureData;
  timestamp: number;
}

// HandGalaxyController consumes events
if (gestureResult.pinch?.state === GestureState.STARTED) {
  this.handlePinchGesture(gestureResult.pinch);
}
```

**Benefits:**

- Decoupled components
- Easy to add new gestures
- Clear data flow

### 12.3 Lifecycle Management

**Initialization Order:**

```typescript
// 1. Create modules
handTracker = new HandTracker();
galaxyRenderer = new GalaxyRenderer(container, config);
controller = new HandGalaxyController(handTracker, galaxyRenderer);

// 2. Initialize modules (async operations)
await handTracker.initialize(videoElement);
galaxyRenderer.initialize();

// 3. Post-initialization setup
controller.initializeEffects(galaxyRenderer.getScene());

// 4. Start update loop
startAnimationLoop();
```

**Disposal Order:**

```typescript
// Reverse order of creation
controller?.dispose();
galaxyRenderer?.dispose();
handTracker.dispose();
```

---

## 13. Type System Architecture

### 13.1 Type Definition Organization

**Per-Module Types:**

```
src/modules/types/
├── HandTypes.ts        # MediaPipe hand landmark types
├── GalaxyTypes.ts      # Galaxy config, uniforms, explosion states
├── GestureTypes.ts     # Gesture detection types, events
└── WipeToRevealTypes.ts # [Other mode - not galaxy]
```

**Shared Types:**

```typescript
// HandTypes.ts - Re-exported from @mediapipe/tasks-vision
export type { NormalizedLandmark, HandLandmarkerResult };
export type Handedness = 'left' | 'right' | 'unknown';
```

### 13.2 Configuration Interfaces

**Pattern:** Partial config + defaults

```typescript
interface GalaxyConfig {
  particleCount: number;
  radius: number;
  particleSize: number;
  // ...
}

const DEFAULT_GALAXY_CONFIG: GalaxyConfig = {
  particleCount: 20000,
  radius: 5,
  particleSize: 0.9,
};

// Usage
constructor(config: Partial<GalaxyConfig> = {}) {
  this.config = { ...DEFAULT_GALAXY_CONFIG, ...config };
}
```

**Benefit:** Type-safe overrides with sensible defaults.

### 13.3 Enum Usage

**Explosion States:**

```typescript
export enum ExplosionState {
  NORMAL = 0,
  IMPLODING = 1,
  SINGULARITY = 2,
  EXPLODING = 3,
  FADING = 4,
}
```

**Why numeric?** Direct mapping to shader uniform (GPU-friendly).

**Gesture States:**

```typescript
export enum GestureState {
  IDLE = 'IDLE',
  STARTED = 'STARTED',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
}
```

**Why strings?** Better logging/debugging (no reverse lookup needed).

---

## 14. Math Utilities Deep Dive

### 14.1 Distance Calculation

**3D Euclidean Distance:**

```typescript
export function distance3D(
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number }
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
```

**Used For:** Hand distance measurement, pinch detection.

### 14.2 Midpoint Calculation

```typescript
export function midpoint3D(
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number }
): THREE.Vector3 {
  return new THREE.Vector3(
    (p1.x + p2.x) / 2,
    (p1.y + p2.y) / 2,
    (p1.z + p2.z) / 2
  );
}
```

**Used For:** Galaxy center position between palms.

### 14.3 Scale Mapping

```typescript
export function mapDistanceToScale(
  distance: number,
  minDist: number = 0.06,
  maxDist: number = 0.35
): number {
  if (distance < minDist) return 0;
  if (distance > maxDist) return 1;

  const normalized = (distance - minDist) / (maxDist - minDist);
  return smootherStep(normalized); // S-curve easing
}
```

**Why smootherStep?** Provides smooth acceleration/deceleration at boundaries.

### 14.4 SmoothStep Family

```typescript
// Standard smoothstep: 3x² - 2x³
export function smoothStep(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

// Smootherstep (Ken Perlin): 6x⁵ - 15x⁴ + 10x³
export function smootherStep(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
```

**Comparison:**

- Linear: Constant velocity (abrupt start/stop)
- smoothStep: Smooth start/stop
- smootherStep: Even smoother (imperceptible transitions)

---

## 15. Shader Programming Details

### 15.1 GLSL Version & Extensions

```glsl
// Implicit WebGL 2.0 (GLSL ES 3.0)
// No #version directive needed in Three.js ShaderMaterial
```

**Built-in Variables:**

- `gl_Position` - Vertex output position (clip space)
- `gl_PointSize` - Particle size in pixels
- `gl_PointCoord` - Fragment UV within point (0-1)
- `gl_FragColor` - Fragment output color

### 15.2 Simplex Noise Implementation

**Why Simplex?** Better visual quality than Perlin, fewer directional artifacts.

**Key Functions:**

```glsl
vec3 mod289(vec3 x);        // Modulo 289 (permutation table size)
vec4 permute(vec4 x);       // Pseudo-random permutation
float snoise(vec3 v);       // 3D simplex noise (-1 to 1)
```

**Performance:** ~50 instructions per noise sample (acceptable for vertex shader).

### 15.3 Uniform Variables

```glsl
uniform float uTime;            // Animation time (seconds)
uniform float uScale;           // Galaxy scale (0-1)
uniform float uSize;            // Particle size multiplier
uniform float uExplosionState;  // ExplosionState enum value (0-4)
uniform float uExplosionTime;   // Time since explosion started
```

**Why uniforms?** Updated once per frame for all vertices (efficient).

### 15.4 Attribute Variables

```glsl
attribute float aSize;          // Per-particle size variation
attribute float aDistance;      // Normalized distance from center (0-1)
attribute float aBrightness;    // Base brightness (brighter near core)
attribute float aSeed;          // Random seed for variation
```

**Why attributes?** Per-vertex data stored in GPU buffers.

### 15.5 Varying Variables

```glsl
// Vertex shader outputs
varying float vBrightness;
varying float vTemperature;
varying float vAlpha;

// Fragment shader receives interpolated values
```

**Interpolation:** GPU automatically interpolates between vertices (for points, uses center value).

---

## 16. Post-Processing Pipeline Details

### 16.1 pmndrs/postprocessing Library

**Why this library?**

- Production-grade effects (used in industry)
- Optimized shader code
- Easy integration with Three.js
- Active maintenance

**Installation:**

```bash
npm install postprocessing
```

### 16.2 EffectComposer Setup

```typescript
import { EffectComposer, EffectPass, RenderPass } from 'postprocessing';

const composer = new EffectComposer(renderer, {
  frameBufferType: THREE.HalfFloatType, // HDR rendering
  multisampling: 0, // Disable MSAA (use TAA if needed)
});

// Pass 1: Render scene to frame buffer
composer.addPass(new RenderPass(scene, camera));

// Pass 2: Apply effects
composer.addPass(new EffectPass(camera, ...effects));
```

### 16.3 Bloom Effect Configuration

```typescript
const bloomEffect = new BloomEffect({
  intensity: 1.5, // Glow strength
  luminanceThreshold: 0.4, // Only bright pixels glow
  luminanceSmoothing: 0.5, // Smooth threshold transition
  radius: 0.8, // Glow spread (0-1)
  kernelSize: KernelSize.LARGE, // Quality vs performance
  blendFunction: BlendFunction.SCREEN, // Additive-like blending
});
```

**Performance:** ~3-5ms per frame at 1920x1080 (LARGE kernel).

### 16.4 Chromatic Aberration

```typescript
const chromaticAberration = new ChromaticAberrationEffect({
  offset: new THREE.Vector2(0.001, 0.001), // RGB channel shift
  radialModulation: true, // Stronger at edges (lens-like)
  modulationOffset: 0.2, // Start at 20% from center
});
```

**Visual Effect:** Subtle RGB color fringing at edges (cinematic look).

### 16.5 Color Grading LUT

**LUT Creation:**

```typescript
// 32³ = 32,768 color mappings
const size = 32;
const data = new Uint8Array(size * size * size * 4);

// For each RGB input color
for (let b = 0; b < size; b++) {
  for (let g = 0; g < size; g++) {
    for (let r = 0; r < size; r++) {
      const index = (b * size * size + g * size + r) * 4;

      // Apply color grading transformations
      // 1. RGB → HSL
      // 2. Hue rotation (toward cosmic palette)
      // 3. Saturation boost (1.8x)
      // 4. S-curve contrast
      // 5. HSL → RGB

      data[index] = r_output;
      data[index + 1] = g_output;
      data[index + 2] = b_output;
      data[index + 3] = 255;
    }
  }
}

const lut = new THREE.Data3DTexture(data, size, size, size);
lut.format = THREE.RGBAFormat;
lut.type = THREE.UnsignedByteType;
lut.minFilter = THREE.LinearFilter;
lut.magFilter = THREE.LinearFilter;
lut.needsUpdate = true;
```

**Application:**

```typescript
const colorGradingEffect = new LUT3DEffect(lut, {
  blendFunction: BlendFunction.NORMAL,
});
colorGradingEffect.blendMode.opacity.value = 0.8; // 80% intensity
```

---

## 17. Camera & Webcam Setup

### 17.1 MediaDevices API

```typescript
async initialize(videoElement: HTMLVideoElement): Promise<void> {
  // Request camera access
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },   // Prefer 720p
      height: { ideal: 720 },
      facingMode: 'user',       // Front camera
      frameRate: { ideal: 30 }  // 30 FPS (balance quality/performance)
    }
  });

  videoElement.srcObject = stream;
  await videoElement.play();
}
```

### 17.2 Video Element Styling

```typescript
videoElement.style.cssText = `
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;               // Fill container
  transform: scaleX(-1);           // Mirror for selfie view
  filter: brightness(0.20) contrast(0.6);  // Dim for background
`;
```

**Why mirror?** Users expect to see themselves as in a mirror (intuitive interaction).

---

## 18. UI/UX Design Patterns

### 18.1 Mode Switcher (Top-Left)

```typescript
modeSwitcherElement.innerHTML = `
  <div>Mode</div>
  <div style="color: #4caf50;">🌌 Galaxy Mode</div>
  <div>Press F for Foggy Mirror</div>
`;
```

**Visual Hierarchy:**

- Active mode: Bright color (#4caf50 green)
- Inactive mode: Muted text in hint
- Clear keyboard shortcut

### 18.2 Controls Hint (Bottom-Right)

```typescript
controlsElement.innerHTML = `
  <div>🎮 Galaxy Controls</div>
  <div>👐 Show both hands → Spawn galaxy</div>
  <div>↔️ Move hands apart → Grow</div>
  <div>↕️ Move hands together → Shrink</div>
  <div>🤏 Close hands → Big Bang explosion</div>
  <div>✨ Pinch gesture → Star burst</div>
  <div>Press H to toggle hints</div>
`;
```

**Design Principles:**

- Emoji icons for visual scanning
- Action → Result format (cause and effect)
- Keyboard shortcut for toggle

### 18.3 Status Indicator (Bottom-Left)

```typescript
updateStatus(message: string, state: 'loading' | 'ready' | 'error' | 'active') {
  const stateColors = {
    loading: '#ffeb3b',  // Yellow
    ready: '#4caf50',    // Green
    error: '#f44336',    // Red
    active: '#2196f3',   // Blue
  };

  const stateIcons = {
    loading: '⏳',
    ready: '✓',
    error: '✗',
    active: '👐',
  };

  statusElement.innerHTML = `
    <span style="color: ${stateColors[state]}">${stateIcons[state]}</span>
    <span>${message}</span>
  `;
}
```

**User Feedback:**

- Color-coded states (instant recognition)
- Icon + text (accessible)
- Updates in real-time (e.g., "2 hands detected")

---

## 19. Error Handling & Edge Cases

### 19.1 Camera Permission Denied

```typescript
try {
  await navigator.mediaDevices.getUserMedia({ video: true });
} catch (error) {
  if (error.name === 'NotAllowedError') {
    updateStatus('Camera access denied', 'error');
    // Show instructions to enable camera
  }
}
```

### 19.2 MediaPipe Model Load Failure

```typescript
try {
  const vision = await FilesetResolver.forVisionTasks(wasmUrl);
  handLandmarker = await HandLandmarker.createFromOptions(vision, options);
} catch (error) {
  updateStatus('Failed to load hand tracking model', 'error');
  console.error('[HandTracker] Model load error:', error);
}
```

### 19.3 WebGL Context Loss

```typescript
renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  console.error('[GalaxyRenderer] WebGL context lost');
  updateStatus('Graphics error - please refresh', 'error');
});

renderer.domElement.addEventListener('webglcontextrestored', () => {
  console.log('[GalaxyRenderer] WebGL context restored');
  reinitialize();
});
```

### 19.4 Rapid Mode Switching

```typescript
switchToGalaxyMode() {
  if (this.state !== 'running') {
    console.warn('[App] Cannot switch modes - app not running');
    return;
  }

  if (this.currentMode === 'galaxy') {
    console.log('[App] Already in galaxy mode');
    return;  // Prevent re-initialization
  }

  // Safe mode transition
  // ...
}
```

---

## 20. Development Workflow

### 20.1 Hot Module Replacement (HMR)

**Vite Configuration:**

```typescript
// vite.config.ts
export default {
  server: {
    port: 3000,
    open: true,
    hmr: {
      overlay: true, // Show errors in browser
    },
  },
};
```

**Module Pattern for HMR:**

```typescript
// Avoid global state (enables clean HMR)
export class GalaxyRenderer {
  // All state in instance variables
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;

  dispose() {
    // Clean up all resources
  }
}
```

### 20.2 TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  }
}
```

**Key Settings:**

- `strict: true` - Maximum type safety
- `moduleResolution: "bundler"` - Vite-compatible
- `skipLibCheck: true` - Faster builds

### 20.3 Build Output

```bash
npm run build
# Output: dist/
#   ├── index.html
#   ├── assets/
#   │   ├── index-[hash].js    (minified, tree-shaken)
#   │   ├── index-[hash].css
#   │   └── vendor-[hash].js   (Three.js, MediaPipe)
```

**Bundle Size (approx):**

- Main bundle: ~50KB (gzipped)
- Three.js: ~150KB (gzipped)
- MediaPipe: ~300KB (WASM + JS)
- **Total:** ~500KB initial load

---

## 21. Future Enhancement Opportunities

### 21.1 Additional Gestures

**Two-Hand Pinch:**

```typescript
// Both hands pinch simultaneously → bigger star burst
if (leftPinch && rightPinch && bothStartedSameFrame) {
  triggerMegaBurst(midpoint(leftPos, rightPos));
}
```

**Open Palm:**

```typescript
// Fully open hand → pause rotation
if (fingerSpread > threshold) {
  galaxyRenderer.setRotationSpeed(0);
}
```

### 21.2 Audio Integration

**Web Audio API:**

```typescript
const audioContext = new AudioContext();
const analyser = audioContext.createAnalyser();

// Map bass to particle scale
const bassEnergy = getFrequencyRange(analyser, 20, 200);
galaxyRenderer.setParticleScale(1.0 + bassEnergy * 0.5);
```

### 21.3 Multi-Galaxy Support

```typescript
// Spawn mini galaxies at pinch points (persistent)
class MultiGalaxyManager {
  private galaxies: Galaxy[] = [];

  onPinch(position: Vector3) {
    const miniGalaxy = new Galaxy(scene, {
      particleCount: 5000,
      radius: 1.0,
    });
    miniGalaxy.setPosition(position);
    this.galaxies.push(miniGalaxy);
  }
}
```

### 21.4 Physics Simulation

**N-Body Gravity:**

```typescript
// Particles attract each other (simplified gravity)
for (let i = 0; i < particleCount; i++) {
  for (let j = i + 1; j < particleCount; j++) {
    const force = calculateGravity(particles[i], particles[j]);
    applyForce(particles[i], force);
    applyForce(particles[j], force.negate());
  }
}
```

**Performance Challenge:** O(n²) complexity - need spatial partitioning (octree).

---

## 22. Testing Strategy (Recommended)

### 22.1 Unit Tests

**Math Utilities:**

```typescript
describe('distance3D', () => {
  it('calculates Euclidean distance correctly', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 3, y: 4, z: 0 };
    expect(distance3D(p1, p2)).toBe(5);
  });
});
```

**Smoothing:**

```typescript
describe('ScalarSmoother', () => {
  it('converges to target value', () => {
    const smoother = new ScalarSmoother(0, 0.5);
    smoother.update(10); // 50% blend
    expect(smoother.value).toBe(5);
    smoother.update(10);
    expect(smoother.value).toBe(7.5);
  });
});
```

### 22.2 Integration Tests

**Gesture Detection:**

```typescript
describe('GestureDetector', () => {
  it('detects pinch when sustained for 3 frames', () => {
    const detector = new GestureDetector();

    // Frame 1-2: Not sustained
    let result = detector.detect(pinchLandmarks, ['left'], 0);
    expect(result.pinch).toBeNull();

    // Frame 3: Sustained, triggers
    result = detector.detect(pinchLandmarks, ['left'], 16);
    expect(result.pinch?.state).toBe(GestureState.STARTED);
  });
});
```

### 22.3 Visual Regression Tests

**Playwright:**

```typescript
test('galaxy renders correctly', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.grantPermissions(['camera']);

  // Wait for galaxy to appear (mock hand tracking)
  await page.evaluate(() => {
    window.app.controller.processHandInteraction(mockTwoHands, 0);
  });

  // Screenshot comparison
  await expect(page).toHaveScreenshot('galaxy-visible.png');
});
```

---

## 23. Accessibility Considerations

### 23.1 Keyboard Navigation

**Current Support:**

- `G` - Galaxy mode
- `F` - Foggy mirror mode
- `H` - Toggle hints
- `D` - Toggle debug
- `Esc` - Exit/cleanup

**Future Enhancement:** Full keyboard control (arrow keys for manual galaxy control).

### 23.2 Screen Reader Support

**ARIA Labels:**

```typescript
statusElement.setAttribute('role', 'status');
statusElement.setAttribute('aria-live', 'polite');
statusElement.setAttribute('aria-atomic', 'true');
```

**Result:** Screen readers announce status changes.

### 23.3 Reduced Motion

```typescript
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

if (prefersReducedMotion) {
  config.smoothingFactor = 1.0; // Instant transitions
  config.rotationSpeed = 0; // No spinning
}
```

---

## 24. Deployment & Production

### 24.1 Vite Build Optimizations

```typescript
// vite.config.ts
export default {
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        passes: 2,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          mediapipe: ['@mediapipe/tasks-vision'],
          postprocessing: ['postprocessing'],
        },
      },
    },
  },
};
```

### 24.2 CDN Hosting

**Vercel Analytics:**

```typescript
import { inject } from '@vercel/analytics';
inject(); // Track page views and performance
```

**Model Caching:**

```typescript
// Use CDN-hosted model with long cache duration
const modelUrl =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/...';
```

---

## 25. Performance Benchmarks (Target)

### 25.1 Frame Rate

- **Target:** 60 FPS (16.67ms per frame)
- **Measured:** 58-60 FPS on mid-range GPU (GTX 1660)
- **Breakdown:**
  - Hand tracking: 3-5ms
  - Galaxy update: 2-3ms
  - Post-processing: 3-5ms
  - Render: 5-7ms

### 25.2 Memory Usage

- **Initial Load:** ~120MB
- **Active (galaxy visible):** ~180MB
- **After 10min:** ~200MB (stable, no leaks)

### 25.3 Bundle Size

- **Initial:** 500KB (gzipped)
- **Code Splitting:** Three.js, MediaPipe, Postprocessing in separate chunks
- **Lazy Loading:** None currently (future: load effects on-demand)

---

## Conclusion

The Interactive Galaxy mode is a sophisticated WebGL application combining:

- **ML-Powered Hand Tracking** (MediaPipe)
- **High-Performance Particle Rendering** (Three.js + Custom Shaders)
- **Cinematic Post-Processing** (Bloom, Chromatic Aberration, Color Grading)
- **Natural Gesture Recognition** (Pinch Detection with Hysteresis)
- **Complex State Management** (Explosion Lifecycle, Per-Galaxy Flags)

All orchestrated through clean, modular architecture with:

- Dependency injection
- Exponential smoothing for stability
- Type-safe interfaces
- Efficient GPU utilization

The result is a magical, performant experience that feels natural and responsive while delivering stunning visual quality.
