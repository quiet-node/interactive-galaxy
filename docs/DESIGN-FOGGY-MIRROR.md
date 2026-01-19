# Foggy Mirror Mode - Design Document

## 1. Vision & User Experience

### Goal

Create an immersive, tactile web experience where users can "wipe away" a foggy overlay from their camera feed using natural hand movements, simulating the experience of clearing condensation from a mirror or window.

### User Experience Flow

1. User switches to Foggy Mirror mode (press `F` key)
2. Camera feed becomes obscured by a realistic fog overlay (blurred video + semi-transparent white layer + noise texture)
3. User moves their hands across the screen → fog clears along the hand's path
4. Cleared areas reveal the sharp, unblurred camera feed underneath
5. Multiple hands work simultaneously for faster clearing
6. User can reset the fog at any time (press `R` key)
7. Smooth, natural trails follow hand movements for realistic wiping effect

The magic happens when users' hands leave perfectly smooth, organic trails that reveal their real camera feed underneath. The combination of:

- Realistic fog texture (blur + noise)
- Soft-edged clearing (radial gradients)
- Smooth interpolation between frames
- Dynamic brush size based on hand size

---

## 2. Technical Architecture

### 2.1 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         App.ts (Main)                            │
│  - Mode switching (Galaxy ↔ Foggy Mirror)                       │
│  - Keyboard event handling (F, G, R, H, D)                      │
│  - Debug panel coordination                                      │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              FoggyMirrorController (Orchestrator)                │
│  - Lifecycle management (initialize, start, stop, dispose)      │
│  - Update loop (requestAnimationFrame)                          │
│  - Coordinates HandTracker, HandTrailTracker, FogOverlay        │
│  - FPS calculation and debug info                               │
└─┬───────────────────┬─────────────────────┬─────────────────────┘
  │                   │                     │
  ▼                   ▼                     ▼
┌──────────┐  ┌────────────────┐  ┌──────────────────────┐
│ Hand     │  │ HandTrail      │  │ FogOverlay           │
│ Tracker  │  │ Tracker        │  │ (Rendering)          │
│ (Shared) │  │ (Smoothing)    │  │                      │
└──────────┘  └────────────────┘  └──────────────────────┘
```

### 2.2 Component Responsibilities

#### FoggyMirrorController

**Purpose:** Orchestrate the foggy mirror interaction mode  
**Key Responsibilities:**

- Initialize all sub-modules
- Run the main update loop at 60 FPS
- Detect hands via HandTracker
- Update HandTrailTracker with detected hands
- Clear fog at trail points via FogOverlay
- Calculate and report performance metrics
- Manage lifecycle states

**Lifecycle States:**

```
uninitialized → ready → active → disposed
                  ↑       ↓
                  └───────┘
                  (start/stop)
```

#### HandTrailTracker

**Purpose:** Generate smooth, interpolated trails from hand movements  
**Key Responsibilities:**

- Track multiple hands by ID (e.g., "Left-0", "Right-1")
- Interpolate between consecutive hand positions
- Calculate dynamic brush radius based on hand size
- Detect movement velocity
- Filter out sub-threshold movements (<2px)
- Provide optimized "new trail points only" for efficient rendering

#### FogOverlay

**Purpose:** Render and manage the multi-layer canvas fog effect  
**Key Responsibilities:**

- Manage 3 canvas layers (display, mask, blur optimization)
- Render blurred video feed efficiently
- Overlay fog appearance (color + noise texture)
- Apply masking to reveal cleared areas
- Calculate fog coverage percentage
- Handle window resize gracefully

---

## 3. Multi-Canvas Rendering Pipeline

### 3.1 Canvas Layer Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                    Visual Layer Stack                          │
├───────────────────────────────────────────────────────────────┤
│  Top Layer: fog-overlay-canvas (visible, z-index: 50)         │
│   - Displays final composited result                          │
│   - Positioned absolutely over video element                  │
│   - Mirrored (scaleX(-1)) to match video                      │
├───────────────────────────────────────────────────────────────┤
│  Middle: video element (visible, dimmed or full brightness)   │
│   - Native webcam stream                                       │
│   - filter: none (full brightness in foggy mirror mode)       │
├───────────────────────────────────────────────────────────────┤
│  Offscreen: maskCanvas (invisible, in-memory)                 │
│   - Tracks where user has wiped                               │
│   - Stores accumulated trail points                           │
│   - Used with destination-out compositing                     │
├───────────────────────────────────────────────────────────────┤
│  Offscreen: blurCanvas (invisible, downscaled)                │
│   - Pre-renders blurred video at low resolution              │
│   - Upscaled to create blur effect (bilinear interpolation)  │
│   - Size: 5-20% of main canvas for performance               │
└───────────────────────────────────────────────────────────────┘
```

### 3.2 Rendering Pipeline (Per Frame)

