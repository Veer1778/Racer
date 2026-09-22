// Race physics. No networking in here: the server runs it authoritatively and
// the browser runs the exact same code to predict the local car, so both sides
// must import this one file. Everything below stays deterministic: the same
// state plus the same inputs must give the same result on both ends.
import { buildTrack, getTrack, project, maxOffset, noRoom, DRIVERS } from './tracks.js';

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
  maxLat: 43,          // m/s^2 of cornering grip on fresh mediums
  wallMargin: 5.5,
  wallKeep: 0.55,
  carHalf: 1.15,       // the barrier stops the bodywork, not the car's centre

  wearRate: 0.0019,    // per second at full lateral load on mediums
  damageSpeed: 0.22,   // top speed lost at full damage
  damageGrip: 0.30,

  pitLimit: 22,        // m/s, about 80 km/h
  pitService: 2.6,     // seconds stationary in the box
  pitOffset: 9,        // metres from the centreline out to the pit lane
  spinDecay: 1.9
};

export const COMPOUNDS = [
  { id: 'soft',   name: 'Soft',   short: 'S', color: '#e2334a', grip: 1.07, wear: 1.70 },
  { id: 'medium', name: 'Medium', short: 'M', color: '#ffc46b', grip: 1.00, wear: 1.00 },
  { id: 'hard',   name: 'Hard',   short: 'H', color: '#e9edf5', grip: 0.94, wear: 0.62 }
];
export const compound = id => COMPOUNDS.find(c => c.id === id) || COMPOUNDS[1];

export function driverOf(id) { return DRIVERS.find(d => d.id === id) || DRIVERS[0]; }
export function trackFor(id) { return buildTrack(getTrack(id)); }

/* ------------------------------------------------------------ pit lane */

// The pit lane is the straight either side of the start line, taken at an
// offset. It has to be derived from the geometry rather than fixed distances:
// on a circuit whose first corner is a hairpin, a fixed window puts the lane
// inside the corner radius, where the barrier folds in and pins every car
// against it. Memoised on the built track, since stepCar asks every tick.
export function pitGeometry(built) {
  if (built._pit) return built._pit;
  const line = built.line, N = line.length, L = built.length, step = built.step;
  const straight = i => line[((i % N) + N) % N].radius > 150;

  let back = 0;
  while (back < N / 3 && straight(-back - 1) && back * step < 430) back++;
  let fwd = 0;
  while (fwd < N / 3 && straight(fwd + 1) && fwd * step < 260) fwd++;

  const entry = L - Math.max(90, back * step);
  const exit = Math.max(50, fwd * step);

  // the offset has to fit inside the tightest barrier anywhere in the window
  let room = built.width / 2 + TUNE.pitOffset;
  for (let k = -back; k <= fwd; k++) {
    const p = line[((k % N) + N) % N];
    room = Math.min(room, maxOffset(p, -(built.width / 2 + TUNE.pitOffset)));
  }
  room = Math.max(built.width / 2 + 3.5, room);

  built._pit = {
    entry, exit,
    box: entry + Math.max(40, (back * step) * 0.55),
    offset: -room,
    usable: back * step > 120           // no room for a pit lane on this circuit
  };
  return built._pit;
}

function inPitWindow(built, d) {
  const p = pitGeometry(built);
  return d >= p.entry || d <= p.exit;
}

/* ---------------------------------------------------------------- cars */

export function gridCar(built, i, tyre = 'medium') {
  const L = built.length, N = built.line.length;
  const back = 18 + i * 11;
  const d = (L - back + L) % L;
  const idx = Math.max(0, Math.min(N - 1, Math.round(d / built.step)));
  const s = built.line[idx];
  const lat = (i % 2 === 0 ? 1 : -1) * built.width * 0.22;
  return {
    x: s.x + s.nx * lat, z: s.z + s.nz * lat,
    h: Math.atan2(s.tx, s.tz),
    v: 0, yaw: 0, lap: 0, hint: idx, prevDist: s.dist, progress: s.dist - L, lateral: lat,
    lapStart: 0, lapTimes: [], best: 0, finished: false, finishT: 0, retired: false,
    off: false, slip: false, hit: 0, impact: 0, touching: false,
    tyre, wear: 0, damage: 0, stops: 0,
    pit: 'no',                 // no | armed | lane | stopped
    pitClock: 0, pitTyre: 'medium',
    sector: 0, sectorStart: 0, sectors: [], bestSectors: []
  };
}

export function sectorOf(built, d) {
  const third = built.length / 3;
  return d < third ? 0 : d < third * 2 ? 1 : 2;
}

