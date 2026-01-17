import * as THREE from 'three';

/**
 * Sound names available in the audio system.
 */
export type SoundName =
  | 'ambientHum'
  | 'bootSequence'
  | 'flybyIn'
  | 'scanBeam'
  | 'energySurge'
  | 'pinchRotate'
  | 'leftHandRotate'
  | 'disassemble'
  | 'assemble'
  | 'loadingLoop'
  | 'hoverDetails'
  | 'rotateSchematic'
  | 'plasmaShot';

/**
 * Configuration for individual sounds.
 */
export interface SoundConfig {
  path: string;
  volume: number;
  loop?: boolean;
  /**
   * Reference distance for positional audio.
   * Distance at which the volume reduction begins to take effect.
   * Default: 1
   */
  refDistance?: number;
  /**
   * Maximum distance for positional audio.
   * Distance beyond which the volume is constant (rolloff factor dependent).
   * Default: 10
   */
  maxDistance?: number;
  /**
   * Optional duration in seconds to limit playback.
   * If specified, the sound will stop automatically after this duration.
   */
  duration?: number;
}

/**
 * A standard, robust audio manager using Three.js native Audio system.
 * Supports both global (ambient/UI) and spatial (3D) audio.
 */
export class ThreeAudioManager {
  private listener: THREE.AudioListener;
  private audioLoader: THREE.AudioLoader;
  private buffers: Map<SoundName, AudioBuffer> = new Map();
  private activeSounds: Set<THREE.Audio<AudioNode>> = new Set();
  // Track looped sounds to stop them later
  private loopMap: Map<string, THREE.Audio<AudioNode>> = new Map();

  private isEnabled: boolean = true;

  constructor(camera: THREE.Camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.audioLoader = new THREE.AudioLoader();
  }

  /**
   * Loads a set of sounds defined by a config map.
   */
  async loadSounds(configs: Record<SoundName, SoundConfig>): Promise<void> {
    const promises = Object.entries(configs).map(async ([name, config]) => {
      try {
        const buffer = await this.audioLoader.loadAsync(config.path);
        this.buffers.set(name as SoundName, buffer);
      } catch (error) {
        console.warn(
          `[ThreeAudioManager] Failed to load sound: ${name} (${config.path})`,
          error
        );
      }
    });

    await Promise.all(promises);
    console.log(
      `[ThreeAudioManager] Loaded ${this.buffers.size} audio buffers.`
    );
  }

  /**
   * Plays a sound.
   * If sourceMesh is provided, plays as PositionalAudio attached to that mesh.
   * Otherwise, plays as global Audio.
   *
   * @param name The name of the sound
   * @param config The sound configuration
   * @param sourceMesh Optional mesh to attach spatial audio to
   * @returns The created audio object, or null if failed
   */
  play(
    name: SoundName,
    config: SoundConfig,
    sourceMesh?: THREE.Object3D
  ): THREE.Audio<AudioNode> | null {
    if (!this.isEnabled) return null;

    const buffer = this.buffers.get(name);
    if (!buffer) {
      console.warn(`[ThreeAudioManager] Sound not loaded: ${name}`);
      return null;
    }

    // Identify if this is a spatial sound
    let sound: THREE.Audio<AudioNode>;

    if (sourceMesh) {
      const positionalSound = new THREE.PositionalAudio(this.listener);
      positionalSound.setRefDistance(config.refDistance ?? 2); // Default to 2 meters
      positionalSound.setMaxDistance(config.maxDistance ?? 15);
      // Linear gives a nice dropoff, but inverse is more realistic. Three uses inverse by default.
      // We can tune this model if needed.
      sourceMesh.add(positionalSound);
      sound = positionalSound;
    } else {
      sound = new THREE.Audio(this.listener);
    }

    sound.setBuffer(buffer);
    sound.setLoop(config.loop ?? false);
    sound.setVolume(config.volume);

    // Track active sounds for cleanup
    this.activeSounds.add(sound);

    // If it's a loop, store it so we can stop it by name/id
    if (config.loop) {
      // For loops, we map by name. If multiple of same name loop, this basic map overwrites.
      // For more complex cases, we'd return a unique ID.
      // Given the requirement, simple name mapping is usually sufficient for "servoWhir" etc.
      // But if we have multiple servos, we might want to track by mesh ID?
      // For now, map by name is consistent with previous API.
      this.loopMap.set(name, sound);
    }

    // Cleanup on end
    sound.onEnded = () => {
      this.cleanupSound(sound, sourceMesh);
    };

    if (sound.isPlaying) {
      sound.stop();
    }
    sound.play();

    // specific for duration
    if (config.duration) {
      setTimeout(() => {
        if (sound.isPlaying) {
          sound.stop();
        }
      }, config.duration * 1000);
    }

    return sound;
  }

  /**
   * Stops a looping sound by name.
   */
  stop(name: SoundName): void {
    const sound = this.loopMap.get(name);
    if (sound) {
      sound.stop();
      this.loopMap.delete(name);
      // Cleanup will trigger via onEnded if we stop?
      // Three.js onEnded is NOT triggered by .stop() usually.
      // So we manually clean up.
      this.cleanupSound(sound);
    }
  }

  /**
   * Stops all sounds.
   */
  stopAll(): void {
    this.activeSounds.forEach((sound) => {
      if (sound.isPlaying) sound.stop();
      this.cleanupSound(sound);
    });
    this.loopMap.clear();
  }

  /**
   * Helper to clean up audio nodes and remove from scene.
   */
  private cleanupSound(sound: THREE.Audio<AudioNode>, parent?: THREE.Object3D) {
    this.activeSounds.delete(sound);
    if (parent && sound instanceof THREE.PositionalAudio) {
      parent.remove(sound);
    }
    // Note: We do not disconnect/dispose nodes aggressively as Three.js reuses context,
    // but removing from parent is good for scene graph hygiene.
  }

  setMasterVolume(volume: number) {
    this.listener.setMasterVolume(volume);
  }

  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (!enabled) this.stopAll();
    this.setMasterVolume(enabled ? 1 : 0);
  }

  /**
   * Start ambient sound (special helper)
   */
  playAmbient(name: SoundName, config: SoundConfig) {
    // Ambients are always global
    this.play(name, config);
  }
}
