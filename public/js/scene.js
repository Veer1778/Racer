import * as THREE from '../vendor/three.module.js';
import { maxOffset, noRoom } from '../shared/tracks.js';
import { pitGeometry, TUNE } from '../shared/sim.js';

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
export function carGeometry(color, trim, helmet = trim) {
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
  b.box(0.42, 0.40, 0.44, 0, 1.28, 0.36, helmet);         // helmet
  b.box(0.44, 0.12, 0.10, 0, 1.26, 0.58, DARK);           // visor
  b.box(0.30, 0.10, 0.22, 0, 1.46, 0.34, color);          // helmet crest
  b.box(0.44, 0.09, 0.26, 0, 1.18, 0.36, color);          // collar
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
  // clamp() keeps the offset inside the local corner radius, so the strip never
  // turns itself inside out at a hairpin
  const clamp = (p, o) => Math.sign(o) * maxOffset(p, o);
  for (let i = 0; i < last; i++) {
    const a = line[i], bb = line[(i + 1) % N];
    const use = colorFn ? new THREE.Color(colorFn(i)) : c;
    const ai = clamp(a, inner), ao = clamp(a, outer), bi = clamp(bb, inner), bo = clamp(bb, outer);
    const a1 = [a.x + a.nx * ai, y, a.z + a.nz * ai], a2 = [a.x + a.nx * ao, y, a.z + a.nz * ao];
    const b1 = [bb.x + bb.nx * bi, y, bb.z + bb.nz * bi], b2 = [bb.x + bb.nx * bo, y, bb.z + bb.nz * bo];
    pos.push(...a1, ...a2, ...b2, ...a1, ...b2, ...b1);
    for (let k = 0; k < 6; k++) col.push(use.r, use.g, use.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

// A barrier with real thickness: inner face, outer face and a top cap. A single
// plane reads as paper from the cockpit and vanishes edge-on.
function wall(line, offset, base, height, colorFn, thick = 0.55) {
  const pos = [], col = [], N = line.length;
  const quad = (p1, p2, p3, p4, c) => {
    pos.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < N; i++) {
    const a = line[i], bb = line[(i + 1) % N];
    const sgn = Math.sign(offset) || 1;
    if (noRoom(a, offset) || noRoom(line[(i + 1) % N], offset)) continue;   // no barrier here
    const oIn = sgn * maxOffset(a, offset), oOut = oIn + thick * sgn;
    const oInB = sgn * maxOffset(bb, offset), oOutB = oInB + thick * sgn;
    const c = new THREE.Color(colorFn(i));
    const dark = c.clone().multiplyScalar(0.72);
    const ai = [a.x + a.nx * oIn, base, a.z + a.nz * oIn], aiT = [ai[0], base + height, ai[2]];
    const bi = [bb.x + bb.nx * oInB, base, bb.z + bb.nz * oInB], biT = [bi[0], base + height, bi[2]];
    const ao = [a.x + a.nx * oOut, base, a.z + a.nz * oOut], aoT = [ao[0], base + height, ao[2]];
    const bo = [bb.x + bb.nx * oOutB, base, bb.z + bb.nz * oOutB], boT = [bo[0], base + height, bo[2]];
    quad(ai, aiT, biT, bi, c);           // track-facing
    quad(bo, boT, aoT, ao, dark);        // back
    quad(aiT, aoT, boT, biT, c.clone().multiplyScalar(1.12));   // cap
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

  // Main straight: grandstands down the outside, pit garages opposite. Every
  // offset here is built from the track's own tangent and normal — mixing
  // world axes with track-relative ones is what turned these into a pile of
  // floating slabs.
  const gs = new PartBuilder();
  const N = built.line.length;
  const bay = Math.max(2, Math.round(18 / built.step));
  const standOff = built.width / 2 + built.runoff + 10;

  const at = (p, along, out, up) => [
    p.x + p.tx * along + p.nx * out,
    up,
    p.z + p.tz * along + p.nz * out
  ];

  for (let k = -24; k <= 14; k++) {
    const p = built.line[((k * bay) % N + N) % N];
    const ry = Math.atan2(p.tx, p.tz);

    // grandstand: base, raked seating, roof on two posts
    let q = at(p, 0, standOff, 1.5);
    gs.box(17, 3, 12, q[0], q[1], q[2], '#262c3a', ry);
    for (let r = 0; r < 5; r++) {
      const s2 = at(p, 0, standOff + 1.2 + r * 1.9, 3.4 + r * 1.25);
      gs.box(16.4, 1.25, 2.1, s2[0], s2[1], s2[2], r % 2 ? '#93a0bb' : '#63708d', ry);
    }
    const roof = at(p, 0, standOff + 5, 11.4);
    gs.box(18, 0.7, 15, roof[0], roof[1], roof[2], '#dfe4ee', ry);
    for (const side of [-1, 1]) {
      const post = at(p, side * 8, standOff + 10.5, 5.6);
      gs.box(1, 11, 1, post[0], post[1], post[2], '#333c52', ry);
    }

    // pit garages on the inside, only alongside the pit lane itself
    if (k > -18 && k < 8) {
      const g1 = at(p, 0, -(built.width / 2 + TUNE.pitOffset + 8), 3);
      gs.box(18, 6, 11, g1[0], g1[1], g1[2], '#1b2130', ry);
      const g2 = at(p, 0, -(built.width / 2 + TUNE.pitOffset + 8), 6.4);
      gs.box(18.4, 0.8, 11.4, g2[0], g2[1], g2[2], '#c4cddf', ry);
      const door = at(p, 0, -(built.width / 2 + TUNE.pitOffset + 2.7), 2);
      gs.box(9, 4, 0.5, door[0], door[1], door[2], k % 2 ? '#2f3a52' : '#3b4760', ry);
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

  // Kerbs only where the circuit actually bends, all merged into one mesh:
  // a mesh per corner meant dozens of draw calls on a real layout.
  const kerbs = { pos: [], col: [] };
  const kerbQuad = (a, b, i1, o1, i2, o2, color) => {
    const c = new THREE.Color(color), y = 0.05;
    const A1 = [a.x + a.nx * i1, y, a.z + a.nz * i1], A2 = [a.x + a.nx * o1, y, a.z + a.nz * o1];
    const B1 = [b.x + b.nx * i2, y, b.z + b.nz * i2], B2 = [b.x + b.nx * o2, y, b.z + b.nz * o2];
    kerbs.pos.push(...A1, ...A2, ...B2, ...A1, ...B2, ...B1);
    for (let k = 0; k < 6; k++) kerbs.col.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < N; i++) {
    if (line[i].radius >= 260) continue;
    const a = line[i], b = line[(i + 1) % N];
    const color = (i % 4 < 2) ? theme.kerb : '#f2f4f8';
    for (const sgn of [1, -1]) {
      const inA = sgn * maxOffset(a, sgn * half), inB = sgn * maxOffset(b, sgn * half);
      kerbQuad(a, b, inA, inA + sgn * 1.2, inB, inB + sgn * 1.2, color);
    }
  }
  if (kerbs.pos.length) {
    const kg = new THREE.BufferGeometry();
    kg.setAttribute('position', new THREE.Float32BufferAttribute(kerbs.pos, 3));
    kg.setAttribute('color', new THREE.Float32BufferAttribute(kerbs.col, 3));
    kg.computeVertexNormals();
    scene.add(new THREE.Mesh(kg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
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

  // pit lane: the stretch of the main straight the cars peel off onto
  const pit = pitGeometry(built);
  const laneSamples = [];
  for (let i = 0; i < N; i++) {
    const d = line[i].dist;
    if (d >= pit.entry - 40 || d <= pit.exit + 40) laneSamples.push({ i, p: line[i] });
  }
  // the window wraps past the start line, so order it entry -> line -> exit
  laneSamples.sort((a, b) => {
    const ka = a.p.dist >= pit.entry - 40 ? a.p.dist - built.length : a.p.dist;
    const kb = b.p.dist >= pit.entry - 40 ? b.p.dist - built.length : b.p.dist;
    return ka - kb;
  });
  const lane = laneSamples.map(s => s.p);
  if (lane.length > 4) {
    const o = pit.offset;
    scene.add(ribbon(lane, o - 3.6, o + 3.6, 0.03, theme.pit || '#4c525c', false));
    scene.add(ribbon(lane, o + 3.4, o + 3.6, 0.05, '#e9edf3', false));
    scene.add(ribbon(lane, o - 3.6, o - 3.4, 0.05, '#e9edf3', false));
    // the box itself
    const boxIdx = Math.round(pit.box / built.step) % N;
    const bp = line[boxIdx];
    const pb = new PartBuilder();
    const ry = Math.atan2(bp.tx, bp.tz);
    pb.box(7, 0.04, 3, bp.x + bp.nx * o, 0.06, bp.z + bp.nz * o, '#ffc46b', ry);
    pb.box(0.5, 2.4, 0.5, bp.x + bp.nx * (o - 4), 1.2, bp.z + bp.nz * (o - 4), '#e2334a', ry);
    scene.add(pb.mesh());
  }

  scene.add(scenery(built, theme));
}
