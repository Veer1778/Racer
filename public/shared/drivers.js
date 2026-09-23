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

// Every car is identical. The three figures below are all 1.00 on purpose:
// nobody should finish ahead because of which driver they picked off the lobby
// screen. What differs between cars during a race is tyre compound, tyre wear,
// damage and who drove better. The columns stay so a private build can make a
// car quicker without touching anything else.
const ROSTER = [
  ['vantari',    7, 'Kaito Renn',      1.00, 1.00, 1.00, '#ffd166'],
  ['vantari',   16, 'Luca Moreau',     1.00, 1.00, 1.00, '#e2334a'],
  ['solaxis',    4, 'Noor Bashir',     1.00, 1.00, 1.00, '#f5a524'],
  ['solaxis',   23, 'Dries Vandaal',   1.00, 1.00, 1.00, '#1b2230'],
  ['ardent',    11, 'Elias Vance',     1.00, 1.00, 1.00, '#e9edf5'],
  ['ardent',    31, 'Sam Okafor',      1.00, 1.00, 1.00, '#2f6fe4'],
  ['kestrel',    5, 'Mira Okonkwo',    1.00, 1.00, 1.00, '#1fc36b'],
  ['kestrel',   18, 'Jonas Ek',        1.00, 1.00, 1.00, '#0d1018'],
  ['nordvik',    9, 'Dmitri Rook',     1.00, 1.00, 1.00, '#9a5cff'],
  ['nordvik',   27, 'Ines Halvard',    1.00, 1.00, 1.00, '#e9edf5'],
  ['verano',    14, 'Tomas Silva',     1.00, 1.00, 1.00, '#00c4c4'],
  ['verano',    22, 'Rafa Duarte',     1.00, 1.00, 1.00, '#0d1018'],
  ['meridian',   3, 'Anaya Deshmukh',  1.00, 1.00, 1.00, '#ff5f8d'],
  ['meridian',  40, 'Yuki Tanabe',     1.00, 1.00, 1.00, '#e9edf5'],
  ['copperline', 77, 'Brett Hale',     1.00, 1.00, 1.00, '#c9d1d9'],
  ['copperline', 12, 'Otto Frey',      1.00, 1.00, 1.00, '#b87333'],
  ['kaizen',     8, 'Sora Iwata',      1.00, 1.00, 1.00, '#ff6a2b'],
  ['kaizen',    29, 'Milo Brandt',     1.00, 1.00, 1.00, '#14181f'],
  ['aurelian',  44, 'Viktor Aalto',    1.00, 1.00, 1.00, '#e8d5a3'],
  ['aurelian',   6, 'Priya Raman',     1.00, 1.00, 1.00, '#1b4fa8']
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
