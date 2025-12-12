import * as THREE from 'three';

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);

  const xf = x - xi;
  const yf = y - yi;

  const sxf = smoothstep(xf);
  const syf = smoothstep(yf);

  const h = (ix: number, iy: number) => {
    const n = ix * 374761393 + iy * 668265263 + seed * 69069;
    const t = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };

  const v00 = h(xi, yi);
  const v10 = h(xi + 1, yi);
  const v01 = h(xi, yi + 1);
  const v11 = h(xi + 1, yi + 1);

  const vx0 = lerp(v00, v10, sxf);
  const vx1 = lerp(v01, v11, sxf);
  return lerp(vx0, vx1, syf);
}

function fbm2D(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;

  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * freq, y * freq, seed + i * 1013) * amp;
    freq *= 2;
    amp *= 0.5;
  }

  return clamp01(sum);
}

export interface RockTextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  aoMap: THREE.Texture;
  emissiveMap: THREE.Texture;
}

export interface MetalTextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  aoMap: THREE.Texture;
  emissiveMap: THREE.Texture;
}

export function createCrystalMicroNormal(options?: {
  size?: number;
  seed?: number;
}): THREE.Texture {
  const size = options?.size ?? 256;
  const seed = options?.seed ?? 9001;

  const normal = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const h = fbm2D(u * 64, v * 64, seed, 5);
      height[y * size + x] = h;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const x1 = (x + 1) % size;
      const x0 = (x - 1 + size) % size;
      const y1 = (y + 1) % size;
      const y0 = (y - 1 + size) % size;

      const hL = height[y * size + x0];
      const hR = height[y * size + x1];
      const hD = height[y0 * size + x];
      const hU = height[y1 * size + x];

      const strength = 1.6;
      const dx = (hL - hR) * strength;
      const dy = (hD - hU) * strength;
      const dz = 1.0;

      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const nx = dx / len;
      const ny = dy / len;
      const nz = dz / len;

      const idx = (y * size + x) * 4;
      normal[idx + 0] = Math.floor((nx * 0.5 + 0.5) * 255);
      normal[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      normal[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      normal[idx + 3] = 255;
    }
  }

  return makeDataTextureRGBA(normal, size);
}

function makeDataTextureRGBA(
  data: Uint8Array,
  size: number,
  colorSpace?: THREE.ColorSpace
): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  if (colorSpace) tex.colorSpace = colorSpace;
  return tex;
}

function makeDataTextureR(data: Uint8Array, size: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return tex;
}

export function createRockTextures(options?: {
  size?: number;
  seed?: number;
}): RockTextureSet {
  const size = options?.size ?? 256;
  const seed = options?.seed ?? 1337;

  const base = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size);
  const ao = new Uint8Array(size * size);
  const emissive = new Uint8Array(size * size * 4);

  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;

      const n = fbm2D(u * 8, v * 8, seed, 5);
      const n2 = fbm2D(u * 24, v * 24, seed + 17, 3);
      const h = clamp01(n * 0.85 + n2 * 0.15);
      height[y * size + x] = h;

      const rock = h;
      const luminance = clamp01(0.55 + rock * 0.4);
      const r = luminance;
      const g = luminance;
      const b = luminance;

      const idx = (y * size + x) * 4;
      base[idx + 0] = Math.floor(r * 255);
      base[idx + 1] = Math.floor(g * 255);
      base[idx + 2] = Math.floor(b * 255);
      base[idx + 3] = 255;

      const roughV = clamp01(0.65 + (1 - h) * 0.35);
      rough[y * size + x] = Math.floor(roughV * 255);

      const aoV = clamp01(0.75 + h * 0.25);
      ao[y * size + x] = Math.floor(aoV * 255);

      const crackNoise = fbm2D(u * 18, v * 18, seed + 999, 4);
      const cracks = crackNoise > 0.78 ? 1 : 0;
      const e = cracks * (0.6 + 0.4 * fbm2D(u * 60, v * 60, seed + 123, 2));

      emissive[idx + 0] = Math.floor(e * 255);
      emissive[idx + 1] = Math.floor(e * 120);
      emissive[idx + 2] = Math.floor(e * 60);
      emissive[idx + 3] = 255;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const x1 = (x + 1) % size;
      const x0 = (x - 1 + size) % size;
      const y1 = (y + 1) % size;
      const y0 = (y - 1 + size) % size;

      const hL = height[y * size + x0];
      const hR = height[y * size + x1];
      const hD = height[y0 * size + x];
      const hU = height[y1 * size + x];

      const strength = 2.0;
      const dx = (hL - hR) * strength;
      const dy = (hD - hU) * strength;
      const dz = 1.0;

      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const nx = dx / len;
      const ny = dy / len;
      const nz = dz / len;

      const idx = (y * size + x) * 4;
      normal[idx + 0] = Math.floor((nx * 0.5 + 0.5) * 255);
      normal[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      normal[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      normal[idx + 3] = 255;
    }
  }

  return {
    map: makeDataTextureRGBA(base, size, THREE.SRGBColorSpace),
    normalMap: makeDataTextureRGBA(normal, size),
    roughnessMap: makeDataTextureR(rough, size),
    aoMap: makeDataTextureR(ao, size),
    emissiveMap: makeDataTextureRGBA(emissive, size),
  };
}

