// Race physics. No networking in here: the server runs it authoritatively and
// the browser runs the exact same code to predict the local car, so both sides
// must import this one file.
import { buildTrack, getTrack, project, DRIVERS } from './tracks.js';

export const TUNE = {
  topSpeed: 82,        // m/s on track at full downforce (~295 km/h)
  power: 46,
  brake: 72,
  drag: 0.26,
  offDrag: 0.50,
  offSpeed: 0.72,      // fraction of top speed in the runoff
  offGrip: 0.74,
  steer: 2.5,          // rad/s at full lock, low speed
  steerRamp: 12,
  maxLat: 43,          // m/s^2 of cornering grip
  wallMargin: 5.5,
  wallKeep: 0.55,
  carHalf: 1.15        // the barrier stops the bodywork, not the car's centre
};

export function driverOf(id) { return DRIVERS.find(d => d.id === id) || DRIVERS[0]; }
export function trackFor(id) { return buildTrack(getTrack(id)); }

export function gridCar(built, i) {
  const L = built.length, N = built.line.length;
  const back = 18 + i * 11;
  const d = (L - back + L) % L;
  const idx = Math.max(0, Math.min(N - 1, Math.round(d / built.step)));
  const s = built.line[idx];
  const lat = (i % 2 === 0 ? 1 : -1) * built.width * 0.22;
  return {
    x: s.x + s.nx * lat, z: s.z + s.nz * lat,
    h: Math.atan2(s.tx, s.tz),
    v: 0, lap: 0, hint: idx, prevDist: s.dist, progress: s.dist - L, lateral: lat,
    lapStart: 0, lapTimes: [], best: 0, finished: false, finishT: 0,
    off: false, slip: false, hit: 0
  };
}

// How fast a car may be here and still make every corner it can see.
export function safeSpeed(built, hint, grip, top) {
  const line = built.line, N = line.length;
  const horizon = Math.ceil(210 / built.step);
  let cap = top;
  for (let k = 0; k < horizon; k += 2) {
    const r = line[((hint + k) % N + N) % N].radius;
    // a hairpin needs a bigger margin than a fast sweeper
    const corner = Math.sqrt(TUNE.maxLat * grip * r) * (r < 70 ? 0.86 : 0.96);
    if (corner >= top) continue;
    const dist = k * built.step;
    cap = Math.min(cap, Math.sqrt(corner * corner + 2 * TUNE.brake * 0.72 * dist));
  }
  return cap;
}

// Bot driver: pure pursuit on the racing line, paced by corner radius.
export function aiInput(built, car, drv, t, seed = 0, skill = 1) {
  const line = built.line, N = line.length;
  const v = Math.abs(car.v);
  // Lookahead has to shrink in tight corners, or the aim point sits across the
  // apex and the car cuts in then runs wide on the exit.
  const here = line[((car.hint % N) + N) % N];
  const Ld = Math.max(9, Math.min(65, Math.min(10 + v * 0.62, here.radius * 1.1 + 8)));
  const a = line[((car.hint + Math.round(Ld / built.step)) % N + N) % N];
  const wob = Math.sin(t * 0.4 + seed) * built.width * 0.16;
  const tx = a.x + a.nx * wob, tz = a.z + a.nz * wob;
  let ang = Math.atan2(tx - car.x, tz - car.z) - car.h;
  while (ang > Math.PI) ang -= Math.PI * 2;
  while (ang < -Math.PI) ang += Math.PI * 2;

  const grip = drv.grip * (car.off ? TUNE.offGrip : 1);
  const curvature = 2 * Math.sin(ang) / Ld;
  const wantTurn = curvature * Math.max(v, 6);
  const authority = TUNE.steer * grip * Math.max(0.25, Math.min(1, v / TUNE.steerRamp));
  const steer = Math.max(-1, Math.min(1, wantTurn / authority));

  const cap = safeSpeed(built, car.hint, drv.grip, TUNE.topSpeed * drv.top) * 0.97 * skill;
  return { s: steer, g: v < cap ? 1 : 0, b: v > cap * 1.04 ? 0.9 : 0 };
}

// One physics tick. Deterministic: same inputs in, same state out, on both ends.
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
      car.v -= Math.min(v * 0.7, (excess - 1) * 13) * dt;   // running wide scrubs speed
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

  const wall = half + (built.runoff || TUNE.wallMargin) - TUNE.carHalf;
  if (Math.abs(pr.lateral) > wall) {
    const s = pr.point, sign = Math.sign(pr.lateral);
    car.x = s.x + s.nx * wall * sign;
    car.z = s.z + s.nz * wall * sign;
    car.hit = raceTime;
    const face = Math.atan2(s.tx, s.tz);
    let d = face - car.h;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const intoWall = -d * sign > 0;
    car.v *= intoWall ? TUNE.wallKeep : 0.92;
    if (intoWall) car.h += d * 0.12;
  }

  const L = built.length;
  const d = pr.dist < 0 ? pr.dist + L : pr.dist % L;
  if (car.prevDist > L * 0.7 && d < L * 0.3) {
    car.lap++;
    if (car.lap > 1 || car.lapStart > 0) {
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
