import * as THREE from '../vendor/three.module.js';
import { maxOffset, noRoom } from '../shared/tracks.js';
import { pitGeometry } from '../shared/sim.js';


/* ------------------------------------------------------------ materials */

// One place decides how shiny the world is. On a machine that cannot hold a
// frame rate, LOW swaps physically-based shading for cheap flat shading and
// drops shadows entirely, because a pretty 25 fps is worse than a plain 60.
export const QUALITY = { level: 'high' };

export function surfaceMaterial(opts = {}) {
  const { color, map, roughness = 0.92, metalness = 0.0, vertexColors = false, side } = opts;
  if (QUALITY.level === 'low') {
    return new THREE.MeshLambertMaterial({ color, map, vertexColors, side });
  }
  return new THREE.MeshStandardMaterial({ color, map, roughness, metalness, vertexColors, side });
}

// Asphalt, grass and concrete as procedural noise so surfaces have grain
// instead of reading as flat fill.
const texCache = new Map();
function noiseTexture(base, spread, repeat, grain = 0.5) {
  const key = base + spread + repeat + grain;
  if (texCache.has(key)) return texCache.get(key);
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(base);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    // two octaves of value noise keeps it from looking like TV static
    const n = (Math.random() * 0.6 + Math.random() * 0.4 - 0.5) * spread;
    const f = 1 + n;
    img.data[i * 4] = Math.min(255, col.r * 255 * f);
    img.data[i * 4 + 1] = Math.min(255, col.g * 255 * f);
    img.data[i * 4 + 2] = Math.min(255, col.b * 255 * f);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // a few darker streaks along the driving line
  ctx.globalAlpha = grain * 0.22;
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? '#000' : '#fff';
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 6 + Math.random() * 40);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

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
  // `castShadow: false` keeps a mesh out of the shadow pass. Scenery and
  // buildings sit far enough from the racing line that their shadows are never
  // seen, and they were most of the geometry the sun had to redraw each frame.
  mesh(opts = {}) {
    const { castShadow = true, ...matOpts } = opts;
    const m = new THREE.Mesh(this.geometry(), surfaceMaterial({ vertexColors: true, roughness: 0.82, ...matOpts }));
    m.castShadow = castShadow && QUALITY.level === 'high';
    m.receiveShadow = QUALITY.level === 'high';
    return m;
  }
}

/* ------------------------------------------------------------------ car */

const TYRE = '#15181e', DARK = '#0e1117', CHROME = '#aeb7c4';

