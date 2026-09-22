// Race physics. Kept free of any networking so it can be run headless in tests.
import { buildTrack, getTrack, project, DRIVERS } from './public/shared/tracks.js';

export const TUNE = {
  topSpeed: 78,        // m/s at full downforce on track
  power: 36,           // engine
  brake: 58,
  drag: 0.26,
  offDrag: 0.50,
  offSpeed: 0.72,      // fraction of top speed in the runoff
  offGrip: 0.74,
  steer: 2.5,          // rad/s at full lock, low speed
  steerRamp: 12,       // speed at which full steering authority arrives
  maxLat: 32,          // m/s^2 of cornering grip
  wallMargin: 5.5,
  wallKeep: 0.55
};

export function driverOf(id) { return DRIVERS.find(d => d.id === id) || DRIVERS[0]; }

export function trackFor(id) { return buildTrack(getTrack(id)); }

export function gridCar(built, i) {
  const L = built.length;
  const back = 16 + i * 10;
  const d = (L - back + L) % L;
  let idx = 0;
  for (let k = 0; k < built.line.length; k++) if (built.line[k].dist <= d) idx = k;
  const s = built.line[idx];
  const lat = (i % 2 === 0 ? 1 : -1) * built.width * 0.22;
  return {
    x: s.x + s.nx * lat, z: s.z + s.nz * lat,
    h: Math.atan2(s.tx, s.tz),
    v: 0, lap: 0, hint: idx, prevDist: d, progress: d - L, lateral: lat,
    lapStart: 0, lapTimes: [], best: 0, finished: false, finishT: 0,
    off: false, slip: false, hit: 0
  };
}

// Corner radius of the centreline around sample i.
export function radiusAt(built, i, span = 5) {
  const line = built.line, N = line.length;
  const a = line[((i % N) + N) % N], b = line[((i + span) % N + N) % N];
  let dh = Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz);
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  let arc = b.dist - a.dist;
  if (arc < 0) arc += built.length;
  return Math.abs(dh) < 1e-3 ? 1e4 : arc / Math.abs(dh);
}

// Walks the centreline forward by a distance in metres. Sample spacing varies a
// lot between circuits, so anything positional has to be measured, not counted.
export function ahead(built, hint, metres) {
  const line = built.line, N = line.length;
  let i = ((hint % N) + N) % N, acc = 0, steps = 0;
  while (acc < metres && steps < N) { acc += line[i].seg; i = (i + 1) % N; steps++; }
  return { p: line[i], idx: i, dist: acc };
}

// How fast a car may be here and still make every corner in the braking horizon.
export function safeSpeed(built, hint, grip, top) {
  const line = built.line, N = line.length;
  let cap = top, i = ((hint % N) + N) % N, dist = 0, steps = 0;
  while (dist < 190 && steps < N) {
    const span = Math.max(2, Math.round(24 / Math.max(1, line[i].seg)));
    const r = radiusAt(built, i, span);
    const corner = Math.sqrt(TUNE.maxLat * grip * r) * 0.93;
    if (corner < top) {
      cap = Math.min(cap, Math.sqrt(corner * corner + 2 * TUNE.brake * 0.55 * dist));
    }
    dist += line[i].seg;
    i = (i + 1) % N; steps++;
  }
  return cap;
}

// Bot driver: aims at the racing line and paces itself by corner radius.
export function aiInput(built, car, drv, t, seed = 0, skill = 1) {
  const line = built.line, N = line.length;
  const v = Math.abs(car.v);
  // Pure pursuit: aim at a point a speed-dependent distance ahead on the line,
  // then ask for the curvature that arc needs and convert it to a steer input.
  const Ld = Math.max(11, Math.min(62, 9 + v * 0.62));
  const a = ahead(built, car.hint, Ld).p;
  const wob = Math.sin(t * 0.45 + seed) * built.width * 0.15;
  const tx = a.x + a.nx * wob, tz = a.z + a.nz * wob;
  let ang = Math.atan2(tx - car.x, tz - car.z) - car.h;
  while (ang > Math.PI) ang -= Math.PI * 2;
  while (ang < -Math.PI) ang += Math.PI * 2;

  const grip = drv.grip * (car.off ? TUNE.offGrip : 1);
  const curvature = 2 * Math.sin(ang) / Ld;             // arc that reaches the target
  const wantTurn = curvature * Math.max(v, 6);          // rad/s
  const authority = TUNE.steer * grip * Math.max(0.25, Math.min(1, v / TUNE.steerRamp));
  const steer = Math.max(-1, Math.min(1, wantTurn / authority));

  const cap = safeSpeed(built, car.hint, drv.grip, TUNE.topSpeed * drv.top) * 0.97 * skill;
  return { s: steer, g: v < cap ? 1 : 0, b: v > cap * 1.04 ? 0.9 : 0 };
}