/* ----------------------------------------------------------------- bot */

export function safeSpeed(built, hint, grip, top) {
  const line = built.line, N = line.length;
  const horizon = Math.ceil(210 / built.step);
  let cap = top;
  for (let k = 0; k < horizon; k += 2) {
    const r = line[((hint + k) % N + N) % N].radius;
    const corner = Math.sqrt(TUNE.maxLat * grip * r) * (r < 70 ? 0.86 : 0.96);
    if (corner >= top) continue;
    const dist = k * built.step;
    cap = Math.min(cap, Math.sqrt(corner * corner + 2 * TUNE.brake * 0.72 * dist));
  }
  return cap;
}

export function tyreGrip(car, drv) {
  const c = compound(car.tyre);
  const worn = 1 - 0.30 * Math.pow(car.wear || 0, 1.4);
  return drv.grip * c.grip * worn * (1 - TUNE.damageGrip * (car.damage || 0));
}
export function damageSpeed(car) { return 1 - TUNE.damageSpeed * (car.damage || 0); }

// Bot driver: pure pursuit on the racing line, paced by corner radius, and it
// comes in for tyres when they are gone.
export function aiInput(built, car, drv, t, seed = 0, skill = 1) {
  const line = built.line, N = line.length;
  const v = Math.abs(car.v);
  const here = line[((car.hint % N) + N) % N];
  const Ld = Math.max(9, Math.min(65, Math.min(10 + v * 0.62, here.radius * 1.1 + 8)));
  const aim = line[((car.hint + Math.round(Ld / built.step)) % N + N) % N];

  // in the pit lane the car follows the pit offset instead of the racing line
  const inLane = car.pit === 'lane' || car.pit === 'stopped';
  const want = inLane ? pitGeometry(built).offset
                      : Math.sin(t * 0.4 + seed) * built.width * 0.16;

  const tx = aim.x + aim.nx * want, tz = aim.z + aim.nz * want;
  let ang = Math.atan2(tx - car.x, tz - car.z) - car.h;
  while (ang > Math.PI) ang -= Math.PI * 2;
  while (ang < -Math.PI) ang += Math.PI * 2;

  const grip = tyreGrip(car, drv) * (car.off ? TUNE.offGrip : 1);
  const curvature = 2 * Math.sin(ang) / Ld;
  const wantTurn = curvature * Math.max(v, 6);
  const authority = TUNE.steer * grip * Math.max(0.25, Math.min(1, v / TUNE.steerRamp));
  const steer = Math.max(-1, Math.min(1, wantTurn / authority));

  let cap = safeSpeed(built, car.hint, tyreGrip(car, drv),
                      TUNE.topSpeed * drv.top * damageSpeed(car)) * 0.97 * skill;
  if (car.pit === 'lane') {
    const pit = pitGeometry(built), d = car.prevDist;
    const toBox = d <= pit.box ? pit.box - d : (built.length - d) + pit.box;
    if (toBox < 70) cap = Math.min(cap, 4.5);        // stop in the box
    else cap = Math.min(cap, TUNE.pitLimit - 1);
  }
  return {
    s: steer,
    g: v < cap ? 1 : 0,
    b: v > cap * 1.04 ? 0.9 : 0,
    pit: (car.wear > 0.68 && car.pit === 'no' && pitGeometry(built).usable) ? 1 : 0
  };
}

/* ------------------------------------------------------------- physics */