// Blocky open-wheeler: front and rear wings, sidepods, airbox, halo, and a
// driver whose helmet and shoulders sit up out of the cockpit.
// tier 0 intact · 1 front wing gone · 2 both wings gone and the nose stoved in
export function carGeometry(color, trim, helmet = trim, tier = 0) {
  const b = new PartBuilder();
  const X = Math.PI / 2;
  const wheelRot = new THREE.Euler(0, 0, X);

  // floor and chassis
  b.box(1.45, 0.22, 4.6, 0, 0.30, -0.1, DARK);
  b.box(1.20, 0.34, 3.0, 0, 0.52, -0.3, color);
  // nose
  b.box(0.80, 0.30, 1.5, 0, 0.50, 1.95, color);
  b.box(0.52, 0.24, 0.8, 0, 0.46, 2.85, color);
  // front wing: main plane, upper flap, endplates. Torn off past tier 0, with
  // a bare stub left where it mounted.
  if (tier === 0) {
    b.box(2.00, 0.10, 0.70, 0, 0.26, 3.25, color);
    b.box(1.70, 0.08, 0.34, 0, 0.42, 3.10, trim);
    b.box(0.10, 0.42, 0.80, 0.95, 0.40, 3.22, trim);
    b.box(0.10, 0.42, 0.80, -0.95, 0.40, 3.22, trim);
  } else {
    b.box(0.70, 0.10, 0.28, 0, 0.26, 3.05, DARK);
    if (tier > 1) b.box(0.44, 0.22, 0.5, 0.06, 0.44, 2.9, DARK, 0.3);   // stoved-in nose
  }
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
  // rear wing, also sheddable
  if (tier < 2) {
    b.box(1.85, 0.10, 0.55, 0, 1.30, -2.35, color);
    b.box(1.60, 0.08, 0.30, 0, 1.14, -2.20, trim);
    b.box(0.09, 0.62, 0.70, 0.88, 1.06, -2.32, trim);
    b.box(0.09, 0.62, 0.70, -0.88, 1.06, -2.32, trim);
  }
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

// Car paint: glossier than the world around it, and the one thing that must
// always cast a shadow, since a car with no shadow reads as floating.
export function carMesh(geometry) {
  const mat = surfaceMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.22 });
  const m = new THREE.Mesh(geometry, mat);
  m.castShadow = QUALITY.level === 'high';
  m.receiveShadow = false;
  return m;
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
  return new THREE.Mesh(g, surfaceMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

// A barrier with real thickness: inner face, outer face and a top cap. A single
// plane reads as paper from the cockpit and vanishes edge-on.
// `offset` may be a number or a function of the sample index, which is what
// lets the pit lane's outer wall follow a lane that swings away from the
// circuit; `skip` leaves the gaps where the pit entry and exit roads cross.
function wall(line, offset, base, height, colorFn, thick = 0.55, skip = null) {
  const N = line.length;
  const off = typeof offset === 'function' ? offset : () => offset;
  const emit = (i, pos, col) => {
    const a = line[i], bb = line[(i + 1) % N];
    if (skip && (skip(i) || skip((i + 1) % N))) return;
    const oa = off(i), ob = off((i + 1) % N);
    if (oa === null || ob === null) return;
    const sgn = Math.sign(oa) || 1;
    if (noRoom(a, oa) || noRoom(bb, ob)) return;              // no barrier here
    const oIn = sgn * maxOffset(a, oa), oOut = oIn + thick * sgn;
    const oInB = sgn * maxOffset(bb, ob), oOutB = oInB + thick * sgn;
    const c = new THREE.Color(colorFn(i));
    const dark = c.clone().multiplyScalar(0.72);
    const cap = c.clone().multiplyScalar(1.12);
    const quad = (p1, p2, p3, p4, cc) => {
      pos.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
      for (let k = 0; k < 6; k++) col.push(cc.r, cc.g, cc.b);
    };
    const ai = [a.x + a.nx * oIn, base, a.z + a.nz * oIn], aiT = [ai[0], base + height, ai[2]];
    const bi = [bb.x + bb.nx * oInB, base, bb.z + bb.nz * oInB], biT = [bi[0], base + height, bi[2]];
    const ao = [a.x + a.nx * oOut, base, a.z + a.nz * oOut], aoT = [ao[0], base + height, ao[2]];
    const bo = [bb.x + bb.nx * oOutB, base, bb.z + bb.nz * oOutB], boT = [bo[0], base + height, bo[2]];
    quad(ai, aiT, biT, bi, c);
    quad(bo, boT, aoT, ao, dark);
    quad(aiT, aoT, boT, biT, cap);
  };
  const group = chunkedMesh(N, Math.max(24, Math.ceil(N / 26)), emit,
                            surfaceMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
  if (QUALITY.level === 'high') for (const m of group.children) { m.castShadow = true; m.receiveShadow = true; }
  return group;
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
  const CHUNK = 90;                 // samples per scenery chunk, for culling
  let chunkAt = 0;
  const free = corridor(built, built.width / 2 + built.runoff + 16);
  const rng = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();

  let b = new PartBuilder();
  let placed = 0, inChunk = 0;
  const flush = () => { if (inChunk) { group.add(b.mesh({ castShadow: false })); b = new PartBuilder(); inChunk = 0; } };
  const desert = !!theme.desert;
  for (let i = 0; i < built.line.length && placed < 520; i += 3) {
    if (i - chunkAt >= CHUNK) { flush(); chunkAt = i; }
    const p = built.line[i];
    for (const side of [1, -1]) {
      if (rng() > 0.55) continue;
      const off = side * (built.width / 2 + built.runoff + 12 + rng() * 55);
      const x = p.x + p.nx * off + (rng() - 0.5) * 14;
      const z = p.z + p.nz * off + (rng() - 0.5) * 14;
      if (free.has(x, z)) continue;
      placed++; inChunk++;
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
  flush();

  // Main straight: grandstands down the outside, pit garages opposite. Every
  // offset here is built from the track's own tangent and normal — mixing
  // world axes with track-relative ones is what turned these into a pile of
  // floating slabs.
  let gs = new PartBuilder();
  let gsCount = 0;
  const gsFlush = () => { if (gsCount) { group.add(gs.mesh({ castShadow: false })); gs = new PartBuilder(); gsCount = 0; } };
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
    gs.box(12, 3, 17, q[0], q[1], q[2], '#262c3a', ry);
    for (let r = 0; r < 5; r++) {
      const s2 = at(p, 0, standOff + 1.2 + r * 1.9, 3.4 + r * 1.25);
      gs.box(2.1, 1.25, 16.4, s2[0], s2[1], s2[2], r % 2 ? '#93a0bb' : '#63708d', ry);
    }
    const roof = at(p, 0, standOff + 5, 11.4);
    gs.box(15, 0.7, 18, roof[0], roof[1], roof[2], '#dfe4ee', ry);
    for (const side of [-1, 1]) {
      const post = at(p, side * 8, standOff + 10.5, 5.6);
      gs.box(1, 11, 1, post[0], post[1], post[2], '#333c52', ry);
    }

  }
  gsFlush();
  return group;
}



/* ------------------------------------------------------------ pit lane */

// Where box `b` sits in the world, and the frame to build around it: `t` runs
// down the lane, `n` points across it towards the garages.
function boxFrame(built, pit, b) {
  const N = built.line.length;
  const pd = pit.boxPd(b);
  const d = ((pit.entry + pd) % built.length + built.length) % built.length;
  const p = built.line[Math.round(d / built.step) % N];
  const c = pit.centre(pd);
  return {
    p, c, pd,
    ry: Math.atan2(p.tx, p.tz),
    // lateral `out` metres from the centreline, `along` metres up the lane
    at: (out, along, y) => [p.x + p.tx * along + p.nx * out, y, p.z + p.tz * along + p.nz * out]
  };
}

// Garages behind the lane, one per box: a bay, a roll-up door in the team's
// colour, a number board and a timing stand on the pit wall opposite.
function pitBuildings(built, pit, theme, teams) {
  const group = new THREE.Group();
  if (!pit.usable) return group;
  const gar = new PartBuilder();
  const dark = '#181d28', pale = '#c4cddf';

  // Box spacing is measured along the centreline, but the garages sit 30 m
  // outside it: on the outside of even a gentle bend that stretches the gap
  // between them, and a row of bays sized to the centreline spacing came out
  // with daylight between every one.
  const frames = [];
  for (let b = 0; b < pit.boxCount; b++) frames.push(boxFrame(built, pit, b));
  const anchor = f => f.at(f.c - pit.laneW / 2 - 6.5, 0, 0);
  const spans = frames.map((f, b) => {
    const other = frames[b + 1] || frames[b - 1];
    if (!other) return pit.boxSpacing;
    const a = anchor(f), o = anchor(other);
    return Math.max(pit.boxSpacing, Math.hypot(o[0] - a[0], o[2] - a[2]));
  });

  for (let b = 0; b < pit.boxCount; b++) {
    const f = frames[b], span = spans[b];
    const team = teams[b % teams.length] || { color: '#5b6b86', trim: '#dfe4ee', name: '' };
    const back = f.c - pit.laneW / 2;              // garage side of the lane

    // bay: body, roof slab, door, and a colour band above the door
    let q = f.at(back - 6.5, 0, 3.2);
    gar.box(12, 6.4, span + 0.4, q[0], q[1], q[2], dark, f.ry);
    q = f.at(back - 6.5, 0, 6.75);
    gar.box(12.8, 0.7, span + 0.5, q[0], q[1], q[2], pale, f.ry);
    // A flat wall with a stripe on it reads as a fence, not a row of garages.
    // Pillars between the bays and a lighter door panel inside each one give
    // the row the rhythm that makes it legible at speed.
    q = f.at(back - 0.4, 0, 2.2);
    gar.box(0.7, 4.4, span - 3.4, q[0], q[1], q[2], '#39445c', f.ry);
    q = f.at(back - 0.2, 0, 2.2);
    gar.box(0.45, 3.8, span - 4.6, q[0], q[1], q[2], '#0d1119', f.ry);
    q = f.at(back - 0.2, 0, 4.75);
    gar.box(0.5, 0.95, span - 3.4, q[0], q[1], q[2], team.color, f.ry);
    for (const side of [-1, 1]) {
      const pil = f.at(back - 1.0, side * span / 2, 3.3);
      gar.box(2.2, 6.6, 1.1, pil[0], pil[1], pil[2], pale, f.ry);
    }
    // tyre stacks either side of the door
    for (const side of [-1, 1]) {
      for (let s = 0; s < 3; s++) {
        const r = f.at(back - 1.7, side * (span / 2 - 1.7), 0.3 + s * 0.55);
        gar.cyl(0.62, 0.62, 0.5, 10, r[0], r[1], r[2], s === 2 ? team.trim : '#15181e');
      }
    }
    // the gantry the lollipop light hangs from
    const g = f.at(f.c + pit.laneW / 2 - 0.6, 0, 1.6);
    gar.box(0.34, 3.2, 0.34, g[0], g[1], g[2], '#39415a', f.ry);
  }

  // pit wall: low wall along the closed section with the teams' timing stands
  const N = built.line.length;
  const seen = new Set();
  for (let i = 0; i < N; i++) {
    const p = built.line[i], pd = pit.pd(p.dist);
    if (pd > pit.total || pit.open(pd)) continue;
    const slot = Math.round(pd / 26);
    if (seen.has(slot)) continue;
    seen.add(slot);
    const ry = Math.atan2(p.tx, p.tz);
    const o = -(built.width / 2 + (built.runoff || 6) + 1.6);
    const at = (out, along, y) => [p.x + p.tx * along + p.nx * out, y, p.z + p.tz * along + p.nz * out];
    let q = at(o, 0, 1.6);
    gar.box(1.2, 3.2, 26, q[0], q[1], q[2], '#232a39', ry);
    q = at(o, 0, 3.4);
    gar.box(2.6, 0.4, 26, q[0], q[1], q[2], '#39415a', ry);
    for (let k = -1; k <= 1; k++) {
      const st = at(o - 0.9, k * 7, 4.2);
      gar.box(0.3, 1.5, 4.2, st[0], st[1], st[2], '#0e1117', ry);
    }
  }
  group.add(gar.mesh({ castShadow: false }));
  group.name = 'pitbuildings';
  return group;
}

// One pit crew member, merged into a single geometry so the whole crew is one
// instanced draw call. The suit is white in vertex colour and the boots and
// helmet are dark, so multiplying by the instance colour tints the team's
// kit without turning the whole figure into a flat silhouette.
function crewGeometry() {
  const b = new PartBuilder();
  const SUIT = '#ffffff', DARKK = '#3c4049', LID = '#e6e9ef', VIS = '#1a1d24';
  for (const s of [-1, 1]) {
    b.box(0.17, 0.11, 0.30, s * 0.13, 0.055, 0.03, DARKK);      // boot
    b.box(0.19, 0.72, 0.21, s * 0.13, 0.46, 0, SUIT);            // leg
    b.box(0.16, 0.56, 0.19, s * 0.33, 1.07, 0.02, SUIT);         // arm
    b.box(0.15, 0.15, 0.16, s * 0.33, 0.79, 0.10, DARKK);        // glove
  }
  b.box(0.54, 0.64, 0.31, 0, 1.12, 0, SUIT);                     // torso
  b.box(0.56, 0.12, 0.33, 0, 1.20, 0, DARKK);                    // harness
  b.box(0.18, 0.10, 0.18, 0, 1.49, 0, DARKK);                    // neck
  b.box(0.33, 0.31, 0.35, 0, 1.67, 0.01, LID);                   // helmet
  b.box(0.30, 0.10, 0.06, 0, 1.68, 0.18, VIS);                   // visor
  return b.geometry();
}

// Idle crew stand against the garage; during a stop they come out to the car,
// crouch over the wheels and go back. Positions are (across, along) in metres:
// idle is relative to the box, work is relative to the car.
const CREW_WORK = [
  [-1.65, 1.60], [1.65, 1.60], [-1.75, -1.70], [1.75, -1.70],
  [0, 3.40], [0, -3.30], [-2.50, 0.90]
];
const CREW_CROUCH = [1, 1, 1, 1, 0.55, 0.55, 0];

export function makePitCrew(scene, built, pit, teams) {
  if (!pit.usable) return { update() {}, boxOf: () => -1 };
  const nBox = pit.boxCount, PER = CREW_WORK.length, total = nBox * PER;
  const mat = surfaceMaterial({ vertexColors: true, roughness: 0.7 });
  const mesh = new THREE.InstancedMesh(crewGeometry(), mat, total);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = QUALITY.level === 'high';
  mesh.name = 'crew';
  scene.add(mesh);

  // the light on each box's gantry: red while the car is stationary, green the
  // instant the jack drops, dark the rest of the time
  const lights = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.5, 0.5, 0.18),
    new THREE.MeshBasicMaterial({ vertexColors: true }), nBox);
  lights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lights.frustumCulled = false;
  scene.add(lights);

  const frames = [], idle = [];
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  for (let b = 0; b < nBox; b++) {
    const f = boxFrame(built, pit, b);
    frames.push(f);
    const team = teams[b % teams.length] || { color: '#8c97ab' };
    const back = f.c - pit.laneW / 2 + 0.9;
    for (let k = 0; k < PER; k++) {
      const q = f.at(back, -3.6 + k * 1.25, 0);
      idle.push({ x: q[0], z: q[2], h: f.ry + Math.PI / 2 });
      col.set(team.color);
      mesh.setColorAt(b * PER + k, col);
    }
    const g = f.at(f.c + pit.laneW / 2 - 0.6, 0, 3.1);
    dummy.position.set(g[0], g[1], g[2]);
    dummy.rotation.set(0, f.ry, 0);
    dummy.updateMatrix();
    lights.setMatrixAt(b, dummy.matrix);
    lights.setColorAt(b, col.set('#20242c'));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  lights.instanceMatrix.needsUpdate = true;
  if (lights.instanceColor) lights.instanceColor.needsUpdate = true;

  const anim = new Float32Array(nBox);       // 0 idle, 1 fully out at the car
  const state = new Array(nBox).fill(null);
  let dirty = true;

  // write everyone home once, so the crew are standing about before any stop
  const writeBox = (b) => {
    const a = anim[b], st = state[b];
    for (let k = 0; k < PER; k++) {
      const home = idle[b * PER + k];
      let x = home.x, z = home.z, h = home.h, crouch = 0;
      if (a > 0.001 && st) {
        const w = CREW_WORK[k];
        const wx = st.x + Math.cos(st.h) * w[0] + Math.sin(st.h) * w[1];
        const wz = st.z - Math.sin(st.h) * w[0] + Math.cos(st.h) * w[1];
        x += (wx - x) * a; z += (wz - z) * a;
        const face = Math.atan2(st.x - x, st.z - z);
        let d = face - h;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        h += d * a;
        crouch = CREW_CROUCH[k] * a;
      }
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, h, 0);
      dummy.scale.set(1, 1 - 0.30 * crouch, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(b * PER + k, dummy.matrix);
    }
  };
  for (let b = 0; b < nBox; b++) writeBox(b);
  mesh.instanceMatrix.needsUpdate = true;

  return {
    // debug: how far out of the garage each box's crew currently are
    anim: () => Array.from(anim, v => +v.toFixed(2)),
    // which box a car at this pit distance is being served at
    boxOf(pd) {
      const k = Math.round((pd - pit.boxOrigin) / pit.boxSpacing);
      return Math.max(0, Math.min(nBox - 1, k));
    },
    // `stops` is rebuilt each frame: { box, x, z, h, phase, released }
    update(stops, dt) {
      for (let b = 0; b < nBox; b++) state[b] = null;
      for (const s of stops) if (s.box >= 0 && s.box < nBox) state[s.box] = s;

      let moving = false;
      for (let b = 0; b < nBox; b++) {
        const st = state[b];
        // out fast at the start of the stop, back as the jack drops
        const want = st ? Math.max(0, Math.min(1, Math.min(st.phase / 0.16, (1.02 - st.phase) / 0.16))) : 0;
        const next = anim[b] + (want - anim[b]) * (1 - Math.exp(-dt / 0.07));
        if (Math.abs(next - anim[b]) > 0.002 || (st && anim[b] > 0.002)) moving = true;
        anim[b] = next;
        if (anim[b] > 0.002 || dirty) writeBox(b);

        const lit = st ? (st.released ? '#3ddc84' : '#e2334a') : '#20242c';
        lights.setColorAt(b, col.set(lit));
      }
      if (moving || dirty) {
        mesh.instanceMatrix.needsUpdate = true;
        if (lights.instanceColor) lights.instanceColor.needsUpdate = true;
      }
      dirty = false;
    }
  };
}

/* -------------------------------------------------------------- effects */

// Debris, sparks and smoke share one instanced mesh each, so the whole system
// costs three draw calls no matter how much carnage is on screen.
export function makeEffects(scene) {
  const N = 180;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x2b2b30, transparent: true, opacity: 0.4, depthWrite: false });
  const smoke = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), smokeMat, 48);
  smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  smoke.frustumCulled = false;
  scene.add(smoke);

  const parts = Array.from({ length: N }, () => ({ life: 0 }));
  const puffs = Array.from({ length: 48 }, () => ({ life: 0 }));
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let next = 0, nextPuff = 0, dirty = false;

  const spawn = (x, y, z, vx, vy, vz, size, life, color, gravity) => {
    const p = parts[next = (next + 1) % N];
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.rx = Math.random() * 6; p.ry = Math.random() * 6;
    p.spin = (Math.random() - 0.5) * 14;
    p.size = size; p.life = life; p.max = life; p.g = gravity;
    p.color = color;
    dirty = true;
  };

  return {
    // bodywork flying off: heavier pieces in the car's colours
    debris(x, z, heading, power, color, trim) {
      const n = Math.min(14, 4 + Math.round(power / 4));
      for (let i = 0; i < n; i++) {
        const a = heading + (Math.random() - 0.5) * 2.4;
        const sp = 4 + Math.random() * power * 0.5;
        spawn(x, 0.5 + Math.random() * 0.6, z,
          Math.sin(a) * sp * 0.5 + (Math.random() - 0.5) * 6,
          3 + Math.random() * 5,
          Math.cos(a) * sp * 0.5 + (Math.random() - 0.5) * 6,
          0.16 + Math.random() * 0.34, 1.6 + Math.random() * 1.6,
          Math.random() < 0.45 ? trim : color, true);
      }
    },
    // scraping the barrier or bottoming out
    sparks(x, z, heading, strength) {
      const n = 2 + Math.round(strength * 3);
      for (let i = 0; i < n; i++) {
        const a = heading + Math.PI + (Math.random() - 0.5) * 1.1;
        spawn(x, 0.25, z,
          Math.sin(a) * (5 + Math.random() * 9), 1.4 + Math.random() * 2.6,
          Math.cos(a) * (5 + Math.random() * 9),
          0.07 + Math.random() * 0.07, 0.24 + Math.random() * 0.22,
          Math.random() < 0.5 ? '#ffd166' : '#ff7a3d', false);
      }
    },
    smoke(x, z, heading) {
      const p = puffs[nextPuff = (nextPuff + 1) % puffs.length];
      p.x = x - Math.sin(heading) * 2.2; p.y = 0.9; p.z = z - Math.cos(heading) * 2.2;
      p.vy = 1.4 + Math.random(); p.vx = (Math.random() - 0.5) * 1.2; p.vz = (Math.random() - 0.5) * 1.2;
      p.life = 1.5; p.max = 1.5; p.size = 0.5 + Math.random() * 0.5;
      dirty = true;
    },
    update(dt) {
      // nothing alive: skip the whole matrix upload rather than writing 228
      // identity matrices every frame for no visible result
      let live = 0;
      for (let i = 0; i < N; i++) if (parts[i].life > 0) { live++; break; }
      for (let i = 0; i < puffs.length; i++) if (puffs[i].life > 0) { live++; break; }
      if (!live && !dirty) return;
      dirty = live > 0;

      for (let i = 0; i < N; i++) {
        const p = parts[i];
        if (p.life <= 0) { dummy.scale.setScalar(0); dummy.position.set(0, -50, 0); }
        else {
          p.life -= dt;
          if (p.g) p.vy -= 22 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < 0.08) { p.y = 0.08; p.vy = Math.abs(p.vy) * 0.34; p.vx *= 0.7; p.vz *= 0.7; }
          p.rx += p.spin * dt; p.ry += p.spin * 0.7 * dt;
          const k = Math.max(0, p.life / p.max);
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.set(p.rx, p.ry, 0);
          dummy.scale.setScalar(p.size * (0.4 + 0.6 * k));
          col.set(p.color);
          mesh.setColorAt(i, col);
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i];
        if (p.life <= 0) { dummy.scale.setScalar(0); dummy.position.set(0, -50, 0); }
        else {
          p.life -= dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          const k = Math.max(0, p.life / p.max);
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.set(0, p.x * 0.1, 0);
          dummy.scale.setScalar(p.size * (1.6 - k));
        }
        dummy.updateMatrix();
        smoke.setMatrixAt(i, dummy.matrix);
      }
      smoke.instanceMatrix.needsUpdate = true;
    }
  };
}