export function createMetalTextures(options?: {
  size?: number;
  seed?: number;
}): MetalTextureSet {
  const size = options?.size ?? 256;
  const seed = options?.seed ?? 4242;
  const rng = mulberry32(seed);

  const base = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size);
  const ao = new Uint8Array(size * size);
  const emissive = new Uint8Array(size * size * 4);

  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;

      const brushed = fbm2D(u * 40, v * 8, seed, 4);
      const dents = fbm2D(u * 10, v * 10, seed + 77, 4);
      const h = clamp01(brushed * 0.5 + dents * 0.5);
      height[y * size + x] = h;

      const tint = 0.65 + 0.2 * (rng() - 0.5);
      const c = clamp01(0.68 + h * 0.25) * tint;

      const idx = (y * size + x) * 4;
      base[idx + 0] = Math.floor(clamp01(c) * 255);
      base[idx + 1] = Math.floor(clamp01(c) * 255);
      base[idx + 2] = Math.floor(clamp01(c) * 255);
      base[idx + 3] = 255;

      const r = clamp01(0.12 + (1 - brushed) * 0.25 + dents * 0.25);
      rough[y * size + x] = Math.floor(r * 255);

      const aoV = clamp01(0.8 + dents * 0.2);
      ao[y * size + x] = Math.floor(aoV * 255);

      const spark = fbm2D(u * 55, v * 55, seed + 9999, 2) > 0.92 ? 1 : 0;
      const e = spark * (0.8 + 0.2 * fbm2D(u * 120, v * 120, seed + 9, 1));

      emissive[idx + 0] = Math.floor(e * 120);
      emissive[idx + 1] = Math.floor(e * 180);
      emissive[idx + 2] = Math.floor(e * 255);
      emissive[idx + 3] = 255;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const x1 = (x + 1) % size;
      const x0 = (x - 1 + size) % size;
      const y1 = (y + 1) % size;
      const y0 = (y - 1 + size) % size;

      const hL = height[y * size + x0];
      const hR = height[y * size + x1];
      const hD = height[y0 * size + x];
      const hU = height[y1 * size + x];

      const strength = 3.0;
      const dx = (hL - hR) * strength;
      const dy = (hD - hU) * strength;
      const dz = 1.0;

      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const nx = dx / len;
      const ny = dy / len;
      const nz = dz / len;

      const idx = (y * size + x) * 4;
      normal[idx + 0] = Math.floor((nx * 0.5 + 0.5) * 255);
      normal[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      normal[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      normal[idx + 3] = 255;
    }
  }

  return {
    map: makeDataTextureRGBA(base, size, THREE.SRGBColorSpace),
    normalMap: makeDataTextureRGBA(normal, size),
    roughnessMap: makeDataTextureR(rough, size),
    aoMap: makeDataTextureR(ao, size),
    emissiveMap: makeDataTextureRGBA(emissive, size),
  };
}
