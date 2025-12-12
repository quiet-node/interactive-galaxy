/**
 * CosmicObject Module
 * Visually STUNNING cosmic objects with dramatic effects
 *
 * Each object type has:
 * - Core mesh with custom shader
 * - Outer glow sprite halo (for stars/crystals)
 * - Dramatic HDR values for bloom
 */

import * as THREE from 'three';
import { CosmicObjectType, COSMIC_OBJECT_CONFIGS } from './types';

// ============== STAR: Blazing sun with corona ==============
const starVertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vLocalPos = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    
    // Pulsing effect
    float pulse = 1.0 + 0.05 * sin(uTime * 3.0);
    vec3 pos = position * pulse;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const starFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  
  varying vec3 vNormal;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  
  // Simple noise
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  
  void main() {
    // cameraPosition is world-space; use world-space position for correct fresnel/spec.
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(0.0, dot(viewDir, vNormal)), 2.0);
    
    // Animated plasma surface
    float n1 = noise(vLocalPos * 4.0 + uTime * 0.5);
    float n2 = noise(vLocalPos * 8.0 - uTime * 0.3);
    float plasma = n1 * 0.6 + n2 * 0.4;
    
    // Hot spots
    float spots = smoothstep(0.5, 0.7, noise(vLocalPos * 5.0 + uTime * 0.2));
    
    // Temperature colors (HDR - values > 1.0)
    vec3 white = vec3(4.0, 3.8, 3.5);   // Blazing white core
    vec3 yellow = vec3(3.0, 2.5, 1.0);  // Hot yellow
    vec3 orange = uColor * 2.0;          // Edge color
    
    vec3 color = mix(yellow, white, plasma * 0.5 + spots * 0.5);
    color = mix(color, orange, fresnel * 0.3);
    
    // Corona glow at edges
    float corona = pow(fresnel, 1.5) * 3.0;
    color += orange * corona;
    
    // Overall brightness
    color *= (1.5 + plasma * 0.5 + spots * 1.0);
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============== METEOR: Fiery rocky asteroid ==============
const meteorVertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying float vDisplacement;
  
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  
  void main() {
    // Rocky surface displacement
    float disp = noise(position * 3.0) * 0.25;
    disp -= noise(position * 6.0) * 0.1;
    vDisplacement = disp;
    
    vec3 displaced = position + normal * disp;
    
    vNormal = normalize(normalMatrix * normal);
    vLocalPos = position;
    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = worldPos.xyz;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const meteorFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uGlowColor;
  
  varying vec3 vNormal;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying float vDisplacement;
  
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.5));
    
    // Rock colors
    vec3 darkRock = vec3(0.15, 0.1, 0.08);
    vec3 lightRock = vec3(0.45, 0.35, 0.25);
    
    float rockPattern = noise(vLocalPos * 5.0);
    vec3 rockColor = mix(darkRock, lightRock, rockPattern);
    
    // Glowing cracks/lava veins
    float cracks = smoothstep(0.55, 0.6, noise(vLocalPos * 8.0 + uTime * 0.1));
    vec3 lavaColor = uGlowColor * 3.0; // HDR glow
    rockColor = mix(rockColor, lavaColor, cracks * 0.8);
    
    // Lighting
    float diffuse = max(0.0, dot(vNormal, lightDir)) * 0.7 + 0.3;
    
    // Atmospheric entry glow at edges
    float fresnel = pow(1.0 - max(0.0, dot(viewDir, vNormal)), 3.0);
    vec3 heatGlow = uGlowColor * fresnel * 1.5;
    
    vec3 color = rockColor * diffuse + heatGlow;
    color += lavaColor * cracks * 0.5; // Extra glow from cracks
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============== CRYSTAL: Glowing energy crystal ==============
const crystalVertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vLocalPos = position;
    
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const crystalFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uGlowColor;
  
  varying vec3 vNormal;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  
  void main() {
    // Strong fresnel for crystal edges
    float fresnel = pow(1.0 - abs(dot(vViewDir, vNormal)), 3.0);
    
    // Inner energy glow (animated)
    float innerGlow = sin(vLocalPos.y * 5.0 + uTime * 2.0) * 0.5 + 0.5;
    innerGlow *= sin(vLocalPos.x * 4.0 - uTime * 1.5) * 0.5 + 0.5;
    
    // Base crystal color (semi-transparent feel)
    vec3 crystalBase = uColor * 0.3;
    
    // Inner HDR glow
    vec3 inner = uGlowColor * innerGlow * 2.0;
    
    // Edge HDR glow (very bright for bloom)
    vec3 edge = uGlowColor * fresnel * 4.0;
    
    // Facet highlight
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
    vec3 reflectDir = reflect(-vViewDir, vNormal);
    float highlight = pow(max(0.0, dot(reflectDir, lightDir)), 80.0);
    
    vec3 color = crystalBase + inner + edge;
    color += vec3(3.0) * highlight; // Bright HDR highlight
    
    // Pulsing
    color *= 0.9 + 0.1 * sin(uTime * 2.5);
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============== DEBRIS: Metallic space junk ==============
const debrisVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldPos;
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const debrisFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uGlowColor;
  
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldPos;
  
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 lightDir = normalize(vec3(0.8, 0.5, 0.6));
    
    // Metallic colors
    vec3 darkMetal = vec3(0.2, 0.22, 0.25);
    vec3 lightMetal = vec3(0.55, 0.58, 0.6);
    
    float pattern = hash(vPosition * 10.0);
    vec3 metalColor = mix(darkMetal, lightMetal, pattern);
    
    // Tint with object color
    metalColor = mix(metalColor, uColor * 0.3, 0.3);
    
    // Lighting
    float diffuse = max(0.0, dot(vNormal, lightDir)) * 0.7 + 0.3;
    
    // Strong metallic specular
    vec3 reflectDir = reflect(-lightDir, vNormal);
    float spec = pow(max(0.0, dot(viewDir, reflectDir)), 50.0);
    
    // Fresnel rim
    float fresnel = pow(1.0 - max(0.0, dot(viewDir, vNormal)), 4.0);
    
    vec3 color = metalColor * diffuse;
    color += vec3(1.5) * spec; // HDR specular
    color += uGlowColor * fresnel * 0.5;
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============== GLOW SPRITE for halos ==============
const glowSpriteVertexShader = /* glsl */ `
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glowSpriteFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  
  varying vec2 vUv;
  
  void main() {
    vec2 center = vUv - 0.5;
    float dist = length(center);
    
    // Soft radial falloff
    float glow = 1.0 - smoothstep(0.0, 0.5, dist);
    glow = pow(glow, 2.0);
    
    // HDR color
    vec3 color = uColor * uIntensity * glow;
    float alpha = glow * 0.6;
    
    if (alpha < 0.01) discard;
    
    gl_FragColor = vec4(color, alpha);
  }
`;

// ============== GEOMETRY CACHE ==============
class GeometryCache {
  private static instance: GeometryCache | null = null;
  private geometries: Map<CosmicObjectType, THREE.BufferGeometry> = new Map();
  public glowPlane: THREE.PlaneGeometry | null = null;

  private constructor() {
    this.createGeometries();
  }

  static getInstance(): GeometryCache {
    if (!GeometryCache.instance) {
      GeometryCache.instance = new GeometryCache();
    }
    return GeometryCache.instance;
  }

  private createGeometries(): void {
    // Star - smooth sphere
    const star = new THREE.IcosahedronGeometry(1, 3);
    this.addSurfaceVariation(star, 0.06);
    star.computeVertexNormals();
    this.geometries.set(CosmicObjectType.STAR, star);

    // Meteor - rougher sphere
    const meteor = new THREE.IcosahedronGeometry(1, 3);
    this.addSurfaceVariation(meteor, 0.18);
    meteor.computeVertexNormals();
    this.geometries.set(CosmicObjectType.METEOR, meteor);

    // Crystal - elongated faceted geometry (slightly higher detail for a cleaner look)
    const crystal = new THREE.OctahedronGeometry(1, 1);
    const crystalPos = crystal.attributes.position;
    for (let i = 0; i < crystalPos.count; i++) {
      crystalPos.setY(i, crystalPos.getY(i) * 2.5);
    }
    this.addSurfaceVariation(crystal, 0.08);
    crystal.computeVertexNormals();
    this.geometries.set(CosmicObjectType.CRYSTAL, crystal);

    // Debris - angular shape
    const debris = new THREE.DodecahedronGeometry(1, 0);
    this.addSurfaceVariation(debris, 0.12);
    debris.computeVertexNormals();
    this.geometries.set(CosmicObjectType.DEBRIS, debris);

    // Glow plane for halos
    this.glowPlane = new THREE.PlaneGeometry(3, 3);
  }

  private addSurfaceVariation(
    geometry: THREE.BufferGeometry,
    magnitude: number
  ): void {
    const position = geometry.attributes.position as THREE.BufferAttribute;
    const dir = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const seed = x * 12.9898 + y * 78.233 + z * 37.719 + i * 0.25;
      const noise = Math.sin(seed) * 43758.5453;
      const rand = noise - Math.floor(noise);
      const direction = dir.set(x, y, z).normalize();
      const delta = (rand - 0.5) * 2 * magnitude;
      position.setXYZ(
        i,
        x + direction.x * delta,
        y + direction.y * delta,
        z + direction.z * delta
      );
    }
    position.needsUpdate = true;
  }

  getGeometry(type: CosmicObjectType): THREE.BufferGeometry {
    return this.geometries.get(type)!;
  }

  dispose(): void {
    for (const geometry of this.geometries.values()) {
      geometry.dispose();
    }
    this.glowPlane?.dispose();
    this.geometries.clear();
    GeometryCache.instance = null;
  }
}