```typescript
// Pseudo-code for FogOverlay.render()

function render() {
  // Step 1: Clear main canvas
  ctx.clearRect(0, 0, width, height);

  // Step 2: Render blurred video (optimized)
  // 2a. Draw video to small offscreen canvas
  blurCtx.drawImage(videoElement, 0, 0, blurCanvas.width, blurCanvas.height);

  // 2b. Upscale blurred canvas to main (creates blur via bilinear interpolation)
  ctx.drawImage(blurCanvas, 0, 0, width, height);

  // Step 3: Overlay fog appearance
  // 3a. Semi-transparent white/gray layer
  ctx.fillStyle = 'rgba(220, 220, 220, 0.85)';
  ctx.fillRect(0, 0, width, height);

  // 3b. Subtle noise texture for realism
  ctx.fillStyle = noisePattern; // Repeating 256x256 perlin-ish noise
  ctx.fillRect(0, 0, width, height);

  // Step 4: Apply mask to cut holes where user wiped
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(maskCanvas, 0, 0, width, height);
  ctx.restore();
}
```

**Rationale for Multi-Canvas:**

- **Performance:** Downscaling blur canvas reduces pixel operations by 25-400x
- **Quality:** Mask canvas maintains sharp edges for trail rendering
- **Flexibility:** Separate layers allow independent manipulation

---

## 4. Detailed Module Specifications

### 4.1 FoggyMirrorController

**File:** `src/foggy-mirror/FoggyMirrorController.ts`

#### Configuration Interface

```typescript
interface FoggyMirrorConfig {
  readonly fogOverlay: Partial<FogOverlayConfig>;
  readonly handTrail: Partial<HandTrailConfig>;
  readonly debug: boolean;
}

const DEFAULT_FOGGY_MIRROR_CONFIG: FoggyMirrorConfig = {
  fogOverlay: {}, // Uses FogOverlay defaults
  handTrail: {}, // Uses HandTrailTracker defaults
  debug: false,
};
```

#### Key Methods

| Method               | Purpose                              | Notes                                |
| -------------------- | ------------------------------------ | ------------------------------------ |
| `initialize()`       | Set up fog overlay and trail tracker | Safe to call multiple times          |
| `start()`            | Begin update loop and show overlay   | Calls initialize() if needed         |
| `stop()`             | Pause update loop and hide overlay   | Preserves state for resume           |
| `reset()`            | Clear all fog back to initial state  | Calls fogOverlay.reset()             |
| `handleResize()`     | Adjust to window size changes        | Updates dimensions for all modules   |
| `getFogPercentage()` | Get current fog coverage (0-100)     | Cached value, updated every 500ms    |
| `dispose()`          | Clean up all resources               | One-way transition to disposed state |

#### Update Loop Algorithm

```typescript
function startUpdateLoop() {
  const update = (timestamp: number) => {
    // 1. Calculate FPS
    updateFpsCounter(timestamp);

    // 2. Detect hands from video frame
    const handResults = handTracker.detectHands(timestamp);

    // 3. Update trail tracker (generates interpolated points)
    const trackedHands = handTrailTracker.update(handResults);

    // 4. Get NEW trail points only (optimization)
    const newTrailPoints = handTrailTracker.getNewTrailPoints();

    // 5. Clear fog at new points (incremental masking)
    if (newTrailPoints.length > 0) {
      fogOverlay.clearAtPoints(newTrailPoints);
    }

    // 6. Render composite image (blur + fog + mask)
    fogOverlay.render();

    // 7. Update debug panel (if enabled)
    if (debugEnabled) {
      emitDebugInfo();
    }

    // 8. Schedule next frame
    requestAnimationFrame(update);
  };

  requestAnimationFrame(update);
}
```

**Performance Characteristics:**

- Target: 60 FPS (16.67ms per frame)
- Hand detection: ~2-4ms (MediaPipe WASM)
- Trail calculation: <1ms
- Fog clearing: <1ms (incremental mask updates)
- Rendering: ~3-6ms (depends on blur canvas scale)
- **Total:** ~7-12ms per frame (comfortable margin)

---

### 4.2 HandTrailTracker

**File:** `src/shared/HandTrailTracker.ts`

#### Configuration

```typescript
interface HandTrailConfig {
  readonly interpolationPoints: number; // Points between positions
  readonly minMovementThreshold: number; // Pixels (filter jitter)
  readonly maxTrailLength: number; // History per hand
  readonly baseClearRadius: number; // Base brush size (px)
  readonly dynamicRadius: boolean; // Scale with hand size
}

const DEFAULT_HAND_TRAIL_CONFIG: HandTrailConfig = {
  interpolationPoints: 5, // 5 steps creates smooth trails
  minMovementThreshold: 2, // Ignore <2px movements
  maxTrailLength: 50, // Cap memory usage
  baseClearRadius: 60, // Good default for most hands
  dynamicRadius: true, // Larger hands = larger brush
};
```

#### Trail Interpolation Algorithm

