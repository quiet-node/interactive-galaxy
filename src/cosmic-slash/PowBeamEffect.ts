import * as THREE from 'three';

export class PowBeamEffect {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh;
  private material: THREE.MeshStandardMaterial;
  private geometry: THREE.CylinderGeometry;
  private isVisible: boolean = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Create beam geometry (vertical by default, will rotate)
    // Radius top, radius bottom, height, segments
    this.geometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 16, 1, true);

    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x00ffff,
      emissiveIntensity: 4.0,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.visible = false;
    this.scene.add(this.mesh);
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.mesh.visible = visible;
  }

  public update(start: THREE.Vector3, end: THREE.Vector3, width: number): void {
    if (!this.isVisible) return;

    // Calculate midpoint
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    this.mesh.position.copy(mid);

    // Calculate distance
    const distance = start.distanceTo(end);
    this.mesh.scale.set(width, distance, width);

    // Orient cylinder to point from start to end
    this.mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3().subVectors(end, start).normalize()
    );

    // Pulse effect
    const time = Date.now() * 0.005;
    this.material.emissiveIntensity = 3.0 + Math.sin(time) * 1.0;
    const hue = (Date.now() * 0.001) % 1;
    this.material.emissive.setHSL(hue, 1, 0.5);
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }

  /**
   * Checks if a point collides with the beam (Capsule collision)
   */
  public checkCollision(
    point: THREE.Vector3,
    radius: number,
    start: THREE.Vector3,
    end: THREE.Vector3,
    beamRadius: number
  ): boolean {
    if (!this.isVisible) return false;

    // Vector from start to end
    const ab = new THREE.Vector3().subVectors(end, start);
    // Vector from start to point
    const ac = new THREE.Vector3().subVectors(point, start);

    // Project point onto line segment
    const t = Math.max(0, Math.min(1, ac.dot(ab) / ab.lengthSq()));

    // Closest point on segment
    const closest = new THREE.Vector3().copy(start).add(ab.multiplyScalar(t));

    // Distance check
    const distance = point.distanceTo(closest);

    return distance < beamRadius + radius;
  }
}
