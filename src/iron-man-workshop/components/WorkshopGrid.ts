/**
 * @fileoverview Holographic floor grid for the workshop environment.
 *
 * Creates a glowing grid floor effect inspired by Tony Stark's workshop,
 * consisting of a standard grid helper with custom wireframe material
 * and a decorative outer ring.
 *
 * @module iron-man-workshop/components/WorkshopGrid
 */

import * as THREE from 'three';
import { createWireframeMaterial } from '../materials/WorkshopMaterial';

/**
 * Configuration options for the workshop grid appearance.
 */
export interface WorkshopGridConfig {
  /** Overall grid size (width and depth) */
  size: number;
  /** Number of grid divisions */
  divisions: number;
  /** Grid line color */
  color: THREE.Color;
  /** Grid line opacity */
  opacity: number;
}

const DEFAULT_CONFIG: WorkshopGridConfig = {
  size: 10,
  divisions: 20,
  color: new THREE.Color(0x00ffff),
  opacity: 0.3,
};

/**
 * Creates a holographic floor grid with outer ring decoration.
 *
 * Grid structure:
 * - THREE.GridHelper with custom additive wireframe material
 * - Outer ring geometry positioned at floor level
 *
 * @param config - Configuration options for grid appearance
 * @returns THREE.Group containing the grid and ring meshes
 */
export function createWorkshopGrid(
  config: Partial<WorkshopGridConfig> = {}
): THREE.Group {
  const { size, divisions, color, opacity } = { ...DEFAULT_CONFIG, ...config };
  const group = new THREE.Group();

  // Create grid lines
  const gridHelper = new THREE.GridHelper(size, divisions, color, color);
  gridHelper.material = createWireframeMaterial(color, opacity);
  gridHelper.position.y = -2;
  group.add(gridHelper);

  // Add outer ring
  const ringGeometry = new THREE.RingGeometry(size / 2 - 0.1, size / 2, 64);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: opacity * 1.5,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -1.99;
  group.add(ring);

  return group;
}
