import * as THREE from 'three';
import { CosmicObjectFactory } from './CosmicObject';
import { CosmicAssetLibrary } from './CosmicAssetLibrary';
import { COSMIC_OBJECT_CONFIGS, CosmicObjectType } from './types';

export class HybridCosmicObjectFactory extends CosmicObjectFactory {
  private assets: CosmicAssetLibrary | null;

  constructor(assets: CosmicAssetLibrary | null) {
    super();
    this.assets = assets;
  }

  override createObject(type: CosmicObjectType): THREE.Group {
    const clone = this.assets?.getModelClone(type);
    if (!clone) {
      void this.assets?.loadType(type);
      return super.createObject(type);
    }

    const config = COSMIC_OBJECT_CONFIGS[type];

    const group = new THREE.Group();
    group.add(clone);

    group.scale.setScalar(config.scale);

    group.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );

    group.userData.cosmicType = type;
    group.userData.config = config;
    group.userData.rotationRoot = clone;
    group.userData.assetBacked = true;

    return group;
  }
}
