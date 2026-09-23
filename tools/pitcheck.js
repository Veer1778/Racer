// Pit lane check: runs a field of bots on soft tyres so every one of them has
// to stop, and reports whether the lane behaves like a pit lane — one stop per
// visit, everybody served at their own box, nobody stuck against a wall, and
// the time lost roughly what a real stop costs.
import { TRACKS } from '../public/shared/tracks.js';
import { trackFor, gridCar, aiInput, stepCar, separate, driverOf, pitGeometry, TUNE } from '../public/shared/sim.js';

const DT = 1 / 60;
const LAPS = 6;
const FIELD = 8;

for (const t of TRACKS) {
  const built = trackFor(t.id);
  const pit = pitGeometry(built);
  const ids = ['kaito-renn', 'mira-okonkwo', 'elias-vance', 'dmitri-rook'];
  const cars = Array.from({ length: FIELD }, (_, i) => gridCar(built, i, 'soft'));

  let time = 0, done = 0, hits = 0;
  const wasTouching = cars.map(() => false);
  let laneTicks = 0, wrongBox = 0, laneOver = 0, minGapToWall = 99;
  const laneIn = new Map(), laneTime = [];

  while (time < 1400 && done < cars.length) {
    time += DT;
    cars.forEach((c, i) => {
      if (c.finished) return;
      const drv = driverOf(ids[i % ids.length]);
      const before = c.pit;
      stepCar(built, c, aiInput(built, c, drv, time, i * 2, 1, cars), drv, DT, time, (kind, d) => {
        if (kind === 'lap' && d.lap > LAPS) { c.finished = true; done++; }
      });
      // sim.js already latches one impact per contact in `touching`; counting
      // raw `hit` timestamps counted every tick a car leaned on a barrier
      if (c.touching && !wasTouching[i]) hits++;
      wasTouching[i] = c.touching;

      const inLane = c.pit === 'lane' || c.pit === 'stopped';
      if (inLane && before !== 'lane' && before !== 'stopped') laneIn.set(i, time);
      if (!inLane && (before === 'lane' || before === 'stopped')) {
        if (laneIn.has(i)) { laneTime.push(time - laneIn.get(i)); laneIn.delete(i); }
      }
      if (inLane) {
        laneTicks++;
        const pd = pit.pd(c.prevDist);
        if (pd > pit.total) { laneOver++; return; }
        // only meaningful where the lane has walls of its own; on the entry
        // and exit roads the corridor deliberately spans track and lane
        if (!pit.open(pd)) {
          const gap = pit.laneW / 2 - Math.abs(c.lateral - pit.centre(pd));
          minGapToWall = Math.min(minGapToWall, gap);
        }
        if (c.pit === 'stopped' && Math.abs(pd - pit.boxPd(c.box)) > 9) wrongBox++;
      }
    });
    separate(cars, DT);
  }

  const stops = cars.map(c => c.stops);
  const avgLane = laneTime.length ? laneTime.reduce((a, b) => a + b, 0) / laneTime.length : 0;
  console.log(
    t.id.padEnd(11),
    'pit', pit.usable ? 'yes' : 'NO ',
    'boxes', String(pit.boxCount).padStart(2),
    'finished', done + '/' + cars.length,
    'stops', stops.join(''),
    'visits', laneTime.length,
    'lane time', avgLane.toFixed(1) + 's',
    'queued stops', wrongBox,
    'outside window', laneOver,
    'wall clearance', minGapToWall === 99 ? '-' : minGapToWall.toFixed(2) + 'm',
    'wallhits', hits
  );
}