// One physics tick. `onLap` fires when the car crosses the line.
export function stepCar(built, car, input, drv, dt, raceTime, onLap) {
  const half = built.width / 2;
  const steer = Math.max(-1, Math.min(1, input.s || 0));
  const gas = car.finished ? 0 : Math.max(0, Math.min(1, input.g || 0));
  const brake = car.finished ? 0.5 : Math.max(0, Math.min(1, input.b || 0));

  const grip = drv.grip * (car.off ? TUNE.offGrip : 1);
  const top = TUNE.topSpeed * drv.top * (car.off ? TUNE.offSpeed : 1);
  const power = TUNE.power * drv.accel * (car.off ? 0.75 : 1);

  car.v += gas * power * Math.max(0, 1 - Math.abs(car.v) / top) * dt;
  car.v -= brake * TUNE.brake * dt * Math.sign(car.v || 1);
  car.v -= (car.off ? TUNE.offDrag : TUNE.drag) * car.v * dt;
  if (gas === 0 && brake > 0 && car.v < 0) car.v = Math.max(car.v, -13);
  if (gas === 0 && brake === 0 && Math.abs(car.v) < 0.35) car.v = 0;

  const v = Math.abs(car.v);
  const ramp = Math.min(1, v / TUNE.steerRamp);
  let turn = steer * TUNE.steer * grip * ramp * Math.sign(car.v || 1);
  if (v > 5) {
    const maxTurn = TUNE.maxLat * grip / v;
    if (Math.abs(turn) > maxTurn) {
      const excess = Math.abs(turn) / maxTurn;
      turn = Math.sign(turn) * maxTurn * Math.min(1.25, 1 + (excess - 1) * 0.15);
      car.v -= Math.min(v * 0.7, (excess - 1) * 13) * dt;   // scrubbing wide costs speed
      car.slip = true;
    } else car.slip = false;
  }
  car.h += turn * dt;

  car.x += Math.sin(car.h) * car.v * dt;
  car.z += Math.cos(car.h) * car.v * dt;

  const pr = project(built, car.x, car.z, car.hint);
  car.hint = pr.idx;
  car.lateral = pr.lateral;
  car.off = Math.abs(pr.lateral) > half;

  const wall = half + TUNE.wallMargin;
  if (Math.abs(pr.lateral) > wall) {
    const s = pr.point, sign = Math.sign(pr.lateral);
    car.x = s.x + s.nx * wall * sign;
    car.z = s.z + s.nz * wall * sign;
    car.hit = raceTime;
    // Only square the car up when it is still pointing into the wall; a car
    // already turning away keeps its own line, so it can drive off the barrier.
    const face = Math.atan2(s.tx, s.tz);
    let d = face - car.h;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const intoWall = -d * sign > 0;                 // nose angled further outward
    car.v *= intoWall ? TUNE.wallKeep : 0.92;       // glancing contact barely costs
    if (intoWall) car.h += d * 0.12;
  }

  const L = built.length;
  const d = pr.dist < 0 ? pr.dist + L : pr.dist % L;
  if (car.prevDist > L * 0.7 && d < L * 0.3) {
    car.lap++;
    if (car.lap > 0 && car.lapStart > 0 || car.lap > 1) {
      const lt = raceTime - car.lapStart;
      if (lt > 5) { car.lapTimes.push(lt); if (!car.best || lt < car.best) car.best = lt; }
    }
    car.lapStart = raceTime;
    onLap && onLap(car.lap);
  } else if (car.prevDist < L * 0.3 && d > L * 0.7) {
    car.lap--;
  }
  car.prevDist = d;
  car.progress = car.lap * L + d;
}

export function separate(cars) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (!a || !b) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz, min = 4.4;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (min - d) / 2, ux = dx / d, uz = dz / d;
        a.x -= ux * push; a.z -= uz * push;
        b.x += ux * push; b.z += uz * push;
        a.v *= 0.95; b.v *= 0.95;
      }
    }
  }
}
