/**
 * @fileoverview Holographic shader materials for the workshop environment.
 *
 * Provides custom Three.js ShaderMaterial implementations featuring fresnel-based
 * edge glow, animated scanlines, and subtle flicker effects. All materials use
 * additive blending for the characteristic holographic appearance.
 *
 * @module iron-man-workshop/materials/WorkshopMaterial
 */

import * as THREE from 'three';

/**
 * Configuration options for the holographic shader material.
 */
export interface WorkshopMaterialConfig {
  /** Primary hologram color */
  color: THREE.Color;
  /** Base opacity (0-1) */
  opacity: number;
  /** Fresnel exponent (higher = sharper edge glow falloff) */
  fresnelPower: number;
  /** Scanline density (lines per world unit) */
  scanlineFrequency: number;
  /** Scanline scroll speed */
  scanlineSpeed: number;
  /** Whether to render animated scanlines */
  enableScanlines: boolean;
}

const DEFAULT_CONFIG: WorkshopMaterialConfig = {
  color: new THREE.Color(0x00ffff),
  opacity: 0.6,
  fresnelPower: 2.0,
  scanlineFrequency: 100.0,
  scanlineSpeed: 2.0,
  enableScanlines: true,
};

/**
 * Vertex shader for holographic effect.
 *
 * Outputs:
 * - vNormal: View-space normal for fresnel calculation
 * - vViewPosition: View-space position for fresnel direction
 * - vWorldPosition: World-space position for scanline sampling
 * - vUv: UV coordinates (available for future texture effects)
 */
const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    
    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * Fragment shader for holographic effect.
 *
 * Visual layers:
 * 1. Base color with configurable opacity
 * 2. Fresnel edge glow (view-angle dependent intensity)
 * 3. Animated horizontal scanlines (world-space Y)
 * 4. Subtle high-frequency flicker
 */
const fragmentShader = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uFresnelPower;
  uniform float uTime;
  uniform float uScanlineFrequency;
  uniform float uScanlineSpeed;
  uniform bool uEnableScanlines;

  // Scan uniforms
  uniform float uScanY;
  uniform float uScanIntensity;
  uniform vec3 uScanColor;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    // Fresnel effect for edge glow
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), uFresnelPower);
    
    // Base color with fresnel
    vec3 color = uColor;
    float alpha = uOpacity;
    
    // Add fresnel glow to edges
    color += uColor * fresnel * 0.5;
    alpha += fresnel * 0.3;
    
    // Scanlines effect
    if (uEnableScanlines) {
      float scanline = sin(vWorldPosition.y * uScanlineFrequency + uTime * uScanlineSpeed) * 0.5 + 0.5;
      scanline = smoothstep(0.4, 0.6, scanline);
      alpha *= 0.7 + scanline * 0.3;
    }

    // Vertical Scan Beam Effect
    // Width of the beam
    float scanWidth = 0.15;
    // Calculate distance from scan plane
    float dist = abs(vWorldPosition.y - uScanY);
    // Gaussian falloff for beam
    float beam = exp(-(dist * dist) / (scanWidth * scanWidth * 0.1));
    
    // Add sharp beam core
    if (uScanIntensity > 0.0) {
        // Bright beam color
        vec3 beamColor = uScanColor * uScanIntensity * 2.0;
        // Add to base color (additive)
        color += beamColor * beam;
        // Boost alpha where beam is
        alpha += beam * uScanIntensity;
    }
    
    // Flickering effect (subtle)
    float flicker = sin(uTime * 30.0) * 0.02 + 1.0;
    alpha *= flicker;
    
    gl_FragColor = vec4(color, alpha * uOpacity);
  }
`;

/**
 * Creates a holographic ShaderMaterial with fresnel glow and scanlines.
 *
 * Material properties:
 * - Transparent with additive blending
 * - Double-sided rendering
 * - Depth write disabled for proper layering
 *
 * @param config - Configuration options for material appearance
 * @returns Configured THREE.ShaderMaterial instance
 *
 * @remarks
 * The `uColor` uniform is cloned from config to prevent shared state
 * between material instances.
 */
export function createWorkshopMaterial(
  config: Partial<WorkshopMaterialConfig> = {}
): THREE.ShaderMaterial {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return new THREE.ShaderMaterial({
    uniforms: {
      // Clone the color so each material has its own instance
      // This prevents mutation in one material from affecting others
      uColor: { value: finalConfig.color.clone() },
      uOpacity: { value: finalConfig.opacity },
      uFresnelPower: { value: finalConfig.fresnelPower },
      uTime: { value: 0 },
      uScanlineFrequency: { value: finalConfig.scanlineFrequency },
      uScanlineSpeed: { value: finalConfig.scanlineSpeed },
      uEnableScanlines: { value: finalConfig.enableScanlines },
      // Scan effect uniforms
      uScanY: { value: -10.0 }, // Start below the model
      uScanIntensity: { value: 0.0 },
      uScanColor: { value: new THREE.Color(0xffffff) }, // Cyan/White mix
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/**
 * Creates a wireframe material for holographic edges and outlines.
 *
 * Uses LineBasicMaterial with additive blending for glowing line effects.
 *
 * @param color - Line color (default: cyan)
 * @param opacity - Line opacity (default: 0.8)
 * @returns Configured THREE.LineBasicMaterial instance
 */
export function createWireframeMaterial(
  color: THREE.Color = new THREE.Color(0x00ffff),
  opacity: number = 0.8
): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
  });
}
