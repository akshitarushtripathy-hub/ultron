import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const ChromaticAberrationShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0.0022 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      float r = texture2D(tDiffuse, vUv + vec2(amount, 0.0)).r;
      float b = texture2D(tDiffuse, vUv - vec2(amount, 0.0)).b;
      gl_FragColor = vec4(r, base.g, b, base.a);
    }`,
};

function radialTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,220,150,1)');
  g.addColorStop(0.25, 'rgba(255,140,30,0.85)');
  g.addColorStop(0.6, 'rgba(255,80,0,0.25)');
  g.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function codeTexture(text: string): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 64);
  ctx.font = '22px monospace';
  ctx.fillStyle = 'rgba(255,170,80,0.9)';
  ctx.fillText(text, 6, 40);
  return new THREE.CanvasTexture(canvas);
}

export type OrbControls = {
  spin: (delta: number) => void;
  zoom: (delta: number) => void;
  pulse: () => void;
  setEnergy: (level: number) => void;
  dispose: () => void;
};

export function createOrb(container: HTMLElement): OrbControls {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070d, 0.055);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 8.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x05070d, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  container.appendChild(renderer.domElement);

  const orb = new THREE.Group();
  scene.add(orb);

  const glowTex = radialTexture();

  // --- molten core ---------------------------------------------------------
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.48, 3),
    new THREE.MeshBasicMaterial({ color: 0xc25a10 })
  );
  orb.add(core);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xa84810,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  }));
  halo.scale.set(3.0, 3.0, 1);
  orb.add(halo);

  // --- spiral inner core ---------------------------------------------------
  const spiral = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.95, 0.018, 260, 8, 2, 3),
    new THREE.MeshBasicMaterial({ color: 0x9a5a1c, transparent: true, opacity: 0.45 })
  );
  orb.add(spiral);

  // --- orbital shells ------------------------------------------------------
  const rings: THREE.Mesh[] = [];
  const ringRotations = [
    [0, 0, 0],
    [Math.PI / 2.2, 0.4, 0],
    [Math.PI / 3, -0.6, Math.PI / 2.5],
  ];
  ringRotations.forEach((rot) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.05, 0.012, 8, 180),
      new THREE.MeshBasicMaterial({ color: 0xc06a28, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending })
    );
    ring.rotation.set(rot[0], rot[1], rot[2]);
    orb.add(ring);
    rings.push(ring);

    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(2.28, 0.006, 6, 180),
      new THREE.MeshBasicMaterial({ color: 0x8a3a08, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending })
    );
    ring2.rotation.copy(ring.rotation);
    orb.add(ring2);
    rings.push(ring2);
  });

  // --- electrons -----------------------------------------------------------
  const electrons: { mesh: THREE.Mesh; ring: number; angle: number; speed: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const e = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xb07030 })
    );
    const eGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x9a5018, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.35, depthWrite: false,
    }));
    eGlow.scale.set(0.6, 0.6, 1);
    e.add(eGlow);
    orb.add(e);
    electrons.push({ mesh: e, ring: i * 2, angle: (i / 3) * Math.PI * 2, speed: 0.7 + i * 0.25 });
  }

  // --- floating code fragments --------------------------------------------
  const codes: THREE.Sprite[] = [];
  const codeLines = ['ULTRON v1.0', 'SYSTEM ONLINE', '0x7F3A', 'NEURAL LINK', 'HANDS: HERMES', '0.98.44', 'TARGET ACQUIRED'];
  codeLines.forEach((line, i) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: codeTexture(line), transparent: true, opacity: 0.28, depthWrite: false,
    }));
    sprite.scale.set(1.7, 0.22, 1);
    const a = (i / codeLines.length) * Math.PI * 2;
    sprite.position.set(Math.cos(a) * 3.0, Math.sin(a) * 2.2, (i % 2 ? 0.4 : -0.4));
    orb.add(sprite);
    codes.push(sprite);
  });

  // --- debris --------------------------------------------------------------
  const debris: THREE.Mesh[] = [];
  for (let i = 0; i < 46; i++) {
    const d = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.015 + Math.random() * 0.035),
      new THREE.MeshBasicMaterial({ color: 0x9a5018, transparent: true, opacity: 0.28 })
    );
    const r = 2.6 + Math.random() * 1.8;
    const a = Math.random() * Math.PI * 2;
    d.position.set(Math.cos(a) * r, (Math.random() - 0.5) * 3.4, Math.sin(a) * r);
    orb.add(d);
    debris.push(d);
  }

  // --- dust field ----------------------------------------------------------
  const dustCount = 520;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const r = 3 + Math.random() * 9;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    dustPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    dustPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    dustPos[i * 3 + 2] = r * Math.cos(phi);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xa05a28, size: 0.024, transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(dust);

  // --- scan rings ----------------------------------------------------------
  const scans: { mesh: THREE.Mesh; life: number }[] = [];
  function emitScan() {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.008, 6, 128),
      new THREE.MeshBasicMaterial({ color: 0x9a5018, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending })
    );
    mesh.rotation.x = Math.PI / 2;
    orb.add(mesh);
    scans.push({ mesh, life: 0 });
  }
  emitScan();

  // --- post processing -----------------------------------------------------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.45, 0.3, 0.2
  );
  composer.addPass(bloom);
  const chromatic = new ShaderPass(ChromaticAberrationShader);
  composer.addPass(chromatic);

  // --- interaction state ---------------------------------------------------
  let spinVelocity = 0.0018;
  let targetZoom = 8.5;
  let energy = 0.35;
  let energyTarget = 0.35;
  let lastScan = 0;
  let raf = 0;
  const clock = new THREE.Clock();

  function animate() {
    raf = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    const dt = Math.min(clock.getDelta(), 0.05);

    orb.rotation.y += spinVelocity + dt * 0.05;
    orb.rotation.x = Math.sin(t * 0.18) * 0.12;
    spinVelocity *= 0.98;
    if (Math.abs(spinVelocity) < 0.0004) spinVelocity = 0.0018;

    spiral.rotation.x += 0.012;
    spiral.rotation.y += 0.008;
    core.scale.setScalar(1 + Math.sin(t * 2.2) * 0.05 + energy * 0.08);
    halo.scale.setScalar(3.6 + Math.sin(t * 1.6) * 0.15 + energy * 0.8);

    electrons.forEach((e) => {
      e.angle += dt * e.speed;
      const ring = rings[e.ring];
      const radius = 2.05;
      const local = new THREE.Vector3(Math.cos(e.angle) * radius, Math.sin(e.angle) * radius, 0);
      e.mesh.position.copy(local.applyEuler(ring.rotation));
    });

    debris.forEach((d, i) => { d.rotation.x += 0.008 + i * 0.0002; d.rotation.y += 0.006; });
    dust.rotation.y += 0.0006;
    dust.rotation.x += 0.0002;
    codes.forEach((c, i) => { c.material.opacity = 0.12 + 0.12 * (1 + Math.sin(t * 1.2 + i)) / 2; });

    for (let i = scans.length - 1; i >= 0; i--) {
      const s = scans[i];
      s.life += dt;
      const scale = 1 + s.life * 2.2;
      s.mesh.scale.setScalar(scale);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.32 - s.life * 0.32);
      if (s.life > 1) { orb.remove(s.mesh); scans.splice(i, 1); }
    }
    if (t - lastScan > 3.2) { emitScan(); lastScan = t; }

    energy += (energyTarget - energy) * 0.06;
    bloom.strength = 0.42 + energy * 0.25;
    camera.position.z += (targetZoom - camera.position.z) * 0.08;

    composer.render();
  }
  animate();

  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  return {
    spin(delta) { spinVelocity += delta * 0.02; },
    zoom(delta) { targetZoom = THREE.MathUtils.clamp(targetZoom - delta * 0.01, 5.5, 13); },
    pulse() { emitScan(); energyTarget = 1; setTimeout(() => { energyTarget = 0.35; }, 700); },
    setEnergy(level) { energyTarget = Math.max(0, Math.min(1, level)); },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      composer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
