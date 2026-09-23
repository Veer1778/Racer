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

  wearRate: 0.0030,    // per second at full lateral load on mediums
  damageSpeed: 0.22,   // top speed lost at full damage
  damageGrip: 0.30,

  pitLimit: 22,        // m/s, about 80 km/h
  pitService: 3.0,     // seconds stationary in the box
  pitLaneW: 12,        // width of the pit lane road
  pitGap: 4.5,         // metres of separation between the barrier and the lane
  spinDecay: 1.9,

  gridBack: 18,        // metres from the line to pole
  gridStep: 9.5,       // metres between one slot and the next
  gridStagger: 2.7,    // metres either side of the centreline
  reverseTop: 11       // m/s, about 40 km/h backwards
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

// A real pit lane is not a painted band inside the runoff: it is a separate
// road that branches off the circuit before the line, runs behind the barrier
// past the garages, and merges back after it. That is what this builds.
//
// Everything is expressed in "pit distance" pd — metres travelled since the
// entry — because the window straddles the start/finish line and wrapping a
// raw centreline distance around L at every comparison is how the old version
// kept dragging cars back into the pits on their out-lap.
//
//   pd = 0 ............ entry, lane road peels off the track edge
//   pd < ramp ......... diverging; no wall between track and lane
//   ramp .. total-ramp  the lane proper, behind the barrier. Garages, boxes.
//   pd > total-ramp ... merging back onto the circuit
//   pd = total ........ exit
//
// Memoised on the built track, since stepCar asks every tick.
export function pitGeometry(built) {
  if (built._pit) return built._pit;
  const line = built.line, N = line.length, L = built.length, step = built.step;
  const half = built.width / 2, RO = built.runoff || 6;

  // The lane may only occupy road that is straight enough AND has room outside
  // the barrier for the whole lane; otherwise it folds through the inside of a
  // corner and drags the barrier across the racing line. Rather than assume a
  // fixed window and hope, grow one outwards from the line until one of those
  // two runs out, and retry with a tighter lane if nothing fits.
  const roomAt = (i, need) => maxOffset(line[((i % N) + N) % N], -(need + 6));

  let LANE = TUNE.pitLaneW, GAP = TUNE.pitGap, back = 0, fwd = 0, ok = false;
  for (const [lane, gap, curve] of [[TUNE.pitLaneW, TUNE.pitGap, 150], [11, 3, 150],
                                    [11, 2, 115], [9.5, 1.5, 90]]) {
    const need = half + RO + gap + lane;
    const good = i => line[((i % N) + N) % N].radius > curve && roomAt(i, need) >= need;
    // capped, not just "as long as the straight is": an 890 m pit lane at the
    // 80 km/h limit costs 45 seconds, which is longer than most of the race
    back = 0; while (back < N / 3 && good(-back - 1) && back * step < 290) back++;
    fwd = 0;  while (fwd < N / 3 && good(fwd + 1) && fwd * step < 170) fwd++;
    LANE = lane; GAP = gap;
    if ((back + fwd) * step > 260) { ok = true; break; }
  }

  const total = (back + fwd) * step;
  const entry = ((L - back * step) % L + L) % L;
  const exit = (fwd * step) % L;

  // At both ends the lane is the track: a car peels off the racing line at the
  // entry and is delivered back onto it at the exit. Ending the ramp out in the
  // runoff instead left the car 4 m beyond the barrier the instant the window
  // closed, and it was snapped back onto the circuit as a wall impact.
  const edge = -half * 0.45;
  const full = -(half + RO + GAP + LANE / 2);
  const ramp = Math.max(40, Math.min(75, total * 0.26));
  const usable = ok && total > 2 * ramp + 70;

  // one box per car, laid out down the flat middle section
  const bFrom = ramp + 26, bTo = total - ramp - 18;
  const spacing = 17;
  const boxCount = Math.max(1, Math.min(20, Math.floor((bTo - bFrom) / spacing) + 1));
  const boxOrigin = bFrom + Math.max(0, ((bTo - bFrom) - (boxCount - 1) * spacing) / 2);

  built._pit = {
    usable, entry, exit, total, ramp, laneW: LANE, edge, full, boxCount, boxOrigin,
    boxSpacing: spacing,

    // metres travelled since the pit entry; > total means "not in the window"
    pd(d) { return ((d - entry) % L + L) % L; },

    // signed lateral offset of the lane's centre at this pit distance
    centre(pd) {
      const u = Math.min(pd / ramp, (total - pd) / ramp);
      const s = u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
      return edge + (full - edge) * s;
    },

    // true where track and lane are still joined, so a car may cross between
    open(pd) { return pd < ramp || pd > total - ramp; },

    boxPd(i) { return boxOrigin + (((i | 0) % boxCount + boxCount) % boxCount) * spacing; },
    boxDist(i) { return (entry + this.boxPd(i)) % L; }
  };
  return built._pit;
}

