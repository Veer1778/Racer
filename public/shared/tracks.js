// Shared between server and browser. Pure ESM, no runtime dependencies.
import { SAKHIR, SILVERSTONE, SPA_ } from './circuits.js';
import { DRIVERS } from './drivers.js';

export { DRIVERS, TEAMS, driverById } from './drivers.js';

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
    country: 'Bahrain',
    blurb: 'Desert night race. Huge braking zone into turn one, three genuine overtaking spots.',
    real: true, width: 14, laps: 3, runoff: 15,
    theme: { sky: '#0e1430', sky2: '#3a2a44', ground: '#c8a06a', ground2: '#b38f5e', asphalt: '#3a3f46', kerb: '#d8443a',
              runoff: '#8a6a42', desert: true, rock: '#9c7b4e', rock2: '#87683f', fence: '#2f3545', night: true },
    points: SAKHIR
  },
  {
    id: 'silverstone',
    name: 'Silverstone',
    country: 'Great Britain',
    blurb: 'Fast, open and flowing. The high-speed sweepers are the whole lap.',
    real: true, width: 14, laps: 3, runoff: 15,
    theme: { sky: '#5ba3d9', sky2: '#d9ecf7', ground: '#5c9c45', ground2: '#4f8a3d', asphalt: '#44494f', kerb: '#d8443a',
              runoff: '#6f7580', tree: '#2f6b34', tree2: '#3f8a44', fence: '#39405180' },
    points: SILVERSTONE
  },
  {
    id: 'spa',
    name: 'Spa',
    country: 'Belgium',
    blurb: 'Forest classic. Steep uphill left-right, then the longest flat-out run in the game.',
    real: true, width: 13, laps: 2, runoff: 13,
    theme: { sky: '#6d8aa6', sky2: '#c3d2de', ground: '#41763c', ground2: '#356032', asphalt: '#40454b', kerb: '#d8443a',
              runoff: '#6b7078', tree: '#27592c', tree2: '#35723a', fence: '#39414f' },
    points: SPA_
  },
  {
    id: 'kestrel',
    name: 'Kestrel Ring',
    country: 'Invented',
    blurb: 'Long straights and heavy braking. Slipstream country.',
    width: 15, laps: 8, runoff: 7,
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
    country: 'Invented',
    blurb: 'Street circuit under lights. Walls close, mistakes expensive.',
    width: 12, laps: 8, runoff: 4,
    theme: { sky: '#101a2e', sky2: '#32455f', ground: '#2f3847', ground2: '#28303d', asphalt: '#383d44', kerb: '#e8e8e8',
              runoff: '#4a515e', tree: '#2a4a3a', tree2: '#356048', fence: '#38404e', night: true },
    // Authored as r(theta) so the loop can never cross itself, with the main
    // straight generated as r = 250/cos(theta) — an exact straight line in
    // polar form. Without a straight there was nowhere to put a pit lane, and
    // hand-placed transition points onto it left 9 m hairpins at both ends.
    points: [
      [250, 101], [250, 121.9], [250, 144.3], [250, 168.6], [250, 195.3], [244.9, 220.5],
      [229.9, 238], [205.9, 245.4], [175, 240.8], [139.7, 223.5], [103.9, 195.4], [72.1, 161.9],
      [49.4, 135.6], [38.8, 135.2], [30.1, 141.6], [20.9, 148.9], [10.9, 156.5], [0, 163.8],
      [-11.9, 170.1], [-24.5, 174.5], [-37.5, 176.5], [-50.3, 175.6], [-62.4, 171.4], [-73, 164.1],
      [-81.7, 153.6], [-87.9, 140.7], [-91.6, 126.1], [-93.2, 111], [-93.3, 96.6], [-93.3, 84],
      [-94.5, 73.8], [-98.2, 66.2], [-105, 60.6], [-115.2, 56.2], [-128.2, 51.8], [-142.7, 46.4],
      [-157.4, 39.3], [-171, 30.2], [-182.2, 19.2], [-190.2, 6.6], [-194.3, -6.8], [-194.3, -20.4],
      [-190.1, -33.5], [-182.2, -45.4], [-170.9, -55.5], [-157.2, -63.5], [-142.1, -69.3], [-126.7, -73.1],
      [-112.3, -75.7], [-99.9, -78], [-90.1, -81.1], [-83.1, -86.1], [-78.5, -93.6], [-75.4, -103.7],
      [-72.6, -116.2], [-69.2, -130.1], [-64.3, -144.5], [-57.6, -158.3], [-48.9, -170.5], [-38.3, -180.4],
      [-26.4, -187.5], [-13.4, -191.4], [0, -192.1], [13.3, -189.8], [26, -184.8], [37.8, -177.8],
      [48.6, -169.5], [60.4, -165.9], [82.7, -185.6], [112.6, -211.7], [145.8, -233.3], [178.6, -245.8],
      [207.7, -247.5], [230.5, -238.7], [245, -220.6], [250, -195.3], [250, -168.6], [250, -144.3],
      [250, -121.9], [250, -101], [250, -81.2], [250, -62.3], [250, -44.1], [250, -26.3],
      [250, -8.7], [250, 8.7], [250, 26.3], [250, 44.1], [250, 62.3], [250, 81.2]
    ]
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

  // Curvature at each sample: the radius, and which side of the track the
  // centre of the bend is on. Anything offset from the centreline (runoff,
  // kerbs, barriers) has to stay inside that radius on the concave side or the
  // offset polyline folds through itself, which at a hairpin drags the barrier
  // straight across the racing line.
  for (let i = 0; i < count; i++) {
    const a = line[i], b = line[(i + 4) % count];
    let dh = Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz);
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const arc = 4 * step;
    a.radius = Math.abs(dh) < 1e-3 ? 1e4 : arc / Math.abs(dh);
    const cross = a.tx * b.tz - a.tz * b.tx;
    a.inner = cross > 0 ? 1 : -1;      // offsets in this direction are limited
  }

  // The clamp has to use the tightest radius nearby, not the radius at this
  // exact sample: clamping each sample independently leaves a zigzag where a
  // hairpin starts, and the zigzag still cuts the corner.
  const win = Math.ceil(24 / step);
  const half = track.width / 2;
  for (let i = 0; i < count; i++) {
    let r = line[i].radius;
    for (let k = -win; k <= win; k++) r = Math.min(r, line[((i + k) % count + count) % count].radius);
    line[i].rmin = r;
    // How far a feature may sit on the inside of this bend. Below the floor
    // there is simply no room for one — the two sides of a hairpin are closer
    // together than the track is wide — and it must be left out rather than
    // squeezed onto the racing line.
    line[i].innerCap = Math.max(half + 3, r * 0.62);
    line[i].noInner = r * 0.62 < half + 3;
  }

  return {
    id: track.id, name: track.name, country: track.country, width: track.width, theme: track.theme,
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

// The furthest a feature can sit from the centreline at this sample without the
// offset curve folding over itself. Only the concave side is limited.
export function maxOffset(sample, signedOffset) {
  const d = Math.abs(signedOffset);
  if (Math.sign(signedOffset) !== sample.inner) return d;
  return Math.min(d, sample.innerCap || d);
}

// True where a feature on this side would have to cut across the track.
export function noRoom(sample, signedOffset) {
  return Math.sign(signedOffset) === sample.inner && !!sample.noInner;
}

// Walks the centreline forward by a distance in metres.
export function ahead(built, hint, metres) {
  const N = built.line.length;
  const i = ((hint + Math.round(metres / built.step)) % N + N) % N;
  return built.line[i];
}