**Problem:** MediaPipe runs at 30-60 FPS, but rapid hand movements create gaps between positions.

**Solution:** Linear interpolation with configurable density.

```typescript
function generateTrail(current: Point2D, previous: Point2D | null, radius: number): TrailPoint[] {
  const trail: TrailPoint[] = [];

  if (!previous) {
    // First frame, just add current point
    return [{ x: current.x, y: current.y, radius, timestamp: now() }];
  }

  const distance = euclideanDistance(current, previous);

  if (distance < minMovementThreshold) {
    // No significant movement, return current point
    return [{ x: current.x, y: current.y, radius, timestamp: now() }];
  }

  // Interpolate N points between previous and current
  for (let i = 0; i <= interpolationPoints; i++) {
    const t = i / interpolationPoints; // Linear parameter [0, 1]
    trail.push({
      x: previous.x + (current.x - previous.x) * t,
      y: previous.y + (current.y - previous.y) * t,
      radius,
      timestamp: now(),
    });
  }

  return trail;
}
```

**Example:** With `interpolationPoints = 5`:

- Previous position: (100, 100)
- Current position: (200, 200)
- Generated points: (100, 100), (120, 120), (140, 140), (160, 160), (180, 180), (200, 200)
- Result: Smooth diagonal line with 6 total points

#### Dynamic Radius Calculation

```typescript
function calculateClearRadius(handSize: number): number {
  if (!dynamicRadius) {
    return baseClearRadius;
  }

  // Hand size ≈ wrist to middle finger tip distance
  // Typical range: 100-200 pixels at 1280x720
  const scale = handSize / 150; // Normalize to average hand
  const dynamicRadius = baseClearRadius * scale;

  // Clamp to reasonable bounds
  return Math.max(30, Math.min(150, dynamicRadius));
}
```

**Rationale:**

- Small hands / far from camera → smaller brush (more precision)
- Large hands / close to camera → larger brush (easier clearing)
- Clamping prevents extreme values

#### Hand Tracking Persistence

Hands are tracked by ID to maintain continuity across frames:

```typescript
// Hand ID format: "{Handedness}-{Index}"
// Examples: "Left-0", "Right-1"

const handId = `${handedness}-${index}`;
const previousHand = trackedHands.get(handId);

// Calculate velocity for debug info
const velocity = previousHand ? distance(current, previousHand.palmPosition) : 0;

// Update tracked hands map
trackedHands.set(handId, {
  palmPosition: current,
  previousPosition: previousHand?.palmPosition || null,
  trail,
  handSize,
  handedness,
  velocity,
});
```

---

### 4.3 FogOverlay

**File:** `src/foggy-mirror/FogOverlay.ts`

#### Configuration

```typescript
interface FogOverlayConfig {
  readonly blurAmount: number; // CSS blur pixels
  readonly backgroundColor: string; // Fog color
  readonly enableHighDPI: boolean; // Use devicePixelRatio
}

const DEFAULT_FOG_OVERLAY_CONFIG: FogOverlayConfig = {
  blurAmount: 80, // Heavy blur
  backgroundColor: 'rgba(220, 220, 220, 0.85)', // Dense fog
  enableHighDPI: true, // Retina support
};
```

#### Canvas Initialization

```typescript
function initialize() {
  // 1. Calculate dimensions
  const rect = container.getBoundingClientRect();
  const dpr = enableHighDPI ? window.devicePixelRatio : 1;

  // 2. Set main canvas resolution
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.scale(dpr, dpr); // Scale context for HiDPI

  // 3. Set mask canvas (same resolution)
  maskCanvas.width = rect.width * dpr;
  maskCanvas.height = rect.height * dpr;
  maskCtx.scale(dpr, dpr);

  // 4. Set blur canvas (downscaled for performance)
  const blurScale = Math.max(0.05, Math.min(0.2, 10 / blurAmount));
  blurCanvas.width = Math.floor(rect.width * blurScale);
  blurCanvas.height = Math.floor(rect.height * blurScale);

  // 5. Apply CSS positioning
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.zIndex = '50';
  canvas.style.pointerEvents = 'none'; // Click-through
  canvas.style.transform = 'scaleX(-1)'; // Mirror video

  // 6. Generate noise pattern
  generateNoisePattern();

  // 7. Append to container
  container.appendChild(canvas);
}
```

**Blur Canvas Scale Calculation:**

```typescript
// Higher blur → smaller canvas (more aggressive downscaling)
// blur = 80 → scale = 10/80 = 0.125 (12.5% size)
// blur = 20 → scale = 10/20 = 0.5 (clamped to 0.2 = 20% size)
// blur = 5  → scale = 10/5 = 2.0 (clamped to 0.2 = 20% size)

const blurScale = Math.max(0.05, Math.min(0.2, 10 / blurAmount));
```

This adaptive scaling maintains performance while adjusting quality based on blur intensity.

#### Noise Pattern Generation

Adds subtle texture to prevent flat, artificial-looking fog:

