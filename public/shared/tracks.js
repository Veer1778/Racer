// Shared between server and browser. Pure ESM, no runtime dependencies.
import { SAKHIR, JEDDAH, MELBOURNE, SUZUKA, SHANGHAI, MIAMI, IMOLA, MONACO, BARCELONA, MONTREAL, SPIELBERG, SILVERSTONE, BUDAPEST, SPA, ZANDVOORT, MONZA, BAKU, SINGAPORE, AUSTIN, MEXICO, SAOPAULO, LUSAIL, YASMARINA } from './circuits.js';
import { DRIVERS } from './drivers.js';

export { DRIVERS, TEAMS, driverById } from './drivers.js';

export const TRACKS = [
  {
    id: 'sakhir', name: 'Sakhir', country: 'Bahrain',
    blurb: 'Desert night race. Huge braking zone into turn one, three real overtaking spots.',
    real: true, width: 17, runoff: 16, laps: 3,
    theme: { sky: '#0e1430', sky2: '#3a2a44', ground: '#c8a06a', ground2: '#b38f5e', asphalt: '#3a3f46', kerb: '#d8443a', runoff: '#8a6a42', desert: true, rock: '#9c7b4e', rock2: '#87683f', fence: '#2f3545', night: true },
    points: SAKHIR
  },
  {
    id: 'jeddah', name: 'Jeddah', country: 'Saudi Arabia',
    blurb: 'Fastest street circuit there is. Walls the whole way, barely a corner below 200.',
    real: true, width: 15, runoff: 7, laps: 3,
    theme: { sky: '#0b1224', sky2: '#2a3b57', ground: '#39424f', ground2: '#2f3743', asphalt: '#3a3f47', kerb: '#d8443a', runoff: '#555c68', tree: '#2a4a3a', tree2: '#356048', fence: '#38404e', night: true },
    points: JEDDAH
  },
  {
    id: 'melbourne', name: 'Melbourne', country: 'Australia',
    blurb: 'Parkland circuit round a lake. Fast, flowing and unforgiving on the exits.',
    real: true, width: 16, runoff: 11, laps: 3,
    theme: { sky: '#74b6e0', sky2: '#dceffa', ground: '#4f9350', ground2: '#438044', asphalt: '#43484e', kerb: '#d8443a', runoff: '#6d737d', tree: '#2c6b3a', tree2: '#3c8a4a', fence: '#38404e' },
    points: MELBOURNE
  },
  {
    id: 'suzuka', name: 'Suzuka', country: 'Japan',
    blurb: 'The figure of eight. Esses in the first sector that reward commitment and nothing else.',
    real: true, width: 15, runoff: 12, laps: 3,
    theme: { sky: '#5ba3d9', sky2: '#d9ecf7', ground: '#5c9c45', ground2: '#4f8a3d', asphalt: '#44494f', kerb: '#d8443a', runoff: '#6f7580', tree: '#2f6b34', tree2: '#3f8a44', fence: '#394051' },
    points: SUZUKA
  },
  {
    id: 'shanghai', name: 'Shanghai', country: 'China',
    blurb: 'The long double-apex opener, then a back straight that goes on forever.',
    real: true, width: 17, runoff: 16, laps: 3,
    theme: { sky: '#8fa8bd', sky2: '#d6e2ea', ground: '#7d8a6a', ground2: '#6b7a5c', asphalt: '#41464c', kerb: '#d8443a', runoff: '#74797f', tree: '#3a6b42', tree2: '#4a8452', fence: '#39414f' },
    points: SHANGHAI
  },
  {
    id: 'miami', name: 'Miami', country: 'United States',
    blurb: 'Stadium infield wrapped in long flat-out runs. Hot, bumpy and technical.',
    real: true, width: 16, runoff: 10, laps: 3,
    theme: { sky: '#74b6e0', sky2: '#dceffa', ground: '#4f9350', ground2: '#438044', asphalt: '#43484e', kerb: '#d8443a', runoff: '#6d737d', tree: '#2c6b3a', tree2: '#3c8a4a', fence: '#38404e' },
    points: MIAMI
  },
  {
    id: 'imola', name: 'Imola', country: 'Italy',
    blurb: 'Old-school and narrow. Kerbs you take or you lose the lap.',
    real: true, width: 14, runoff: 10, laps: 3,
    theme: { sky: '#5ba3d9', sky2: '#d9ecf7', ground: '#5c9c45', ground2: '#4f8a3d', asphalt: '#44494f', kerb: '#d8443a', runoff: '#6f7580', tree: '#2f6b34', tree2: '#3f8a44', fence: '#394051' },
    points: IMOLA
  },
  {
    id: 'monaco', name: 'Monaco', country: 'Monaco',
    blurb: 'The barriers are the track limits. Qualifying is the race.',
    real: true, width: 14, runoff: 5, laps: 4,
    theme: { sky: '#101a2e', sky2: '#32455f', ground: '#2f3847', ground2: '#28303d', asphalt: '#383d44', kerb: '#e8e8e8', runoff: '#4a515e', tree: '#2a4a3a', tree2: '#356048', fence: '#38404e', night: true },
    points: MONACO
  },
  {
    id: 'barcelona', name: 'Barcelona', country: 'Spain',
    blurb: 'The reference lap. Long rights that punish anything less than a perfect balance.',
    real: true, width: 16, runoff: 14, laps: 3,
    theme: { sky: '#8fa8bd', sky2: '#d6e2ea', ground: '#7d8a6a', ground2: '#6b7a5c', asphalt: '#41464c', kerb: '#d8443a', runoff: '#74797f', tree: '#3a6b42', tree2: '#4a8452', fence: '#39414f' },
    points: BARCELONA
  },
  {
    id: 'montreal', name: 'Montreal', country: 'Canada',
    blurb: 'Stop-start island circuit. Brakes and traction, and a wall at the last chicane.',
    real: true, width: 15, runoff: 6, laps: 3,
    theme: { sky: '#74b6e0', sky2: '#dceffa', ground: '#4f9350', ground2: '#438044', asphalt: '#43484e', kerb: '#d8443a', runoff: '#6d737d', tree: '#2c6b3a', tree2: '#3c8a4a', fence: '#38404e' },
    points: MONTREAL
  },
  {
    id: 'spielberg', name: 'Spielberg', country: 'Austria',
    blurb: 'Shortest lap of the year. Three big braking zones and not much else.',
    real: true, width: 16, runoff: 13, laps: 4,
    theme: { sky: '#5ba3d9', sky2: '#d9ecf7', ground: '#5c9c45', ground2: '#4f8a3d', asphalt: '#44494f', kerb: '#d8443a', runoff: '#6f7580', tree: '#2f6b34', tree2: '#3f8a44', fence: '#394051' },
    points: SPIELBERG
  },
  {
    id: 'silverstone', name: 'Silverstone', country: 'Great Britain',
    blurb: 'Fast, open and flowing. The high-speed sweepers are the whole lap.',
    real: true, width: 17, runoff: 15, laps: 3,
    theme: { sky: '#5ba3d9', sky2: '#d9ecf7', ground: '#5c9c45', ground2: '#4f8a3d', asphalt: '#44494f', kerb: '#d8443a', runoff: '#6f7580', tree: '#2f6b34', tree2: '#3f8a44', fence: '#394051' },
    points: SILVERSTONE
  },
  {
    id: 'budapest', name: 'Budapest', country: 'Hungary',
    blurb: 'Twisty and tight. Track position matters more than anywhere but Monaco.',
    real: true, width: 15, runoff: 11, laps: 3,
    theme: { sky: '#5ba3d9', sky2: '#d9ecf7', ground: '#5c9c45', ground2: '#4f8a3d', asphalt: '#44494f', kerb: '#d8443a', runoff: '#6f7580', tree: '#2f6b34', tree2: '#3f8a44', fence: '#394051' },
    points: BUDAPEST
  },
  {
    id: 'spa', name: 'Spa', country: 'Belgium',
    blurb: 'Forest classic. The uphill left-right, then the longest flat-out run of the year.',
    real: true, width: 16, runoff: 13, laps: 2,
    theme: { sky: '#6d8aa6', sky2: '#c3d2de', ground: '#41763c', ground2: '#356032', asphalt: '#40454b', kerb: '#d8443a', runoff: '#6b7078', tree: '#27592c', tree2: '#35723a', fence: '#39414f' },
    points: SPA
  },
  {
    id: 'zandvoort', name: 'Zandvoort', country: 'Netherlands',
    blurb: 'Banked turns through the dunes. Narrow, old and relentless.',
    real: true, width: 14, runoff: 7, laps: 4,
    theme: { sky: '#7fb0cf', sky2: '#dbe9f2', ground: '#cbbb8f', ground2: '#b8a87d', asphalt: '#42474d', kerb: '#d8443a', runoff: '#8a7f5e', desert: true, rock: '#b7a67d', rock2: '#a3926a', fence: '#39414f' },
    points: ZANDVOORT
  },
  {
    id: 'monza', name: 'Monza', country: 'Italy',
    blurb: 'The temple of speed. Four chicanes and the rest flat out.',
    real: true, width: 16, runoff: 12, laps: 3,
    theme: { sky: '#6d8aa6', sky2: '#c3d2de', ground: '#41763c', ground2: '#356032', asphalt: '#40454b', kerb: '#d8443a', runoff: '#6b7078', tree: '#27592c', tree2: '#35723a', fence: '#39414f' },
    points: MONZA
  },
  {
    id: 'baku', name: 'Baku', country: 'Azerbaijan',
    blurb: 'Castle section tighter than Monaco, then two kilometres flat along the sea.',
    real: true, width: 14, runoff: 4, laps: 3,
    theme: { sky: '#101a2e', sky2: '#32455f', ground: '#2f3847', ground2: '#28303d', asphalt: '#383d44', kerb: '#e8e8e8', runoff: '#4a515e', tree: '#2a4a3a', tree2: '#356048', fence: '#38404e', night: true },
    points: BAKU
  },
  {
    id: 'singapore', name: 'Singapore', country: 'Singapore',
    blurb: 'Night race under the lights. Bumps, walls and no let-up.',
    real: true, width: 13, runoff: 4, laps: 3,
    theme: { sky: '#0b1224', sky2: '#2a3b57', ground: '#39424f', ground2: '#2f3743', asphalt: '#3a3f47', kerb: '#d8443a', runoff: '#555c68', tree: '#2a4a3a', tree2: '#356048', fence: '#38404e', night: true },
    points: SINGAPORE
  },
  {
    id: 'austin', name: 'Austin', country: 'United States',
    blurb: 'Blind uphill first corner, then a sector of Silverstone esses.',
    real: true, width: 17, runoff: 15, laps: 3,
    theme: { sky: '#8fa8bd', sky2: '#d6e2ea', ground: '#7d8a6a', ground2: '#6b7a5c', asphalt: '#41464c', kerb: '#d8443a', runoff: '#74797f', tree: '#3a6b42', tree2: '#4a8452', fence: '#39414f' },
    points: AUSTIN
  },
  {
    id: 'mexico', name: 'Mexico City', country: 'Mexico',
    blurb: 'Thin air. Low downforce, long straight, a stadium section at the end.',
    real: true, width: 16, runoff: 12, laps: 4,
    theme: { sky: '#74b6e0', sky2: '#dceffa', ground: '#4f9350', ground2: '#438044', asphalt: '#43484e', kerb: '#d8443a', runoff: '#6d737d', tree: '#2c6b3a', tree2: '#3c8a4a', fence: '#38404e' },
    points: MEXICO
  },
  {
    id: 'saopaulo', name: 'Sao Paulo', country: 'Brazil',
    blurb: 'Anticlockwise and uphill to the line. Short lap, big grip changes.',
    real: true, width: 15, runoff: 10, laps: 4,
    theme: { sky: '#8fa8bd', sky2: '#d6e2ea', ground: '#7d8a6a', ground2: '#6b7a5c', asphalt: '#41464c', kerb: '#d8443a', runoff: '#74797f', tree: '#3a6b42', tree2: '#4a8452', fence: '#39414f' },
    points: SAOPAULO
  },
  {
    id: 'lusail', name: 'Lusail', country: 'Qatar',
    blurb: 'Medium-and-fast all the way round. Brutal on tyres.',
    real: true, width: 17, runoff: 15, laps: 3,
    theme: { sky: '#0e1430', sky2: '#3a2a44', ground: '#c8a06a', ground2: '#b38f5e', asphalt: '#3a3f46', kerb: '#d8443a', runoff: '#8a6a42', desert: true, rock: '#9c7b4e', rock2: '#87683f', fence: '#2f3545', night: true },
    points: LUSAIL
  },
  {
    id: 'yasmarina', name: 'Yas Marina', country: 'Abu Dhabi',
    blurb: 'Sunset to floodlight. Long straights into slow corners.',
    real: true, width: 16, runoff: 14, laps: 3,
    theme: { sky: '#0b1224', sky2: '#2a3b57', ground: '#39424f', ground2: '#2f3743', asphalt: '#3a3f47', kerb: '#d8443a', runoff: '#555c68', tree: '#2a4a3a', tree2: '#356048', fence: '#38404e', night: true },
    points: YASMARINA
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
  // How close the nearest OTHER part of the lap passes. Local radius is not
  // the only thing that limits how far a barrier can sit from the centreline:
  // at a hairpin the two legs run within a few tens of metres of each other,
  // and runoff sized to the radius alone lands on the next piece of road. Only
  // samples far away along the lap count, or a sample's own neighbours would
  // always be the nearest thing to it.
  // Can a barrier stand here at all? The exact question is whether the barrier
  // post would end up on a piece of road — its own, or another part of the lap
  // that doubles back. Heuristics about arc length and heading got close and
  // still left a post across the track at four circuits' hairpins, so this asks
  // the question directly: put the post where it would go and see whether any
  // centreline sample is within half a track width of it.
  //
  // A uniform grid keeps it O(N): a lap of Spa is 1100 samples and the naive
  // form is a million distance checks every time a track is built, including
  // twenty-three times over when the lobby draws its circuit maps.
  const CELL = 34;
  const bucket = new Map();
  const key = (x, z) => (Math.floor(x / CELL) * 73856093 ^ Math.floor(z / CELL) * 19349663);
  for (let i = 0; i < count; i++) {
    const k = key(line[i].x, line[i].z);
    let arr = bucket.get(k);
    if (!arr) bucket.set(k, arr = []);
    arr.push(i);
  }
  const onRoad = (x, z, clear) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), c2 = clear * clear;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = bucket.get(key((cx + a) * CELL, (cz + b) * CELL));
      if (!arr) continue;
      for (let n = 0; n < arr.length; n++) {
        const p = line[arr[n]];
        const dx = p.x - x, dz = p.z - z;
        if (dx * dx + dz * dz < c2) return true;
      }
    }
    return false;
  };

  const win = Math.ceil(24 / step);
  const half = track.width / 2;
  for (let i = 0; i < count; i++) {
    let r = line[i].radius;
    for (let k = -win; k <= win; k++) r = Math.min(r, line[((i + k) % count + count) % count].radius);
    line[i].rmin = r;
    line[i].wallCap = 1e4;
    // How far a feature may sit on the inside of this bend. Below the floor
    // there is simply no room for one — the two sides of a hairpin are closer
    // together than the track is wide — and it must be left out rather than
    // squeezed onto the racing line.
    line[i].innerCap = Math.max(half + 3, r * 0.62);
    line[i].noInner = r * 0.62 < half + 3;
  }

  // Now the offsets are known, test where each barrier would actually stand.
  const barrier = half + (track.runoff || 6);
  for (let i = 0; i < count; i++) {
    const p = line[i];
    let blocked = false;
    for (const sgn of [1, -1]) {
      const o = sgn * maxOffset(p, sgn * barrier);
      if (onRoad(p.x + p.nx * o, p.z + p.nz * o, half + 0.6)) blocked = true;
    }
    p.noWall = blocked;
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
  let d = Math.abs(signedOffset);
  // the distance to the next stretch of road limits BOTH sides; the corner
  // radius limits only the side the bend curves towards
  if (sample.wallCap) d = Math.min(d, sample.wallCap);
  if (Math.sign(signedOffset) !== sample.inner) return d;
  return Math.min(d, sample.innerCap || d);
}

// True where a feature on this side would have to cut across the track.
export function noRoom(sample, signedOffset) {
  if (sample.noWall) return true;             // another leg of the lap is too close
  return Math.sign(signedOffset) === sample.inner && !!sample.noInner;
}

// Walks the centreline forward by a distance in metres.
export function ahead(built, hint, metres) {
  const N = built.line.length;
  const i = ((hint + Math.round(metres / built.step)) % N + N) % N;
  return built.line[i];
}
