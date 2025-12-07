# Interactive Galaxy Between Hands - Design Document

## Project Overview

**Project Name:** Interactive Galaxy  
**Version:** 2.0.0  
**Tech Stack:** Vite + TypeScript + MediaPipe Tasks Vision + Three.js (WebGL)  
**Estimated Development Time:** 2-3 hours  
**Target Platform:** Web (Chrome/Edge/Firefox; Safari with limitations)

### Key Technologies

| Technology              | Version | Purpose                 |
| ----------------------- | ------- | ----------------------- |
| Vite                    | 5.x     | Build tool with HMR     |
| TypeScript              | 5.x     | Type safety             |
| @mediapipe/tasks-vision | latest  | Hand landmark detection |
| Three.js                | 0.170.x | WebGL 3D rendering      |

---

## 1. Project Vision

### Goal

Create an immersive, magical web experience where users can conjure and manipulate a 3D spiral galaxy between their hands using hand tracking.

### User Experience

1. User opens the application in a web browser
2. Camera activates and shows user's video feed
3. User brings both hands close together → nothing appears
4. As user separates hands → a small galaxy materializes and grows between them
5. User rotates hands → galaxy rotates in 3D space matching hand orientation
6. User brings hands closer → galaxy shrinks and eventually disappears
7. Smooth, magical transitions create a sense of controlling cosmic forces

---

## 2. Technical Architecture

### 2.1 Technology Stack

#### Frontend Framework

- **Vite** (v5.x): Fast build tool with instant HMR
- **TypeScript** (v5.x): Type safety and better developer experience
- **Reason:** Vite provides instant dev server startup and fast HMR for rapid iteration

#### Hand Tracking

- **MediaPipe Tasks Vision** (`@mediapipe/tasks-vision@latest`): Google's modern ML hand tracking solution
- **API Class:** `HandLandmarker` (Tasks Vision API)
- **Model:** `hand_landmarker.task` (float16, ~12MB)
- **Model URL:** `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
- **Configuration:**
  - `runningMode`: "VIDEO" (for continuous video processing)
  - `numHands`: 2
  - `minHandDetectionConfidence`: 0.5
  - `minHandPresenceConfidence`: 0.5
  - `minTrackingConfidence`: 0.5
- **Reason:** Industry-standard, accurate, runs 100% in browser with WASM, no server needed
- **Reference:** [Official MediaPipe Hand Landmarker Web Guide](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js)

#### 3D Graphics

- **Three.js** (v0.170.x or latest stable): WebGL 3D library
- **Renderer:** `WebGLRenderer` (broad browser compatibility)
- **Particle System:** `BufferGeometry` + `Points` + `ShaderMaterial` with custom GLSL shaders
- **Blending:** Additive blending for glow effect
- **Reason:** Most popular 3D library, excellent docs, WebGL ensures broad browser support
- **Reference:** [Three.js Particle System Example](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_buffergeometry_custom_attributes_particles.html)

### 2.2 Project Structure

```
toe-4-fun/
├── public/
│   └── models/
│       └── hand_landmarker.task          # MediaPipe model file
├── src/
│   ├── main.ts                           # Entry point
│   ├── app.ts                            # Main application class
│   ├── modules/
│   │   ├── HandTracker.ts                # MediaPipe hand tracking module
│   │   ├── GalaxyRenderer.ts             # Three.js galaxy rendering
│   │   ├── HandGalaxyController.ts       # Bridge between hands and galaxy
│   │   └── types/
│   │       ├── HandTypes.ts              # Hand tracking type definitions
│   │       └── GalaxyTypes.ts            # Galaxy parameter types
│   ├── utils/
│   │   ├── math.ts                       # Vector math utilities
│   │   └── smoothing.ts                  # Smoothing/interpolation functions
│   └── styles/
│       └── main.css                      # Minimal styling
├── index.html                            # HTML entry point
├── package.json                          # Dependencies
├── tsconfig.json                         # TypeScript config
├── vite.config.ts                        # Vite configuration
├── DESIGN.md                             # This file
└── README.md                             # Project documentation
```

---

## 3. Core Modules

### 3.1 HandTracker Module

**Responsibility:** Manage webcam access and hand landmark detection using MediaPipe Tasks Vision API

**Dependencies:**

```typescript
import {
  FilesetResolver,
  HandLandmarker,
  HandLandmarkerResult,
} from '@mediapipe/tasks-vision';
```

**Public Interface:**

```typescript
class HandTracker {
  private handLandmarker: HandLandmarker | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private isRunning: boolean = false;

