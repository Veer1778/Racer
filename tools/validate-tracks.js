import { TRACKS, buildTrack } from '../public/shared/tracks.js';

let bad = 0;
for (const t of TRACKS) {
  const b = buildTrack(t);
  const N = b.line.length, L = b.length;
  const need = t.width + 13;            // half-width + runoff on both sides + margin
  let minSep = 1e9, at = null;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      // along-track separation, accounting for the loop closing
      let along = b.line[j].dist - b.line[i].dist;
      if (along > L / 2) along = L - along;
      if (along < need * 2.2) continue;   // adjacent stretches are meant to be close
      const d = Math.hypot(b.line[i].x - b.line[j].x, b.line[i].z - b.line[j].z);
      if (d < minSep) { minSep = d; at = [i, j]; }
    }
  }
  // curvature check: tightest corner radius
  let minR = 1e9;
  for (let i = 0; i < N; i++) {
    const a = b.line[i], c = b.line[(i + 3) % N];
    let dh = Math.atan2(c.tx, c.tz) - Math.atan2(a.tx, a.tz);
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const arc = (c.dist - a.dist + L) % L;
    if (Math.abs(dh) > 1e-4) minR = Math.min(minR, arc / Math.abs(dh));
  }
  const segs = b.line.map(p => p.seg);
  // A real circuit legitimately contains hairpins, so tight radii are not a
  // failure. What matters is that two stretches of track never share runoff,
  // which is what would break projection, lap counting and the barriers.
  const ok = minSep >= need && minR > 7;
  if (!ok) bad++;
  console.log(
    (ok ? 'PASS ' : 'FAIL ') + t.id.padEnd(11),
    'len', b.length.toFixed(0).padStart(5),
    'sep', minSep.toFixed(1).padStart(6), '(need ' + need + ')',
    'minRadius', minR.toFixed(1).padStart(6) + (minR < 14 ? ' (hairpin)' : ''),
    'seg', Math.min(...segs).toFixed(1) + '-' + Math.max(...segs).toFixed(1),
    at ? 'closest ' + at : ''
  );
}
console.log(bad ? `\n${bad} track(s) failing` : '\nall tracks clear');
process.exit(bad ? 1 : 0);
