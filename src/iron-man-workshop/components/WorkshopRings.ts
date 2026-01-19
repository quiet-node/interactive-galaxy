/**
 * @fileoverview Animated holographic ring arcs for the workshop environment.
 *
 * Creates decorative rotating ring segments and torus elements that orbit
 * around the schematic model, enhancing the Tony Stark workshop aesthetic.
 *
 * @module iron-man-workshop/components/WorkshopRings
 */

import * as THREE from 'three';
import { createWorkshopMaterial } from '../materials/WorkshopMaterial';

/**
 * Configuration options for workshop ring appearance.
 */
export interface WorkshopRingsConfig {
  /** Inner radius of the arc segments */
  innerRadius: number;
  /** Outer radius of the arc segments */
  outerRadius: number;
  /** Number of segments for arc smoothness */
  thetaSegments: number;
  /** Holographic color for the rings */
  color: THREE.Color;
}

const DEFAULT_CONFIG: WorkshopRingsConfig = {
  innerRadius: 1.5,
  outerRadius: 1.7,
  thetaSegments: 64,
  color: new THREE.Color(0x00ffff),
};

/**
 * Creates a group of animated holographic ring arcs.
 *
 * Ring structure:
 * - 3 outer arc segments at 120° intervals, rotating on alternating axes
 * - 1 inner torus ring rotating on the X axis
 *
 * Each ring has different rotation speeds and opacity levels for visual depth.
 *
 * @param config - Configuration options for ring appearance
 * @returns THREE.Group containing all ring meshes with rotation metadata
 */
export function createWorkshopRings(config: Partial<WorkshopRingsConfig> = {}): THREE.Group {
  const { innerRadius, outerRadius, thetaSegments, color } = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  const group = new THREE.Group();

  // Create multiple arc segments at different angles
  const arcCount = 3;
  for (let i = 0; i < arcCount; i++) {
    const arcAngle = Math.PI * 0.6; // 108 degrees arc
    const startAngle = (i * Math.PI * 2) / arcCount;

    const arcGeometry = new THREE.RingGeometry(
      innerRadius + i * 0.3,
      outerRadius + i * 0.3,
      thetaSegments,
      1,
      startAngle,
      arcAngle
    );

    const material = createWorkshopMaterial({
      color,
      opacity: 0.5 - i * 0.1,
      fresnelPower: 1.5,
      enableScanlines: false,
    });

    const arc = new THREE.Mesh(arcGeometry, material);
    arc.userData.rotationSpeed = 0.3 + i * 0.1;
    arc.userData.rotationAxis = i % 2 === 0 ? 'y' : 'z';
    group.add(arc);
  }

  // Add inner decorative ring
  const innerRingGeometry = new THREE.TorusGeometry(innerRadius * 0.8, 0.02, 8, 64);
  const innerMaterial = createWorkshopMaterial({
    color,
    opacity: 0.7,
    enableScanlines: false,
  });
  const innerRing = new THREE.Mesh(innerRingGeometry, innerMaterial);
  innerRing.userData.rotationSpeed = -0.5;
  innerRing.userData.rotationAxis = 'x';
  group.add(innerRing);

  return group;
}

/**
 * Updates ring rotation animations and shader time uniforms.
 *
 * Applies per-ring rotation based on stored `userData.rotationSpeed` and
 * `userData.rotationAxis` properties. Also updates shader time uniforms
 * for any animated material effects.
 *
 * @param rings - The ring group created by {@link createWorkshopRings}
 * @param deltaTime - Time since last frame in seconds
 * @param time - Current animation time in seconds (for shader uniforms)
 */
export function updateWorkshopRings(rings: THREE.Group, deltaTime: number, time: number): void {
  rings.children.forEach((child) => {
    if (child.userData.rotationSpeed) {
      const speed = child.userData.rotationSpeed * deltaTime;
      const axis = child.userData.rotationAxis || 'y';

      if (axis === 'y') {
        child.rotation.y += speed;
      } else if (axis === 'z') {
        child.rotation.z += speed;
      } else if (axis === 'x') {
        child.rotation.x += speed;
      }
    }

    // Update shader time uniform
    if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
      child.material.uniforms.uTime.value = time;
    }
  });
}