  async initialize(videoElement: HTMLVideoElement): Promise<void>;
  detectHands(timestamp: number): HandLandmarkerResult | null;
  dispose(): void;
  isReady(): boolean;
}

// MediaPipe Tasks Vision API returns this structure
interface HandLandmarkerResult {
  landmarks: NormalizedLandmark[][]; // [handIndex][landmarkIndex]
  worldLandmarks: Landmark[][]; // 3D world coordinates in meters
  handedness: Category[][]; // Left/Right classification
}

interface NormalizedLandmark {
  x: number; // Normalized 0-1 (image width)
  y: number; // Normalized 0-1 (image height)
  z: number; // Depth relative to wrist
}

interface Landmark {
  x: number; // Meters from hand center
  y: number; // Meters from hand center
  z: number; // Meters from hand center
}

interface Category {
  categoryName: string; // "Left" or "Right"
  score: number; // Confidence 0-1
}
```

**Initialization Pattern (Tasks Vision API):**

```typescript
async initialize(videoElement: HTMLVideoElement): Promise<void> {
  // Step 1: Load WASM runtime
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  // Step 2: Create HandLandmarker with options
  this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU" // Use GPU acceleration if available
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  this.videoElement = videoElement;
}
```

**Detection Pattern:**

```typescript
detectHands(timestamp: number): HandLandmarkerResult | null {
  if (!this.handLandmarker || !this.videoElement) return null;

  // detectForVideo is synchronous and returns results immediately
  return this.handLandmarker.detectForVideo(this.videoElement, timestamp);
}
```

**Key Features:**

- Webcam initialization with error handling
- MediaPipe Tasks Vision model loading via WASM
- Synchronous detection using `detectForVideo()` for VIDEO running mode
- GPU delegate for hardware acceleration when available
- Graceful degradation if camera unavailable

**Implementation Notes:**

- Use `requestAnimationFrame` for efficient processing
- Pass `performance.now()` as timestamp to `detectForVideo()`
- Results include both normalized landmarks (0-1) and world landmarks (meters)
- No event callbacks needed - detection is synchronous in VIDEO mode
- Cache model in browser for faster subsequent loads

---

### 3.2 GalaxyRenderer Module

**Responsibility:** Create and render 3D spiral galaxy using Three.js WebGL particle system

**Public Interface:**

```typescript
class GalaxyRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private galaxy: THREE.Points | null = null;
  private uniforms: { [key: string]: THREE.IUniform };

  constructor(container: HTMLElement);
  initialize(): void;
  setScale(scale: number): void; // 0-1
  setPosition(x: number, y: number, z: number): void;
  setRotation(euler: THREE.Euler): void;
  setVisible(visible: boolean): void;
  render(): void;
  dispose(): void;
}

interface GalaxyConfig {
  particleCount: number; // Default: 20000
  spiralArms: number; // Default: 3
  radius: number; // Default: 5
  colorInside: string; // Default: '#ffa575'
  colorOutside: string; // Default: '#311599'
}
```

**Implementation Details:**

**WebGL Particle System Setup:**

```typescript
// Create geometry with custom attributes
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const colors = new Float32Array(particleCount * 3);
const sizes = new Float32Array(particleCount);
const randoms = new Float32Array(particleCount * 3); // For randomness

