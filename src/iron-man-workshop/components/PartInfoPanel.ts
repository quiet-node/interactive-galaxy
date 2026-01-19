/**
 * @fileoverview Holographic information panel for displaying armor part specifications.
 *
 * Renders technical specs using dynamic canvas texture on a Three.js plane mesh.
 * Features smart screen-edge positioning, smoothed anchor tracking, and animated
 * connector line with elbow routing.
 *
 * @module iron-man-workshop/components/PartInfoPanel
 */

import * as THREE from 'three';
import gsap from 'gsap';
import { PartInfo, MARK_VI_PART_DATA } from '../data/PartData';

/**
 * Holographic information panel displaying armor part technical specifications.
 *
 * Architecture:
 * - **Canvas Texture**: Dynamically renders UI to 2D canvas, uploaded as GPU texture
 * - **Billboard Orientation**: Panel always faces camera for readability
 * - **Smart Positioning**: Detects screen edges and flips offset to stay visible
 * - **Anchor Smoothing**: Lerps position to reduce jitter from hand tracking noise
 * - **Connector Line**: Elbow-routed line connecting panel to the hovered part
 *
 * Visual design:
 * - Dark semi-transparent background for text contrast
 * - Cyan/blue holographic color scheme
 * - Tech accent corner decorations
 * - Subtle scanline overlay effect
 *
 * @example
 * ```typescript
 * const panel = new PartInfoPanel();
 * scene.add(panel.getObject());
 *
 * // Show when hovering a part
 * panel.show('arm_left', intersectionPoint);
 *
 * // In animation loop:
 * panel.update(time, camera);
 * ```
 */
export class PartInfoPanel {
  private container: THREE.Group;
  private panelMesh: THREE.Mesh;
  private connectorLine: THREE.Line;
  private texture: THREE.CanvasTexture;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;

  private currentTarget: string | null = null;
  private isVisible: boolean = false;

  // GSAP timeline for animation cleanup
  private animationTimeline: gsap.core.Timeline | null = null;

  // Stability - Smoothing for anchor point
  private targetAnchor: THREE.Vector3 = new THREE.Vector3();
  private smoothedAnchor: THREE.Vector3 = new THREE.Vector3();

  // Design constants
  private readonly WIDTH = 512;
  private readonly HEIGHT = 256;
  private readonly WORLD_WIDTH = 1.6; // Slightly wider for better text fit
  private readonly WORLD_HEIGHT = 0.8;
  // Colors - Enhanced for readability
  private readonly PRIMARY_COLOR = '#00ffff';
  private readonly SECONDARY_COLOR = '#0088ff';
  private readonly ALERT_COLOR = '#ff9900';
  private readonly PANEL_BG_COLOR = 'rgba(0, 15, 30, 0.95)'; // Darker, more opaque

