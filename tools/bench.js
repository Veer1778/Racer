// Headless physics bench: races bots on every circuit and reports how well they drive.
import { TRACKS } from '../public/shared/tracks.js';
import { trackFor, gridCar, aiInput, stepCar, separate, driverOf, TUNE } from '../public/shared/sim.js';

const DT = 1 / 60;
const LAPS = 3;

for (const t of TRACKS) {
  const built = trackFor(t.id);
  const drivers = ['kaito', 'mira', 'vance', 'rook'];
  const cars = drivers.map((_, i) => gridCar(built, i));
  let time = 0, offTicks = 0, ticks = 0, hits = 0, lastHit = -9;
  const done = [];

  while (time < 620 && done.length < cars.length) {
    time += DT;
    cars.forEach((c, i) => {
      if (c.finished) return;
      const drv = driverOf(drivers[i]);
      stepCar(built, c, aiInput(built, c, drv, time, i * 2), drv, DT, time, lap => {
        if (lap > LAPS && !c.finished) { c.finished = true; c.finishT = time; done.push({ i, time, best: c.best, laps: c.lapTimes }); }
      });
      ticks++;
      if (c.off) offTicks++;
      if (c.hit > lastHit) { hits++; lastHit = c.hit; }
    });
    separate(cars);
  }

  const laps = cars.flatMap(c => c.lapTimes);
  const avg = laps.length ? laps.reduce((a, b) => a + b, 0) / laps.length : 0;
  const top = Math.max(...cars.map(c => c.v));
  console.log(
    t.id.padEnd(11),
    'len', String(Math.round(built.length)).padStart(4) + 'm',
    'finished', done.length + '/' + cars.length,
    'lap avg', avg.toFixed(1) + 's',
    'best', (laps.length ? Math.min(...laps).toFixed(1) : '-') + 's',
    'offtrack', (100 * offTicks / Math.max(1, ticks)).toFixed(1) + '%',
    'wallhits', hits,
    'avg speed', (built.length / (avg || 1) * 3.6).toFixed(0) + 'km/h'
  );
  if (laps.length) console.log('   lap spread:', cars.map(c => c.lapTimes.map(x => x.toFixed(1)).join('/')).join('  |  '));
}
