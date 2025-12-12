import * as THREE from 'three';

export interface CosmicEnvironment {
  scene: THREE.Scene;
  dispose(): void;
}

export function createCosmicEnvironment(): CosmicEnvironment {
  const scene = new THREE.Scene();

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      scene,
      dispose() {},
    };
  }

  ctx.fillStyle = '#000008';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gradA = ctx.createRadialGradient(140, 90, 10, 140, 90, 180);
  gradA.addColorStop(0, 'rgba(120,60,255,0.25)');
  gradA.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradA;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gradB = ctx.createRadialGradient(380, 140, 10, 380, 140, 220);
  gradB.addColorStop(0, 'rgba(0,210,255,0.20)');
  gradB.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradB;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const starCount = 1600;
  for (let i = 0; i < starCount; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = Math.random();
    const alpha = 0.15 + Math.random() * 0.85;

    const hue = 200 + Math.random() * 80;
    const sat = 40 + Math.random() * 60;
    const lum = 70 + Math.random() * 30;

    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${alpha})`;
    ctx.fillRect(x, y, r < 0.92 ? 1 : 2, r < 0.92 ? 1 : 2);

    if (r > 0.985) {
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(x - 2, y, 5, 1);
      ctx.fillRect(x, y - 2, 1, 5);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  const sphereGeo = new THREE.SphereGeometry(8, 48, 32);
  const sphereMat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
  });
  const dome = new THREE.Mesh(sphereGeo, sphereMat);
  scene.add(dome);

  const accentA = new THREE.PointLight(0x6d4dff, 2.2, 30);
  accentA.position.set(-6, 3, -3);
  scene.add(accentA);

  const accentB = new THREE.PointLight(0x00d6ff, 1.9, 30);
  accentB.position.set(6, -2, -2);
  scene.add(accentB);

  return {
    scene,
    dispose() {
      sphereGeo.dispose();
      sphereMat.dispose();
      texture.dispose();
    },
  };
}