// Set attributes
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 3));
```

**Galaxy Generation Algorithm:**

```typescript
for (let i = 0; i < particleCount; i++) {
  const i3 = i * 3;

  // Spiral galaxy formula
  const radiusRatio = Math.random(); // 0-1
  const radius = Math.pow(radiusRatio, 1.5) * maxRadius;

  // Spiral arms (3 branches)
  const branchIndex = i % spiralArms;
  const branchAngle = (branchIndex / spiralArms) * Math.PI * 2;
  const spinAngle = radius * spinFactor; // Twist increases with distance
  const angle = branchAngle + spinAngle;

  // Base position in spiral
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const y = 0; // Flat galaxy

  // Add randomness for organic look (more spread at edges)
  const randomX = (Math.random() - 0.5) * randomness * radiusRatio;
  const randomY = (Math.random() - 0.5) * randomness * radiusRatio * 0.5;
  const randomZ = (Math.random() - 0.5) * randomness * radiusRatio;

  positions[i3] = x + randomX;
  positions[i3 + 1] = y + randomY;
  positions[i3 + 2] = z + randomZ;

  // Color gradient: inside (warm) to outside (cool)
  const colorInside = new THREE.Color('#ffa575');
  const colorOutside = new THREE.Color('#311599');
  const mixedColor = colorInside.clone().lerp(colorOutside, radiusRatio);

  colors[i3] = mixedColor.r;
  colors[i3 + 1] = mixedColor.g;
  colors[i3 + 2] = mixedColor.b;

  // Size (smaller at edges for depth effect)
  sizes[i] = Math.random() * 2.0 + 0.5;
}
```

**Custom GLSL Shaders:**

```glsl
// Vertex Shader
attribute float size;
varying vec3 vColor;

void main() {
  vColor = color;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}

// Fragment Shader
uniform sampler2D pointTexture;
varying vec3 vColor;

void main() {
  // Create soft circular particle with glow
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);
  float alpha = 0.1 / dist - 0.2; // Glow falloff
  alpha = clamp(alpha, 0.0, 1.0);

  gl_FragColor = vec4(vColor, alpha);
}
```

**Particle Material (WebGL):**

```typescript
const material = new THREE.ShaderMaterial({
  uniforms: {
    pointTexture: {
      value: new THREE.TextureLoader().load('textures/spark.png'),
    },
    uTime: { value: 0 },
    uScale: { value: 1.0 },
  },
  vertexShader: vertexShader,
  fragmentShader: fragmentShader,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  transparent: true,
  vertexColors: true,
});