// Geometry built as one mesh per circuit can never be frustum-culled: a lap of
// Spa is 7 km and all of it is submitted every frame. Splitting the road,
// barriers and scenery into chunks lets the GPU skip whatever is behind you.
function chunkedMesh(count, perChunk, emit, material) {
  const group = new THREE.Group();
  for (let start = 0; start < count; start += perChunk) {
    const pos = [], col = [];
    const end = Math.min(count, start + perChunk);
    for (let i = start; i < end; i++) emit(i, pos, col);
    if (!pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    group.add(new THREE.Mesh(g, material));
  }
  return group;
}

/* --------------------------------------------------------- road surface */

// Every painted surface — runoff, kerbs, edge lines, asphalt and the pit lane —
// is built as ONE mesh of laterally adjacent bands. Stacking them as separate
// ribbons a few centimetres apart is what made the track shimmer and tear at
// distance: the depth buffer cannot separate 2 cm at 600 m, so the layers
// fight. Adjacent bands never overlap, so there is nothing to fight over.
function roadSurface(built, theme, pit) {
  const line = built.line, N = line.length, half = built.width / 2, RO = built.runoff;
  const pos = [], col = [];
  const C = {
    asphalt: new THREE.Color(theme.asphalt),
    runoff: new THREE.Color(theme.runoff || '#6b6f77'),
    line: new THREE.Color('#e9edf3'),
    kerbA: new THREE.Color(theme.kerb),
    kerbB: new THREE.Color('#f2f4f8'),
    pit: new THREE.Color(theme.pit || '#464c57'),
    apron: new THREE.Color(theme.apron || '#71767f'),
    box: new THREE.Color('#d9dee8')
  };

  // a quad between two samples, from lateral a1..a2 at `i` to b1..b2 at `i+1`
  let pushPos = pos, pushCol = col;
  const band = (a, b, a1, a2, b1, b2, c, y1 = 0, y2 = 0) => {
    // Winding decides which way the surface faces, and a band written from the
    // outside in comes out face-down and is culled — which is exactly why the
    // pit lane was an invisible strip of grass. Normalise the order here so a
    // caller can give the two edges in whichever order reads best.
    if (a2 < a1) { const t1 = a1; a1 = a2; a2 = t1; const t2 = b1; b1 = b2; b2 = t2;
                   const ty = y1; y1 = y2; y2 = ty; }
    const A1 = [a.x + a.nx * a1, y1, a.z + a.nz * a1], A2 = [a.x + a.nx * a2, y2, a.z + a.nz * a2];
    const B1 = [b.x + b.nx * b1, y1, b.z + b.nz * b1], B2 = [b.x + b.nx * b2, y2, b.z + b.nz * b2];
    pushPos.push(...A1, ...A2, ...B2, ...A1, ...B2, ...B1);
    for (let k = 0; k < 6; k++) pushCol.push(c.r, c.g, c.b);
  };
  const clamp = (p, o) => Math.sign(o) * maxOffset(p, o);

  // Per-sample pit lane cross-section. The lane is a road of its own that
  // branches off the circuit, so its offsets change from sample to sample; at
  // the entry and exit it merges into the track, and there the drawn surface
  // is clipped at the kerb so it never overlaps the asphalt and z-fights it.
  const laneAt = (p) => {
    if (!pit || !pit.usable) return null;
    const pd = pit.pd(p.dist);
    if (pd > pit.total) return null;
    const c = pit.centre(pd);
    const inn = Math.min(c + pit.laneW / 2, -(half + 1.3));
    const out = c - pit.laneW / 2;
    return out < inn - 0.2 ? { pd, inn, out } : null;
  };
  const boxAt = pd => {
    if (!pit || !pit.usable) return -1;
    const k = Math.round((pd - pit.boxOrigin) / pit.boxSpacing);
    if (k < 0 || k >= pit.boxCount) return -1;
    return Math.abs(pd - pit.boxPd(k)) < 3.2 ? k : -1;
  };

  // note: the chunk buffers are named P/Q, not C — C is the colour table above
  const emit = (i, P, Q) => {
    pushPos = P; pushCol = Q;
    const a = line[i], b = line[(i + 1) % N];
    const kerbHere = a.radius < 260;
    const kerbCol = (i % 5 < 2) ? C.kerbA : C.kerbB;

    // asphalt, inside the edge lines
    band(a, b, -half + 0.4, half - 0.4, -half + 0.4, half - 0.4, C.asphalt);
    // edge lines
    band(a, b, half - 0.4, half, half - 0.4, half, C.line);
    band(a, b, -half, -half + 0.4, -half, -half + 0.4, C.line);

    for (const sgn of [1, -1]) {
      const edge = sgn * half;
      const kerbOut = clamp(a, sgn * (half + 1.3)), kerbOutB = clamp(b, sgn * (half + 1.3));
      if (kerbHere) {
        // raised kerb with a lip, so it reads as a kerb rather than paint
        band(a, b, edge, kerbOut, edge, kerbOutB, kerbCol, 0.09, 0.09);
        band(a, b, edge, edge, edge, edge, kerbCol.clone().multiplyScalar(0.7), 0, 0.09);
      } else {
        band(a, b, edge, kerbOut, edge, kerbOutB, C.runoff);
      }

      // runoff out to the barrier, then the pit lane beyond it where it exists
      const outer = clamp(a, sgn * (half + RO)), outerB = clamp(b, sgn * (half + RO));
      const la = sgn < 0 ? laneAt(a) : null, lb = sgn < 0 ? laneAt(b) : null;
      if (!la || !lb) {
        band(a, b, kerbOut, outer, kerbOutB, outerB, C.runoff);
        continue;
      }

      // runoff as far as the lane's inner edge, or the barrier, whichever first
      const rA = Math.max(outer, la.inn), rB = Math.max(outerB, lb.inn);
      band(a, b, kerbOut, rA, kerbOutB, rB, C.runoff);
      // concrete apron between barrier and lane where the two are separated
      if (la.inn < outer || lb.inn < outerB) {
        band(a, b, Math.min(outer, rA), Math.min(outer, la.inn),
                   Math.min(outerB, rB), Math.min(outerB, lb.inn), C.apron);
      }
      // the lane: white boundary line, then the road. Where a box is marked
      // out, a painted rectangle just wide enough for a car sits on the garage
      // side of it, which is what the driver actually aims at.
      band(a, b, la.inn, la.inn - 0.35, lb.inn, lb.inn - 0.35, C.line);
      const oA = clamp(a, la.out), oB = clamp(b, lb.out);
      const k = boxAt(la.pd);
      if (k < 0) {
        band(a, b, la.inn - 0.35, oA, lb.inn - 0.35, oB, C.pit);
      } else {
        const mA = (la.inn + la.out) / 2 - 1.1, mB = (lb.inn + lb.out) / 2 - 1.1;
        band(a, b, la.inn - 0.35, mA + 2.6, lb.inn - 0.35, mB + 2.6, C.pit);
        band(a, b, mA + 2.6, mA - 2.6, mB + 2.6, mB - 2.6, C.box);
        band(a, b, mA - 2.6, oA, mB - 2.6, oB, C.pit);
      }
    }
  };

  // the asphalt carries a noise map so it has grain rather than flat fill
  const mat = surfaceMaterial({ vertexColors: true, roughness: 0.95,
                                map: noiseTexture('#f2f2f2', 0.14, 300, 0.9) });
  const group = chunkedMesh(N, Math.max(24, Math.ceil(N / 26)), emit, mat);
  if (QUALITY.level === 'high') for (const m of group.children) m.receiveShadow = true;
  return group;
}

/* ------------------------------------------------------------ the world */

// `world` carries back the handful of things the render loop has to move each
// frame, the sun's shadow frustum above all.
export function buildWorld(scene, built, theme, renderer, teams = []) {
  const world = {};
  const half = built.width / 2;
  const line = built.line, N = line.length;

  scene.background = new THREE.Color(theme.sky2);
  scene.fog = new THREE.Fog(theme.sky2, 360, 1400);

  scene.add(skyDome(theme.sky, theme.sky2));

  const hemi = new THREE.HemisphereLight(0xcdd9f0, theme.ground, theme.night ? 0.40 : 0.62);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2e0, theme.night ? 0.6 : 1.7);
  sun.position.set(180, 320, 140);
  scene.add(sun);
  scene.add(sun.target);

  if (QUALITY.level === 'high') {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    // A shadow frustum big enough for a 7 km circuit would have no resolution
    // left, so it covers a box around the car and is moved every frame.
    const s = 74;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 620;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.5;
    world.sun = sun;

    // A tiny gradient environment is enough to give paint and chrome something
    // to reflect; without it standard materials read as matte plastic.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(theme.sky2);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(8, 8, 6),
      new THREE.MeshBasicMaterial({ color: theme.night ? 0x4a5570 : 0xfff4e2 })
    );
    glow.position.set(4, 7, 2);
    envScene.add(glow);
    const env = pmrem.fromScene(envScene, 0.04);
    scene.environment = env.texture;
    world.env = env.texture;           // so a quality change can put it back
    scene.environmentIntensity = theme.night ? 0.25 : 0.5;
    pmrem.dispose();
  }

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    surfaceMaterial({ color: 0xffffff, map: noiseTexture(theme.ground, 0.22, 900, 0.3), roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.12;
  ground.receiveShadow = QUALITY.level === 'high';
  scene.add(ground);

  const RO = built.runoff;
  const pit = pitGeometry(built);
  const road = roadSurface(built, theme, pit); road.name = 'road'; scene.add(road);

  // Barriers. On the pit side the barrier has to break where the entry and
  // exit roads cross it — otherwise it is a wall across the pit road — and the
  // catch fence moves out behind the garages rather than through them.
  const inWin = i => pit.usable && pit.pd(line[i].dist) <= pit.total;
  const openHere = i => pit.usable && (() => { const pd = pit.pd(line[i].dist);
                                               return pd <= pit.total && pit.open(pd); })();
  for (const sgn of [1, -1]) {
    const off = (half + RO + 0.4) * sgn;
    const skip = sgn < 0 ? openHere : null;
    scene.add(wall(line, off, 0, 1.15, i => (i % 6 < 3) ? '#e6e9ef' : '#d8443a', 0.55, skip));
    scene.add(wall(line, off, 1.15, 0.55, () => '#3b4250', 0.55, skip));
    if (sgn > 0) scene.add(wall(line, off * 1.14, 0, 2.6, () => theme.fence || '#2b3140'));
    else scene.add(wall(line, i => inWin(i) ? null : off * 1.14, 0, 2.6,
                        () => theme.fence || '#2b3140'));
  }

  // the pit lane's own outer wall, which follows the lane out and back again
  if (pit.usable) {
    const laneOut = i => {
      const pd = pit.pd(line[i].dist);
      if (pd > pit.total) return null;
      const o = pit.centre(pd) - pit.laneW / 2 - 0.3;
      return o > -(half + 2) ? null : o;      // nothing to wall off where it is still the track
    };
    scene.add(wall(line, laneOut, 0, 1.0, () => '#cfd6e2', 0.5));
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

  // garages, pit wall, and the signs marking the entry and exit
  if (pit.usable) {
    scene.add(pitBuildings(built, pit, theme, teams));
    const pb = new PartBuilder();
    const at = d => line[Math.round(((d % built.length) + built.length) % built.length / built.step) % N];
    const sign = (d, out, color, label) => {
      const p = at(d), ry = Math.atan2(p.tx, p.tz);
      pb.box(0.5, 2.6, 0.5, p.x + p.nx * out, 1.3, p.z + p.nz * out, '#39415a', ry);
      pb.box(2.4, 1.0, 0.2, p.x + p.nx * out, 3.0, p.z + p.nz * out, color, ry);
      pb.box(2.0, 0.22, 0.12, p.x + p.nx * out, 3.0, p.z + p.nz * out, label, ry);
    };
    sign(pit.entry + 6, -(half + 2.4), '#12351f', '#3ddc84');                 // PIT ENTRY
    sign(pit.entry + pit.total - 4, -(half + 2.4), '#3b2c0c', '#ffc46b');     // PIT EXIT
    // the 80 km/h limiter board where the lane proper begins
    const lp = at(pit.entry + pit.ramp);
    const lo = pit.centre(pit.ramp) - pit.laneW / 2 - 1.4;
    const lry = Math.atan2(lp.tx, lp.tz);
    pb.box(0.4, 2.2, 0.4, lp.x + lp.nx * lo, 1.1, lp.z + lp.nz * lo, '#39415a', lry);
    pb.box(1.5, 1.5, 0.16, lp.x + lp.nx * lo, 2.7, lp.z + lp.nz * lo, '#e9edf3', lry);
    pb.box(1.1, 1.1, 0.10, lp.x + lp.nx * lo, 2.7, lp.z + lp.nz * lo, '#d8443a', lry);
    scene.add(pb.mesh());
  }

  world.crew = makePitCrew(scene, built, pit, teams);
  world.pit = pit;

  const sc = scenery(built, theme); sc.name = 'scenery'; scene.add(sc);
  return world;
}
