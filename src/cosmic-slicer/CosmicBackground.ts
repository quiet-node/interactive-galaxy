/**
 * CosmicBackground Module
 * Creates an immersive starfield background for the cosmic slicer
 *
 * Features:
 * - Thousands of procedurally generated stars
 * - Twinkling animation via shader
 * - Color variation for cosmic atmosphere
 * - GPU-accelerated rendering
 *
 * Based on GalaxyRenderer pattern but optimized for static background
 */

import * as THREE from 'three';
import {
  CosmicBackgroundConfig,
  DEFAULT_COSMIC_BACKGROUND_CONFIG,
} from './types';

// Vertex shader with twinkling
const backgroundVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aBrightness;
  attribute float aSeed;
  
  uniform float uTime;
  uniform float uSize;
  
  varying float vBrightness;
  varying float vTemperature;
  
  void main() {
    vTemperature = aSeed;
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    
    float twinkleSpeed = 0.95 + aSeed * 10.25;
    float twinklePhase = aSeed * 6.28318;
    float twinkle = 0.75 + 0.25 * sin(uTime * twinkleSpeed + twinklePhase);

    float slowTwinkle = 0.85 + 0.15 * sin(uTime * 0.28 + aSeed * 3.14159);
    twinkle *= slowTwinkle;

    float micro = 0.5 + 0.5 * sin(uTime * (twinkleSpeed * 2.2) + twinklePhase * 3.7);
    micro = pow(micro, 8.0);
    twinkle = clamp(twinkle + micro * 0.35, 0.0, 1.35);

    vBrightness = aBrightness * twinkle;

    float perspectiveSize = aSize * uSize * (300.0 / -mvPosition.z);
    perspectiveSize *= (0.9 + 0.95 * twinkle);
    gl_PointSize = clamp(perspectiveSize, 0.35, 3.6);
    
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment shader with cosmic colors
const backgroundFragmentShader = /* glsl */ `
  varying float vBrightness;
  varying float vTemperature;
  
  void main() {
    // Circular point with soft falloff
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    
    if (dist > 0.5) discard;
    
    float alpha = exp(-dist * dist * 8.0);
    float halo = exp(-dist * 2.0) * 0.95;
    alpha += halo;
    
    alpha *= vBrightness;
    
    if (alpha < 0.01) discard;
    
    // Color based on temperature (seed)
    vec3 starColor;
    
    if (vTemperature < 0.25) {
      // Blue-white stars
      starColor = mix(
        vec3(0.7, 0.85, 1.0),
        vec3(0.9, 0.95, 1.0),
        vTemperature * 4.0
      );
    } else if (vTemperature < 0.5) {
      // Purple-magenta
      starColor = mix(
        vec3(0.85, 0.75, 1.0),
        vec3(1.0, 0.7, 0.95),
        (vTemperature - 0.25) * 4.0
      );
    } else if (vTemperature < 0.75) {
      // Cyan-teal
      starColor = mix(
        vec3(0.6, 1.0, 1.0),
        vec3(0.8, 0.95, 1.0),
        (vTemperature - 0.5) * 4.0
      );
    } else {
      // Warm white
      starColor = mix(
        vec3(1.0, 0.95, 0.9),
        vec3(1.0, 0.9, 0.8),
        (vTemperature - 0.75) * 4.0
      );
    }
    
    starColor *= (1.0 + vBrightness * 0.65);
    
    gl_FragColor = vec4(starColor, alpha);
  }
`;

/**
 * CosmicBackground - Renders immersive starfield
 */
export class CosmicBackground {
  private scene: THREE.Scene;
  private config: CosmicBackgroundConfig;

  // Three.js objects
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private points: THREE.Points | null = null;

  // Uniforms
  private uniforms: {
    uTime: { value: number };
    uSize: { value: number };
  };

  constructor(
    scene: THREE.Scene,
    config: Partial<CosmicBackgroundConfig> = {}
  ) {
    this.scene = scene;
    this.config = { ...DEFAULT_COSMIC_BACKGROUND_CONFIG, ...config };

    this.uniforms = {
      uTime: { value: 0 },
      uSize: { value: this.config.starSize },
    };

    this.initialize();
  }

  /**
   * Initialize the starfield
   */
  private initialize(): void {
    this.geometry = new THREE.BufferGeometry();

    const { starCount, starSpread } = this.config;

    // Create typed arrays
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const brightnesses = new Float32Array(starCount);
    const seeds = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;

      // Distribute stars in a large sphere around the scene
      // Use spherical distribution for uniform coverage
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = starSpread * (0.3 + Math.random() * 0.7);

      positions[i3] = Math.sin(phi) * Math.cos(theta) * radius;
      positions[i3 + 1] = Math.sin(phi) * Math.sin(theta) * radius;
      positions[i3 + 2] = Math.cos(phi) * radius;

      // Varied sizes (mostly small, few larger)
      sizes[i] = 0.3 + Math.pow(Math.random(), 3) * 0.7;

      // Brightness variation
      brightnesses[i] = 0.3 + Math.random() * 0.7;

      // Random seed for animation
      seeds[i] = Math.random();
    }

    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute(
      'aBrightness',
      new THREE.BufferAttribute(brightnesses, 1)
    );
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: backgroundVertexShader,
      fragmentShader: backgroundFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -1; // Render behind everything

    this.scene.add(this.points);

    console.log(`[CosmicBackground] Initialized with ${starCount} stars`);
  }

  /**
   * Update animation time
   */
  update(deltaTime: number): void {
    this.uniforms.uTime.value += deltaTime * this.config.twinkleSpeed;
    if (this.points) {
      this.points.rotation.y += deltaTime * 0.03;
      this.points.rotation.x += deltaTime * 0.03;
    }
  }

  /**
   * Set star size
   */
  setStarSize(size: number): void {
    this.config.starSize = size;
    this.uniforms.uSize.value = size;
  }

  /**
   * Set twinkle speed
   */
  setTwinkleSpeed(speed: number): void {
    this.config.twinkleSpeed = speed;
  }

  /**
   * Show the background
   */
  show(): void {
    if (this.points) {
      this.points.visible = true;
    }
  }

  /**
   * Hide the background
   */
  hide(): void {
    if (this.points) {
      this.points.visible = false;
    }
  }

  /**
   * Check visibility
   */
  isVisible(): boolean {
    return this.points?.visible ?? false;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.points) {
      this.scene.remove(this.points);
    }
    this.geometry?.dispose();
    this.material?.dispose();

    this.geometry = null;
    this.material = null;
    this.points = null;

    console.log('[CosmicBackground] Disposed');
  }
}
