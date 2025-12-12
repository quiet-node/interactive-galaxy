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
import {
  CosmicObjectType,
  COSMIC_OBJECT_CONFIGS,
  type CosmicObjectConfig,
} from './types';
import {
  createCrystalMicroNormal,
  createMetalTextures,
  createRockTextures,
} from './ProceduralTextures';

// ============== STAR: Premium blazing sun with dynamic corona ==============
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
    
    // Dynamic pulsing with noise-based variation
    float pulseBase = 1.0 + 0.08 * sin(uTime * 3.0);
    float pulseVariation = 0.03 * sin(vLocalPos.x * 10.0 + uTime * 2.0) * 
                           sin(vLocalPos.y * 10.0 - uTime * 1.5);
    float pulse = pulseBase + pulseVariation;
    
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
  
  // Enhanced noise for plasma turbulence
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
  
  // Turbulent plasma (multiple octaves)
  float turbulence(vec3 p) {
    float t = 0.0;
    float amp = 1.0;
    for (int i = 0; i < 4; i++) {
      t += abs(noise(p)) * amp;
      p *= 2.0;
      amp *= 0.5;
    }
    return t;
  }
  
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    
    // LAYER 1: Dynamic plasma surface (roiling energy)
    vec3 plasmaCoord = vLocalPos * 3.0 + vec3(uTime * 0.5, -uTime * 0.3, uTime * 0.4);
    float plasma1 = turbulence(plasmaCoord);
    float plasma2 = turbulence(plasmaCoord * 1.5 + vec3(uTime * 0.2));
    float plasmaPattern = plasma1 * 0.6 + plasma2 * 0.4;
    
    // LAYER 2: Solar flares (bright active regions)
    vec3 flareCoord = vLocalPos * 4.0 + vec3(0.0, uTime * 0.8, 0.0);
    float flares = smoothstep(0.6, 0.8, noise(flareCoord));
    flares += smoothstep(0.65, 0.85, noise(flareCoord * 2.0 - uTime * 0.5)) * 0.5;
    
    // LAYER 3: Temperature-based coloring (photosphere)
    // HDR values for extreme brightness
    vec3 coreWhite = vec3(9.0, 9.5, 10.0);      // Blazing white-blue core
    vec3 hotYellow = vec3(7.0, 6.5, 4.0);       // Hot yellow
    vec3 warmOrange = uColor * 4.5;              // Orange-red edges
    
    vec3 surfaceColor = mix(hotYellow, coreWhite, plasmaPattern * 0.5);
    surfaceColor = mix(surfaceColor, warmOrange, smoothstep(0.4, 0.7, plasmaPattern));
    
    // Add flare hotspots
    surfaceColor += coreWhite * flares * 0.8;
    
    // LAYER 4: Corona glow (atmospheric halo)
    float fresnel = pow(1.0 - max(0.0, dot(viewDir, vNormal)), 2.0);
    vec3 coronaColor = warmOrange * 1.2;
    vec3 coronaGlow = coronaColor * fresnel * 5.0; // Intense corona
    
    // LAYER 5: Chromosphere (mid-layer between surface and corona)
    float chromosphere = pow(fresnel, 1.5) * (1.0 - fresnel);
    vec3 chromosphereColor = mix(warmOrange, hotYellow, 0.5);
    vec3 chromosphereGlow = chromosphereColor * chromosphere * 6.0;
    
    // LAYER 6: Surface detail enhancement
    float surfaceDetail = noise(vLocalPos * 15.0 + uTime * 0.3);
    float granulation = smoothstep(0.45, 0.55, surfaceDetail) * 0.3;
    
    // Combine all layers
    vec3 finalColor = surfaceColor * (1.0 + granulation);
    finalColor += coronaGlow + chromosphereGlow;
    
    // LAYER 7: Energy pulses across surface
    float pulse = sin(uTime * 4.0 + plasmaPattern * 8.0) * 0.15 + 0.85;
    finalColor *= pulse;
    
    // LAYER 8: Sparkle effect (surface eruptions/prominences)
    float sparkles = pow(max(0.0, noise(vLocalPos * 30.0 + uTime * 2.0)), 20.0);
    finalColor += coreWhite * sparkles * 2.0;
    
    // Overall brightness boost for bloom
    finalColor *= 1.3;
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// ============== METEOR: Enhanced fiery asteroid with detail ==============
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
    // Enhanced rocky surface displacement with crater-like features
    float largeCraters = noise(position * 2.0) * 0.35;
    float mediumRoughness = noise(position * 5.0) * 0.18;
    float fineDetail = noise(position * 12.0) * 0.08;
    
    float disp = largeCraters - mediumRoughness + fineDetail;
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
    
    // Enhanced rock surface detail
    float rockDetail1 = noise(vLocalPos * 8.0);
    float rockDetail2 = noise(vLocalPos * 16.0);
    float rockDetail3 = noise(vLocalPos * 32.0);
    
    // Multi-layer rock coloring
    vec3 darkRock = vec3(0.12, 0.08, 0.06);    // Deep charcoal
    vec3 midRock = vec3(0.35, 0.25, 0.18);     // Medium brown
    vec3 lightRock = vec3(0.55, 0.42, 0.30);   // Light tan
    
    float rockMix1 = rockDetail1;
    float rockMix2 = rockDetail2 * 0.5 + 0.5;
    
    vec3 rockColor = mix(darkRock, midRock, rockMix1);
    rockColor = mix(rockColor, lightRock, rockMix2 * 0.4);
    
    // Add crater shadows (displacement-based)
    float craterShadow = smoothstep(-0.2, 0.1, vDisplacement);
    rockColor *= (0.5 + 0.5 * craterShadow);
    
    // Glowing lava cracks (more dramatic)
    vec3 crackCoord = vLocalPos * 6.0 + vec3(uTime * 0.15, 0.0, 0.0);
    float crackPattern = noise(crackCoord);
    crackPattern += noise(crackCoord * 2.0) * 0.5;
    
    // Sharp crack threshold for defined lava veins
    float cracks = smoothstep(0.68, 0.72, crackPattern);
    cracks += smoothstep(0.78, 0.82, noise(vLocalPos * 12.0 + uTime * 0.1)) * 0.5;
    
    // Animated lava pulse
    float lavaPulse = 0.8 + 0.2 * sin(uTime * 3.0 + crackPattern * 10.0);
    vec3 lavaColor = uGlowColor * (4.0 + sin(uTime * 2.0) * 0.5) * lavaPulse; // HDR lava
    
    rockColor = mix(rockColor, lavaColor, cracks * 0.85);
    
    // Lighting with rim light
    float diffuse = max(0.0, dot(vNormal, lightDir)) * 0.75 + 0.25;
    
    // Specular highlights on rough surface
    vec3 halfDir = normalize(lightDir + viewDir);
    float specular = pow(max(0.0, dot(vNormal, halfDir)), 20.0) * rockDetail3;
    
    // Atmospheric entry glow (heat shield effect)
    float fresnel = pow(1.0 - max(0.0, dot(viewDir, vNormal)), 4.0);
    vec3 heatGlow = uGlowColor * fresnel * 2.5;
    
    // Heat distortion on forward-facing surfaces
    float heatIntensity = max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0)));
    heatGlow += uGlowColor * heatIntensity * 1.2;
    
    vec3 color = rockColor * diffuse + heatGlow;
    color += vec3(1.0) * specular;
    color += lavaColor * cracks * 0.6; // Extra glow from cracks
    
    // Ember particles simulation (sparkle effect)
    float embers = pow(max(0.0, noise(vLocalPos * 40.0 + uTime * 4.0)), 15.0);
    color += uGlowColor * embers * 8.0;
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============== CRYSTAL: Premium multi-layered energy crystal ==============
const crystalVertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  varying float vVerticalPos;
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vLocalPos = position;
    
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    vVerticalPos = position.y;
    
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
  varying float vVerticalPos;
  
  // High-quality noise for energy veins
  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
  }
  
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    vec3 c000 = hash33(i + vec3(0.0, 0.0, 0.0));
    vec3 c100 = hash33(i + vec3(1.0, 0.0, 0.0));
    vec3 c010 = hash33(i + vec3(0.0, 1.0, 0.0));
    vec3 c110 = hash33(i + vec3(1.0, 1.0, 0.0));
    vec3 c001 = hash33(i + vec3(0.0, 0.0, 1.0));
    vec3 c101 = hash33(i + vec3(1.0, 0.0, 1.0));
    vec3 c011 = hash33(i + vec3(0.0, 1.0, 1.0));
    vec3 c111 = hash33(i + vec3(1.0, 1.0, 1.0));
    
    vec3 v00 = mix(c000, c100, f.x);
    vec3 v10 = mix(c010, c110, f.x);
    vec3 v01 = mix(c001, c101, f.x);
    vec3 v11 = mix(c011, c111, f.x);
    
    vec3 v0 = mix(v00, v10, f.y);
    vec3 v1 = mix(v01, v11, f.y);
    
    return mix(v0, v1, f.z).x;
  }
  
  void main() {
    // LAYER 1: Internal energy veins (animated)
    // Create flowing energy patterns that travel through the crystal
    float veinPattern = noise(vLocalPos * 3.0 + vec3(0.0, uTime * 0.4, 0.0));
    veinPattern += noise(vLocalPos * 6.0 - vec3(uTime * 0.3, 0.0, 0.0)) * 0.5;
    veinPattern = pow(max(0.0, veinPattern), 2.5);
    
    // Vertical energy flow (like electricity rising through crystal)
    float verticalFlow = sin(vVerticalPos * 8.0 - uTime * 3.0) * 0.5 + 0.5;
    verticalFlow *= sin(vVerticalPos * 4.0 + uTime * 2.0) * 0.5 + 0.5;
    
    vec3 energyVeins = uGlowColor * (veinPattern * 3.0 + verticalFlow * 2.5);
    
    float fresnel = pow(1.0 - abs(dot(vViewDir, vNormal)), 3.0);
    vec3 fresnelGlow = uGlowColor * fresnel * 5.0;

    vec3 R = reflect(-vViewDir, normalize(vNormal));
    float sky = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 env = mix(vec3(0.01, 0.015, 0.03), vec3(0.12, 0.18, 0.32), pow(sky, 1.6));
    vec3 envSpec = env * fresnel * 4.0;
    
    // LAYER 3: Subsurface scattering approximation
    // Light appears to pass through the crystal
    float thickness = abs(vNormal.y); // Simulate varying thickness
    float subsurface = pow(1.0 - thickness, 2.0);
    vec3 subsurfaceColor = uColor * subsurface * 1.5;
    
    // LAYER 4: Crystalline facet highlights
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
    vec3 reflectDir = reflect(-vViewDir, vNormal);
    float facetHighlight = pow(max(0.0, dot(reflectDir, lightDir)), 120.0);
    vec3 highlightColor = vec3(8.0) * facetHighlight; // Very bright highlights
    
    // LAYER 5: Base crystal body (semi-transparent look)
    vec3 crystalBase = uColor * 0.4;
    
    // LAYER 6: Atmospheric glow (depth impression)
    float depthGlow = smoothstep(-1.0, 1.0, vVerticalPos);
    vec3 atmosphericGlow = uGlowColor * depthGlow * 1.2;
    
    vec3 finalColor = crystalBase + subsurfaceColor + energyVeins + 
                      fresnelGlow + envSpec + highlightColor + atmosphericGlow;
    
    // LAYER 7: Pulsing energy core (heartbeat effect)
    float pulse = 0.85 + 0.15 * sin(uTime * 3.0);
    float corePulse = 0.9 + 0.1 * sin(uTime * 5.0 + vVerticalPos * 4.0);
    finalColor *= pulse * corePulse;
    
    // Add sparkles for magical quality
    float sparkle = pow(max(0.0, noise(vLocalPos * 25.0 + uTime * 2.0)), 12.0);
    finalColor += vec3(6.0) * sparkle;
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// ============== DEBRIS: Enhanced metallic space junk with detail ==============
const debrisVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    
    // Generate UVs for panel line patterns
    vUv = vec2(
      atan(position.z, position.x) / 6.28318 + 0.5,
      asin(position.y) / 3.14159 + 0.5
    );
    
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
  varying vec2 vUv;
  
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  
  float hash2(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  
  float saturate(float x) { return clamp(x, 0.0, 1.0); }

  vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
  }

  float distributionGGX(float NdotH, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float denom = (NdotH * NdotH) * (a2 - 1.0) + 1.0;
    return a2 / max(3.14159 * denom * denom, 1e-6);
  }

  float geometrySchlickGGX(float NdotV, float roughness) {
    float r = roughness + 1.0;
    float k = (r * r) / 8.0;
    return NdotV / max(NdotV * (1.0 - k) + k, 1e-6);
  }

  float geometrySmith(float NdotV, float NdotL, float roughness) {
    float ggx1 = geometrySchlickGGX(NdotV, roughness);
    float ggx2 = geometrySchlickGGX(NdotL, roughness);
    return ggx1 * ggx2;
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L0 = normalize(vec3(0.25, 0.85, 0.55));
    vec3 L1 = normalize(vec3(-0.55, 0.25, 0.70));
    
    // LAYER 1: Base metallic surface
    float surfaceDetail = hash(vPosition * 12.0);
    
    vec3 darkMetal = vec3(0.15, 0.16, 0.18);    // Dark gunmetal
    vec3 midMetal = vec3(0.42, 0.44, 0.48);     // Medium steel
    vec3 lightMetal = vec3(0.65, 0.68, 0.72);   // Light aluminum
    
    vec3 metalBase = mix(darkMetal, midMetal, surfaceDetail);
    metalBase = mix(metalBase, lightMetal, hash(vPosition * 6.0) * 0.3);
    
    // LAYER 2: Panel lines (mechanical detail)
    float panelH = fract(vUv.x * 8.0);
    float panelV = fract(vUv.y * 6.0);
    
    float panelLineH = smoothstep(0.02, 0.0, panelH) + smoothstep(0.98, 1.0, panelH);
    float panelLineV = smoothstep(0.02, 0.0, panelV) + smoothstep(0.98, 1.0, panelV);
    float panelLines = max(panelLineH, panelLineV);
    
    // Darken panel lines for mechanical look
    metalBase *= (1.0 - panelLines * 0.6);
    
    // LAYER 3: Rivets and bolts
    vec2 rivetGrid = fract(vUv * 16.0);
    float rivetDist = length(rivetGrid - 0.5);
    float rivets = smoothstep(0.15, 0.12, rivetDist) * 
                   step(hash2(floor(vUv * 16.0)), 0.3); // Random rivets
    metalBase *= (1.0 - rivets * 0.4);
    
    // LAYER 4: Wear and tear (scratches, dents)
    float wear = hash(vPosition * 20.0);
    wear = pow(wear, 3.0); // Make scratches less frequent but visible
    metalBase *= (0.92 + wear * 0.08);
    
    // LAYER 5: Damaged/sparking areas
    float damagePattern = hash(vPosition * 4.0);
    float damagedAreas = step(0.85, damagePattern);
    
    // Animated electrical sparks from damaged sections
    float sparkTime = uTime * 8.0 + hash(vPosition * 5.0) * 6.28;
    float sparks = step(0.95, hash(vPosition * 40.0 + floor(sparkTime)));
    sparks *= damagedAreas;
    
    vec3 sparkColor = uGlowColor * 8.0 * sparks; // Bright HDR sparks
    
    // Damaged area glow (exposed circuits)
    vec3 damageGlow = uGlowColor * damagedAreas * 0.8 * 
                      (0.8 + 0.2 * sin(uTime * 3.0 + damagePattern * 10.0));
    
    metalBase = mix(metalBase, uColor * 0.55, 0.35);

    float roughness = clamp(0.18 + panelLines * 0.35 + (1.0 - wear) * 0.22, 0.08, 0.85);
    float metallic = 1.0;
    vec3 albedo = metalBase;
    vec3 F0 = mix(vec3(0.04), albedo, metallic);

    vec3 R = reflect(-V, N);
    float sky = saturate(R.y * 0.5 + 0.5);
    vec3 env = mix(vec3(0.01, 0.01, 0.02), vec3(0.12, 0.18, 0.30), pow(sky, 1.6));
    float envStars = step(0.997, hash(R * 120.0 + uTime * 0.03));
    env += vec3(0.9, 0.95, 1.0) * envStars * 0.25;

    vec3 Lo = vec3(0.0);

    vec3 lights[2];
    lights[0] = L0;
    lights[1] = L1;

    for (int li = 0; li < 2; li++) {
      vec3 L = lights[li];
      vec3 H = normalize(V + L);

      float NdotL = saturate(dot(N, L));
      float NdotV = saturate(dot(N, V));
      float NdotH = saturate(dot(N, H));
      float VdotH = saturate(dot(V, H));

      float D = distributionGGX(NdotH, roughness);
      float G = geometrySmith(NdotV, NdotL, roughness);
      vec3  F = fresnelSchlick(VdotH, F0);

      vec3 spec = (D * G) * F / max(4.0 * NdotV * NdotL, 1e-4);
      vec3 kS = F;
      vec3 kD = (vec3(1.0) - kS);
      kD *= (1.0 - metallic);

      vec3 diffuse = kD * albedo / 3.14159;

      vec3 radiance = vec3(3.2);
      Lo += (diffuse + spec) * radiance * NdotL;
    }

    float rim = pow(1.0 - saturate(dot(V, N)), 4.0);
    vec3 rimLight = uGlowColor * rim * 0.55;

    vec3 Fenv = fresnelSchlick(saturate(dot(N, V)), F0);
    vec3 envSpec = env * Fenv * (1.6 + 1.2 * (1.0 - roughness));

    vec3 finalColor = Lo + envSpec;
    finalColor += rimLight;
    finalColor += damageGlow;
    finalColor += sparkColor;
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

const _legacyShaderSources = [
  meteorVertexShader,
  meteorFragmentShader,
  crystalVertexShader,
  crystalFragmentShader,
  debrisVertexShader,
  debrisFragmentShader,
];
void _legacyShaderSources;

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
    if (star.attributes.uv) {
      star.setAttribute(
        'uv2',
        new THREE.BufferAttribute(star.attributes.uv.array, 2)
      );
    }
    this.geometries.set(CosmicObjectType.STAR, star);

    // Meteor - rougher sphere
    const meteor = new THREE.IcosahedronGeometry(1, 3);
    this.addSurfaceVariation(meteor, 0.18);
    meteor.computeVertexNormals();
    if (meteor.attributes.uv) {
      meteor.setAttribute(
        'uv2',
        new THREE.BufferAttribute(meteor.attributes.uv.array, 2)
      );
    }
    this.geometries.set(CosmicObjectType.METEOR, meteor);

    // Crystal - natural hexagonal prism with pyramidal caps
    const crystal = this.createHexagonalCrystal();
    this.geometries.set(CosmicObjectType.CRYSTAL, crystal);

    // Debris - angular shape
    const debris = new THREE.DodecahedronGeometry(1, 0);
    this.addSurfaceVariation(debris, 0.12);
    debris.computeVertexNormals();
    if (debris.attributes.uv) {
      debris.setAttribute(
        'uv2',
        new THREE.BufferAttribute(debris.attributes.uv.array, 2)
      );
    }
    this.geometries.set(CosmicObjectType.DEBRIS, debris);

    // Glow plane for halos
    this.glowPlane = new THREE.PlaneGeometry(3, 3);
  }

  /**
   * Create a natural-looking hexagonal crystal geometry
   * Like a quartz crystal with hexagonal prism body and pyramidal terminations
   */
  private createHexagonalCrystal(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];

    const sides = 6; // Hexagonal
    const height = 2.8;
    const radius = 0.85;
    const pyramidHeight = 0.8;

    // Create vertices for hexagonal prism with pyramidal caps

    // Top pyramid apex
    vertices.push(0, height / 2 + pyramidHeight, 0);
    const topApexIdx = 0;

    // Top ring (base of top pyramid)
    const topRingStart = vertices.length / 3;
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const x = Math.cos(angle) * radius * 0.95;
      const z = Math.sin(angle) * radius * 0.95;
      vertices.push(x, height / 2, z);
    }

    // Middle-top ring (slight taper)
    const midTopRingStart = vertices.length / 3;
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      vertices.push(x, height / 4, z);
    }

    // Center ring (widest part)
    const centerRingStart = vertices.length / 3;
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const x = Math.cos(angle) * radius * 1.05;
      const z = Math.sin(angle) * radius * 1.05;
      vertices.push(x, 0, z);
    }

    // Middle-bottom ring (slight taper)
    const midBotRingStart = vertices.length / 3;
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      vertices.push(x, -height / 4, z);
    }

    // Bottom ring (base of bottom pyramid)
    const botRingStart = vertices.length / 3;
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const x = Math.cos(angle) * radius * 0.95;
      const z = Math.sin(angle) * radius * 0.95;
      vertices.push(x, -height / 2, z);
    }

    // Bottom pyramid apex
    const botApexIdx = vertices.length / 3;
    vertices.push(0, -height / 2 - pyramidHeight, 0);

    // Build faces

    // Top pyramid faces
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      indices.push(topApexIdx, topRingStart + i, topRingStart + next);
    }

    // Prism body faces (4 rings creating 3 segments)
    const rings = [
      topRingStart,
      midTopRingStart,
      centerRingStart,
      midBotRingStart,
      botRingStart,
    ];
    for (let ring = 0; ring < rings.length - 1; ring++) {
      for (let i = 0; i < sides; i++) {
        const next = (i + 1) % sides;
        const r0 = rings[ring];
        const r1 = rings[ring + 1];

        // Two triangles per face
        indices.push(r0 + i, r1 + i, r0 + next);
        indices.push(r0 + next, r1 + i, r1 + next);
      }
    }

    // Bottom pyramid faces
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      indices.push(botApexIdx, botRingStart + next, botRingStart + i);
    }

    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    geometry.setIndex(indices);

    const positionsForUv = geometry.attributes
      .position as THREE.BufferAttribute;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < positionsForUv.count; i++) {
      const y = positionsForUv.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const ySpan = Math.max(1e-6, maxY - minY);
    const uvs: number[] = [];
    for (let i = 0; i < positionsForUv.count; i++) {
      const x = positionsForUv.getX(i);
      const y = positionsForUv.getY(i);
      const z = positionsForUv.getZ(i);
      const u = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
      const v = (y - minY) / ySpan;
      uvs.push(u, v);
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(uvs, 2));

    // Add slight natural variation to vertices
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Skip apex points
      if (i === topApexIdx || i === botApexIdx) continue;

      // Subtle variation based on position
      const noise = Math.sin(x * 13.7 + y * 7.3 + z * 11.1) * 0.04;
      const length = Math.sqrt(x * x + z * z);
      if (length > 0.01) {
        positions.setX(i, x + (x / length) * noise);
        positions.setZ(i, z + (z / length) * noise);
      }
      positions.setY(i, y + noise * 0.5);
    }

    geometry.computeVertexNormals();
    return geometry;
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

  private rockTextures = createRockTextures({ size: 256, seed: 1337 });
  private metalTextures = createMetalTextures({ size: 256, seed: 4242 });
  private crystalMicroNormal = createCrystalMicroNormal({
    size: 256,
    seed: 9001,
  });

  constructor() {
    this.geometryCache = GeometryCache.getInstance();
    this.createGlowMaterials();
  }

  private createGlowMaterials(): void {
    // Pre-create glow materials for halo sprites
    for (const type of Object.values(CosmicObjectType)) {
      const config = COSMIC_OBJECT_CONFIGS[type as CosmicObjectType];
      const intensity =
        type === CosmicObjectType.STAR
          ? 3.6
          : type === CosmicObjectType.CRYSTAL
          ? 1.1
          : 2.4;

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

    // Core mesh - solid, writes depth
    const core = new THREE.Mesh(geometry, material);
    core.renderOrder = 100; // Base render order

    // Create group to hold all layers
    const group = new THREE.Group();

    // Outer shell for stars (no depth write)
    if (type === CosmicObjectType.STAR) {
      const shellMaterial = new THREE.MeshBasicMaterial({
        color: config.emissiveColor,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
      });
      const shell = new THREE.Mesh(geometry, shellMaterial);
      shell.scale.setScalar(1.1);
      shell.renderOrder = 97; // Before everything
      group.add(shell);
    }

    // Glow halo sprite (billboard, no depth write)
    if (type === CosmicObjectType.STAR || type === CosmicObjectType.CRYSTAL) {
      const glowMaterial = this.glowMaterials.get(type)?.clone();
      if (glowMaterial && this.geometryCache.glowPlane) {
        const glow = new THREE.Mesh(this.geometryCache.glowPlane, glowMaterial);
        glow.scale.setScalar(type === CosmicObjectType.STAR ? 2.1 : 1.35);
        glow.renderOrder = 96; // Behind everything
        group.add(glow);

        // Store reference for billboard update
        group.userData.glowSprite = glow;
      }
    }

    // Add core mesh last (renders on top, writes depth)
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
    group.userData.rotationRoot = core;
    group.userData.assetBacked = false;

    return group;
  }

  private createMaterial(
    type: CosmicObjectType,
    config: CosmicObjectConfig
  ): THREE.Material {
    if (type === CosmicObjectType.STAR) {
      return new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: Math.random() * 100 },
          uColor: { value: config.color.clone() },
          uGlowColor: { value: config.emissiveColor.clone() },
        },
        vertexShader: starVertexShader,
        fragmentShader: starFragmentShader,
        side: THREE.FrontSide,
        depthTest: true,
        depthWrite: true,
        transparent: false,
        toneMapped: true,
      });
    }

    if (type === CosmicObjectType.METEOR) {
      const m = new THREE.MeshStandardMaterial({
        color: config.color.clone(),
        metalness: 0.0,
        roughness: 1.0,
        map: this.rockTextures.map,
        normalMap: this.rockTextures.normalMap,
        normalScale: new THREE.Vector2(1.35, 1.35),
        roughnessMap: this.rockTextures.roughnessMap,
        aoMap: this.rockTextures.aoMap,
        aoMapIntensity: 1.0,
        emissive: config.emissiveColor.clone(),
        emissiveMap: this.rockTextures.emissiveMap,
        emissiveIntensity: Math.max(0.8, config.emissiveIntensity * 1.35),
      });
      m.envMapIntensity = 1.65;
      m.depthTest = true;
      m.depthWrite = true;
      m.toneMapped = true;
      return m;
    }

    if (type === CosmicObjectType.DEBRIS) {
      const m = new THREE.MeshStandardMaterial({
        color: config.color.clone(),
        metalness: 1.0,
        roughness: 0.35,
        map: this.metalTextures.map,
        normalMap: this.metalTextures.normalMap,
        normalScale: new THREE.Vector2(1.25, 1.25),
        roughnessMap: this.metalTextures.roughnessMap,
        aoMap: this.metalTextures.aoMap,
        aoMapIntensity: 1.0,
        emissive: config.emissiveColor.clone(),
        emissiveMap: this.metalTextures.emissiveMap,
        emissiveIntensity: Math.max(0.5, config.emissiveIntensity * 1.25),
      });
      m.envMapIntensity = 1.85;
      m.depthTest = true;
      m.depthWrite = true;
      m.toneMapped = true;
      return m;
    }

    const m = new THREE.MeshPhysicalMaterial({
      color: config.color.clone(),
      metalness: 0.0,
      roughness: 0.06,
      transmission: 0.0,
      thickness: 0.0,
      ior: 1.45,
      attenuationColor: config.color.clone(),
      attenuationDistance: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      specularIntensity: 1.0,
      specularColor: new THREE.Color(0xffffff),
      iridescence: 0.35,
      iridescenceIOR: 1.25,
      iridescenceThicknessRange: [120, 420],
      emissive: config.emissiveColor.clone(),
      emissiveIntensity: Math.max(0.5, config.emissiveIntensity * 0.9),
      side: THREE.DoubleSide,
    });
    m.normalMap = this.crystalMicroNormal;
    m.normalScale = new THREE.Vector2(0.75, 0.75);
    m.envMapIntensity = 2.75;
    m.depthTest = true;
    m.depthWrite = false;
    m.toneMapped = true;
    return m;
  }

  static updateObjectTime(
    object: THREE.Object3D,
    time: number,
    camera?: THREE.Camera
  ): void {
    // Update core mesh shader time
    const coreMesh = object.userData.coreMesh as THREE.Mesh | undefined;
    if (coreMesh) {
      const material = coreMesh.material;
      if (
        material instanceof THREE.ShaderMaterial &&
        material.uniforms?.uTime
      ) {
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

    this.rockTextures.map.dispose();
    this.rockTextures.normalMap.dispose();
    this.rockTextures.roughnessMap.dispose();
    this.rockTextures.aoMap.dispose();
    this.rockTextures.emissiveMap.dispose();

    this.metalTextures.map.dispose();
    this.metalTextures.normalMap.dispose();
    this.metalTextures.roughnessMap.dispose();
    this.metalTextures.aoMap.dispose();
    this.metalTextures.emissiveMap.dispose();

    this.crystalMicroNormal.dispose();

    console.log('[CosmicObjectFactory] Disposed');
  }
}
