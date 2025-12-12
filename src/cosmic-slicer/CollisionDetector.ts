/**
 * CollisionDetector Module
 * Precise 2D screen-space collision detection
 *
 * Accuracy improvements:
 * - Smaller collision radius (must actually touch object)
 * - Only check very recent trail segments (last 3 points)
 * - Conservative distance scaling
 */

import * as THREE from 'three';
import type { TrailPoint2D } from './HandTrailRenderer';
import type { CosmicObjectInstance } from './types';

/**
 * Collision event data
 */
export interface CollisionEvent {
  object: CosmicObjectInstance;
  screenPosition: { x: number; y: number };
  handId: string;
  velocity: number;
}

/**
 * CollisionDetector - Precise screen-space collision
 */
export class CollisionDetector {
  private camera: THREE.PerspectiveCamera;
  private screenWidth: number;
  private screenHeight: number;

  // Base collision radius in pixels (smaller = more precise)
  private baseRadius: number = 25;

  // Cooldown to prevent double-hits
  private collisionCooldown: number = 200;
  private lastCollisionTimes: Map<number, number> = new Map();

  constructor(
    camera: THREE.PerspectiveCamera,
    screenWidth: number,
    screenHeight: number
  ) {
    this.camera = camera;
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
  }

  setScreenSize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
  }

  setCollisionRadius(radius: number): void {
    this.baseRadius = radius;
  }

  /**
   * Project a 3D position to screen coordinates
   */
  private projectToScreen(
    position: THREE.Vector3
  ): { x: number; y: number; scale: number } | null {
    const vector = position.clone();
    vector.project(this.camera);

    // Behind camera
    if (vector.z > 1) return null;

    const x = ((vector.x + 1) / 2) * this.screenWidth;
    const y = ((1 - vector.y) / 2) * this.screenHeight;

    // Calculate visual scale based on distance
    // Objects at z=0 should have scale=1, further away smaller
    const distance = this.camera.position.distanceTo(position);
    const scale = Math.max(0.3, Math.min(1.5, 5 / distance));

    return { x, y, scale };
  }

  /**
   * Check for collisions between trails and objects
   */
  detectCollisions(
    trailSegments: Map<string, TrailPoint2D[]>,
    objects: CosmicObjectInstance[]
  ): CollisionEvent[] {
    const collisions: CollisionEvent[] = [];
    const currentTime = performance.now();

    for (const object of objects) {
      // Skip if on cooldown
      const lastHit = this.lastCollisionTimes.get(object.id);
      if (lastHit && currentTime - lastHit < this.collisionCooldown) {
        continue;
      }

      // Project object to screen
      const screenPos = this.projectToScreen(object.position);
      if (!screenPos) continue;

      // Calculate collision radius - must be very precise
      // Only slightly larger than visual size
      const objectVisualRadius =
        this.baseRadius * screenPos.scale * object.config.scale * 1.2;

      // Check each hand's trail separately
      for (const [handId, points] of trailSegments) {
        if (points.length < 2) continue;

        // Only check the LAST 2 trail segments (most recent movement only)
        // This prevents old trail positions from triggering false hits
        const startIdx = Math.max(0, points.length - 3);

        for (let i = startIdx; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];

          // Only count very recent segments (within last 80ms)
          const segmentAge = currentTime - p2.timestamp;
          if (segmentAge > 80) continue;

          if (
            this.lineCircleIntersection(p1, p2, screenPos, objectVisualRadius)
          ) {
            const velocity = this.calculateVelocity(points, i);

            collisions.push({
              object,
              screenPosition: screenPos,
              handId,
              velocity,
            });

            this.lastCollisionTimes.set(object.id, currentTime);
            break;
          }
        }
      }
    }

    this.cleanupCooldowns(currentTime);
    return collisions;
  }

  /**
   * Check if a line segment intersects with a circle
   */
  private lineCircleIntersection(
    p1: TrailPoint2D,
    p2: TrailPoint2D,
    center: { x: number; y: number },
    radius: number
  ): boolean {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const fx = p1.x - center.x;
    const fy = p1.y - center.y;

    const a = dx * dx + dy * dy;
    if (a < 0.0001) {
      // Points are the same - check distance to center
      return Math.sqrt(fx * fx + fy * fy) < radius;
    }

    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;

    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) return false;

    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    // Must intersect within the segment (not extended line)
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
  }

  /**
   * Calculate velocity from trail points
   */
  private calculateVelocity(points: TrailPoint2D[], index: number): number {
    if (index < 0 || index >= points.length - 1) return 1;

    const p1 = points[index];
    const p2 = points[index + 1];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const timeDelta = Math.max(1, p2.timestamp - p1.timestamp) / 1000;

    return distance / timeDelta;
  }

  /**
   * Cleanup old cooldown entries
   */
  private cleanupCooldowns(currentTime: number): void {
    const expiredThreshold = currentTime - this.collisionCooldown * 2;

    for (const [id, time] of this.lastCollisionTimes) {
      if (time < expiredThreshold) {
        this.lastCollisionTimes.delete(id);
      }
    }
  }

  reset(): void {
    this.lastCollisionTimes.clear();
  }

  dispose(): void {
    this.lastCollisionTimes.clear();
    console.log('[CollisionDetector] Disposed');
  }
}