  constructor() {
    this.container = new THREE.Group();
    this.container.visible = false;

    // Initialize Canvas for dynamic text
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.WIDTH;
    this.canvas.height = this.HEIGHT;
    this.context = this.canvas.getContext('2d', { alpha: true })!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.anisotropy = 16;

    // Create Panel Mesh
    const geometry = new THREE.PlaneGeometry(this.WORLD_WIDTH, this.WORLD_HEIGHT);
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false, // Ensure it renders on top of some things
      depthWrite: false,
      blending: THREE.NormalBlending, // Switch to Normal for better text readability over background
    });

    this.panelMesh = new THREE.Mesh(geometry, material);
    this.container.add(this.panelMesh);

    // Create Connector Line (from panel to part)
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -0.5, 0), // Default down
    ]);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    this.connectorLine = new THREE.Line(lineGeo, lineMat);
    this.container.add(this.connectorLine);
  }

  /**
   * Returns the container Group for scene integration.
   *
   * @returns The THREE.Group containing the panel mesh and connector line
   */
  getObject(): THREE.Object3D {
    return this.container;
  }

  /**
   * Shows the panel for a specific armor part.
   *
   * If already showing for the same part, updates only the anchor position.
   * If showing for a new part, redraws content and triggers enter animation.
   *
   * @param partName - Part identifier key (e.g., 'arm_left', 'head')
   * @param anchorPoint - World-space position to anchor the connector line
   */
  show(partName: string, anchorPoint: THREE.Vector3): void {
    // Update target for smoothing
    this.targetAnchor.copy(anchorPoint);

    // If switching targets or showing for the first time, snap to position immediately
    if (this.currentTarget !== partName || !this.isVisible) {
      this.smoothedAnchor.copy(anchorPoint);
    }

    if (this.currentTarget === partName && this.isVisible) {
      return;
    }

    this.currentTarget = partName;
    const data = MARK_VI_PART_DATA[partName] || MARK_VI_PART_DATA['unknown'];

    // Draw content to canvas
    this.drawContent(data);
    this.texture.needsUpdate = true;

    if (!this.isVisible) {
      this.isVisible = true;
      this.container.visible = true;

      // Reset for animation
      this.panelMesh.scale.set(0.1, 0.1, 1);
      (this.panelMesh.material as THREE.MeshBasicMaterial).opacity = 0;
      (this.connectorLine.material as THREE.LineBasicMaterial).opacity = 0;

      // Kill any existing animation to prevent stacking
      this.animationTimeline?.kill();

      // Animate In with GSAP
      this.animationTimeline = gsap.timeline();

      // 1. Line draws out
      this.animationTimeline.to(this.connectorLine.material, { opacity: 0.8, duration: 0.2 });

      // 2. Panel expands and fades in
      this.animationTimeline.to(
        [this.panelMesh.scale, this.panelMesh.material],
        {
          x: 1,
          y: 1,
          opacity: 1, // Full opacity for readability
          duration: 0.4,
          ease: 'back.out(1.7)',
        },
        '-=0.1'
      );
    }
  }

  /**
   * Updates panel position and connector line geometry.
   *
   * Uses camera projection to determine screen-space position of the anchor,
   * then flips the panel offset if too close to screen edges. Scales the panel
   * based on distance to maintain readability at varying depths.
   *
   * @param camera - Camera for projection and billboard orientation
   */
  private updatePosition(camera: THREE.Camera): void {
    // Determine screen position of the anchor
    const screenPos = this.smoothedAnchor.clone().project(camera);

    // Distance-based scaling to maintain readability
    // As parts get further away, we scale the panel up to compensate for perspective
    const distance = camera.position.distanceTo(this.smoothedAnchor);
    // Reference distance is 5.0 (default camera Z).
    // We allow it to scale down slightly if very close, but primarily scale up when far.
    const scaleFactor = distance / 5.0;
    // Clamp to reasonable values to prevent it getting microscopic or massive
    const finalScale = Math.max(0.6, Math.min(scaleFactor, 3.0));

    this.container.scale.setScalar(finalScale);

    // Base Offsets
    let offX = 1.0;
    let offY = 0.8;

    // Flip logic based on Normalized Device Coordinates (-1 to 1)
    // If we are high up (y > 0.3), flip down
    if (screenPos.y > 0.3) {
      offY = -0.8;
    }

    // If we are far right (x > 0.4), flip left
    if (screenPos.x > 0.4) {
      offX = -1.0;
    }

    // We keep the container at the anchor point
    this.container.position.copy(this.smoothedAnchor);

    // Set panel mesh position relative to container
    const OFFSET_Z = 0;
    this.panelMesh.position.set(offX, offY, OFFSET_Z);

    // Update connector line
    // The line needs to connect (0,0,0) -> Panel Edge
    // "Elbow" style logic

    // Determining connection points
    const panelBottomY = offY - this.WORLD_HEIGHT / 2;
    const panelTopY = offY + this.WORLD_HEIGHT / 2;

    // If panel is above (offY > 0), connect to bottom. If below, connect to top.
    const connectY = offY > 0 ? panelBottomY : panelTopY;

    // Direction signs
    const dirX = Math.sign(offX);
    const dirY = Math.sign(offY);

    const points = [
      new THREE.Vector3(0, 0, 0), // Origin (Anchor)
      new THREE.Vector3(0.15 * dirX, 0.15 * dirY, 0), // Small diagonal leader
      new THREE.Vector3(offX - 0.1 * dirX, 0.15 * dirY, 0), // Horizontal run
      new THREE.Vector3(offX, connectY, 0), // Vertical to panel edge
    ];
    this.connectorLine.geometry.setFromPoints(points);
  }

  /**
   * Hides the panel with a fade-out animation.
   *
   * Clears the current target and fades opacity to zero before hiding
   * the container. Safe to call when already hidden.
   */
  hide(): void {
    if (!this.isVisible) return;

    this.isVisible = false;
    this.currentTarget = null;

    // Kill any existing animation to prevent conflicts
    this.animationTimeline?.kill();

    // Animate Out
    gsap.to([this.panelMesh.material, this.connectorLine.material], {
      opacity: 0,
      duration: 0.3,
      overwrite: true,
      onComplete: () => {
        this.container.visible = false;
      },
    });
  }

  /**
   * Renders the holographic UI content to the canvas.
   *
   * Drawing layers:
   * 1. Rounded rectangle background with border
   * 2. Tech accent corner decorations
   * 3. Title and subtitle text
   * 4. Horizontal separator line
   * 5. Stat labels and values with status-based coloring
   * 6. Scanline overlay effect
   *
   * @param data - Part information containing title, subtitle, and stats array
   */
  private drawContent(data: PartInfo): void {
    const ctx = this.context;
    const w = this.WIDTH;
    const h = this.HEIGHT;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // -- Background Frame --
    ctx.fillStyle = this.PANEL_BG_COLOR;

    // Rounded corners
    const radius = 10;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(w - radius, 0);
    ctx.quadraticCurveTo(w, 0, w, radius);
    ctx.lineTo(w, h - radius);
    ctx.quadraticCurveTo(w, h, w - radius, h);
    ctx.lineTo(radius, h);
    ctx.quadraticCurveTo(0, h, 0, h - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    // Border
    ctx.strokeStyle = this.PRIMARY_COLOR;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Tech Accents (corners)
    ctx.fillStyle = this.PRIMARY_COLOR;
    ctx.fillRect(0, 0, 30, 6);
    ctx.fillRect(0, 0, 6, 30);

    ctx.fillRect(w - 30, h - 6, 30, 6);
    ctx.fillRect(w - 6, h - 30, 6, 30);

    // -- Content --

    // Title
    ctx.font = 'bold 36px "Segoe UI", "Courier New", monospace';
    ctx.fillStyle = this.PRIMARY_COLOR;
    ctx.fillText(data.title.toUpperCase(), 40, 60);

    // Subtitle
    ctx.font = '24px "Segoe UI", "Courier New", monospace';
    ctx.fillStyle = this.SECONDARY_COLOR;
    ctx.fillText(data.subtitle, 40, 95);

    // Separator
    ctx.beginPath();
    ctx.moveTo(40, 110);
    ctx.lineTo(w - 40, 110);
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Stats
    let y = 160;
    const xLabel = 40;
    const xValue = 300; // Align values

    data.stats.forEach((stat) => {
      // Label
      ctx.font = '22px "Consolas", "Courier New", monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; // Brighter text
      ctx.fillText(stat.label, xLabel, y);

      // Value
      ctx.font = 'bold 22px "Consolas", "Courier New", monospace';
      if (stat.status === 'optimal') ctx.fillStyle = '#00ff88';
      else if (stat.status === 'warning') ctx.fillStyle = this.ALERT_COLOR;
      else if (stat.status === 'critical') ctx.fillStyle = '#ff3333';
      else ctx.fillStyle = '#ffffff';

      ctx.fillText(stat.value, xValue, y);

      y += 40;
    });

    // Scanline effect (very subtle now)
    ctx.fillStyle = 'rgba(0, 255, 255, 0.02)';
    for (let i = 0; i < h; i += 4) {
      ctx.fillRect(0, i, w, 2);
    }
  }

  /**
   * Per-frame update for position smoothing and visual effects.
   *
   * Updates:
   * - Anchor position lerping for smooth tracking
   * - Panel position and connector line geometry
   * - Billboard orientation facing camera
   * - Connector line opacity pulse animation
   * - Random subtle flicker effect
   *
   * @param time - Current animation time in seconds
   * @param camera - Camera reference for billboard orientation and positioning
   */
  update(time: number, camera: THREE.Camera): void {
    if (!this.isVisible) return;

    // Smooth position interpolation
    // Lerp factor of 0.1 gives nice weight, 0.2 is snappier
    const LERP_FACTOR = 0.1;
    this.smoothedAnchor.lerp(this.targetAnchor, LERP_FACTOR);

    // Update visuals based on smoothed anchor
    // Pass camera for smart positioning (screen edge detection)
    this.updatePosition(camera);

    // Ensure panel matches camera rotation for perfect readability
    this.panelMesh.lookAt(camera.position);

    // Pulse border opacity instead of whole panel
    // We can't easily target border only on canvas texture, so we pulse the line
    if (this.connectorLine.material instanceof THREE.LineBasicMaterial) {
      this.connectorLine.material.opacity = 0.6 + Math.sin(time * 2) * 0.2;
    }

    // Very subtle flicker, much rarer
    if (Math.random() < 0.005) {
      (this.panelMesh.material as THREE.MeshBasicMaterial).opacity = 0.8;
      setTimeout(() => {
        if (this.panelMesh && this.panelMesh.material) {
          (this.panelMesh.material as THREE.MeshBasicMaterial).opacity = 1.0;
        }
      }, 50);
    }
  }
}
