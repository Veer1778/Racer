import * as THREE from '../vendor/three.module.js';

/* ---------------------------------------------------------------- utils */

// Merges a set of transformed boxes/cylinders into one vertex-coloured mesh, so
// a whole car is a single draw call instead of twenty.
export class PartBuilder {
  constructor() { this.pos = []; this.norm = []; this.col = []; }
  add(geo, m, color) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(m);
    g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    const c = new THREE.Color(color);
    for (let i = 0; i < p.length; i += 3) {
      this.pos.push(p[i], p[i + 1], p[i + 2]);
      this.norm.push(n[i], n[i + 1], n[i + 2]);
      this.col.push(c.r, c.g, c.b);
    }
    g.dispose();
    return this;
  }
  box(w, h, d, x, y, z, color, ry = 0) {
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    return this.add(new THREE.BoxGeometry(w, h, d), m, color);
  }
  cyl(r1, r2, h, seg, x, y, z, color, rot) {
    const m = new THREE.Matrix4();
    if (rot) m.makeRotationFromEuler(rot);
    m.setPosition(x, y, z);
    return this.add(new THREE.CylinderGeometry(r1, r2, h, seg), m, color);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
  mesh(opts = {}) {
    return new THREE.Mesh(this.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, ...opts }));
  }
}

/* ------------------------------------------------------------------ car */

const TYRE = '#15181e', DARK = '#0e1117', CHROME = '#aeb7c4';

// Blocky open-wheeler: front and rear wings, sidepods, airbox, halo, and a
// driver whose helmet and shoulders sit up out of the cockpit.
export function carGeometry(color, trim) {
  const b = new PartBuilder();
  const X = Math.PI / 2;
  const wheelRot = new THREE.Euler(0, 0, X);

  // floor and chassis
  b.box(1.45, 0.22, 4.6, 0, 0.30, -0.1, DARK);
  b.box(1.20, 0.34, 3.0, 0, 0.52, -0.3, color);
  // nose
  b.box(0.80, 0.30, 1.5, 0, 0.50, 1.95, color);
  b.box(0.52, 0.24, 0.8, 0, 0.46, 2.85, color);
  // front wing: main plane, upper flap, endplates
  b.box(2.00, 0.10, 0.70, 0, 0.26, 3.25, color);
  b.box(1.70, 0.08, 0.34, 0, 0.42, 3.10, trim);
  b.box(0.10, 0.42, 0.80, 0.95, 0.40, 3.22, trim);
  b.box(0.10, 0.42, 0.80, -0.95, 0.40, 3.22, trim);
  // sidepods with a trim stripe
  b.box(0.55, 0.52, 1.90, 0.62, 0.56, -0.30, color);
  b.box(0.55, 0.52, 1.90, -0.62, 0.56, -0.30, color);
  b.box(0.58, 0.12, 1.60, 0.62, 0.74, -0.30, trim);
  b.box(0.58, 0.12, 1.60, -0.62, 0.74, -0.30, trim);
  // cockpit surround and the driver in it
  b.box(0.86, 0.40, 1.30, 0, 0.80, 0.55, color);
  b.box(0.66, 0.26, 0.90, 0, 0.98, 0.62, DARK);
  b.box(0.62, 0.30, 0.42, 0, 1.00, 0.30, DARK);          // shoulders
  b.box(0.42, 0.40, 0.44, 0, 1.28, 0.36, trim);           // helmet
  b.box(0.44, 0.12, 0.10, 0, 1.26, 0.58, DARK);           // visor
  b.box(0.30, 0.10, 0.22, 0, 1.46, 0.34, color);          // helmet crest
  // halo
  b.box(0.08, 0.30, 0.10, 0.44, 1.18, 0.45, CHROME);
  b.box(0.08, 0.30, 0.10, -0.44, 1.18, 0.45, CHROME);
  b.box(0.10, 0.10, 0.90, 0.42, 1.34, 0.72, CHROME);
  b.box(0.10, 0.10, 0.90, -0.42, 1.34, 0.72, CHROME);
  b.box(0.95, 0.10, 0.12, 0, 1.36, 1.12, CHROME);
  b.box(0.12, 0.22, 0.30, 0, 1.30, 1.16, CHROME);
  // airbox and engine cover
  b.box(0.50, 0.46, 0.60, 0, 1.18, -0.25, color);
  b.box(0.62, 0.52, 1.70, 0, 0.86, -1.35, color);
  b.box(0.22, 0.16, 1.70, 0, 1.16, -1.40, trim);          // spine stripe
  // rear wing
  b.box(1.85, 0.10, 0.55, 0, 1.30, -2.35, color);
  b.box(1.60, 0.08, 0.30, 0, 1.14, -2.20, trim);
  b.box(0.09, 0.62, 0.70, 0.88, 1.06, -2.32, trim);
  b.box(0.09, 0.62, 0.70, -0.88, 1.06, -2.32, trim);
  b.box(0.30, 0.55, 0.18, 0, 1.02, -2.42, DARK);          // wing pylon
  b.box(1.30, 0.10, 0.34, 0, 0.36, -2.45, DARK);          // beam wing

  // wheels: fat tyres with a coloured rim face
  const wheels = [[0.98, 1.58, 0.44, 0.42], [-0.98, 1.58, 0.44, 0.42],
                  [1.04, -1.62, 0.50, 0.48], [-1.04, -1.62, 0.50, 0.48]];
  for (const [x, z, w, r] of wheels) {
    b.cyl(r, r, w, 12, x, r, z, TYRE, wheelRot);
    b.cyl(r * 0.55, r * 0.55, w + 0.04, 8, x, r, z, trim, wheelRot);
  }
  return b.geometry();
}

