// 2026 Formula 1 grid — 11 teams, two cars each.
//
// NOTE:
// Real Formula 1 team/driver names are used here.
// A publicly released/commercial game may require licences for trademarks,
// logos, liveries and driver likenesses.
//
// All cars remain performance-identical. accel/top/grip are 1.00.

export const TEAMS = [
  {
    id: 'mclaren',
    name: 'McLaren',
    color: '#FF8700',
    trim: '#47C7FC',
    base: 'Woking, UK'
  },
  {
    id: 'mercedes',
    name: 'Mercedes',
    color: '#00D2BE',
    trim: '#C0C0C0',
    base: 'Brackley, UK'
  },
  {
    id: 'red-bull',
    name: 'Red Bull Racing',
    color: '#3671C6',
    trim: '#FFD700',
    base: 'Milton Keynes, UK'
  },
  {
    id: 'ferrari',
    name: 'Ferrari',
    color: '#E8002D',
    trim: '#FFD700',
    base: 'Maranello, IT'
  },
  {
    id: 'williams',
    name: 'Williams',
    color: '#1868DB',
    trim: '#FFFFFF',
    base: 'Grove, UK'
  },
  {
    id: 'racing-bulls',
    name: 'Racing Bulls',
    color: '#6692FF',
    trim: '#FFFFFF',
    base: 'Faenza, IT'
  },
  {
    id: 'aston-martin',
    name: 'Aston Martin',
    color: '#229971',
    trim: '#CEDC00',
    base: 'Silverstone, UK'
  },
  {
    id: 'haas',
    name: 'Haas',
    color: '#B6BABD',
    trim: '#E6002D',
    base: 'Kannapolis, US'
  },
  {
    id: 'alpine',
    name: 'Alpine',
    color: '#2293D1',
    trim: '#FF87BC',
    base: 'Enstone, UK'
  },
  {
    id: 'audi',
    name: 'Audi',
    color: '#F50537',
    trim: '#C7C7C7',
    base: 'Hinwil, CH'
  },
  {
    id: 'cadillac',
    name: 'Cadillac',
    color: '#111111',
    trim: '#D4AF37',
    base: 'Fishers, US'
  }
];


// [teamId, number, driver, accel, topSpeed, grip, helmet]
//
// Every car deliberately uses identical performance values.

const ROSTER = [
  // McLaren
  ['mclaren',       1, 'Lando Norris',       1.00, 1.00, 1.00, '#FF8700'],
  ['mclaren',      81, 'Oscar Piastri',      1.00, 1.00, 1.00, '#FFEA00'],

  // Mercedes
  ['mercedes',     63, 'George Russell',     1.00, 1.00, 1.00, '#00D2BE'],
  ['mercedes',     12, 'Kimi Antonelli',     1.00, 1.00, 1.00, '#FFFFFF'],

  // Red Bull Racing
  ['red-bull',      3, 'Max Verstappen',     1.00, 1.00, 1.00, '#FF8C00'],
  ['red-bull',      6, 'Isack Hadjar',       1.00, 1.00, 1.00, '#FFFFFF'],

  // Ferrari
  ['ferrari',      16, 'Charles Leclerc',    1.00, 1.00, 1.00, '#E8002D'],
  ['ferrari',      44, 'Lewis Hamilton',     1.00, 1.00, 1.00, '#FFD700'],

  // Williams
  ['williams',     23, 'Alexander Albon',    1.00, 1.00, 1.00, '#1868DB'],
  ['williams',     55, 'Carlos Sainz',       1.00, 1.00, 1.00, '#FFDA00'],

  // Racing Bulls
  ['racing-bulls', 30, 'Liam Lawson',        1.00, 1.00, 1.00, '#6692FF'],
  ['racing-bulls', 41, 'Arvid Lindblad',     1.00, 1.00, 1.00, '#FFFFFF'],

  // Aston Martin
  ['aston-martin', 14, 'Fernando Alonso',    1.00, 1.00, 1.00, '#229971'],
  ['aston-martin', 18, 'Lance Stroll',       1.00, 1.00, 1.00, '#CEDC00'],

  // Haas
  ['haas',         31, 'Esteban Ocon',       1.00, 1.00, 1.00, '#E6002D'],
  ['haas',         87, 'Oliver Bearman',     1.00, 1.00, 1.00, '#FFFFFF'],

  // Alpine
  ['alpine',       10, 'Pierre Gasly',       1.00, 1.00, 1.00, '#2293D1'],
  ['alpine',       43, 'Franco Colapinto',   1.00, 1.00, 1.00, '#FF87BC'],

  // Audi
  ['audi',         27, 'Nico Hulkenberg',    1.00, 1.00, 1.00, '#F50537'],
  ['audi',          5, 'Gabriel Bortoleto',  1.00, 1.00, 1.00, '#C7C7C7'],

  // Cadillac
  ['cadillac',     11, 'Sergio Perez',       1.00, 1.00, 1.00, '#D4AF37'],
  ['cadillac',     77, 'Valtteri Bottas',    1.00, 1.00, 1.00, '#FFFFFF']
];


export const DRIVERS = ROSTER.map(
  ([teamId, no, name, accel, top, grip, helmet]) => {
    const team = TEAMS.find(t => t.id === teamId);

    return {
      id: name
        .toLowerCase()
        .replace(/[^a-z]+/g, '-')
        .replace(/^-|-$/g, ''),

      name,
      no,
      helmet,

      team: team.name,
      teamId,

      color: team.color,
      trim: team.trim,

      accel,
      top,
      grip,

      short: name
        .split(' ')
        .pop()
        .slice(0, 3)
        .toUpperCase()
    };
  }
);


export const driverById = id =>
  DRIVERS.find(d => d.id === id) || DRIVERS[0];
