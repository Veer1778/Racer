// Stewarding check: does each offence actually get noticed, and does serving a
// penalty at a pit stop cost what it should?
import { trackFor, gridCar, stepCar, separate, driverOf, aiInput, pitGeometry, TUNE } from '../public/shared/sim.js';

const DT = 1 / 60;
const built = trackFor('monza');
const drv = driverOf('kaito-renn');
const pit = pitGeometry(built);

/* ---- track limits: run wide three times, expect three strikes ---------- */
// The car is placed off the road and back rather than steered there, so the
// test measures the rule and not the handling.
function placeAt(c, dist, lateral) {
  const i = Math.round((((dist % built.length) + built.length) % built.length) / built.step) % built.line.length;
  const p = built.line[i];
  c.x = p.x + p.nx * lateral;
  c.z = p.z + p.nz * lateral;
  c.h = Math.atan2(p.tx, p.tz);
  c.hint = i;
  c.prevDist = p.dist;
  c.lateral = lateral;
}

{
  const c = gridCar(built, 0);
  const half = built.width / 2;
  let t = 0;
  const strikes = [];
  for (let trip = 0; trip < 3; trip++) {
    // a second fully off the road, at racing speed
    for (let i = 0; i < 60; i++) {
      t += DT;
      c.v = 45;
      placeAt(c, 400 + trip * 900 + i * 0.75, half + 3.5);
      stepCar(built, c, { s: 0, g: 1, b: 0 }, drv, DT, t, (k) => { if (k === 'limits') strikes.push(+t.toFixed(1)); });
    }
    // and back on it
    for (let i = 0; i < 40; i++) {
      t += DT;
      c.v = 45;
      placeAt(c, 445 + trip * 900 + i * 0.75, 0);
      stepCar(built, c, { s: 0, g: 1, b: 0 }, drv, DT, t, (k) => { if (k === 'limits') strikes.push(+t.toFixed(1)); });
    }
  }
  console.log('track limits   strikes recorded:', strikes.length, 'of 3 excursions',
              '| car.limitStrikes =', c.limitStrikes);
}

/* ---- pushed off is not a strike ---------------------------------------- */
{
  const c = gridCar(built, 0);
  const half = built.width / 2;
  let t = 0, strikes = 0;
  for (let i = 0; i < 60; i++) {
    t += DT; c.v = 45; c.hit = t;               // someone is leaning on it the whole way
    placeAt(c, 400 + i * 0.75, half + 3.5);
    stepCar(built, c, { s: 0, g: 1, b: 0 }, drv, DT, t, k => { if (k === 'limits') strikes++; });
  }
  for (let i = 0; i < 40; i++) {
    t += DT; c.v = 45; c.hit = t;
    placeAt(c, 445 + i * 0.75, 0);
    stepCar(built, c, { s: 0, g: 1, b: 0 }, drv, DT, t, k => { if (k === 'limits') strikes++; });
  }
  console.log('pushed off     strikes recorded:', strikes, '(should be 0)');
}

/* ---- causing a collision: who gets the blame --------------------------- */
{
  const cases = [
    ['rear-ender    ', 60, 0],      // straight into the back
    ['side by side  ', 60, 1]       // alongside, same speed
  ];
  for (const [label, speed, mode] of cases) {
    const a = gridCar(built, 0), b = gridCar(built, 1);
    if (mode === 0) {
      b.x = a.x + Math.sin(a.h) * 26; b.z = a.z + Math.cos(a.h) * 26; b.v = 0;
      a.v = speed; a.h = Math.atan2(b.x - a.x, b.z - a.z);
    } else {
      b.x = a.x + Math.cos(a.h) * 3.6; b.z = a.z - Math.sin(a.h) * 3.6;
      a.v = speed; b.v = speed - 3; b.h = a.h;
    }
    let t = 0, blamed = null, sq = 0, sv = 0;
    for (let i = 0; i < 200; i++) {
      t += DT;
      for (const c of [a, b]) stepCar(built, c, { s: 0, g: 0, b: 0 }, drv, DT, t, null);
      separate([a, b], DT, (ca, cb, sev, square) => {
        if (blamed === null) { blamed = ca === a ? 'A' : 'B'; sq = square; sv = sev; }
      }, built.length);
    }
    const penal = sq > 0.55 && sv > 20;
    console.log(label, 'blamed', blamed || '-', 'square', sq.toFixed(2), 'severity', sv.toFixed(0),
                '->', penal ? 'PENALTY' : 'racing incident');
  }
}

/* ---- serving a penalty at a stop --------------------------------------- */
{
  for (const owed of [0, 5]) {
    const c = gridCar(built, 0, 'soft');
    c.wear = 0.95;
    c.penaltySec = owed;
    let t = 0, stopAt = null, goAt = null;
    while (t < 400 && goAt === null) {
      t += DT;
      stepCar(built, c, aiInput(built, c, drv, t, 0, 1, [c]), drv, DT, t, (k, d) => {
        if (k === 'pit' && d.state === 'stopped') stopAt = t;
        if (k === 'pit' && d.state === 'released') goAt = t;
      });
    }
    console.log(`stop with ${owed}s owed: stationary for`,
                (goAt - stopAt).toFixed(1) + 's',
                '(service is', TUNE.pitService + 's)',
                '| still owed', (c.penaltySec || 0).toFixed(1) + 's');
  }
}
