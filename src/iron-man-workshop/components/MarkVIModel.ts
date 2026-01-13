/**
 * @fileoverview GLB model loader with holographic shader application and BVH acceleration.
 *
 * Loads the articulated Mark VI suit model, applies holographic shader materials,
 * generates wireframe edge geometry, and attaches hit volumes for raycasting.
 * Uses three-mesh-bvh for 10-100x faster raycasting performance.
 *
 * @module iron-man-workshop/components/MarkVIModel
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from 'three-mesh-bvh';
import { createWorkshopMaterial } from '../materials/WorkshopMaterial';

// Register BVH extension methods on Three.js prototypes (once at module load)
// This enables accelerated raycasting for all meshes that have a boundsTree
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Import articulated GLB model with properly separated limbs
import modelUrl from '../assets/mark-vi-articulated.glb?url';

export interface MarkVIModelConfig {
  /** Primary hologram color */
  color: THREE.Color;
  /** Scale multiplier for the model */
  scale: number;
}

const DEFAULT_CONFIG: MarkVIModelConfig = {
  color: new THREE.Color(0x00ff88),
  scale: 1.0,
};

export interface MarkVIModelResult {
  /** The Three.js group containing the loaded model */
  group: THREE.Group;
  /** Promise that resolves when the model is fully loaded */
  loadPromise: Promise<void>;
}

/**
 * Loads and configures the holographic Mark VI suit model.
 *
 * Processing pipeline:
 * 1. Load compressed GLB via meshopt decoder (90% smaller assets)
 * 2. Apply holographic shader material to all meshes
 * 3. Generate structural wireframe edges (20° angle threshold)
 * 4. Compute BVH bounds trees for accelerated raycasting
 * 5. Attach invisible hit volumes to articulated limbs
 * 6. Center model at origin
 *
 * @param config - Configuration options for hologram appearance and scale
 * @returns Object containing the Three.js group (can be added to scene immediately)
 *          and a promise that resolves when loading completes
 *
 * @example
 * ```typescript
 * const { group, loadPromise } = loadMarkVIModel({
 *   color: new THREE.Color(0x00ff88),
 *   scale: 15,
 * });
 * scene.add(group);
 * await loadPromise;
 * ```
 */