export function stepCar(built, car, input, drv, dt, raceTime, events) {
  const half = built.width / 2;
  const pit = pitGeometry(built);
  const fire = (kind, data) => { if (events) events(kind, data); };

  if (car.retired) { car.v *= Math.max(0, 1 - 2 * dt); return; }

  /* ---- pit state machine ---------------------------------------------- */
  const dNow = car.prevDist;
  if (input.pit && !car.finished) {
    if (car.pit === 'armed') {                 // pressing again calls it off
      car.pit = 'no';
      fire('pit', { state: 'no' });
    } else if (car.pit === 'no' && pit.usable) {
      car.pit = 'armed';
      fire('pit', { state: 'armed' });
    }
  }
  if (car.pit === 'armed' && dNow >= pit.entry) {
    car.pit = 'lane';
    fire('pit', { state: 'lane' });
  }
  const inLane = car.pit === 'lane' || car.pit === 'stopped';

  // `served` keeps a released car from instantly re-triggering the stop it is
  // still sitting in. It clears when the car leaves the pit lane.
  if (car.pit === 'lane' && !car.served && Math.abs(car.lateral - pit.offset) < 5
      && dNow >= pit.box && dNow < pit.box + 70 && Math.abs(car.v) < 7) {
    car.pit = 'stopped';
    car.pitClock = TUNE.pitService;
    fire('pit', { state: 'stopped' });
  }
  if (car.pit === 'stopped') {
    car.v *= Math.max(0, 1 - 6 * dt);
    if (Math.abs(car.v) < 0.5) car.v = 0;
    car.pitClock -= dt;
    if (car.pitClock <= 0) {
      car.tyre = car.pitTyre || 'medium';
      car.wear = 0;
      car.damage = Math.max(0, car.damage - 0.7);
      car.stops++;
      car.pit = 'lane';
      car.served = true;
      fire('pit', { state: 'released', tyre: car.tyre });
    }
  }
  if (inLane && dNow > pit.exit && dNow < pit.entry) {
    car.pit = 'no';
    car.served = false;
    fire('pit', { state: 'no' });
  }

  /* ---- driver inputs --------------------------------------------------- */
  const steer = Math.max(-1, Math.min(1, input.s || 0));
  let gas = (car.finished || car.pit === 'stopped') ? 0 : Math.max(0, Math.min(1, input.g || 0));
  let brake = car.finished ? 0.5 : Math.max(0, Math.min(1, input.b || 0));

  const grip = tyreGrip(car, drv) * (car.off ? TUNE.offGrip : 1);
  let top = TUNE.topSpeed * drv.top * damageSpeed(car) * (car.off ? TUNE.offSpeed : 1);
  if (inLane) {
    top = Math.min(top, TUNE.pitLimit);          // pit limiter
    if (Math.abs(car.v) > TUNE.pitLimit) { gas = 0; brake = Math.max(brake, 0.55); }
  }
  const power = TUNE.power * drv.accel * (car.off ? 0.75 : 1);

  car.v += gas * power * Math.max(0, 1 - Math.abs(car.v) / top) * dt;
  car.v -= brake * TUNE.brake * dt * Math.sign(car.v || 1);
  car.v -= (car.off ? TUNE.offDrag : TUNE.drag) * car.v * dt;
  if (gas === 0 && brake > 0 && car.v < 0) car.v = Math.max(car.v, -13);
  if (gas === 0 && brake === 0 && Math.abs(car.v) < 0.35) car.v = 0;

  /* ---- steering, limited by grip --------------------------------------- */
  const v = Math.abs(car.v);
  const ramp = Math.min(1, v / TUNE.steerRamp);
  let turn = steer * TUNE.steer * grip * ramp * Math.sign(car.v || 1);
  let load = 0;
  if (v > 5) {
    const maxTurn = TUNE.maxLat * grip / v;
    load = Math.min(1.4, Math.abs(turn) / maxTurn);
    if (Math.abs(turn) > maxTurn) {
      const excess = Math.abs(turn) / maxTurn;
      turn = Math.sign(turn) * maxTurn * Math.min(1.25, 1 + (excess - 1) * 0.15);
      car.v -= Math.min(v * 0.7, (excess - 1) * 13) * dt;
      car.slip = true;
    } else car.slip = false;
  }

  // a spin from contact plays out on top of whatever the driver is doing
  car.yaw = (car.yaw || 0) * Math.max(0, 1 - TUNE.spinDecay * dt);
  car.h += (turn + car.yaw) * dt;

  /* ---- tyre wear ------------------------------------------------------- */
  if (!car.finished && v > 3 && !inLane) {
    const c = compound(car.tyre);
    const stress = 0.35 + load * 0.9 + (car.slip ? 0.5 : 0) + (car.off ? 0.6 : 0);
    car.wear = Math.min(1, car.wear + TUNE.wearRate * c.wear * stress * dt);
  }

  car.x += Math.sin(car.h) * car.v * dt;
  car.z += Math.cos(car.h) * car.v * dt;

  /* ---- where on the track ---------------------------------------------- */
  const pr = project(built, car.x, car.z, car.hint);
  car.hint = pr.idx;
  car.lateral = pr.lateral;
  car.off = Math.abs(pr.lateral) > half && !inLane;

  /* ---- barrier --------------------------------------------------------- */
  const sign = Math.sign(pr.lateral) || 1;
  const limit = (inLane && sign < 0)
    ? half + TUNE.pitOffset + 5                       // the pit lane has its own wall
    : half + (built.runoff || TUNE.wallMargin);
  const wall = noRoom(pr.point, sign * limit)
    ? limit - TUNE.carHalf                       // open apron on the inside of a hairpin
    : Math.max(half + 1.5, maxOffset(pr.point, sign * limit) - TUNE.carHalf);

  if (Math.abs(pr.lateral) > wall) {
    const s = pr.point;
    car.x = s.x + s.nx * wall * sign;
    car.z = s.z + s.nz * wall * sign;

    const face = Math.atan2(s.tx, s.tz);
    let d = face - car.h;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;

    // severity is the speed straight INTO the wall, not the speed along it:
    // brushing a barrier at 300 should cost far less than arriving square on
    const closing = Math.abs(v * Math.sin(d));
    car.hit = raceTime;
    // One impact per contact. Without this the car takes damage on every tick
    // it spends leaning on a barrier and is written off in a fifth of a second.
    const fresh = !car.touching;
    car.touching = true;
    if (closing > 11 && fresh) {
      car.impact = closing;
      car.damage = Math.min(1, car.damage + closing / 140);
      car.v *= Math.max(0.12, 1 - closing / 55);
      car.yaw += -Math.sign(d) * Math.min(2.2, closing / 18);
      fire('crash', { closing, damage: car.damage });
    } else {
      car.v *= (-d * sign > 0) ? TUNE.wallKeep : 0.94;
      if (-d * sign > 0) car.h += d * 0.12;
    }
  } else if (Math.abs(pr.lateral) < wall - 2.2) {
    car.touching = false;          // clear of the barrier, next hit counts again
  }

  /* ---- lap and sector timing ------------------------------------------- */
  const L = built.length;
  const dist = pr.dist < 0 ? pr.dist + L : pr.dist % L;
  const sec = sectorOf(built, dist);
  if (sec !== car.sector) {
    if (sec === (car.sector + 1) % 3 && car.sectorStart > 0) {
      const st = raceTime - car.sectorStart;
      if (st > 1) {
        car.sectors[car.sector] = st;
        const pb = !car.bestSectors[car.sector] || st < car.bestSectors[car.sector];
        if (pb) car.bestSectors[car.sector] = st;
        fire('sector', { index: car.sector, time: st, pb });
      }
    }
    car.sector = sec;
    car.sectorStart = raceTime;
  }

  if (car.prevDist > L * 0.7 && dist < L * 0.3) {
    car.lap++;
    if (car.lap > 1 || car.lapStart > 0) {
      const lt = raceTime - car.lapStart;
      if (lt > 5) { car.lapTimes.push(lt); if (!car.best || lt < car.best) car.best = lt; }
    }
    car.lapStart = raceTime;
    fire('lap', { lap: car.lap });
  } else if (car.prevDist < L * 0.3 && dist > L * 0.7) {
    car.lap--;
  }
  car.prevDist = dist;
  car.progress = car.lap * L + dist;
}

