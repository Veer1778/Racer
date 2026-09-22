// Shared between server and browser. Pure ESM, no imports.
// All circuits and drivers are fictional.

export const DRIVERS = [
  { id: 'kaito',  name: 'Kaito Renn',      team: 'Vantari',   color: '#e2334a', accel: 1.00, top: 1.00, grip: 1.00 },
  { id: 'noor',   name: 'Noor Bashir',     team: 'Solaxis',   color: '#f5a524', accel: 1.05, top: 0.96, grip: 1.02 },
  { id: 'vance',  name: 'Elias Vance',     team: 'Ardent',    color: '#3a7bd5', accel: 0.95, top: 1.05, grip: 0.98 },
  { id: 'mira',   name: 'Mira Okonkwo',    team: 'Kestrel',   color: '#28c76f', accel: 1.02, top: 0.99, grip: 1.03 },
  { id: 'rook',   name: 'Dmitri Rook',     team: 'Nordvik',   color: '#a66bff', accel: 0.98, top: 1.03, grip: 0.97 },
  { id: 'silva',  name: 'Tomas Silva',     team: 'Verano',    color: '#00d1d1', accel: 1.03, top: 0.97, grip: 1.01 },
  { id: 'anaya',  name: 'Anaya Deshmukh',  team: 'Meridian',  color: '#ff6f91', accel: 1.01, top: 1.01, grip: 1.00 },
  { id: 'hale',   name: 'Brett Hale',      team: 'Copperline', color: '#c9d1d9', accel: 0.97, top: 1.04, grip: 0.99 }
];

// Layouts are authored in polar form: [angle°, radius]. Interpolating a loop
// whose radius is a function of angle keeps it from ever crossing itself, which
// matters because lap timing and position both rely on projecting onto the
// centreline. Tuned so opposite stretches never share runoff.
function polar(list, cx = 0, cz = 0, squash = 1) {
  return list.map(([a, r]) => {
    const t = a * Math.PI / 180;
    return [+(cx + Math.cos(t) * r).toFixed(1), +(cz + Math.sin(t) * r * squash).toFixed(1)];
  });
}

// Control points are in metres. Each track is a closed loop.
export const TRACKS = [
  {
    id: 'kestrel',
    name: 'Kestrel Ring',
    blurb: 'Long straights, heavy braking zones. Slipstream country.',
    width: 15,
    sky: '#0b1020', ground: '#14361f', kerb: '#d8443a',
    points: polar([
      [0, 330], [18, 332], [36, 322], [54, 292], [72, 234], [90, 196],
      [108, 188], [126, 214], [144, 206], [162, 150], [180, 128], [198, 168],
      [216, 214], [234, 206], [252, 154], [270, 140], [288, 186], [306, 252],
      [324, 302], [342, 326]
    ], 0, 0, 1.2)
  },
  {
    id: 'cobalt',
    name: 'Cobalt Bay',
    blurb: 'Street circuit. Walls close, mistakes expensive.',
    width: 12,
    sky: '#070d18', ground: '#1b2230', kerb: '#e8e8e8',
    points: polar([
      [0, 236], [15, 232], [30, 206], [45, 156], [60, 122], [75, 134],
      [90, 172], [105, 186], [120, 154], [135, 116], [150, 108], [165, 140],
      [180, 184], [195, 196], [210, 162], [225, 120], [240, 112], [255, 146],
      [270, 188], [285, 198], [300, 168], [315, 140], [330, 170], [345, 214]
    ], 0, 0, 0.96)
  },
  {
    id: 'verde',
    name: 'Verde Alta',
    blurb: 'Flowing high-speed esses through the hills.',
    width: 16,
    sky: '#0a1410', ground: '#1e4029', kerb: '#ffd166',
    points: polar([
      [0, 300], [20, 286], [40, 232], [60, 186], [80, 202], [100, 252],
      [120, 264], [140, 216], [160, 176], [180, 198], [200, 252], [220, 272],
      [240, 228], [260, 178], [280, 170], [300, 216], [320, 268], [340, 292]
    ], 0, 0, 1.08)
  },
  {
    id: 'dunecrest',
    name: 'Dunecrest',
    blurb: 'Night race. Fast, wide and relentless.',
    width: 18,
    sky: '#12080f', ground: '#3a2c1c', kerb: '#ff8a3d',
    points: polar([
      [0, 384], [22, 380], [44, 348], [66, 288], [88, 252], [110, 274],
      [132, 318], [154, 306], [176, 246], [198, 214], [220, 244], [242, 304],
      [264, 322], [286, 276], [308, 232], [330, 276], [352, 356]
    ], 0, 0, 1.12)
  }
];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Samples the closed control polygon into an evenly-ish spaced centreline.
export function buildTrack(track, perSeg = 14) {
  const pts = track.points;
  const n = pts.length;
  const line = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg;
      line.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), z: catmull(p0[1], p1[1], p2[1], p3[1], t) });
    }
  }
  // tangents, normals, cumulative distance
  let total = 0;
  for (let i = 0; i < line.length; i++) {
    const a = line[i], b = line[(i + 1) % line.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1e-6;
    a.tx = dx / len; a.tz = dz / len;
    a.nx = -a.tz; a.nz = a.tx;
    a.seg = len;
    a.dist = total;
    total += len;
  }
  return { id: track.id, name: track.name, width: track.width, sky: track.sky, ground: track.ground, kerb: track.kerb, line, length: total };
}

export function getTrack(id) {
  return TRACKS.find(t => t.id === id) || TRACKS[0];
}

// Nearest point on the centreline, searched near a hint index for speed.
export function project(built, x, z, hint = -1) {
  const line = built.line, N = line.length;
  let best = -1, bestD = Infinity;
  const scan = (i) => {
    const p = line[i];
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < bestD) { bestD = d; best = i; }
  };
  if (hint >= 0) {
    for (let k = -18; k <= 18; k++) scan(((hint + k) % N + N) % N);
    if (bestD > 3600) { best = -1; bestD = Infinity; }
  }
  if (best < 0) for (let i = 0; i < N; i++) scan(i);
  const p = line[best];
  // signed lateral offset and distance along lap
  const dx = x - p.x, dz = z - p.z;
  const along = dx * p.tx + dz * p.tz;
  const lateral = dx * p.nx + dz * p.nz;
  return { idx: best, lateral, dist: p.dist + along, point: p };
}
