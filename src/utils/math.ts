/**
 * Math utility functions for vector operations and coordinate transformations
 */

import * as THREE from 'three';
import type { NormalizedLandmark } from '../modules/types/HandTypes';

/**
 * Calculate Euclidean distance between two 3D points
 */
export function distance3D(
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number }
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate midpoint between two 3D points
 */
export function midpoint3D(
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number }
): THREE.Vector3 {
  return new THREE.Vector3(
    (p1.x + p2.x) / 2,
    (p1.y + p2.y) / 2,
    (p1.z + p2.z) / 2
  );
}

/**
 * Convert normalized landmark coordinates to Three.js world space
 * MediaPipe normalized coordinates: x,y in [0,1], z is depth relative to wrist
 * Three.js world: centered at origin, scaled appropriately
 */
export function normalizedToWorld(
  landmark: NormalizedLandmark,
  scale: number = 10
): THREE.Vector3 {
  // Convert from [0,1] to [-0.5, 0.5] range, then scale
  // Flip Y because screen Y is inverted relative to 3D Y
  return new THREE.Vector3(
    (landmark.x - 0.5) * scale,
    -(landmark.y - 0.5) * scale,
    -landmark.z * scale // Z points toward camera in MediaPipe
  );
}

/**
 * Apply Gram-Schmidt orthogonalization to create orthonormal basis
 * This is critical for creating valid rotation matrices from hand landmarks
 * because landmark vectors are not guaranteed to be perpendicular
 *
 * @param forward - Primary direction vector (will be normalized)
 * @param right - Secondary direction vector (will be orthogonalized to forward)
 * @returns Orthonormal basis { forward, right, up }
 */
export function gramSchmidtOrthogonalize(
  rawForward: THREE.Vector3,
  rawRight: THREE.Vector3
): { forward: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3 } {
  // Step 1: Normalize forward vector
  const forward = rawForward.clone().normalize();

  // Step 2: Remove component of rawRight parallel to forward
  const rightProjection = forward.clone().multiplyScalar(forward.dot(rawRight));
  const right = rawRight.clone().sub(rightProjection).normalize();

  // Step 3: Compute up vector via cross product (guaranteed perpendicular)
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();

  // Step 4: Re-orthogonalize right for numerical stability
  right.crossVectors(up, forward).normalize();

  return { forward, right, up };
}

/**
 * Create rotation matrix from hand landmarks using Gram-Schmidt orthogonalization
 *
 * @param wrist - Wrist landmark position
 * @param indexMCP - Index finger MCP landmark position
 * @param middleMCP - Middle finger MCP landmark position
 * @returns THREE.Euler rotation angles
 */
export function calculateHandRotation(
  wrist: NormalizedLandmark,
  indexMCP: NormalizedLandmark,
  middleMCP: NormalizedLandmark
): THREE.Euler {
  // Create raw direction vectors from landmarks
  const rawForward = new THREE.Vector3(
    middleMCP.x - wrist.x,
    middleMCP.y - wrist.y,
    middleMCP.z - wrist.z
  );

  const rawRight = new THREE.Vector3(
    indexMCP.x - wrist.x,
    indexMCP.y - wrist.y,
    indexMCP.z - wrist.z
  );

  // Apply Gram-Schmidt to ensure orthonormal basis
  const { forward, right, up } = gramSchmidtOrthogonalize(rawForward, rawRight);

  // Create rotation matrix from orthonormal basis
  const matrix = new THREE.Matrix4();
  matrix.makeBasis(right, up, forward);

  // Extract Euler angles
  return new THREE.Euler().setFromRotationMatrix(matrix);
}

/**
 * Average two rotations using quaternion SLERP
 * Handles quaternion double-cover to ensure shortest path interpolation
 */
export function averageRotations(
  rot1: THREE.Euler,
  rot2: THREE.Euler,
  t: number = 0.5
): THREE.Euler {
  const quat1 = new THREE.Quaternion().setFromEuler(rot1);
  const quat2 = new THREE.Quaternion().setFromEuler(rot2);

  // Handle quaternion double-cover: ensure shortest path
  if (quat1.dot(quat2) < 0) {
    quat2.set(-quat2.x, -quat2.y, -quat2.z, -quat2.w);
  }

  // SLERP interpolation
  const avgQuat = quat1.clone().slerp(quat2, t);

  return new THREE.Euler().setFromQuaternion(avgQuat);
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Smooth step function (ease-in-out)
 * Creates smoother transitions than linear interpolation
 */
export function smoothStep(x: number): number {
  const clamped = clamp(x, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Smoother step function (Ken Perlin's improvement)
 * Even smoother acceleration/deceleration
 */
export function smootherStep(x: number): number {
  const clamped = clamp(x, 0, 1);
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

/**
 * Map a value from one range to another
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const normalized = (value - inMin) / (inMax - inMin);
  return outMin + normalized * (outMax - outMin);
}

/**
 * Map hand distance to galaxy scale with smooth curve
 *
 * @param distance - Distance between hands (normalized coordinates)
 * @param minDist - Minimum distance threshold (galaxy appears)
 * @param maxDist - Maximum distance threshold (galaxy at full size)
 * @returns Scale value 0-1
 */
export function mapDistanceToScale(
  distance: number,
  minDist: number = 0.05,
  maxDist: number = 0.3
): number {
  const clamped = clamp(distance, minDist, maxDist);
  const normalized = (clamped - minDist) / (maxDist - minDist);
  return smoothStep(normalized);
}
