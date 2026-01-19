/**
 * @fileoverview Floating holographic UI panels with technical readout styling.
 *
 * Creates decorative plane meshes positioned around the schematic that simulate
 * the floating holographic displays from Tony Stark's workshop. Includes animated
 * hover effects and corner bracket decorations.
 *
 * @module iron-man-workshop/components/WorkshopPanels
 */

import * as THREE from 'three';
import { createWorkshopMaterial } from '../materials/WorkshopMaterial';

export interface WorkshopPanelConfig {
  width: number;
  height: number;
  color: THREE.Color;
}

const DEFAULT_CONFIG: WorkshopPanelConfig = {
  width: 1.5,
  height: 1.0,
  color: new THREE.Color(0x00ffff),
};

/**
 * Creates a group of floating holographic UI panels.
 *
 * Panel layout:
 * - Left panel: Angled inward at -2.5 X
 * - Right panel: Angled inward at +2.5 X
 * - Top panel: Centered above, tilted down
 *
 * Each panel includes:
 * - Holographic shader material with scanlines
 * - Edge border lines
 * - Corner bracket decorations
 * - Float animation offset for organic movement
 *
 * @param config - Configuration options for panel appearance
 * @returns THREE.Group containing all panel meshes
 */
export function createWorkshopPanels(config: Partial<WorkshopPanelConfig> = {}): THREE.Group {
  const { width, height, color } = { ...DEFAULT_CONFIG, ...config };
  const group = new THREE.Group();

  // Create main panel
  const panelGeometry = new THREE.PlaneGeometry(width, height);
  const panelMaterial = createWorkshopMaterial({
    color,
    opacity: 0.15, // Reduced from 0.3 for better schematic visibility
    fresnelPower: 1.2,
    scanlineFrequency: 80,
    enableScanlines: true,
  });

  // Create multiple panels at different positions
  const panelPositions = [
    { x: -2.5, y: 0.5, z: 0, rotY: Math.PI * 0.15 },
    { x: 2.5, y: 0.5, z: 0, rotY: -Math.PI * 0.15 },
  ];

  panelPositions.forEach((pos, index) => {
    const panel = new THREE.Mesh(panelGeometry.clone(), panelMaterial.clone());
    panel.position.set(pos.x, pos.y, pos.z);
    panel.rotation.y = pos.rotY;

    // Add border frame
    const borderGeometry = new THREE.EdgesGeometry(panelGeometry);
    const borderMaterial = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    const border = new THREE.LineSegments(borderGeometry, borderMaterial);
    panel.add(border);

    // Add corner brackets
    addCornerBrackets(panel, width, height, color);

    // Store animation data
    panel.userData.floatOffset = index * Math.PI * 0.5;
    panel.userData.baseY = pos.y;

    group.add(panel);
  });

  return group;
}

/**
 * Adds decorative L-shaped corner brackets to a panel.
 *
 * Creates four corner bracket lines using additive blending for
 * the characteristic holographic UI aesthetic.
 *
 * @param panel - The panel mesh to attach brackets to
 * @param width - Panel width for bracket positioning
 * @param height - Panel height for bracket positioning
 * @param color - Bracket line color
 */
function addCornerBrackets(
  panel: THREE.Mesh,
  width: number,
  height: number,
  color: THREE.Color
): void {
  const bracketSize = 0.15;
  const bracketMaterial = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
  });

  const corners = [
    { x: -width / 2, y: height / 2, dx: 1, dy: -1 },
    { x: width / 2, y: height / 2, dx: -1, dy: -1 },
    { x: -width / 2, y: -height / 2, dx: 1, dy: 1 },
    { x: width / 2, y: -height / 2, dx: -1, dy: 1 },
  ];

  corners.forEach((corner) => {
    const points = [
      new THREE.Vector3(corner.x, corner.y + corner.dy * bracketSize, 0.01),
      new THREE.Vector3(corner.x, corner.y, 0.01),
      new THREE.Vector3(corner.x + corner.dx * bracketSize, corner.y, 0.01),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const bracket = new THREE.Line(geometry, bracketMaterial);
    panel.add(bracket);
  });
}

/**
 * Updates panel float animations and shader time uniforms.
 *
 * Applies gentle sinusoidal Y-axis oscillation based on stored
 * `userData.floatOffset` values for asynchronous movement.
 *
 * @param panels - The panel group created by {@link createWorkshopPanels}
 * @param time - Current animation time in seconds
 */
export function updateWorkshopPanels(panels: THREE.Group, time: number): void {
  panels.children.forEach((child) => {
    if (child instanceof THREE.Mesh) {
      // Gentle floating animation
      const offset = child.userData.floatOffset || 0;
      const baseY = child.userData.baseY || child.position.y;
      child.position.y = baseY + Math.sin(time * 0.5 + offset) * 0.05;

      // Update shader time
      if (child.material instanceof THREE.ShaderMaterial) {
        child.material.uniforms.uTime.value = time;
      }
    }
  });
}