/* -------------------------------------------------------------- scenery */

function ribbon(line, inner, outer, y, color, closed = true, colorFn = null) {
  const pos = [], col = [], N = line.length;
  const c = new THREE.Color(color);
  const last = closed ? N : N - 1;
  for (let i = 0; i < last; i++) {
    const a = line[i], bb = line[(i + 1) % N];
    const use = colorFn ? new THREE.Color(colorFn(i)) : c;
    const a1 = [a.x + a.nx * inner, y, a.z + a.nz * inner], a2 = [a.x + a.nx * outer, y, a.z + a.nz * outer];
    const b1 = [bb.x + bb.nx * inner, y, bb.z + bb.nz * inner], b2 = [bb.x + bb.nx * outer, y, bb.z + bb.nz * outer];
    pos.push(...a1, ...a2, ...b2, ...a1, ...b2, ...b1);
    for (let k = 0; k < 6; k++) col.push(use.r, use.g, use.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

function wall(line, offset, base, height, colorFn) {
  const pos = [], col = [], N = line.length;
  for (let i = 0; i < N; i++) {
    const a = line[i], bb = line[(i + 1) % N];
    const ax = a.x + a.nx * offset, az = a.z + a.nz * offset;
    const bx = bb.x + bb.nx * offset, bz = bb.z + bb.nz * offset;
    const c = new THREE.Color(colorFn(i));
    pos.push(ax, base, az, ax, base + height, az, bx, base + height, bz);
    pos.push(ax, base, az, bx, base + height, bz, bx, base, bz);
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

function skyDome(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const ctx = c.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, top);
  grd.addColorStop(0.55, bottom);
  grd.addColorStop(1, bottom);
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 4, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(2600, 20, 12),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  return dome;
}

function groundTexture(a, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = a; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = b; ctx.fillRect(0, 0, 32, 32); ctx.fillRect(32, 32, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(160, 160);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Cells within reach of the circuit, so scenery never lands on the racing line.
function corridor(built, pad) {
  const cells = new Set();
  const S = 12;
  for (const p of built.line) {
    const r = Math.ceil(pad / S);
    const cx = Math.round(p.x / S), cz = Math.round(p.z / S);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) cells.add((cx + i) + ':' + (cz + j));
  }
  return { cells, S, has: (x, z) => cells.has(Math.round(x / S) + ':' + Math.round(z / S)) };
}

function scenery(built, theme) {
  const group = new THREE.Group();
  const free = corridor(built, built.width / 2 + built.runoff + 16);
  const rng = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();

  const b = new PartBuilder();
  let placed = 0;
  const desert = !!theme.desert;
  for (let i = 0; i < built.line.length && placed < 420; i += 3) {
    const p = built.line[i];
    for (const side of [1, -1]) {
      if (rng() > 0.55) continue;
      const off = side * (built.width / 2 + built.runoff + 12 + rng() * 55);
      const x = p.x + p.nx * off + (rng() - 0.5) * 14;
      const z = p.z + p.nz * off + (rng() - 0.5) * 14;
      if (free.has(x, z)) continue;
      placed++;
      if (desert) {
        const s = 2 + rng() * 4;
        b.box(s * 2.4, s, s * 2.0, x, s / 2, z, theme.rock || '#9c7b4e', rng() * 3);
        b.box(s * 1.2, s * 0.8, s * 1.1, x + s, s * 0.4, z - s * 0.6, theme.rock2 || '#8a6a42', rng() * 3);
      } else {
        const h = 6 + rng() * 7;
        b.box(0.9, h * 0.45, 0.9, x, h * 0.22, z, '#5a4030');
        b.box(4.4, h * 0.42, 4.4, x, h * 0.52, z, theme.tree || '#2f6b34');
        b.box(3.0, h * 0.34, 3.0, x, h * 0.80, z, theme.tree2 || '#3c8040');
      }
    }
  }
  if (placed) group.add(b.mesh());

  // grandstands along the pit straight
  const gs = new PartBuilder();
  for (let k = 1; k <= 7; k++) {
    const p = built.line[(built.line.length - k * 9) % built.line.length];
    const off = built.width / 2 + built.runoff + 9;
    for (const side of [1, -1]) {
      const x = p.x + p.nx * off * side, z = p.z + p.nz * off * side;
      const ry = Math.atan2(p.tx, p.tz);
      gs.box(9, 7, 16, x, 3.5, z, side > 0 ? '#3b4250' : '#39404d', ry);
      gs.box(9.4, 0.8, 16.4, x, 7.4, z, '#e2e6ee', ry);
      for (let r = 0; r < 4; r++) {
        gs.box(8.2, 0.5, 2.6, x, 2.2 + r * 1.3, z + (r - 1.5) * 0.1, r % 2 ? '#c9d2e2' : '#8f9bb3', ry);
      }
    }
  }
  group.add(gs.mesh());
  return group;
}

/* ------------------------------------------------------------ the world */

export function buildWorld(scene, built, theme) {
  const half = built.width / 2;
  const line = built.line, N = line.length;

  scene.background = new THREE.Color(theme.sky2);
  scene.fog = new THREE.Fog(theme.sky2, 420, 1500);

  scene.add(skyDome(theme.sky, theme.sky2));

  const hemi = new THREE.HemisphereLight(0xffffff, theme.ground, theme.night ? 1.05 : 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, theme.night ? 0.55 : 1.0);
  sun.position.set(220, 380, 160);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshLambertMaterial({ map: groundTexture(theme.ground, theme.ground2) })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.12;
  scene.add(ground);

  const RO = built.runoff;
  scene.add(ribbon(line, -half - RO, half + RO, -0.02, theme.runoff || '#6b6f77'));   // runoff
  scene.add(ribbon(line, -half, half, 0.01, theme.asphalt));                        // track
  scene.add(ribbon(line, half - 0.35, half, 0.03, '#e9edf3'));                      // edge lines
  scene.add(ribbon(line, -half, -half + 0.35, 0.03, '#e9edf3'));

  // kerbs only where the circuit actually bends
  for (const sgn of [1, -1]) {
    const seg = [];
    const flush = () => {
      if (seg.length > 2) {
        const start = seg[0].i;
        scene.add(ribbon(seg.map(s => s.p), sgn > 0 ? half : -half - 1.2, sgn > 0 ? half + 1.2 : -half,
          0.05, '#fff', false, (i) => ((i + start) % 4 < 2) ? theme.kerb : '#f2f4f8'));
      }
      seg.length = 0;
    };
    for (let i = 0; i < N; i++) {
      if (line[i].radius < 260) seg.push({ p: line[i], i });
      else flush();
    }
    flush();
  }

  // barriers
  for (const sgn of [1, -1]) {
    const off = (half + RO + 0.4) * sgn;
    scene.add(wall(line, off, 0, 1.15, i => (i % 6 < 3) ? '#e6e9ef' : '#d8443a'));
    scene.add(wall(line, off, 1.15, 0.55, () => '#3b4250'));
    scene.add(wall(line, off * 1.14, 0, 2.6, () => theme.fence || '#2b3140'));
  }

  // start/finish: painted line, gantry, pit wall
  const s0 = line[0], ang = Math.atan2(s0.tx, s0.tz);
  const grid = new PartBuilder();
  for (let k = -Math.floor(built.width / 2); k < built.width / 2; k++) {
    for (let r = 0; r < 2; r++) {
      const off = k + 0.5, along = r * 0.8;
      grid.box(1, 0.02, 0.8,
        s0.x + s0.nx * off + s0.tx * along, 0.06, s0.z + s0.nz * off + s0.tz * along,
        (k + r) % 2 ? '#101317' : '#f2f4f8', ang);
    }
  }
  const G = built.width / 2 + 3;
  grid.box(1.2, 9, 1.2, s0.x + s0.nx * G, 4.5, s0.z + s0.nz * G, '#2b3242', ang);
  grid.box(1.2, 9, 1.2, s0.x - s0.nx * G, 4.5, s0.z - s0.nz * G, '#2b3242', ang);
  grid.box(built.width + 7, 1.6, 1.2, s0.x, 9.3, s0.z, '#2b3242', ang);
  grid.box(built.width + 2, 0.9, 0.6, s0.x, 8.2, s0.z, '#e2334a', ang);
  scene.add(grid.mesh());

  scene.add(scenery(built, theme));
}
