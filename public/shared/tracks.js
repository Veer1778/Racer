// Shared between server and browser. Pure ESM, no runtime dependencies.
import { SAKHIR, NORTHANTS, ARDENNES } from './circuits.js';

export const DRIVERS = [
  { id: 'kaito',  name: 'Kaito Renn',     team: 'Vantari',    color: '#e2334a', trim: '#ffd166', accel: 1.00, top: 1.00, grip: 1.00 },
  { id: 'noor',   name: 'Noor Bashir',    team: 'Solaxis',    color: '#f5a524', trim: '#1b2230', accel: 1.05, top: 0.96, grip: 1.02 },
  { id: 'vance',  name: 'Elias Vance',    team: 'Ardent',     color: '#3a7bd5', trim: '#e9edf5', accel: 0.95, top: 1.05, grip: 0.98 },
  { id: 'mira',   name: 'Mira Okonkwo',   team: 'Kestrel',    color: '#28c76f', trim: '#0d1018', accel: 1.02, top: 0.99, grip: 1.03 },
  { id: 'rook',   name: 'Dmitri Rook',    team: 'Nordvik',    color: '#a66bff', trim: '#e9edf5', accel: 0.98, top: 1.03, grip: 0.97 },
  { id: 'silva',  name: 'Tomas Silva',    team: 'Verano',     color: '#00d1d1', trim: '#0d1018', accel: 1.03, top: 0.97, grip: 1.01 },
  { id: 'anaya',  name: 'Anaya Deshmukh', team: 'Meridian',   color: '#ff6f91', trim: '#2b1721', accel: 1.01, top: 1.01, grip: 1.00 },
  { id: 'hale',   name: 'Brett Hale',     team: 'Copperline', color: '#c9d1d9', trim: '#e2334a', accel: 0.97, top: 1.04, grip: 0.99 }
];

// Fictional layouts are authored in polar form (radius at a given angle), which
// can never produce a loop that crosses itself.
function polar(list, squash = 1) {
  return list.map(([a, r]) => {
    const t = a * Math.PI / 180;
    return [+(Math.cos(t) * r).toFixed(1), +(Math.sin(t) * r * squash).toFixed(1)];
  });
}

export const TRACKS = [
  {
    id: 'sakhir',
    name: 'Sakhir',
    blurb: 'The desert night race. Heavy braking into turn one, three real overtaking spots.',
    real: true, width: 14, laps: 2, runoff: 15,
    theme: { sky: '#0e1430', sky2: '#3a2a44', ground: '#c8a06a', ground2: '#b38f5e', asphalt: '#3a3f46', kerb: '#d8443a',
              runoff: '#8a6a42', desert: true, rock: '#9c7b4e', rock2: '#87683f', fence: '#2f3545', night: true },
    points: SAKHIR
  },
  {
    id: 'northants',
    name: 'Northants',
    blurb: 'Fast, open and flowing. The high-speed sweeper sequence is the whole lap.',
    real: true, width: 14, laps: 2, runoff: 15,
    theme: { sky: '#5ba3d9', sky2: '#d9ecf7', ground: '#5c9c45', ground2: '#4f8a3d', asphalt: '#44494f', kerb: '#d8443a',
              runoff: '#6f7580', tree: '#2f6b34', tree2: '#3f8a44', fence: '#39405180' },
    points: NORTHANTS
  },
  {
    id: 'ardennes',
    name: 'Ardennes',
    blurb: 'Forest classic. The uphill left-right at the bottom, then a very long flat-out blast.',
    real: true, width: 13, laps: 2, runoff: 13,
    theme: { sky: '#6d8aa6', sky2: '#c3d2de', ground: '#41763c', ground2: '#356032', asphalt: '#40454b', kerb: '#d8443a',
              runoff: '#6b7078', tree: '#27592c', tree2: '#35723a', fence: '#39414f' },
    points: ARDENNES
  },
  {
    id: 'kestrel',
    name: 'Kestrel Ring',
    blurb: 'Fictional. Long straights and heavy braking zones. Slipstream country.',
    width: 15, laps: 3, runoff: 7,
    theme: { sky: '#6fb3dd', sky2: '#cfe7f5', ground: '#478a4d', ground2: '#3b7442', asphalt: '#42474e', kerb: '#d8443a',
              runoff: '#70767f', tree: '#2c6b3a', tree2: '#3c8a4a', fence: '#38404e' },
    points: polar([
      [0, 330], [18, 332], [36, 322], [54, 292], [72, 234], [90, 196],
      [108, 188], [126, 214], [144, 206], [162, 150], [180, 128], [198, 168],
      [216, 214], [234, 206], [252, 154], [270, 140], [288, 186], [306, 252],
      [324, 302], [342, 326]
    ], 1.2)
  },
  {
    id: 'cobalt',
    name: 'Cobalt Bay',
    blurb: 'Fictional street circuit. Walls close, mistakes expensive.',
    width: 12, laps: 3, runoff: 4,
    theme: { sky: '#101a2e', sky2: '#32455f', ground: '#2f3847', ground2: '#28303d', asphalt: '#383d44', kerb: '#e8e8e8',
              runoff: '#4a515e', tree: '#2a4a3a', tree2: '#356048', fence: '#38404e', night: true },
    points: polar([
      [0, 236], [15, 232], [30, 206], [45, 156], [60, 122], [75, 134],
      [90, 172], [105, 186], [120, 154], [135, 116], [150, 108], [165, 140],
      [180, 184], [195, 196], [210, 162], [225, 120], [240, 112], [255, 146],
      [270, 188], [285, 198], [300, 168], [315, 140], [330, 170], [345, 214]
    ], 0.96)
  }
];