```typescript
function generateNoisePattern() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const val = Math.floor(Math.random() * 255);
    data[i] = val; // R
    data[i + 1] = val; // G
    data[i + 2] = val; // B
    data[i + 3] = 10 + Math.floor(Math.random() * 30); // Alpha: 10-40
  }

  ctx.putImageData(imageData, 0, 0);
  noisePattern = ctx.createPattern(canvas, 'repeat');
}
```

**Technical Notes:**

- 256x256 tile size balances detail and memory
- Grayscale values (R=G=B) create neutral noise
- Low alpha (10-40) prevents overpowering fog color
- `repeat` mode tiles seamlessly across canvas

#### Clear Points with Radial Gradient

Creates soft-edged wipe trails:

```typescript
function clearAtPoints(points: readonly TrailPoint[]) {
  for (const point of points) {
    // Create radial gradient for soft edges
    const gradient = maskCtx.createRadialGradient(
      point.x,
      point.y,
      0, // Inner circle (center)
      point.x,
      point.y,
      point.radius // Outer circle (edge)
    );

    // Gradient stops
    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)'); // Fully opaque center
    gradient.addColorStop(0.4, 'rgba(0, 0, 0, 1)'); // Hard edge at 40%
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Fade to transparent

    maskCtx.fillStyle = gradient;
    maskCtx.beginPath();
    maskCtx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
    maskCtx.fill();
  }
}
```

**Why Radial Gradient?**

- Hard circle (`fillStyle = solid color`) creates pixelated edges
- Radial gradient provides smooth anti-aliasing
- Adjustable falloff (0.4 stop) controls softness

#### Fog Percentage Calculation

Estimates fog coverage for debug/gameplay purposes:

```typescript
function getFogPercentage(): number {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let opaquePixels = 0;
  const totalPixels = data.length / 4;

  // Sample every 10th pixel for performance
  for (let i = 0; i < data.length; i += 40) {
    // 40 = 10 pixels * 4 channels
    if (data[i + 3] > 128) {
      // Alpha > 50%
      opaquePixels++;
    }
  }

  return (opaquePixels / (totalPixels / 10)) * 100;
}
```

**Performance Consideration:**

- Full scan = O(width × height × 4) = millions of operations
- 10x sampling = O(width × height / 10) = ~100k operations (acceptable)
- Called only every 500ms (throttled in controller)
- CPU readback is expensive; avoid calling every frame

---

## 5. Performance Optimizations

### 5.1 Blur Canvas Downscaling

**Problem:** Applying CSS filter `blur(80px)` to a 1280×720 canvas is expensive (~15-20ms per frame).

**Solution:** Multi-pass blur via downscaling + upscaling:

1. Draw video to small canvas (e.g., 128×72 for 80px blur)
2. Upscale to main canvas with bilinear interpolation
3. Bilinear interpolation naturally creates blur effect

**Speedup:** ~5-10x faster than CSS filter on large canvas

**Code:**

```typescript
// Small blur canvas (10-20% of main size)
blurCanvas.width = 128;
blurCanvas.height = 72;

// Render video small
blurCtx.drawImage(video, 0, 0, 128, 72);

// Upscale to main (bilinear creates blur)
ctx.drawImage(blurCanvas, 0, 0, 1280, 720);
```

### 5.2 Incremental Masking

**Problem:** Redrawing entire mask every frame is wasteful.

**Solution:** Accumulate trail points on persistent mask canvas:

```typescript
// ❌ Slow: Clear and redraw all trails every frame
maskCtx.clearRect(0, 0, width, height);
allTrailPoints.forEach((point) => drawCircle(point));

// ✅ Fast: Draw only new points (mask persists)
newTrailPoints.forEach((point) => drawCircle(point));
```

**Speedup:** ~10-100x for typical usage (5-10 new points vs 500+ total)

### 5.3 Canvas Context Configuration

```typescript
// Main canvas (rarely read, frequently written)
const ctx = canvas.getContext('2d', {
  alpha: true, // Need transparency for fog overlay
  willReadFrequently: false, // Optimize for GPU rendering
});

// Mask canvas (write-only)
const maskCtx = maskCanvas.getContext('2d', {
  alpha: true, // Need alpha for gradient masking
});

// Blur canvas (copy video frames)
const blurCtx = blurCanvas.getContext('2d', {
  alpha: false, // Video has no transparency
  willReadFrequently: false, // Never read back to CPU
});
```

**Impact:** `willReadFrequently: false` enables GPU-accelerated compositing

### 5.4 Calculation Throttling

**Fog Percentage Calculation:**

```typescript
// Throttle expensive CPU readback
if (timestamp - lastFogPercentageUpdate >= 500) {
  cachedFogPercentage = fogOverlay.getFogPercentage();
  lastFogPercentageUpdate = timestamp;
}
```

**Why:** `getImageData()` forces GPU → CPU transfer (expensive)