export function loadMarkVIModel(
  config: Partial<MarkVIModelConfig> = {}
): MarkVIModelResult {
  const { color, scale } = { ...DEFAULT_CONFIG, ...config };
  const group = new THREE.Group();
  group.scale.setScalar(scale);

  const loadPromise = new Promise<void>((resolve, reject) => {
    const loader = new GLTFLoader();
    // Enable meshopt decompression for the compressed GLB
    loader.setMeshoptDecoder(MeshoptDecoder);

    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;

        // List of specific mesh names to attach hit volumes to
        const articulatedLimbs = [
          'head',
          'torso',
          'arm_left',
          'arm_right',
          'leg_left',
          'leg_right',
        ];

        // Store all hit volumes for efficient raycasting
        const hitVolumes: THREE.Mesh[] = [];

        // Create material for wireframe rendering
        const edgeMaterial = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
        });

        // Hit volume material (invisible)
        const hitMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        });

        // Apply holographic material to all meshes and compute BVH for raycasting
        const limbMeshes: THREE.Mesh[] = [];

        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // Store original material info for potential restoration
            child.userData.originalMaterial = child.material;

            // Apply holographic shader material for background volume
            child.material = createWorkshopMaterial({
              color,
              opacity: 0.1,
              fresnelPower: 2.5,
              scanlineFrequency: 60,
              enableScanlines: true,
            });

            // Generate wireframe geometry based on edge angle threshold
            // 20° threshold filters for structural edges while ignoring smooth curvature
            const edges = new THREE.EdgesGeometry(child.geometry, 20);
            const wireframe = new THREE.LineSegments(
              edges,
              edgeMaterial.clone()
            );
            child.add(wireframe);

            // Compute BVH for accelerated raycasting (10-100x faster)
            // This is a one-time cost at load time
            child.geometry.computeBoundsTree();

            // Check if this is one of our articulated limbs
            if (articulatedLimbs.includes(child.name)) {
              limbMeshes.push(child);
            }
          }
        });

        // Create hit volumes for identified limbs
        // Done in a separate pass to ensure they don't get wireframes or holographic materials
        // if the traversal loop were to inadvertently visit them.
        limbMeshes.forEach((limb) => {
          // Create a simplified hit volume for this limb
          // Using a Box3 to approximate the bounding volume
          limb.geometry.computeBoundingBox();
          const bbox = limb.geometry.boundingBox!;
          const size = new THREE.Vector3();
          bbox.getSize(size);

          // Inflate slightly to make grabbing easier
          size.multiplyScalar(1.2);

          // For arms and legs, a capsule or cylinder might be better, but a box is efficient
          // and sufficient for general grabbing.
          const hitGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
          const hitVolume = new THREE.Mesh(hitGeometry, hitMaterial.clone());

          // Center the hit volume
          const center = new THREE.Vector3();
          bbox.getCenter(center);
          hitVolume.position.copy(center);

          hitVolume.userData = {
            isHitVolume: true,
            limbType: limb.name,
          };

          // Parent to the limb so it moves with it
          limb.add(hitVolume);
          hitVolumes.push(hitVolume);

          console.log(`[MarkVIModel] Attached hit volume to ${limb.name}`);
        });

        // Center the model at origin
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        // Add the model to our group
        group.add(model);

        // Store reference to hit volumes on the group for easy access
        group.userData.hitVolumes = hitVolumes;

        // Fallback: If no specific limbs were found (e.g. naming mismatch),
        // create a global hit volume like before to prevent breakage.
        if (hitVolumes.length === 0) {
          console.warn(
            '[MarkVIModel] No named limbs found. Creating fallback global hit volume.'
          );
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const hitGeometry = new THREE.SphereGeometry(maxDim * 0.6, 8, 8);
          const hitVolume = new THREE.Mesh(hitGeometry, hitMaterial);
          hitVolume.userData = { isHitVolume: true, limbType: 'torso' }; // Default to torso/body
          group.add(hitVolume);
          group.userData.hitVolumes = [hitVolume];
        }

        console.log('[MarkVIModel] GLB model loaded successfully');
        resolve();
      },
      (progress) => {
        // Loading progress callback
        if (progress.lengthComputable) {
          const percent = (progress.loaded / progress.total) * 100;
          console.log(`[MarkVIModel] Loading: ${percent.toFixed(1)}%`);
        }
      },
      (error) => {
        console.error('[MarkVIModel] Failed to load GLB model:', error);
        reject(error);
      }
    );
  });

  return { group, loadPromise };
}

/**
 * Type alias for meshes using the holographic shader material.
 */
export type ShaderMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

/**
 * Updates shader time uniforms using a pre-cached mesh array.
 *
 * This is the performance-optimized update path that avoids expensive
 * `Object3D.traverse()` calls every frame. The mesh array should be
 * populated once after model load via traversal.
 *
 * @param cachedMeshes - Pre-cached array of shader meshes
 * @param time - Current animation time in seconds
 */
export function updateMarkVIModelCached(
  cachedMeshes: ShaderMesh[],
  time: number
): void {
  for (const mesh of cachedMeshes) {
    mesh.material.uniforms.uTime.value = time;
  }
}

/**
 * Updates shader time uniforms by traversing the scene graph.
 *
 * @deprecated Use {@link updateMarkVIModelCached} with pre-cached meshes for better performance.
 *             This function traverses the entire model hierarchy every frame, causing
 *             unnecessary overhead in the hot path.
 *
 * @param model - The hologram model group
 * @param time - Current animation time in seconds
 */
export function updateMarkVIModel(model: THREE.Group, time: number): void {
  model.traverse((child) => {
    if (
      child instanceof THREE.Mesh &&
      child.material instanceof THREE.ShaderMaterial
    ) {
      child.material.uniforms.uTime.value = time;
    }
  });
}