// Create Points object
const galaxy = new THREE.Points(geometry, material);
scene.add(galaxy);
```

**Performance:**

- Use `BufferGeometry` with typed arrays for efficient memory
- Limit to 20,000 particles for 60 FPS on average hardware
- Option to reduce to 10,000 for lower-end devices
- Use `depthWrite: false` to avoid sorting overhead
- Additive blending creates natural glow effect

**Sources:**

- Based on [Three.js WebGL Particle System](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_buffergeometry_custom_attributes_particles.html)
- Galaxy algorithm inspired by [Three.js Journey Galaxy Lesson](https://threejs-journey.com/lessons/animated-galaxy)

---

### 3.3 HandGalaxyController Module

**Responsibility:** Bridge between hand tracking and galaxy rendering

**Public Interface:**

```typescript
class HandGalaxyController {
  constructor(handTracker: HandTracker, galaxyRenderer: GalaxyRenderer);
  start(): void;
  stop(): void;
  setDistanceThresholds(min: number, max: number): void;
  setSmoothingFactor(factor: number): void;
}
```

**Core Logic:**

**1. Hand Distance Calculation**

```typescript
function calculateHandDistance(hand1: Hand, hand2: Hand): number {
  const wrist1 = hand1.landmarks[0]; // Wrist landmark
  const wrist2 = hand2.landmarks[0];

  const dx = wrist2.x - wrist1.x;
  const dy = wrist2.y - wrist1.y;
  const dz = wrist2.z - wrist1.z;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
```

**2. Midpoint Calculation**

```typescript
function calculateMidpoint(hand1: Hand, hand2: Hand): Vector3 {
  const w1 = hand1.landmarks[0];
  const w2 = hand2.landmarks[0];

  return new THREE.Vector3(
    (w1.x + w2.x) / 2,
    (w1.y + w2.y) / 2,
    (w1.z + w2.z) / 2
  );
}
```

**3. Hand Rotation Calculation**

```typescript
function calculateHandRotation(
  hand: HandLandmarkerResult,
  handIndex: number
): THREE.Euler {
  const landmarks = hand.landmarks[handIndex];
  const wrist = landmarks[0];
  const middleBase = landmarks[9]; // Middle finger MCP
  const indexBase = landmarks[5]; // Index finger MCP

  // Step 1: Create raw direction vectors from landmarks
  const rawForward = new THREE.Vector3(
    middleBase.x - wrist.x,
    middleBase.y - wrist.y,
    middleBase.z - wrist.z
  );

  const rawRight = new THREE.Vector3(
    indexBase.x - wrist.x,
    indexBase.y - wrist.y,
    indexBase.z - wrist.z
  );

  // Step 2: Gram-Schmidt orthogonalization to ensure orthonormal basis
  // This is CRITICAL because landmarks are not guaranteed to be perpendicular
  const forward = rawForward.clone().normalize();

  // Remove the component of rawRight that is parallel to forward
  const rightProjection = forward.clone().multiplyScalar(forward.dot(rawRight));
  const right = rawRight.clone().sub(rightProjection).normalize();

  // Step 3: Compute up vector via cross product (guaranteed perpendicular)
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();

  // Step 4: Re-orthogonalize right to ensure perfect orthonormality
  right.crossVectors(up, forward).normalize();

  // Step 5: Create rotation matrix from orthonormal basis vectors
  const matrix = new THREE.Matrix4();
  matrix.makeBasis(right, up, forward);

  // Step 6: Extract Euler angles from rotation matrix
  return new THREE.Euler().setFromRotationMatrix(matrix);
}
```

**Why Gram-Schmidt is Required:**

MediaPipe hand landmarks are detected from 2D image features and may not produce perfectly perpendicular vectors. Using `makeBasis()` with non-orthonormal vectors results in skewed or invalid rotation matrices. Gram-Schmidt orthogonalization:

1. Normalizes the forward vector
2. Projects out the parallel component from the right vector
3. Ensures the resulting basis is truly orthonormal
4. Produces valid rotation matrices for Three.js

**4. Average Rotation from Both Hands**

```typescript
function calculateAverageRotation(result: HandLandmarkerResult): THREE.Euler {
  if (result.landmarks.length < 2) {
    // Only one hand, return its rotation
    return calculateHandRotation(result, 0);
  }

  const rot1 = calculateHandRotation(result, 0);
  const rot2 = calculateHandRotation(result, 1);

  // Convert to quaternions for proper averaging (Euler interpolation is problematic)
  const quat1 = new THREE.Quaternion().setFromEuler(rot1);
  const quat2 = new THREE.Quaternion().setFromEuler(rot2);

  // Handle quaternion double-cover: ensure shortest path interpolation
  if (quat1.dot(quat2) < 0) {
    quat2.set(-quat2.x, -quat2.y, -quat2.z, -quat2.w);
  }

  // Slerp (spherical linear interpolation) for smooth averaging
  const avgQuat = quat1.clone().slerp(quat2, 0.5);

  // Convert back to Euler
  return new THREE.Euler().setFromQuaternion(avgQuat);
}
```

**Note:** The quaternion double-cover check ensures we always interpolate via the shortest arc, avoiding unexpected 360° flips.

**5. Galaxy Scale Mapping**

```typescript
function mapDistanceToScale(distance: number): number {
  const minDist = 0.05; // Hands very close
  const maxDist = 0.3; // Hands far apart

  // Clamp distance to range
  const clamped = Math.max(minDist, Math.min(maxDist, distance));

  // Normalize to 0-1
  const normalized = (clamped - minDist) / (maxDist - minDist);

  // Apply smooth curve (ease-in-out)
  return smoothStep(normalized);
}

function smoothStep(x: number): number {
  return x * x * (3 - 2 * x);
}
```

**6. Smooth Transitions**

```typescript
class Smoother {
  private currentValue: number = 0;
  private targetValue: number = 0;
  private smoothingFactor: number = 0.1;

  update(newTarget: number): number {
    this.targetValue = newTarget;
    this.currentValue +=
      (this.targetValue - this.currentValue) * this.smoothingFactor;
    return this.currentValue;
  }
}
```

**Main Update Loop:**

```typescript
class HandGalaxyController {
  private handTracker: HandTracker;
  private galaxyRenderer: GalaxyRenderer;
  private scaleSmoother: Smoother;
  private positionSmoother: Vector3Smoother;
  private rotationSmoother: QuaternionSmoother;
  private lastHandsTime: number = 0;
  private gracePeriod: number = 500; // ms to keep galaxy visible after losing hands

  update(timestamp: number): void {
    const result = this.handTracker.detectHands(timestamp);

    if (result && result.landmarks.length === 2) {
      this.lastHandsTime = timestamp;

      // Calculate parameters from both hands
      const distance = this.calculateHandDistance(result);
      const midpoint = this.calculateMidpoint(result);
      const rotation = calculateAverageRotation(result);
      const scale = this.mapDistanceToScale(distance);

      // Apply smoothing for fluid motion
      const smoothScale = this.scaleSmoother.update(scale);
      const smoothPosition = this.positionSmoother.update(midpoint);
      const smoothRotation = this.rotationSmoother.update(rotation);

      // Update galaxy
      this.galaxyRenderer.setScale(smoothScale);
      this.galaxyRenderer.setPosition(
        smoothPosition.x,
        smoothPosition.y,
        smoothPosition.z
      );
      this.galaxyRenderer.setRotation(smoothRotation);
      this.galaxyRenderer.setVisible(smoothScale > 0.01);
    } else {
      // Grace period: keep galaxy visible briefly after losing hands
      const timeSinceHands = timestamp - this.lastHandsTime;
      if (timeSinceHands > this.gracePeriod) {
        this.galaxyRenderer.setVisible(false);
      }
    }
  }

  private calculateHandDistance(result: HandLandmarkerResult): number {
    const wrist1 = result.landmarks[0][0]; // First hand, wrist
    const wrist2 = result.landmarks[1][0]; // Second hand, wrist

    const dx = wrist2.x - wrist1.x;
    const dy = wrist2.y - wrist1.y;
    const dz = wrist2.z - wrist1.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private calculateMidpoint(result: HandLandmarkerResult): THREE.Vector3 {
    const w1 = result.landmarks[0][0];
    const w2 = result.landmarks[1][0];

    return new THREE.Vector3(
      (w1.x + w2.x) / 2,
      (w1.y + w2.y) / 2,
      (w1.z + w2.z) / 2
    );
  }
}
```

---

## 4. User Interface

### 4.1 Visual Layout

```
┌─────────────────────────────────────────┐
│                                         │
│        [Full-screen Canvas]             │
│     (Galaxy rendered on top of          │
│      webcam video background)           │
│                                         │
│                                         │
│  [Galaxy appears between hands]         │
│                                         │
│                                         │
│  [Status indicator]  [FPS counter]      │
└─────────────────────────────────────────┘
```

### 4.2 UI Elements

**Minimal UI:**

- Full-screen immersive experience
- No intrusive controls during use
- Optional debug panel (toggleable with 'D' key)

**Status Indicator:**

- Camera status: ⚪ Loading | 🟢 Active | 🔴 Error
- Hand tracking: "2 hands" | "1 hand" | "No hands"
- Position: Bottom-left corner, semi-transparent

**Debug Panel (Optional):**

- Hand distance value
- Galaxy scale value
- FPS counter
- Particle count
- Toggle: Show/hide hand landmarks overlay

### 4.3 Styling

**Background:**

- Live webcam feed (mirrored for selfie effect)
- Slight darkening overlay for contrast
- Galaxy renders on top with additive blending

**Colors:**

- Galaxy: Orange (#ffa575) to Purple (#311599)
- UI text: White with semi-transparent black background
- Status indicators: Green/Yellow/Red

**Fonts:**

- System font stack for performance
- Monospace for debug values

---

## 5. Configuration & Settings

### 5.1 Adjustable Parameters

**Hand Tracking (Tasks Vision API):**

```typescript
interface HandLandmarkerOptions {
  baseOptions: {
    modelAssetPath: string; // Path to hand_landmarker.task
    delegate: 'GPU' | 'CPU'; // Hardware acceleration preference
  };
  runningMode: 'IMAGE' | 'VIDEO'; // VIDEO for continuous detection
  numHands: number; // Max hands to detect (1-2)
  minHandDetectionConfidence: number; // 0.0-1.0, default 0.5
  minHandPresenceConfidence: number; // 0.0-1.0, default 0.5
  minTrackingConfidence: number; // 0.0-1.0, default 0.5
}

// Default configuration for this project:
const defaultConfig: HandLandmarkerOptions = {
  baseOptions: {
    modelAssetPath:
      'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    delegate: 'GPU',
  },
  runningMode: 'VIDEO',
  numHands: 2,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};
```

**Galaxy Parameters:**

```typescript
interface GalaxyConfig {
  particleCount: 20000;
  spiralArms: 3;
  radius: 5;
  colorInside: '#ffa575';
  colorOutside: '#311599';
  rotationSpeed: 0; // Auto-rotation disabled
}
```

**Interaction Thresholds:**

```typescript
interface InteractionConfig {
  minHandDistance: 0.05; // Below this: no galaxy
  maxHandDistance: 0.3; // Above this: max size
  smoothingFactor: 0.1; // 0 = instant, 1 = no movement
  scaleMultiplier: 1.0; // Adjust galaxy size
}
```

### 5.2 Performance Profiles

**High Quality (default):**

- 20,000 particles
- Full resolution (1280x720)
- 60 FPS target

**Balanced:**

- 10,000 particles
- Medium resolution (960x540)
- 60 FPS target

**Performance:**

- 5,000 particles
- Low resolution (640x480)
- 30 FPS target

**Auto-detection:**

- Start with High Quality
- Monitor FPS for 5 seconds
- Downgrade if average FPS < 45

---

## 6. Development Roadmap

### Phase 1: Foundation (1 hour)

- [x] Project setup (Vite + TypeScript)
- [ ] Install dependencies (Three.js, MediaPipe)
- [ ] Basic project structure
- [ ] Webcam initialization
- [ ] MediaPipe hands integration
- [ ] Display video feed

### Phase 2: Galaxy Creation (45 min)

- [ ] Three.js scene setup
- [ ] Implement galaxy generation algorithm
- [ ] Create particle system
- [ ] Add color gradient
- [ ] Test rendering performance

### Phase 3: Integration (45 min)

- [ ] Hand distance calculation
- [ ] Midpoint calculation
- [ ] Hand rotation calculation
- [ ] Galaxy scale mapping
- [ ] Position and rotation control
- [ ] Test two-hand interaction

### Phase 4: Polish (30 min)

- [ ] Add smoothing to all parameters
- [ ] Implement fade-in/fade-out
- [ ] Add UI status indicators
- [ ] Performance optimization
- [ ] Cross-browser testing
- [ ] Documentation

### Phase 5: Enhancements (Optional, +1-2 hours)

- [ ] Debug panel with controls
- [ ] Multiple color schemes
- [ ] Sound effects
- [ ] Recording/screenshot feature
- [ ] Mobile optimization

---

## 7. Technical Challenges & Solutions

### Challenge 1: Jittery Hand Tracking

**Problem:** Hand landmarks can jitter frame-to-frame  
**Solution:** Exponential moving average smoothing on all parameters

### Challenge 2: Galaxy Disappearing Unexpectedly

**Problem:** Hand detection can momentarily fail  
**Solution:** Keep galaxy visible for 0.5s after losing hands (grace period)

### Challenge 3: Coordinate System Mismatch

**Problem:** MediaPipe (normalized 0-1) vs Three.js (world space)  
**Solution:** Clear mapping functions with documented transformations

### Challenge 4: Hand Rotation Ambiguity

**Problem:** Multiple valid rotations for same hand pose  
**Solution:** Use palm normal vector + wrist-to-finger vector for unique rotation

### Challenge 5: Performance on Low-End Devices

**Problem:** 20k particles may lag on older hardware  
**Solution:** Adaptive quality system with performance monitoring

---

## 8. Browser Compatibility

### Technology Requirements

| Technology   | Minimum Version | Purpose                        |
| ------------ | --------------- | ------------------------------ |
| WebGL        | 2.0             | Three.js particle rendering    |
| WebAssembly  | Supported       | MediaPipe Tasks Vision runtime |
| getUserMedia | Supported       | Webcam access                  |
| ES2020+      | Supported       | Modern JavaScript features     |

### Desktop Browsers

| Browser | Minimum Version | Status          | Notes                            |
| ------- | --------------- | --------------- | -------------------------------- |
| Chrome  | 79+             | ✅ Full Support | Recommended for best performance |
| Edge    | 79+             | ✅ Full Support | Chromium-based                   |
| Firefox | 67+             | ✅ Full Support | Good WebGL2 support              |
| Safari  | 15.4+           | ⚠️ Partial      | Some WebGL2 features may vary    |

### Mobile Browsers

| Browser          | Minimum Version | Status       | Notes                        |
| ---------------- | --------------- | ------------ | ---------------------------- |
| Chrome Android   | 79+             | ✅ Supported | Reduce particles to 10k      |
| Safari iOS       | 15.4+           | ⚠️ Limited   | Performance varies by device |
| Samsung Internet | 12+             | ✅ Supported | Chromium-based               |

### Feature Detection

```typescript
function checkBrowserSupport(): { supported: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check WebGL 2.0
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    issues.push('WebGL 2.0 not supported');
  }

  // Check WebAssembly
  if (typeof WebAssembly === 'undefined') {
    issues.push('WebAssembly not supported');
  }

  // Check getUserMedia
  if (!navigator.mediaDevices?.getUserMedia) {
    issues.push('Camera API (getUserMedia) not supported');
  }

  return {
    supported: issues.length === 0,
    issues,
  };
}
```

### Known Limitations

- **Safari:** WebGL2 support may have performance differences; test thoroughly
- **Firefox:** Excellent compatibility but slightly slower MediaPipe WASM execution
- **Mobile:** Reduced particle count (5k-10k) recommended for 60 FPS
- **Older devices:** May need to use "Performance" quality profile

### Not Supported

- Internet Explorer (any version)
- Browsers without WebGL 2.0 support
- Browsers without WebAssembly support

---

## 9. Testing Strategy

### Unit Tests

- Math utilities (vector operations, smoothing)
- Coordinate transformations
- Threshold calculations

### Integration Tests

- Hand tracking initialization
- Galaxy creation and rendering
- Controller integration

### Manual Testing Checklist

- [ ] Camera permission handling
- [ ] One hand detected (no galaxy)
- [ ] Two hands close together (no galaxy)
- [ ] Hands separating (galaxy appears and grows)
- [ ] Hands rotating (galaxy rotates)
- [ ] Hands closing (galaxy shrinks)
- [ ] Rapid hand movements (smooth tracking)
- [ ] Poor lighting conditions
- [ ] Different hand positions
- [ ] Hand occlusion (one hand behind other)

### Performance Testing

- [ ] FPS remains above 30 on target hardware
- [ ] No memory leaks over 5 minutes
- [ ] Smooth transitions under all conditions
- [ ] Browser CPU usage < 80%

---

## 10. Error Handling

### Camera Errors

```typescript
try {
  await navigator.mediaDevices.getUserMedia({ video: true });
} catch (error) {
  if (error.name === 'NotAllowedError') {
    // Show: "Please allow camera access"
  } else if (error.name === 'NotFoundError') {
    // Show: "No camera found"
  } else {
    // Show: "Camera error: [error message]"
  }
}
```

### MediaPipe Loading Errors

```typescript
async function initializeHandTracking(): Promise<HandLandmarker | null> {
  try {
    // Step 1: Load WASM runtime
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    // Step 2: Create HandLandmarker
    const handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    });

    return handLandmarker;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('wasm')) {
        // WASM loading failed
        console.error('Failed to load MediaPipe WASM runtime:', error);
        showError(
          'Your browser may not support WebAssembly. Please try Chrome or Firefox.'
        );
      } else if (error.message.includes('model')) {
        // Model loading failed
        console.error('Failed to load hand tracking model:', error);
        showError(
          'Failed to download hand tracking model. Check your internet connection.'
        );
      } else {
        // Generic error
        console.error('MediaPipe initialization error:', error);
        showError(
          'Hand tracking initialization failed. Try refreshing the page.'
        );
      }
    }
    return null;
  }
}
```

### WebGL Errors

```typescript
if (!renderer.capabilities.isWebGL2) {
  // Show: "WebGL 2.0 required. Please update your browser."
}
```

---

## 11. Future Enhancements

### Short-term (1-2 hours each)

1. **Multiple Galaxy Styles**

   - Fire galaxy (red/orange)
   - Ice galaxy (blue/white)
   - Rainbow galaxy (multi-color)
   - Keyboard shortcuts to switch

2. **Sound Design**

   - Ambient space sounds
   - Whoosh when galaxy appears/disappears
   - Pitch shifts based on galaxy scale

3. **Gesture Library**
   - Pinch to create black hole
   - Spread fingers to add nebula clouds
   - Clap to reset/explode galaxy

### Long-term (4+ hours each)

1. **Multi-user Mode**

   - Multiple galaxies for multiple hand pairs
   - Collision detection between galaxies

2. **AR Mode**

   - Use device camera for background
   - Galaxy appears in real environment

3. **Recording/Sharing**
   - Record video of interaction
   - Export as GIF or MP4
   - Share to social media

---

## 12. References & Resources

### Official Documentation

1. [MediaPipe Tasks Vision - Hand Landmarker Web Guide](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js) - Official Google documentation for hand tracking
2. [Three.js Documentation](https://threejs.org/docs/) - Core Three.js API reference
3. [Three.js WebGL Particle Examples](https://threejs.org/examples/?q=particles) - Official particle system examples
4. [Vite Guide](https://vitejs.dev/guide/) - Build tool documentation

### Code Examples

1. [MediaPipe Hand Landmarker CodePen](https://codepen.io/mediapipe-preview/pen/gOKBGPN) - Official interactive example
2. [Three.js BufferGeometry Particles](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_buffergeometry_custom_attributes_particles.html) - WebGL particle system reference
3. [Three.js Custom Attributes Points](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_custom_attributes_points.html) - Custom shader particles

### Learning Resources

1. [Three.js Journey - Galaxy Lesson](https://threejs-journey.com/lessons/animated-galaxy) - Galaxy algorithm tutorial
2. [MediaPipe Solutions Guide](https://ai.google.dev/edge/mediapipe/solutions/guide) - Overview of MediaPipe capabilities
3. [WebGL2 Fundamentals](https://webgl2fundamentals.org/) - Understanding WebGL2

### API References

1. [@mediapipe/tasks-vision NPM](https://www.npmjs.com/package/@mediapipe/tasks-vision) - MediaPipe Tasks Vision package
2. [Three.js GitHub](https://github.com/mrdoob/three.js) - Three.js source code
3. [MDN WebGL2](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext) - WebGL2 API documentation

---

## 13. License & Credits

### Dependencies

- **Vite:** MIT License
- **Three.js:** MIT License
- **MediaPipe:** Apache 2.0 License

### Credits

- Galaxy algorithm inspired by Three.js official example
- Hand tracking powered by Google MediaPipe
- Math utilities based on Three.js implementations

---

## Appendix A: MediaPipe Hand Landmarks Reference

```
Hand Landmarks (21 total):
0:  WRIST
1:  THUMB_CMC
2:  THUMB_MCP
3:  THUMB_IP
4:  THUMB_TIP
5:  INDEX_FINGER_MCP
6:  INDEX_FINGER_PIP
7:  INDEX_FINGER_DIP
8:  INDEX_FINGER_TIP
9:  MIDDLE_FINGER_MCP  ← Used for orientation
10: MIDDLE_FINGER_PIP
11: MIDDLE_FINGER_DIP
12: MIDDLE_FINGER_TIP
13: RING_FINGER_MCP
14: RING_FINGER_PIP
15: RING_FINGER_DIP
16: RING_FINGER_TIP
17: PINKY_MCP
18: PINKY_PIP
19: PINKY_DIP
20: PINKY_TIP
```

**Key landmarks for this project:**

- **0 (WRIST):** Hand base position
- **5 (INDEX_MCP):** For orientation vector
- **9 (MIDDLE_MCP):** For orientation vector

---

## Appendix B: Math Formulas

### Distance Formula (3D)

```
distance = √[(x₂-x₁)² + (y₂-y₁)² + (z₂-z₁)²]
```

### Midpoint Formula (3D)

```
midpoint = ((x₁+x₂)/2, (y₁+y₂)/2, (z₁+z₂)/2)
```

### Cross Product (for palm normal)

```
a × b = (a.y*b.z - a.z*b.y, a.z*b.x - a.x*b.z, a.x*b.y - a.y*b.x)
```

### Smooth Step (ease-in-out)

```
smoothstep(x) = x² * (3 - 2x)
```

### Exponential Moving Average

```
value_new = value_current + (value_target - value_current) * α
where α = smoothing factor (0-1)
```

---

**END OF DESIGN DOCUMENT**

---

**Document Version:** 2.0  
**Last Updated:** December 6, 2025  
**Author:** AI Assistant  
**Review Status:** ✅ Ready for Implementation

**Changelog v2.0:**

- Updated MediaPipe from legacy `@mediapipe/hands` to modern `@mediapipe/tasks-vision` Tasks Vision API
- Changed Three.js renderer approach from WebGPU to WebGL for broad browser compatibility
- Fixed hand rotation calculation with Gram-Schmidt orthogonalization
- Updated browser compatibility table with accurate requirements
- Added quaternion double-cover handling for rotation averaging
- Added grace period for galaxy visibility when hands temporarily lost
- Updated all code examples to use `HandLandmarkerResult` type
- Added feature detection code for browser support checking
