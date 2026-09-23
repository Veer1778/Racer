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
  const N = line.length;
  const emit = (i, pos, col) => {
    const a = line[i], bb = line[(i + 1) % N];
    const sgn = Math.sign(offset) || 1;
    if (noRoom(a, offset) || noRoom(bb, offset)) return;      // no barrier here
    const oIn = sgn * maxOffset(a, offset), oOut = oIn + thick * sgn;
    const oInB = sgn * maxOffset(bb, offset), oOutB = oInB + thick * sgn;
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
  return chunkedMesh(N, Math.max(24, Math.ceil(N / 26)), emit,
                     new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
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
  const flush = () => { if (inChunk) { group.add(b.mesh()); b = new PartBuilder(); inChunk = 0; } };
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
  const gsFlush = () => { if (gsCount) { group.add(gs.mesh()); gs = new PartBuilder(); gsCount = 0; } };
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
  gsFlush();
  return group;
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
  let next = 0, nextPuff = 0;

  const spawn = (x, y, z, vx, vy, vz, size, life, color, gravity) => {
    const p = parts[next = (next + 1) % N];
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.rx = Math.random() * 6; p.ry = Math.random() * 6;
    p.spin = (Math.random() - 0.5) * 14;
    p.size = size; p.life = life; p.max = life; p.g = gravity;
    p.color = color;
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
    },
    update(dt) {
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
    box: new THREE.Color('#ffc46b')
  };

  // a quad between two samples, from lateral a1..a2 at `i` to b1..b2 at `i+1`
  let pushPos = pos, pushCol = col;
  const band = (a, b, a1, a2, b1, b2, c, y1 = 0, y2 = 0) => {
    const A1 = [a.x + a.nx * a1, y1, a.z + a.nz * a1], A2 = [a.x + a.nx * a2, y2, a.z + a.nz * a2];
    const B1 = [b.x + b.nx * b1, y1, b.z + b.nz * b1], B2 = [b.x + b.nx * b2, y2, b.z + b.nz * b2];
    pushPos.push(...A1, ...A2, ...B2, ...A1, ...B2, ...B1);
    for (let k = 0; k < 6; k++) pushCol.push(c.r, c.g, c.b);
  };
  const clamp = (p, o) => Math.sign(o) * maxOffset(p, o);

  const inPit = d => pit && pit.usable && (d >= pit.entry || d <= pit.exit);
  const boxFrom = pit ? pit.box : 0, boxTo = pit ? pit.box + 26 : 0;

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

      // runoff out to the barrier, minus the pit lane where that applies
      const outer = clamp(a, sgn * (half + RO)), outerB = clamp(b, sgn * (half + RO));
      const pitSide = sgn < 0 && inPit(a.dist) && inPit(b.dist);
      if (!pitSide) {
        band(a, b, kerbOut, outer, kerbOutB, outerB, C.runoff);
        continue;
      }


      // pit side: runoff strip, boundary line, the lane itself, then the wall side
      const o = pit.offset;                       // negative, inside the barrier
      const laneIn = o + 3.4, laneOut = o - 3.4;
      band(a, b, kerbOut, laneIn, kerbOutB, laneIn, C.runoff);
      band(a, b, laneIn, laneIn - 0.35, laneIn, laneIn - 0.35, C.line);
      const inBox = a.dist >= boxFrom && a.dist < boxTo;
      band(a, b, laneIn - 0.35, laneOut, laneIn - 0.35, laneOut, inBox ? C.box : C.pit);
      band(a, b, laneOut, outer, laneOut, outerB, C.runoff);
    }
  };

  return chunkedMesh(N, Math.max(24, Math.ceil(N / 26)), emit,
                     new THREE.MeshLambertMaterial({ vertexColors: true }));
}

/* ------------------------------------------------------------ the world */

export function buildWorld(scene, built, theme) {
  const half = built.width / 2;
  const line = built.line, N = line.length;

  scene.background = new THREE.Color(theme.sky2);
  scene.fog = new THREE.Fog(theme.sky2, 360, 1400);

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
  const pit = pitGeometry(built);
  scene.add(roadSurface(built, theme, pit));

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

  // pit furniture: the box marker, a limiter board at the entry and the exit
  if (pit.usable) {
    const pb = new PartBuilder();
    const at = d => line[Math.round(((d % built.length) + built.length) % built.length / built.step) % N];
    const bp = at(pit.box + 10), o = pit.offset;
    const ry = p => Math.atan2(p.tx, p.tz);
    pb.box(0.6, 3.2, 0.6, bp.x + bp.nx * (o - 4.2), 1.6, bp.z + bp.nz * (o - 4.2), '#e2334a', ry(bp));
    pb.box(2.6, 1.1, 0.25, bp.x + bp.nx * (o - 4.6), 3.1, bp.z + bp.nz * (o - 4.6), '#0e1117', ry(bp));
    for (let k = 0; k < 6; k++) {                       // garage boards down the lane
      const g = at(pit.box - 30 + k * 16);
      pb.box(0.4, 2.4, 0.4, g.x + g.nx * (o - 4.2), 1.2, g.z + g.nz * (o - 4.2), '#39415a', ry(g));
    }
    const ep = at(pit.entry + 8), xp = at(pit.exit);
    pb.box(0.5, 2.6, 0.5, ep.x + ep.nx * (o + 3.9), 1.3, ep.z + ep.nz * (o + 3.9), '#3ddc84', ry(ep));
    pb.box(2.2, 0.9, 0.2, ep.x + ep.nx * (o + 3.9), 2.9, ep.z + ep.nz * (o + 3.9), '#12351f', ry(ep));
    pb.box(0.5, 2.6, 0.5, xp.x + xp.nx * (o + 3.9), 1.3, xp.z + xp.nz * (o + 3.9), '#ffc46b', ry(xp));
    scene.add(pb.mesh());
  }

  scene.add(scenery(built, theme));
}
