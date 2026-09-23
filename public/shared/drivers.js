// The grid: ten teams, two cars each.
//
// These are invented teams and drivers. Real F1 team names, driver names and
// liveries are trademarks and likeness rights that a published game has to
// licence, so this file keeps its own roster. Everything a rename needs is
// here: change `name`, `team` and the colours and the rest of the game follows.

export const TEAMS = [
  { id: 'vantari',    name: 'Vantari',    color: '#e2334a', trim: '#ffd166', base: 'Maranello, IT' },
  { id: 'solaxis',    name: 'Solaxis',    color: '#f5a524', trim: '#14181f', base: 'Enstone, UK' },
  { id: 'ardent',     name: 'Ardent',     color: '#2f6fe4', trim: '#e9edf5', base: 'Milton Keynes, UK' },
  { id: 'kestrel',    name: 'Kestrel',    color: '#1fc36b', trim: '#0d1018', base: 'Brackley, UK' },
  { id: 'nordvik',    name: 'Nordvik',    color: '#9a5cff', trim: '#e9edf5', base: 'Hinwil, CH' },
  { id: 'verano',     name: 'Verano',     color: '#00c4c4', trim: '#0d1018', base: 'Faenza, IT' },
  { id: 'meridian',   name: 'Meridian',   color: '#ff5f8d', trim: '#2b1721', base: 'Silverstone, UK' },
  { id: 'copperline', name: 'Copperline', color: '#c9d1d9', trim: '#b87333', base: 'Grove, UK' },
  { id: 'kaizen',     name: 'Kaizen',     color: '#ff6a2b', trim: '#14181f', base: 'Sakura, JP' },
  { id: 'aurelian',   name: 'Aurelian',   color: '#1b4fa8', trim: '#e8d5a3', base: 'Banbury, UK' }
];

// accel / top / grip are multipliers around 1.0, so a car is quick somewhere
// and compromised somewhere else rather than simply better.
const ROSTER = [
  ['vantari',    7, 'Kaito Renn',      1.00, 1.00, 1.00, '#ffd166'],
  ['vantari',   16, 'Luca Moreau',     1.02, 0.99, 1.00, '#e2334a'],
  ['solaxis',    4, 'Noor Bashir',     1.05, 0.96, 1.02, '#f5a524'],
  ['solaxis',   23, 'Dries Vandaal',   1.03, 0.97, 1.01, '#1b2230'],
  ['ardent',    11, 'Elias Vance',     0.95, 1.05, 0.98, '#e9edf5'],
  ['ardent',    31, 'Sam Okafor',      0.97, 1.04, 0.99, '#2f6fe4'],
  ['kestrel',    5, 'Mira Okonkwo',    1.02, 0.99, 1.03, '#1fc36b'],
  ['kestrel',   18, 'Jonas Ek',        1.00, 1.01, 1.02, '#0d1018'],
  ['nordvik',    9, 'Dmitri Rook',     0.98, 1.03, 0.97, '#9a5cff'],
  ['nordvik',   27, 'Ines Halvard',    1.01, 1.00, 0.99, '#e9edf5'],
  ['verano',    14, 'Tomas Silva',     1.03, 0.97, 1.01, '#00c4c4'],
  ['verano',    22, 'Rafa Duarte',     1.04, 0.96, 1.00, '#0d1018'],
  ['meridian',   3, 'Anaya Deshmukh',  1.01, 1.01, 1.00, '#ff5f8d'],
  ['meridian',  40, 'Yuki Tanabe',     1.02, 1.00, 1.01, '#e9edf5'],
  ['copperline', 77, 'Brett Hale',     0.97, 1.04, 0.99, '#c9d1d9'],
  ['copperline', 12, 'Otto Frey',      0.99, 1.02, 0.98, '#b87333'],
  ['kaizen',     8, 'Sora Iwata',      1.04, 0.97, 1.02, '#ff6a2b'],
  ['kaizen',    29, 'Milo Brandt',     1.02, 0.98, 1.00, '#14181f'],
  ['aurelian',  44, 'Viktor Aalto',    0.99, 1.03, 1.01, '#e8d5a3'],
  ['aurelian',   6, 'Priya Raman',     1.01, 1.01, 0.99, '#1b4fa8']
];

export const DRIVERS = ROSTER.map(([teamId, no, name, accel, top, grip, helmet]) => {
  const team = TEAMS.find(t => t.id === teamId);
  return {
    id: name.toLowerCase().replace(/[^a-z]+/g, '-'),
    name, no, helmet,
    team: team.name, teamId,
    color: team.color, trim: team.trim,
    accel, top, grip,
    short: name.split(' ').pop().slice(0, 3).toUpperCase()
  };
});

export const driverById = id => DRIVERS.find(d => d.id === id) || DRIVERS[0];