/* ------------------------------------------------------------ contacts */

// Car to car: push them apart, trade speed along the contact line and kick both
// into a slide, so diving down the inside and leaning on someone costs time.
export function separate(cars, dt = 1 / 60) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (!a || !b || a.retired || b.retired) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz, min = 4.4;
      if (d2 >= min * min || d2 < 1e-6) continue;

      const d = Math.sqrt(d2), ux = dx / d, uz = dz / d;
      const push = (min - d) / 2;
      a.x -= ux * push; a.z -= uz * push;
      b.x += ux * push; b.z += uz * push;

      const av = { x: Math.sin(a.h) * a.v, z: Math.cos(a.h) * a.v };
      const bv = { x: Math.sin(b.h) * b.v, z: Math.cos(b.h) * b.v };
      const closing = (av.x - bv.x) * ux + (av.z - bv.z) * uz;
      if (closing <= 0) continue;

      // Everything here is scaled by dt. Two cars rubbing along a straight are
      // in contact for hundreds of ticks; applying a full impulse on each one
      // wrote the car off in a fraction of a second.
      const hit = Math.min(1, closing / 22) * Math.min(1, dt * 9);
      a.v *= 1 - 0.20 * hit;
      b.v *= 1 - 0.09 * hit;
      const sideA = Math.sin(a.h) * uz - Math.cos(a.h) * ux;
      const sideB = Math.sin(b.h) * uz - Math.cos(b.h) * ux;
      a.yaw = (a.yaw || 0) + sideA * hit * 1.4;
      b.yaw = (b.yaw || 0) - sideB * hit * 1.0;
      if (closing > 11) {                     // rubbing panels is not damage
        a.damage = Math.min(1, (a.damage || 0) + hit * 0.06);
        b.damage = Math.min(1, (b.damage || 0) + hit * 0.04);
      }
      a.impact = Math.max(a.impact || 0, closing);
      b.impact = Math.max(b.impact || 0, closing);
    }
  }
}