### 5.5 Memory Efficiency

**Trail Point Limits:**

```typescript
const DEFAULT_HAND_TRAIL_CONFIG = {
  maxTrailLength: 50, // Cap memory per hand
};

// In practice: 2 hands × 50 points × 32 bytes/point ≈ 3.2 KB
// Negligible memory usage
```

**Pattern:** Use `readonly` interfaces and const configs to enable V8 optimizations

---

## 6. Integration with Application

### 6.1 Mode Switching (App.ts)

**Galaxy → Foggy Mirror:**

```typescript
function switchToFoggyMirrorMode() {
  // 1. Initialize controller if first time
  if (!foggyMirrorController) {
    foggyMirrorController = new FoggyMirrorController(
      handTracker, // Shared hand tracking
      container,
      { debug: false }
    );
    foggyMirrorController.initialize();
  }

  // 2. Hide galaxy
  galaxyRenderer.hide();
  controller.disableDebug();

  // 3. Show foggy mirror
  foggyMirrorController.start();

  // 4. Update video appearance
  videoElement.style.filter = 'none'; // Full brightness

  // 5. Update UI
  currentMode = 'foggy-mirror';
  updateModeSwitcher('foggy-mirror');
  updateControlsHint('foggy-mirror');
}
```

**Foggy Mirror → Galaxy:**

```typescript
function switchToGalaxyMode() {
  // 1. Stop foggy mirror
  foggyMirrorController.stop();
  foggyMirrorController.disableDebug();

  // 2. Show galaxy
  galaxyRenderer.show();

  // 3. Dim video for galaxy background
  videoElement.style.filter = 'brightness(0.20) contrast(0.6)';

  // 4. Update UI
  currentMode = 'galaxy';
  updateModeSwitcher('galaxy');
  updateControlsHint('galaxy');
}
```

### 6.2 Shared HandTracker

Both modes use the same HandTracker instance:

**Advantages:**

- Single webcam initialization
- Shared MediaPipe model (no duplicate downloads)
- Consistent hand detection across modes

**Implementation:**

```typescript
class App {
  private handTracker: HandTracker;
  private controller: HandGalaxyController;
  private foggyMirrorController: FoggyMirrorController;

  async initialize() {
    // Initialize shared hand tracker once
    this.handTracker = new HandTracker();
    await this.handTracker.initialize(videoElement);

    // Pass to both controllers
    this.controller = new HandGalaxyController(this.handTracker, galaxyRenderer);

    this.foggyMirrorController = new FoggyMirrorController(this.handTracker, container);
  }
}
```

### 6.3 Lifecycle Coordination

```
App Lifecycle:
  initialize()
    ↓
  start() → startAnimationLoop()
    ↓
  [Mode switching]
    ↓
  dispose() → cleanup all controllers
    ↓
  disposed state
```

**Mode-Specific Loops:**

- **Galaxy Mode:** App.ts animation loop calls `controller.update(timestamp)`
- **Foggy Mirror Mode:** FoggyMirrorController runs its own RAF loop

**Rationale:** Galaxy needs Three.js render loop; Foggy Mirror is independent 2D rendering

---

## 7. Configuration & Tuning

### 7.1 All Configurable Parameters

#### FogOverlayConfig

| Parameter         | Default                     | Min | Max | Impact                              |
| ----------------- | --------------------------- | --- | --- | ----------------------------------- |
| `blurAmount`      | 80                          | 10  | 200 | Blur intensity (also affects scale) |
| `backgroundColor` | `rgba(220, 220, 220, 0.85)` | -   | -   | Fog color and opacity               |
| `enableHighDPI`   | true                        | -   | -   | Use devicePixelRatio for sharpness  |

**Tuning Tips:**

- Lower `blurAmount` (20-40) for subtle fog, higher (80-120) for dense fog
- Decrease alpha in `backgroundColor` (0.5-0.7) for lighter fog
- Disable `enableHighDPI` on low-end devices for performance

#### HandTrailConfig

| Parameter              | Default | Min | Max | Impact                                |
| ---------------------- | ------- | --- | --- | ------------------------------------- |
| `interpolationPoints`  | 5       | 1   | 20  | Smoothness vs performance             |
| `minMovementThreshold` | 2       | 0   | 10  | Jitter filtering sensitivity          |
| `maxTrailLength`       | 50      | 10  | 500 | Memory usage (unused in current impl) |
| `baseClearRadius`      | 60      | 20  | 200 | Brush size                            |
| `dynamicRadius`        | true    | -   | -   | Scale brush with hand size            |

**Tuning Tips:**

- Increase `interpolationPoints` (10-15) for ultra-smooth trails (minor perf cost)
- Lower `baseClearRadius` (30-40) for precise control, higher (80-100) for fast clearing
- Disable `dynamicRadius` for consistent brush size regardless of hand distance

### 7.2 Performance vs Quality Tradeoffs

