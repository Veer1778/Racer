// Headless physics bench: races bots on every circuit and reports how well they drive.
import { TRACKS } from '../public/shared/tracks.js';
import { trackFor, gridCar, aiInput, stepCar, separate, driverOf, TUNE } from '../public/shared/sim.js';

const DT = 1 / 60;
const LAPS = 4;

for (const t of TRACKS) {
  const built = trackFor(t.id);
  const drivers = ['kaito-renn', 'mira-okonkwo', 'elias-vance', 'dmitri-rook'];
  const cars = drivers.map((_, i) => gridCar(built, i));
  let time = 0, offTicks = 0, ticks = 0, hits = 0, crashes = 0;
  const wasTouching = cars.map(() => false);
  const done = [];

  while (time < 900 && done.length < cars.length) {
    time += DT;
    cars.forEach((c, i) => {
      if (c.finished) return;
      const drv = driverOf(drivers[i]);
      stepCar(built, c, aiInput(built, c, drv, time, i * 2, 1, cars), drv, DT, time, (kind, data) => {
        if (kind === 'lap' && data.lap > LAPS && !c.finished) {
          c.finished = true; c.finishT = time;
          done.push({ i, time, best: c.best, laps: c.lapTimes });
        }
        if (kind === 'crash') crashes++;
      });
      ticks++;
      if (c.off) offTicks++;
      // sim.js already latches one impact per contact in `touching`; counting
      // raw `hit` timestamps counted every tick a car leaned on a barrier
      if (c.touching && !wasTouching[i]) hits++;
      wasTouching[i] = c.touching;
    });
    separate(cars, DT, null, built.length);
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
    'wallhits', hits, 'crashes', crashes,
    'stops', cars.reduce((n, c) => n + c.stops, 0),
    'wear', (cars.reduce((n, c) => n + c.wear, 0) / cars.length).toFixed(2),
    'damage', (cars.reduce((n, c) => n + c.damage, 0) / cars.length).toFixed(2),
    'sectors', cars[0].bestSectors.filter(Boolean).length,
    'avg speed', (built.length / (avg || 1) * 3.6).toFixed(0) + 'km/h'
  );
  if (laps.length) console.log('   lap spread:', cars.map(c => c.lapTimes.map(x => x.toFixed(1)).join('/')).join('  |  '));
}