// ============== FACTORY ==============
export class CosmicObjectFactory {
  private geometryCache: GeometryCache;
  private glowMaterials: Map<CosmicObjectType, THREE.ShaderMaterial> =
    new Map();

  constructor() {
    this.geometryCache = GeometryCache.getInstance();
    this.createGlowMaterials();
  }

  private createGlowMaterials(): void {
    // Pre-create glow materials for halo sprites
    for (const type of Object.values(CosmicObjectType)) {
      const config = COSMIC_OBJECT_CONFIGS[type as CosmicObjectType];
      const intensity = type === CosmicObjectType.STAR ? 3.6 : 2.4;

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: config.emissiveColor.clone() },
          uIntensity: { value: intensity },
        },
        vertexShader: glowSpriteVertexShader,
        fragmentShader: glowSpriteFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: true, // Respect depth for proper sorting
        depthWrite: false, // Don't write depth (for additive blending)
        side: THREE.DoubleSide,
        toneMapped: true,
      });

      this.glowMaterials.set(type as CosmicObjectType, material);
    }
  }

  createObject(type: CosmicObjectType): THREE.Group {
    const config = COSMIC_OBJECT_CONFIGS[type];
    const geometry = this.geometryCache.getGeometry(type);
    const material = this.createMaterial(type, config);

    // Core mesh with proper depth settings
    const core = new THREE.Mesh(geometry, material);
    core.renderOrder = 1; // Render after glow

    // Create group to hold core + glow
    const group = new THREE.Group();

    // Holographic shell for extra polish on emissive types
    if (type === CosmicObjectType.STAR || type === CosmicObjectType.CRYSTAL) {
      const shellMaterial = new THREE.MeshBasicMaterial({
        color: config.emissiveColor,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const shell = new THREE.Mesh(geometry, shellMaterial);
      shell.scale.setScalar(1.12);
      shell.renderOrder = 0.5;
      group.add(shell);
    }

    // Add glow halo for stars and crystals (render first, behind core)
    if (type === CosmicObjectType.STAR || type === CosmicObjectType.CRYSTAL) {
      const glowMaterial = this.glowMaterials.get(type)?.clone();
      if (glowMaterial && this.geometryCache.glowPlane) {
        const glow = new THREE.Mesh(this.geometryCache.glowPlane, glowMaterial);
        glow.scale.setScalar(type === CosmicObjectType.STAR ? 2.5 : 1.8);
        glow.renderOrder = 0; // Render before core
        group.add(glow);

        // Store reference for billboard update
        group.userData.glowSprite = glow;
      }
    }

    // Add core mesh (renders on top of glow)
    group.add(core);

    group.scale.setScalar(config.scale);

    group.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );

    group.userData.cosmicType = type;
    group.userData.config = config;
    group.userData.coreMesh = core;

    return group;
  }

  private createMaterial(
    type: CosmicObjectType,
    config: { color: THREE.Color; emissiveColor: THREE.Color }
  ): THREE.ShaderMaterial {
    let vertexShader: string;
    let fragmentShader: string;

    switch (type) {
      case CosmicObjectType.STAR:
        vertexShader = starVertexShader;
        fragmentShader = starFragmentShader;
        break;
      case CosmicObjectType.METEOR:
        vertexShader = meteorVertexShader;
        fragmentShader = meteorFragmentShader;
        break;
      case CosmicObjectType.CRYSTAL:
        vertexShader = crystalVertexShader;
        fragmentShader = crystalFragmentShader;
        break;
      case CosmicObjectType.DEBRIS:
        vertexShader = debrisVertexShader;
        fragmentShader = debrisFragmentShader;
        break;
      default:
        vertexShader = starVertexShader;
        fragmentShader = starFragmentShader;
    }

    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: Math.random() * 100 },
        uColor: { value: config.color.clone() },
        uGlowColor: { value: config.emissiveColor.clone() },
      },
      vertexShader,
      fragmentShader,
      side: THREE.FrontSide,
      depthTest: true,
      depthWrite: true,
      transparent: false, // Opaque core for proper depth sorting
    });
  }

  static updateObjectTime(
    object: THREE.Object3D,
    time: number,
    camera?: THREE.Camera
  ): void {
    // Update core mesh shader time
    const coreMesh = object.userData.coreMesh as THREE.Mesh | undefined;
    if (coreMesh) {
      const material = coreMesh.material as THREE.ShaderMaterial;
      if (material.uniforms?.uTime) {
        material.uniforms.uTime.value = time;
      }
    }

    // Billboard the glow sprite toward camera
    const glowSprite = object.userData.glowSprite as THREE.Mesh | undefined;
    if (glowSprite && camera) {
      glowSprite.quaternion.copy(camera.quaternion);
    }
  }

  static getRandomType(): CosmicObjectType {
    const rand = Math.random();
    if (rand < 0.2) return CosmicObjectType.STAR;
    if (rand < 0.5) return CosmicObjectType.METEOR;
    if (rand < 0.8) return CosmicObjectType.CRYSTAL;
    return CosmicObjectType.DEBRIS;
  }

  dispose(): void {
    for (const material of this.glowMaterials.values()) {
      material.dispose();
    }
    this.glowMaterials.clear();
    console.log('[CosmicObjectFactory] Disposed');
  }
}