| Setting                     | Performance | Quality | Recommendation        |
| --------------------------- | ----------- | ------- | --------------------- |
| `blurAmount: 40`            | ⭐⭐⭐      | ⭐⭐    | Budget devices        |
| `blurAmount: 80` (default)  | ⭐⭐        | ⭐⭐⭐  | Balanced              |
| `enableHighDPI: false`      | ⭐⭐⭐      | ⭐      | Low-end mobile        |
| `interpolationPoints: 10`   | ⭐⭐        | ⭐⭐⭐  | High-end only         |
| Fog % sampling every 1000ms | ⭐⭐⭐      | ⭐⭐    | Reduce debug overhead |

### 7.3 Browser Compatibility

| Browser       | Version | Compatibility      | Notes                                |
| ------------- | ------- | ------------------ | ------------------------------------ |
| Chrome        | 90+     | ✅ Full support    | Best performance (Blink)             |
| Edge          | 90+     | ✅ Full support    | Chromium-based                       |
| Firefox       | 88+     | ✅ Full support    | Slightly slower canvas ops           |
| Safari        | 14+     | ⚠️ Partial support | MediaPipe may have issues            |
| Mobile Chrome | 90+     | ✅ Full support    | Disable HiDPI on low-end devices     |
| Mobile Safari | 14+     | ⚠️ Limited         | Camera permissions, MediaPipe issues |

**Key Requirements:**

- Canvas 2D API (universal support)
- `globalCompositeOperation: 'destination-out'` (universal)
- `createRadialGradient()` (universal)
- `requestAnimationFrame` (universal)
- MediaPipe WASM (Chrome/Edge/Firefox best; Safari experimental)

---

## 8. Debug & Telemetry

### 8.1 Debug Panel Interface

```typescript
interface FoggyMirrorDebugInfo {
  handsDetected: number; // 0-2 (or more with config change)
  fps: number; // Update loop FPS
  trailPoints: number; // Active trail points being tracked
  clearedPercentage: number; // 0-100 (inverse of fog percentage)
  avgVelocity: number; // Pixels per frame
  avgBrushSize: number; // Current average radius
}
```

### 8.2 Performance Metrics

**Key Timing Breakdowns (typical values):**

```
Per-frame budget: 16.67ms (60 FPS)

Breakdown:
  Hand detection:      2-4ms   (MediaPipe WASM)
  Trail calculation:   <1ms    (JS math)
  Mask updates:        <1ms    (canvas draw calls)
  Rendering:           3-6ms   (canvas compositing)
  Debug callbacks:     <1ms    (if enabled)

Total:                 7-12ms  (safe margin for 60 FPS)
```

**Memory Usage:**

```
Static:
  Main canvas:     1280×720×4 = 3.6 MB
  Mask canvas:     1280×720×4 = 3.6 MB
  Blur canvas:     128×72×4   = 36 KB
  Noise pattern:   256×256×4  = 256 KB

Dynamic:
  Trail points:    2 hands × 50 points × 32 bytes ≈ 3.2 KB

Total:             ~7.5 MB (reasonable for modern devices)
```

### 8.3 Logging Strategy

```typescript
// Production: Minimal logging
console.log('[FoggyMirrorController] Initialized');
console.log('[FoggyMirrorController] Started');
console.log('[FoggyMirrorController] Stopped');

// Debug mode: Verbose logging
if (config.debug && trackedHands.length > 0) {
  console.log('[FoggyMirrorController] Update:', {
    hands: trackedHands.length,
    trailPoints: handTrailTracker.getAllTrailPoints().length,
    fogRemaining: `${fogPercentage.toFixed(1)}%`,
  });
}
```

---

## 9. Error Handling & Edge Cases

### 9.1 Initialization Failures

**Scenario:** Container element not found

```typescript
if (!container) {
  throw new Error('[FogOverlay] Container element required');
}
```

**Scenario:** Canvas context creation fails

```typescript
const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('[FogOverlay] Failed to get 2D canvas context');
}
```

### 9.2 Runtime Edge Cases

**No video element:**

```typescript
if (!this.videoElement) {
  console.warn('[FogOverlay] No video element found, skipping render');
  return;
}
```

**Window resize during active state:**

```typescript
handleResize() {
  // Save mask data before resizing
  const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

  // Update dimensions
  updateDimensions();

  // Restore mask (simple version; production should scale properly)
  maskCtx.putImageData(maskData, 0, 0);
}
```

**Hand detection errors:**

```typescript
try {
  const handResults = handTracker.detectHands(timestamp);
} catch (error) {
  console.error('[FoggyMirrorController] Hand detection failed:', error);
  // Continue loop, skip this frame
}
```

### 9.3 State Validation

```typescript
function start() {
  if (state === 'disposed') {
    throw new Error('[FoggyMirrorController] Cannot start after disposal');
  }

  if (state === 'uninitialized') {
    initialize();
  }

  if (state === 'active') {
    console.warn('[FoggyMirrorController] Already active');
    return;
  }

  // Safe to start...
}
```