/* ------------------------------------------------------------- building */

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export const SPACING = 6;   // metres between centreline samples, every circuit

// Splines through the control points, then resamples at a constant arc length
// so that every downstream calculation can treat sample count as distance.
export function buildTrack(track, spacing = SPACING) {
  const pts = track.points, n = pts.length;
  const fine = [];
  const sub = Math.max(2, Math.min(24, Math.ceil(80 / Math.max(1, n / 40))));
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      fine.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), z: catmull(p0[1], p1[1], p2[1], p3[1], t) });
    }
  }

  // arc length of the fine curve
  const F = fine.length;
  const seg = new Array(F);
  let total = 0;
  for (let i = 0; i < F; i++) {
    const a = fine[i], b = fine[(i + 1) % F];
    seg[i] = Math.hypot(b.x - a.x, b.z - a.z);
    total += seg[i];
  }

  // resample at even spacing
  const count = Math.max(16, Math.round(total / spacing));
  const step = total / count;
  const line = [];
  let idx = 0, run = 0;
  for (let k = 0; k < count; k++) {
    const want = k * step;
    while (run + seg[idx] < want && idx < F - 1) { run += seg[idx]; idx++; }
    const t = seg[idx] > 0 ? (want - run) / seg[idx] : 0;
    const a = fine[idx], b = fine[(idx + 1) % F];
    line.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  }

  let acc = 0;
  for (let i = 0; i < count; i++) {
    const a = line[i], b = line[(i + 1) % count];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1e-6;
    a.tx = dx / len; a.tz = dz / len;
    a.nx = -a.tz; a.nz = a.tx;
    a.seg = len;
    a.dist = acc;
    acc += len;
  }

  // curvature radius at each sample, precomputed for the bots and for scenery
  for (let i = 0; i < count; i++) {
    const a = line[i], b = line[(i + 4) % count];
    let dh = Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz);
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const arc = 4 * step;
    a.radius = Math.abs(dh) < 1e-3 ? 1e4 : arc / Math.abs(dh);
  }

  return {
    id: track.id, name: track.name, width: track.width, theme: track.theme,
    laps: track.laps || 3, real: !!track.real,
    runoff: track.runoff || 6,        // metres of asphalt before the barrier
    line, length: acc, step
  };
}

export function getTrack(id) {
  return TRACKS.find(t => t.id === id) || TRACKS[0];
}

/* ---------------------------------------------------------- projection */

// Nearest point on the centreline. `hint` is the sample the car was on last
// tick; the search stays in a window around it so that a layout which doubles
// back on itself can never make a car jump to the wrong part of the lap.
export function project(built, x, z, hint = -1) {
  const line = built.line, N = line.length;
  let best = -1, bestD = Infinity;

  const scan = (i) => {
    const p = line[i];
    const dx = p.x - x, dz = p.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  };

  if (hint >= 0) {
    const win = Math.ceil(60 / built.step) + 6;      // ~60 m either way
    for (let k = -win; k <= win; k++) scan(((hint + k) % N + N) % N);
  } else {
    for (let i = 0; i < N; i++) scan(i);
  }

  const p = line[best];
  const dx = x - p.x, dz = z - p.z;
  const along = dx * p.tx + dz * p.tz;
  const lateral = dx * p.nx + dz * p.nz;
  return { idx: best, lateral, dist: p.dist + along, point: p };
}

// Walks the centreline forward by a distance in metres.
export function ahead(built, hint, metres) {
  const N = built.line.length;
  const i = ((hint + Math.round(metres / built.step)) % N + N) % N;
  return built.line[i];
}
