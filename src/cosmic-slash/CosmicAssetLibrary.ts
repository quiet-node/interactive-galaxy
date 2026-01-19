import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { CosmicObjectType } from './types';

export interface CosmicAssetLibraryConfig {
  baseUrl: string;
  modelUrls: Partial<Record<CosmicObjectType, string>>;
  enableKtx2: boolean;
  ktx2TranscoderPath: string;
}

const DEFAULT_COSMIC_ASSET_LIBRARY_CONFIG: CosmicAssetLibraryConfig = {
  baseUrl: '/assets/cosmic-slash/models',
  modelUrls: {
    [CosmicObjectType.METEOR]: 'meteor.glb',
    [CosmicObjectType.CRYSTAL]: 'crystal.glb',
  },
  enableKtx2: false,
  ktx2TranscoderPath: '/basis/',
};

export class CosmicAssetLibrary {
  private renderer: THREE.WebGLRenderer;
  private config: CosmicAssetLibraryConfig;
  private loader: GLTFLoader;
  private ktx2Loader: KTX2Loader | null = null;

  private loadedRoots: Map<CosmicObjectType, THREE.Object3D> = new Map();
  private loading: Map<CosmicObjectType, Promise<void>> = new Map();

  constructor(renderer: THREE.WebGLRenderer, config: Partial<CosmicAssetLibraryConfig> = {}) {
    this.renderer = renderer;
    this.config = { ...DEFAULT_COSMIC_ASSET_LIBRARY_CONFIG, ...config };

    this.loader = new GLTFLoader();

    if (this.config.enableKtx2) {
      const ktx2Loader = new KTX2Loader();
      ktx2Loader.setTranscoderPath(this.config.ktx2TranscoderPath);
      ktx2Loader.detectSupport(this.renderer);
      this.loader.setKTX2Loader(ktx2Loader);
      this.ktx2Loader = ktx2Loader;
    }
  }

  preload(types: CosmicObjectType[]): void {
    for (const type of types) {
      void this.loadType(type);
    }
  }

  getModelClone(type: CosmicObjectType): THREE.Object3D | null {
    const root = this.loadedRoots.get(type);
    if (!root) return null;
    return root.clone(true);
  }

  loadType(type: CosmicObjectType): Promise<void> {
    if (this.loadedRoots.has(type)) {
      return Promise.resolve();
    }

    const inFlight = this.loading.get(type);
    if (inFlight) {
      return inFlight;
    }

    const url = this.getModelUrl(type);
    if (!url) {
      return Promise.resolve();
    }

    const task = this.loader
      .loadAsync(url)
      .then((gltf) => {
        this.loadedRoots.set(type, gltf.scene);
      })
      .catch((error) => {
        console.warn(`[CosmicAssetLibrary] Failed to load model for ${type}:`, error);
      })
      .finally(() => {
        this.loading.delete(type);
      });

    this.loading.set(type, task);
    return task;
  }

  dispose(): void {
    for (const root of this.loadedRoots.values()) {
      root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) {
            material.dispose();
          }
        }
      });
    }

    this.loadedRoots.clear();
    this.loading.clear();
    this.ktx2Loader?.dispose();
  }

  private getModelUrl(type: CosmicObjectType): string | null {
    const file = this.config.modelUrls[type];
    if (!file) return null;

    const base = this.config.baseUrl.endsWith('/')
      ? this.config.baseUrl.slice(0, -1)
      : this.config.baseUrl;

    return `${base}/${file}`;
  }
}