---

## 10. Testing Strategy

### 10.1 Manual Testing Checklist

**Functional Tests:**

- [ ] Fog appears when switching to foggy mirror mode
- [ ] Single hand creates trail
- [ ] Two hands create independent trails
- [ ] Trails are smooth (no gaps)
- [ ] Fog resets properly (R key)
- [ ] Mode switching (F/G keys) works bidirectionally
- [ ] Window resize preserves fog state
- [ ] Debug panel shows accurate metrics (D key)

**Performance Tests:**

- [ ] Maintains 60 FPS with 0 hands
- [ ] Maintains 60 FPS with 1 hand moving
- [ ] Maintains 60 FPS with 2 hands moving rapidly
- [ ] No memory leaks after extended use (10+ minutes)
- [ ] Fog percentage calculation doesn't cause stuttering

**Visual Quality Tests:**

- [ ] Fog appears realistic (blur + color + texture)
- [ ] Trail edges are smooth (no pixelation)
- [ ] Cleared areas reveal sharp video feed
- [ ] Brush size scales appropriately with hand distance
- [ ] No flickering or tearing

### 10.2 Edge Case Testing

**Device-Specific:**

- [ ] Works on 4K displays (HiDPI scaling)
- [ ] Works on low-DPI displays
- [ ] Works on mobile (touch events don't interfere)
- [ ] Works on tablets (various aspect ratios)

**Browser-Specific:**

- [ ] Chrome (desktop & mobile)
- [ ] Edge
- [ ] Firefox
- [ ] Safari (expected limitations documented)

**Error Recovery:**

- [ ] Recovers from camera disconnection
- [ ] Handles rapid mode switching
- [ ] Handles window minimize/restore
- [ ] Handles browser tab visibility changes

---

## 11. Future Enhancements

### 11.1 Potential Improvements

**Visual Enhancements:**

- **Animated Condensation Drops:** Simulate water droplets forming and rolling down
- **Breathing Effect:** Subtle fog expansion/contraction to simulate humidity changes
- **Multiple Fog Layers:** Parallax fog at different depths
- **Customizable Fog Colors:** Themes (morning mist, evening fog, colored smoke)

**Interaction Improvements:**

- **Velocity-Based Brush:** Faster movement = wider brush (more energetic wiping)
- **Pressure Simulation:** Larger hands / closer proximity = more clearing power
- **Multi-Finger Tracking:** Use individual finger tips instead of palm center
- **Gesture Recognition:** Swipe gestures for instant fog reset

**Performance Optimizations:**

- **WebGL Fog Rendering:** Move from Canvas 2D to WebGL for GPU acceleration
- **Mask Texture Compression:** Use lower-precision formats for mask data
- **Adaptive Quality:** Auto-adjust blur and interpolation based on FPS
- **Web Workers:** Offload fog percentage calculation to separate thread

**Gameplay Elements:**

- **Fog Regeneration:** Slowly re-fog cleared areas over time
- **Target Reveals:** Hidden objects revealed when fog is cleared
- **Score Tracking:** Speed runs (clear 90% fog in X seconds)
- **Multiplayer:** Collaborative fog clearing on shared canvas

### 11.2 Known Limitations

**Current Implementation:**

- Mask data doesn't scale properly on window resize (simple `putImageData`)
- Fog percentage calculation is approximate (10x sampling)
- No hand occlusion handling (hands can't block each other)
- Fixed brush shape (circular only)

**MediaPipe Constraints:**

- Requires good lighting for reliable hand detection
- Limited to 2 hands (configurable but performance degrades)
- Occasional tracking jitter in low light

**Browser Limitations:**

- Safari MediaPipe support is experimental
- Mobile devices may struggle with high blur amounts
- `destination-out` compositing may vary slightly between browsers

---

## 12. References & Standards

### 12.1 Official Documentation

- [Canvas 2D API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [CanvasRenderingContext2D.globalCompositeOperation](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation)
- [MediaPipe Hand Landmarker (Web)](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [RequestAnimationFrame - MDN](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame)

### 12.2 Design Patterns

**Patterns Used:**

- **Module Pattern:** Encapsulation of FogOverlay, HandTrailTracker
- **Observer Pattern:** Debug callbacks for telemetry
- **State Machine:** Lifecycle state management (uninitialized → ready → active → disposed)
- **Dependency Injection:** HandTracker passed to controller
- **Factory Pattern:** Trail point generation

### 12.3 Performance Best Practices

- **Avoid Synchronous Layouts:** Batch DOM reads/writes
- **Minimize `getImageData()` Calls:** GPU → CPU transfer is expensive
- **Use `willReadFrequently` Correctly:** false for write-heavy canvases
- **Leverage Bilinear Interpolation:** Natural blur via upscaling
- **Incremental Updates:** Only draw new data, not full re-renders

---

## 13. Conclusion

### 13.1 Design Philosophy

The Foggy Mirror mode prioritizes:

1. **Natural Interaction:** Hand movements feel intuitive and responsive
2. **Visual Quality:** Realistic fog appearance with minimal artifacts
3. **Performance:** Smooth 60 FPS on mid-range hardware
4. **Code Quality:** Modular, testable, well-documented architecture
5. **Extensibility:** Easy to add new fog effects or interaction modes

### 13.2 Success Criteria

The implementation is successful if:

✅ Users can clear fog smoothly with hand movements  
✅ Maintains 60 FPS with 2 hands on 1080p displays  
✅ Fog appears realistic (blur + color + texture)  
✅ Mode switching is seamless (no lag or artifacts)  
✅ Code is maintainable and follows TypeScript best practices  
✅ Works across modern browsers (Chrome, Edge, Firefox)

### 13.3 Key Takeaways

**Technical Innovations:**

- Multi-canvas architecture for performance
- Blur via downscaling (5-10x faster than CSS filter)
- Incremental masking (100x faster than full redraw)
- Adaptive blur canvas scaling

**Lessons Learned:**

- Canvas 2D API is powerful but requires careful optimization
- MediaPipe hand tracking is robust but needs good lighting
- Interpolation is critical for smooth trails
- Throttling expensive calculations (fog %) prevents stuttering

**What Makes It Special:**
The combination of realistic fog texture, smooth hand tracking, and performant rendering creates a uniquely satisfying interaction that feels both magical and natural—like you're truly wiping condensation from a mirror.

---

## Appendix A: Type Definitions Reference

```typescript
// Core Types
interface Point2D {
  readonly x: number;
  readonly y: number;
}

interface TrailPoint extends Point2D {
  readonly radius: number;
  readonly timestamp: number;
}

interface TrackedHand {
  readonly palmPosition: Point2D;
  readonly previousPosition: Point2D | null;
  readonly trail: readonly TrailPoint[];
  readonly handSize: number;
  readonly handedness: string;
  readonly velocity: number;
}

// Configuration Types
interface FogOverlayConfig {
  readonly blurAmount: number;
  readonly backgroundColor: string;
  readonly enableHighDPI: boolean;
}

interface HandTrailConfig {
  readonly interpolationPoints: number;
  readonly minMovementThreshold: number;
  readonly maxTrailLength: number;
  readonly baseClearRadius: number;
  readonly dynamicRadius: boolean;
}

interface FoggyMirrorConfig {
  readonly fogOverlay: Partial<FogOverlayConfig>;
  readonly handTrail: Partial<HandTrailConfig>;
  readonly debug: boolean;
}

// State Types
type FoggyMirrorState = 'uninitialized' | 'ready' | 'active' | 'disposed';

// Debug Types
interface FoggyMirrorDebugInfo {
  handsDetected: number;
  fps: number;
  trailPoints: number;
  clearedPercentage: number;
  avgVelocity: number;
  avgBrushSize: number;
}
```

---

## Appendix B: Algorithm Complexity Analysis

| Operation            | Complexity    | Notes                                     |
| -------------------- | ------------- | ----------------------------------------- |
| Hand detection       | O(1)          | MediaPipe WASM (fixed cost ~3ms)          |
| Trail interpolation  | O(n)          | n = interpolationPoints (typically 5)     |
| Hand tracking update | O(h)          | h = number of hands (typically 1-2)       |
| Mask drawing         | O(p)          | p = new trail points (5-10 per frame)     |
| Fog percentage calc  | O(w × h / 10) | 10x sampling of canvas pixels             |
| Canvas compositing   | O(w × h)      | GPU-accelerated, effectively O(1) latency |

**Overall Per-Frame Complexity:** O(w × h) dominated by canvas compositing (GPU-accelerated)

---

## Appendix C: Memory Layout

```
Heap Allocation Breakdown:
├─ FoggyMirrorController Instance: ~1 KB
│  ├─ Config object: ~200 bytes
│  ├─ State variables: ~100 bytes
│  └─ Function closures: ~500 bytes
│
├─ FogOverlay Instance: ~7.5 MB
│  ├─ Main canvas: 3.6 MB (1280×720×4)
│  ├─ Mask canvas: 3.6 MB (1280×720×4)
│  ├─ Blur canvas: 36 KB (128×72×4)
│  ├─ Noise pattern: 256 KB (256×256×4)
│  └─ Context objects: ~50 KB
│
└─ HandTrailTracker Instance: ~5 KB
   ├─ Tracked hands map: ~3 KB (2 hands × 1.5 KB)
   ├─ New trail points array: ~2 KB (50 points × 32 bytes)
   └─ Config object: ~200 bytes

Total: ~7.5 MB (dominated by canvas buffers)
```

---

**Document Version:** 1.0.0  
**Last Updated:** December 9, 2025  
**Author:** AI Assistant (Claude Sonnet 4.5)  
**Status:** Complete Design Specification