/* ---------------------------------------------------------------- cars */

export function gridCar(built, i, tyre = 'medium') {
  const L = built.length, N = built.line.length;
  const back = TUNE.gridBack + i * TUNE.gridStep;
  const d = (L - back + L) % L;
  const idx = Math.max(0, Math.min(N - 1, Math.round(d / built.step)));
  const s = built.line[idx];
  const lat = (i % 2 === 0 ? 1 : -1) * TUNE.gridStagger;
  return {
    x: s.x + s.nx * lat, z: s.z + s.nz * lat,
    h: Math.atan2(s.tx, s.tz),
    v: 0, yaw: 0, lap: 0, hint: idx, prevDist: s.dist, progress: s.dist - L, lateral: lat,
    lapStart: 0, lapTimes: [], best: 0, finished: false, finishT: 0, retired: false,
    off: false, slip: false, hit: 0, impact: 0, touching: false,
    tyre, wear: 0, damage: 0, stops: 0,
    pit: 'no',                 // no | armed | lane | stopped
    pitClock: 0, pitTyre: 'medium', box: i, served: false, pitCool: 0, jack: 0, hitCool: 0,
    sector: 0, sectorStart: 0, sectors: [], bestSectors: []
  };
}

// Where grid slot `i` sits: the painted box and the car standing in it are
// built from this one function, so they can never drift apart.
export function gridSlot(built, i) {
  const L = built.length, N = built.line.length;
  const d = ((L - (TUNE.gridBack + i * TUNE.gridStep)) % L + L) % L;
  return {
    sample: built.line[Math.round(d / built.step) % N],
    lateral: (i % 2 === 0 ? 1 : -1) * TUNE.gridStagger
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
    const corner = Math.sqrt(TUNE.maxLat * grip * r) * (r < 40 ? 0.80 : r < 70 ? 0.86 : 0.96);
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
export function aiInput(built, car, drv, t, seed = 0, skill = 1, field = null) {
  const line = built.line, N = line.length;
  const v = Math.abs(car.v);
  const here = line[((car.hint % N) + N) % N];
  const pit = pitGeometry(built);
  const inLane = car.pit === 'lane' || car.pit === 'stopped';

  // Short lookahead in the lane: the entry road swings 15 m sideways in 70 m,
  // and a 60 m aim point cuts that corner straight through the barrier.
  const Ld = inLane ? Math.max(8, Math.min(24, 7 + v * 0.55))
                    : Math.max(9, Math.min(65, Math.min(10 + v * 0.62, here.radius * 1.1 + 8)));
  const aim = line[((car.hint + Math.round(Ld / built.step)) % N + N) % N];

  // Traffic. Without this a bot drives at the back of whatever is in front of
  // it at full speed, which with real contact damage means the field destroys
  // itself on anyone who slows down — a car parked on pole took the whole grid
  // into the back of it and was written off before it had moved.
  let gapAhead = Infinity, sideAhead = 0;
  if (field) {
    const sh = Math.sin(car.h), ch = Math.cos(car.h);
    for (let k = 0; k < field.length; k++) {
      const o = field[k];
      if (!o || o === car || o.retired) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const ahead = dx * sh + dz * ch;
      if (ahead <= 0.5 || ahead > 55) continue;
      const side = dx * ch - dz * sh;
      if (Math.abs(side) > 3.4) continue;
      if (ahead < gapAhead) { gapAhead = ahead; sideAhead = side; }
    }
  }

  // in the pit lane the car follows the lane road instead of the racing line
  let want;
  if (inLane) {
    const pdAim = pit.pd(car.prevDist + Ld);
    want = pit.centre(Math.min(pdAim, pit.total));
  } else {
    want = Math.sin(t * 0.4 + seed) * built.width * 0.16;
    // set up a pass rather than sit in the mirrors: pull to whichever side
    // there is room on, as far as the track allows
    if (gapAhead < 34) {
      const edge = built.width / 2 - 2.2;
      const dir = sideAhead > 0 ? -1 : 1;
      const lean = dir * edge * Math.min(1, (34 - gapAhead) / 20);
      want = Math.max(-edge, Math.min(edge, want + lean));
    }
  }

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
  // slow to the speed the remaining gap can absorb, unless there is room to go
  // around, in which case only close to within a car length
  if (gapAhead < 55) {
    const room = Math.max(0, gapAhead - (Math.abs(sideAhead) > 2.2 ? 3.5 : 7));
    cap = Math.min(cap, Math.sqrt(2 * TUNE.brake * 0.45 * room) + 3);
  }
  if (car.pit === 'lane') {
    cap = Math.min(cap, TUNE.pitLimit - 1.5);
    const pd = pit.pd(car.prevDist);
    if (!car.served && pd <= pit.total) {
      // brake to a standstill exactly on its own box, rather than crawling the
      // whole lane at walking pace hoping to trip a trigger
      const toBox = pit.boxPd(car.box || 0) - pd;
      if (toBox > -4) cap = Math.min(cap, Math.sqrt(2 * 5.2 * Math.max(0, toBox)));
    }
  }
  return {
    s: steer,
    g: v < cap ? 1 : 0,
    b: v > cap * 1.04 ? 0.9 : 0,
    pit: (car.wear > 0.62 && car.pit === 'no' && (car.pitCool || 0) <= 0 && pit.usable) ? 1 : 0
  };
}

/* ------------------------------------------------------------- physics */

export function stepCar(built, car, input, drv, dt, raceTime, events) {
  const half = built.width / 2;
  const pit = pitGeometry(built);
  const fire = (kind, data) => { if (events) events(kind, data); };

  if (car.retired) { car.v *= Math.max(0, 1 - 2 * dt); return; }

  // A car with nothing left is out. Damage arrives from walls and from other
  // cars, so this is the one place that can see the total and end the race for
  // it, whatever put it there.
  if ((car.damage || 0) >= 1 && !car.finished) {
    car.retired = true;
    car.pit = 'no';
    fire('dnf', { damage: car.damage });
    return;
  }

  /* ---- pit state machine ---------------------------------------------- */
  const dNow = car.prevDist;
  if (car.pitCool > 0) car.pitCool -= dt;
  if (car.hitCool > 0) car.hitCool -= dt;

  const pd = pit.usable ? pit.pd(dNow) : 1e9;
  const inWindow = pd <= pit.total;
  const laneC = inWindow ? pit.centre(pd) : 0;
  const laneOpen = inWindow && pit.open(pd);

  if (input.pit && !car.finished) {
    if (car.pit === 'armed') {                 // pressing again calls it off
      car.pit = 'no';
      fire('pit', { state: 'no' });
    } else if (car.pit === 'lane' && !car.served && laneOpen && pd < pit.ramp) {
      car.pit = 'no';                          // still on the entry road: back out
      fire('pit', { state: 'no' });
    } else if (car.pit === 'no' && pit.usable) {
      car.pit = 'armed';
      fire('pit', { state: 'armed' });
    }
  }
  // armed: the lane is taken at the next entry, and from there the car is
  // steered down the entry road rather than round the outside of turn one
  if (car.pit === 'armed' && inWindow && pd < pit.ramp * 0.9) {
    car.pit = 'lane';
    fire('pit', { state: 'lane' });
  }
  // Simply driving onto the entry road counts as pitting, so the lane is
  // discoverable without knowing the key. The cooldown stops a car that has
  // just been released from being dragged back in on its way out.
  // Only once the entry road has visibly separated from the circuit: at pd 0
  // the lane IS the track, and a wide line through Spa's pit-straight kink was
  // enough to drag a car in on every single lap.
  if (car.pit === 'no' && pit.usable && pd > pit.ramp * 0.3 && pd < pit.ramp
      && (car.pitCool || 0) <= 0
      && car.lateral < -(half + 1.5) && car.lateral > laneC - pit.laneW / 2) {
    car.pit = 'lane';
    fire('pit', { state: 'lane' });
  }
  // Missed it. Once the walls close in, a car that never made it across is on
  // the circuit, not in the lane — and must be let go, or the corridor clamp
  // teleports it 26 m sideways through the barrier into its own pit box.
  if (car.pit === 'lane' && !car.served && inWindow && !pit.open(pd)
      && Math.abs(car.lateral - laneC) > pit.laneW / 2 + 1.5) {
    car.pit = 'no';
    car.pitCool = 6;
    fire('pit', { state: 'no' });
  }
  const inLane = car.pit === 'lane' || car.pit === 'stopped';
  // the limiter comes on at the line, not the moment the driver presses the
  // button halfway down the previous straight
  const limited = inLane && (pd > pit.ramp * 0.5 || car.lateral < -half);

  // `served` keeps a released car from instantly re-triggering the stop it is
  // still sitting in. It clears when the car leaves the pit lane.
  if (car.pit === 'lane' && !car.served && inWindow && !pit.open(pd)) {
    // queueing counts: a car held up behind someone else's stop can never
    // reach its own box, and without this it crawls the length of the lane
    // and leaves on the same tyres it came in on
    car.pitWait = Math.abs(car.v) < 2 ? (car.pitWait || 0) + dt : 0;
    const atBox = Math.abs(pd - pit.boxPd(car.box || 0)) < 8;
    if (Math.abs(car.lateral - laneC) < 5.5 && Math.abs(car.v) < 5
        && (atBox || car.pitWait > 1.5)) {
      car.pit = 'stopped';
      car.pitWait = 0;
      car.pitClock = TUNE.pitService;
      fire('pit', { state: 'stopped' });
    }
  } else car.pitWait = 0;
  if (car.pit === 'stopped') {
    car.v *= Math.max(0, 1 - 8 * dt);
    if (Math.abs(car.v) < 0.5) car.v = 0;
    car.pitClock -= dt;
    // the jack lifts the car for the middle of the stop; the renderer reads it
    const phase = 1 - Math.max(0, car.pitClock) / TUNE.pitService;
    car.jack = Math.max(0, Math.min(1, Math.min(phase / 0.22, (1 - phase) / 0.18)));
    if (car.pitClock <= 0) {
      car.tyre = car.pitTyre || 'medium';
      car.wear = 0;
      car.damage = Math.max(0, car.damage - 0.7);
      car.stops++;
      car.pit = 'lane';
      car.served = true;
      car.jack = 0;
      car.pitCool = 28;              // seconds before the entry road can grab it again
      fire('pit', { state: 'released', tyre: car.tyre });
    }
  } else car.jack = 0;

  if (inLane && !inWindow) {
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
  if (limited) {
    top = Math.min(top, TUNE.pitLimit);          // pit limiter
    if (Math.abs(car.v) > TUNE.pitLimit) { gas = 0; brake = Math.max(brake, 0.55); }
  }
  const power = TUNE.power * drv.accel * (car.off ? 0.75 : 1);

  // Reverse gear. Held, the throttle drives the car backwards at walking pace;
  // if it is still rolling forwards it brakes to a stop first, so selecting
  // reverse at speed slows the car rather than throwing it into a spin.
  if (input.r && !car.finished && car.pit !== 'stopped') {
    if (car.v > 0.6) { gas = 0; brake = Math.max(brake, 0.65); }
    else {
      car.v -= gas * power * 0.45 * Math.max(0, 1 - Math.abs(car.v) / TUNE.reverseTop) * dt;
      gas = 0;
    }
  }

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
    // Weighted towards a constant rather than cornering load, so a compound
    // lasts roughly the same number of laps everywhere. Load-dominated wear
    // made mediums last three laps at Sakhir and barely one at Spa.
    const stress = 0.62 + load * 0.40 + (car.slip ? 0.30 : 0) + (car.off ? 0.5 : 0);
    car.wear = Math.min(1, car.wear + TUNE.wearRate * c.wear * stress * dt);
  }

  car.x += Math.sin(car.h) * car.v * dt;
  car.z += Math.cos(car.h) * car.v * dt;

  /* ---- where on the track ---------------------------------------------- */
  const pr = project(built, car.x, car.z, car.hint);
  car.hint = pr.idx;
  car.lateral = pr.lateral;
  // the entry and exit roads are asphalt, not grass: a car on them keeps grip
  const onPitRoad = inWindow && pr.lateral < 0 && pr.lateral > pit.centre(pd) - pit.laneW / 2;
  car.off = Math.abs(pr.lateral) > half && !inLane && !onPitRoad;

  /* ---- walls ----------------------------------------------------------- */
  // The drivable corridor, signed. On the circuit it is the barrier either
  // side; in the pit lane it is the lane's own walls; where the two are joined
  // — the entry and exit roads — it spans both, which is how a car gets across.
  const wallAt = s => noRoom(pr.point, s * (half + (built.runoff || TUNE.wallMargin)))
    ? half + (built.runoff || TUNE.wallMargin) - TUNE.carHalf   // open apron inside a hairpin
    : Math.max(half + 1.5, maxOffset(pr.point, s * (half + (built.runoff || TUNE.wallMargin))) - TUNE.carHalf);

  let hi = wallAt(1), lo = -wallAt(-1);
  if (inWindow) {
    // clamped to the local corner radius like any other offset feature, or the
    // lane's outer wall folds through itself where the window meets a bend
    const laneLo = -Math.min(maxOffset(pr.point, laneC - pit.laneW / 2),
                             pit.laneW / 2 - laneC) + TUNE.carHalf;
    const laneHi = laneC + pit.laneW / 2 - TUNE.carHalf;
    if (inLane) { lo = laneLo; if (!laneOpen) hi = laneHi; }
    else if (laneOpen) lo = Math.min(lo, laneLo);
  }

  const outside = pr.lateral > hi ? 1 : pr.lateral < lo ? -1 : 0;
  if (outside) {
    const bound = outside > 0 ? hi : lo;
    const sign = outside;
    const s = pr.point;
    car.x = s.x + s.nx * bound;
    car.z = s.z + s.nz * bound;
    car.lateral = bound;

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
  } else if (pr.lateral < hi - 2.2 && pr.lateral > lo + 2.2) {
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

// Car to car. Two things happen here, and separating them is the whole point.
//
// Rubbing — running alongside someone, leaning on them through a corner — is
// continuous, scaled by dt, and costs speed and grip but no damage. Hitting
// someone is a single event: it lands once, hard, and it hurts.
//
// The old version only had the first. Every impact was divided by dt and
// spread over the hundreds of ticks a contact lasts, so a 200 km/h rear-ender
// and a gentle nudge produced the same imperceptible nothing.
export function separate(cars, dt = 1 / 60, events) {
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

      const avx = Math.sin(a.h) * a.v, avz = Math.cos(a.h) * a.v;
      const bvx = Math.sin(b.h) * b.v, bvz = Math.cos(b.h) * b.v;
      const closing = (avx - bvx) * ux + (avz - bvz) * uz;
      if (closing <= 0) continue;

      // How square the hit is: 1 when a car drives straight into another,
      // near 0 when the two are running parallel and merely touching. A
      // 300 km/h rear-ender and a 300 km/h side-by-side rub are the same
      // closing speed and must not be the same accident.
      const square = Math.abs(Math.sin(a.h) * ux + Math.cos(a.h) * uz);
      const sideA = Math.sin(a.h) * uz - Math.cos(a.h) * ux;
      const sideB = Math.sin(b.h) * uz - Math.cos(b.h) * ux;

      // the rub: continuous, dt-scaled, no damage
      const rub = Math.min(1, closing / 22) * Math.min(1, dt * 9);
      a.v *= 1 - 0.20 * rub;
      b.v *= 1 - 0.09 * rub;
      a.yaw = (a.yaw || 0) + sideA * rub * 1.4;
      b.yaw = (b.yaw || 0) - sideB * rub * 1.0;
      a.impact = Math.max(a.impact || 0, closing);
      b.impact = Math.max(b.impact || 0, closing);

      // the hit: once per contact, full force. The cooldown is what keeps it
      // from firing on every one of the ticks the two cars stay overlapped.
      const sev = closing * (0.30 + 0.70 * square);
      if (sev < 7 || (a.hitCool || 0) > 0 || (b.hitCool || 0) > 0) continue;
      a.hitCool = b.hitCool = 0.45;

      const k = Math.min(1, sev / 30);
      a.v *= Math.max(0.25, 1 - sev / 46);
      b.v *= Math.max(0.45, 1 - sev / 110);           // the car in front is shoved along
      b.v += Math.min(9, sev * 0.22);
      // A square hit spins the car that caused it and launches the one in
      // front; a glancing one just unsettles both.
      // sim.js must stay deterministic, so a dead-square hit picks its spin
      // direction from the geometry rather than from a random number
      const kickA = sideA >= 0 ? Math.max(0.3, sideA) : Math.min(-0.3, sideA);
      a.yaw = (a.yaw || 0) + kickA * k * 2.6;
      b.yaw = (b.yaw || 0) - sideB * k * 2.0 - (1 - square) * sideB * k * 1.2;
      a.damage = Math.min(1, (a.damage || 0) + sev / 62);
      b.damage = Math.min(1, (b.damage || 0) + sev / 125);
      if (events) events(a, b, sev);
    }
  }
}
