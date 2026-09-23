import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import os from 'os';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
import path from 'path';
import { TRACKS, DRIVERS, TEAMS, getTrack } from './public/shared/tracks.js';
import { trackFor, gridCar, aiInput, stepCar, separate, driverOf, COMPOUNDS, TUNE } from './public/shared/sim.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/info', (req, res) => {
  res.json({ lan: lanAddress(), port: PORT, drivers: DRIVERS, teams: TEAMS,
             tracks: TRACKS.map(t => ({ id: t.id, name: t.name, country: t.country, blurb: t.blurb })) });
});

app.get('/qr', async (req, res) => {
  const text = String(req.query.d || '');
  try {
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#0b0e14', light: '#ffffff' } });
    res.type('svg').send(svg);
  } catch (e) { res.status(400).send('bad'); }
});

// /c is the phone controller
app.get('/c', (req, res) => res.sendFile(path.join(__dirname, 'public', 'controller.html')));

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/* ---------------------------------------------------------------- rooms */

const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rnd = n => Array.from({ length: n }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

function newRoom() {
  let code;
  do { code = rnd(4); } while (rooms.has(code));
  const room = {
    code,
    hostId: null,
    trackId: TRACKS[0].id,
    laps: TRACKS[0].laps || 3,
    aiCount: 7,
    aiSkill: 0.94,
    state: 'lobby',       // lobby | countdown | racing | results
    players: new Map(),
    built: null,
    startAt: 0,
    raceTime: 0,
    results: [],
    lastBroadcast: 0
  };
  rooms.set(code, room);
  return room;
}

function freeDriver(room) {
  const taken = new Set([...room.players.values()].map(p => p.driverId));
  return (DRIVERS.find(d => !taken.has(d.id)) || DRIVERS[0]).id;
}

function addPlayer(room, name, ws, isBot = false) {
  const pid = rnd(6);
  const p = {
    pid, token: rnd(8), name: (name || 'Driver').slice(0, 14), bot: isBot,
    seed: Math.random() * 6.3,
    driverId: freeDriver(room), ready: isBot, ws, ctrl: null, hasCtrl: isBot,
    input: { s: 0, g: 0, b: 0 },
    car: null
  };
  room.players.set(pid, p);
  if (!room.hostId && !isBot) room.hostId = pid;
  return p;
}

function lobbyPayload(room) {
  return {
    t: 'lobby',
    code: room.code,
    state: room.state,
    trackId: room.trackId,
    laps: room.laps,
    aiCount: room.aiCount,
    aiSkill: room.aiSkill,
    hostId: room.hostId,
    players: [...room.players.values()].filter(p => !p.bot).map(p => ({
      pid: p.pid, name: p.name, driverId: p.driverId, ready: p.ready, ctrl: !!p.hasCtrl, tyre: p.tyre || 'medium'
    }))
  };
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch {} }
}
function broadcast(room, obj) {
  for (const p of room.players.values()) if (!p.bot) send(p.ws, obj);
}
function pushLobby(room) { broadcast(room, lobbyPayload(room)); }

/* ------------------------------------------------------------- physics */

// Physics lives in sim.js so it can be tuned and tested without a server.

function resetGrid(room) {
  const built = room.built = trackFor(room.trackId);
  [...room.players.values()].forEach((p, i) => {
    p.car = gridCar(built, i, p.tyre || 'medium');
    p.car.pitTyre = p.pitTyre || 'medium';
    p.input = { s: 0, g: 0, b: 0, pit: 0 };
  });
}

// Puts a stranded car back on the racing line, facing the right way.
function recover(room, p) {
  const c = p.car, s = room.built.line[c.hint];
  if (!c || c.finished) return;
  c.x = s.x; c.z = s.z;
  c.h = Math.atan2(s.tx, s.tz);
  c.v = 0; c.off = false; c.slip = false; c.stuck = 0;
  send(p.ws, { t: 'recovered' });
}

// One way out of a race, whether the driver pressed the button or the car was
// written off. Classification keeps retirements, so a DNF still appears on the
// results sheet in the order the cars got that far.
function retire(room, p, reason) {
  if (!p.car || p.car.retired && p.car.finished) return;
  p.car.retired = true;
  p.car.finished = true;
  if (!room.results.some(r => r.pid === p.pid)) {
    room.results.push({ pid: p.pid, name: p.name, bot: p.bot, driverId: p.driverId,
                        time: null, best: p.car.best, laps: Math.max(0, p.car.lap),
                        progress: p.car.progress, retired: true, reason,
                        penalty: Math.max(0, p.car.penaltySec || 0) });
  }
  broadcast(room, { t: 'retired', pid: p.pid, name: p.name, reason });
  if (!p.bot) send(p.ws, { t: 'results', results: room.results, trackId: room.trackId });
}

// ---------------------------------------------------------- stewarding
//
// A time penalty is served at the next pit stop, and anything still unserved
// when the car finishes is added to its race time. That is how Formula 1 does
// it, and it means a penalty is a real cost whether or not you stop again.
function penalise(room, p, seconds, reason) {
  if (!p.car || p.car.retired) return;
  p.car.penaltySec = (p.car.penaltySec || 0) + seconds;
  p.car.penalties = (p.car.penalties || 0) + 1;
  broadcast(room, { t: 'penalty', pid: p.pid, name: p.name, seconds, reason,
                    total: p.car.penaltySec, count: p.car.penalties });
}

function tickCar(room, p, dt) {
  const drv = driverOf(p.driverId);
  let input;
  if (p.bot || p.autopilot) {
    input = aiInput(room.built, p.car, drv, room.raceTime, p.seed || 0, room.aiSkill, room.field);
  } else {
    input = { ...p.input, pit: p.pitRequest ? 1 : 0 };
    p.pitRequest = false;
  }
  // anyone parked against a barrier gets rejoined automatically
  const wedged = Math.abs(p.car.v) < 9 && (p.car.off || room.raceTime - p.car.hit < 1.5);
  if (!p.car.finished && (Math.abs(p.car.v) < 3 || wedged) && room.raceTime > 3) {
    p.car.stuck = (p.car.stuck || 0) + dt;
    if (p.car.stuck > 6) recover(room, p);
  } else p.car.stuck = 0;

  stepCar(room.built, p.car, input, drv, dt, room.raceTime, (kind, data) => {
    if (kind === 'sector' && !p.bot) {
      send(p.ws, { t: 'sector', i: data.index, time: data.time, pb: data.pb });
    }
    if (kind === 'crash' && !p.bot) {
      send(p.ws, { t: 'crash', closing: data.closing, damage: data.damage });
    }
    if (kind === 'pit' && !p.bot) {
      send(p.ws, { t: 'pitstate', state: data.state, tyre: data.tyre || p.car.tyre });
    }
    if (kind === 'dnf') { retire(room, p, 'damage'); return; }

    // Track limits: two warnings, then five seconds for the third and for
    // every third after that — the same ladder the stewards use.
    if (kind === 'limits') {
      const n = data.strikes;
      if (n > TUNE.limitsAllowed && (n - TUNE.limitsAllowed) % 1 === 0 && n % 3 === 0) {
        penalise(room, p, TUNE.penaltyLimits, 'track limits');
      } else if (!p.bot) {
        send(p.ws, { t: 'warning', kind: 'limits', strikes: n,
                     left: Math.max(0, 3 - (n % 3)) });
      }
    }
    if (kind !== 'lap') return;
    const lap = data.lap;
    if (lap > room.laps && !p.car.finished) {
      p.car.finished = true;
      p.car.finishT = room.raceTime;
      // Anything still unserved is added here, which is what makes a penalty
      // taken on the last lap cost exactly as much as one taken on the first.
      const pen = Math.max(0, p.car.penaltySec || 0);
      room.results.push({ pid: p.pid, name: p.name, bot: p.bot, driverId: p.driverId,
                          time: room.raceTime + pen, raw: room.raceTime, penalty: pen,
                          best: p.car.best, laps: lap - 1 });
      broadcast(room, { t: 'finished', pid: p.pid, name: p.name, pos: room.results.length, time: room.raceTime });
    }
  });
}


function standings(room) {
  const ps = [...room.players.values()].filter(p => p.car);
  ps.sort((a, b) => {
    if (a.car.finished !== b.car.finished) return a.car.finished ? -1 : 1;
    if (a.car.finished && b.car.finished) return a.car.finishT - b.car.finishT;
    return b.car.progress - a.car.progress;
  });
  return ps;
}

function snapshot(room) {
  const ord = standings(room);
  const posOf = new Map(ord.map((p, i) => [p.pid, i + 1]));
  return {
    t: 'state',
    time: room.raceTime,
    ends: room.endsAt || 0,
    state: room.state,
    cars: [...room.players.values()].map(p => ({
      id: p.pid, n: p.name, d: p.driverId, bot: p.bot,
      x: +p.car.x.toFixed(2), z: +p.car.z.toFixed(2), h: +p.car.h.toFixed(3),
      v: +p.car.v.toFixed(1), lap: Math.max(0, p.car.lap), pos: posOf.get(p.pid),
      off: p.car.off, fin: p.car.finished, best: p.car.best, q: p.seq || 0,
      ty: p.car.tyre, w: +p.car.wear.toFixed(3), dmg: +p.car.damage.toFixed(3), st: p.car.stops || 0,
      pit: p.car.pit, ret: p.car.retired, yaw: +(p.car.yaw || 0).toFixed(3),
      jk: +(p.car.jack || 0).toFixed(2), pcl: +Math.max(0, p.car.pitClock || 0).toFixed(2),
      sv: !!p.car.served, pen: +(p.car.penaltySec || 0).toFixed(1),
      lim: p.car.limitStrikes || 0,
      hint: p.car.hint, pd: +p.car.prevDist.toFixed(2), pr: +p.car.progress.toFixed(1),
      in: p.bot ? undefined : { s: +(p.input.s || 0).toFixed(2), g: p.input.g || 0, b: p.input.b || 0 },
      cur: +Math.max(0, room.raceTime - p.car.lapStart).toFixed(2)
    }))
  };
}

/* ---------------------------------------------------------------- loop */

const TICK = 1 / 60;
const GRACE = 30;          // seconds the field gets after the winner crosses the line
let acc = 0, last = Date.now();

setInterval(() => {
  const now = Date.now();
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;

  while (acc >= TICK) {
    acc -= TICK;
    for (const room of rooms.values()) {
      if (room.state === 'countdown') {
        const left = (room.startAt - Date.now()) / 1000;
        // The last second of the countdown is simulated, so a driver who gets
        // on the throttle early actually creeps forward and can be caught for
        // it. Bots are held at zero input; only a person can jump the start.
        if (left < 1.0 && left > 0 && room.built) {
          for (const p of room.players.values()) {
            if (!p.car) continue;
            const input = p.bot ? { s: 0, g: 0, b: 0 } : { ...p.input, pit: 0 };
            stepCar(room.built, p.car, input, driverOf(p.driverId), TICK, 0, null);
            if (!p.jumped && Math.abs(p.car.v) > 0.9) p.jumped = true;
          }
        }
        if (left <= 0) {
          room.state = 'racing'; room.raceTime = 0;
          broadcast(room, { t: 'go' });
          for (const p of room.players.values()) {
            if (p.jumped) { penalise(room, p, TUNE.penaltyJump, 'jump start'); p.jumped = false; }
          }
        }
      } else if (room.state === 'racing') {
        room.raceTime += TICK;
        room.field = [...room.players.values()].map(p => p.car).filter(Boolean);
        for (const p of room.players.values()) if (p.car) tickCar(room, p, TICK);
        const field = [...room.players.values()].filter(p => p.car);
        const byCar = new Map(field.map(p => [p.car, p]));
        separate(field.map(p => p.car), TICK, (ca, cb, sev, square) => {
          ca.hit = cb.hit = room.raceTime;
          for (const c of [ca, cb]) {
            const p = byCar.get(c);
            if (p && !p.bot) send(p.ws, { t: 'crash', closing: sev, damage: c.damage, car: true });
          }
          // Causing a collision: the car that closed, squarely, at speed. A
          // side-by-side rub is racing; driving into the back of someone is not.
          const at = byCar.get(ca);
          if (at && square > 0.55 && sev > 20 && room.raceTime > 1) {
            penalise(room, at, TUNE.penaltyCollision, 'causing a collision');
          }
        }, room.built.length);

        // Unsafe release: rejoining the lane from the box across another car.
        for (const p of field) {
          const c = p.car;
          const releasing = c.served && c.pit === 'lane' && room.raceTime - (c.releasedAt || -99) < 1.2;
          if (c.pit === 'lane' && c.served && !c.releasedAt) c.releasedAt = room.raceTime;
          if (c.pit !== 'lane') c.releasedAt = 0;
          if (!releasing || c.releaseJudged) continue;
          for (const q of field) {
            if (q === p || q.car.pit !== 'lane') continue;
            const dx = q.car.x - c.x, dz = q.car.z - c.z;
            const behind = -(dx * Math.sin(c.h) + dz * Math.cos(c.h));
            if (behind > 0 && behind < 11 && Math.hypot(dx, dz) < 12) {
              c.releaseJudged = true;
              penalise(room, p, TUNE.penaltyRelease, 'unsafe release');
              break;
            }
          }
        }
        const humans = [...room.players.values()].filter(p => !p.bot);
        const allDone = humans.length > 0 && humans.every(p => p.car.finished || p.car.retired);
        const firstDone = room.results.length > 0;
        // once the leader is home the rest get a fixed window to finish
        room.endsAt = firstDone ? room.results[0].time + GRACE : 0;
        if (allDone || (firstDone && room.raceTime > room.endsAt)) endRace(room);
      }
    }
  }

  // 20 Hz broadcast
  for (const room of rooms.values()) {
    if (room.state !== 'racing' && room.state !== 'countdown') continue;
    if (now - room.lastBroadcast < 33) continue;
    room.lastBroadcast = now;
    if (room.built) broadcast(room, snapshot(room));

    // A few times a second, each paired phone gets its own car's speed back.
    // The controller needs it to tell the driver that holding the brake has
    // put the car in reverse; it is far too little traffic to batch.
    if (now - (room.lastTel || 0) > 180) {
      room.lastTel = now;
      for (const p of room.players.values()) {
        if (p.ctrl && p.car) send(p.ctrl, { t: 'tel', v: +p.car.v.toFixed(1) });
      }
    }
  }
}, 8);

function endRace(room) {
  room.state = 'results';
  const already = new Set(room.results.map(r => r.pid));
  for (const p of room.players.values()) {
    if (p.car && !p.car.finished && !already.has(p.pid)) {
      room.results.push({ pid: p.pid, name: p.name, bot: p.bot, driverId: p.driverId, time: null,
                          best: p.car.best, laps: Math.max(0, p.car.lap), progress: p.car.progress });
    }
  }
  // Classification: finishers by time, then whoever got furthest, retirements
  // last. Results are appended as they happen, so a retirement early in the
  // race would otherwise sit at the top of the sheet.
  room.results.sort((a, b) => {
    if ((a.time != null) !== (b.time != null)) return a.time != null ? -1 : 1;
    if (a.time != null) return a.time - b.time;
    if (!!a.retired !== !!b.retired) return a.retired ? 1 : -1;
    return (b.progress || 0) - (a.progress || 0);
  });
  broadcast(room, { t: 'results', results: room.results, trackId: room.trackId });
  for (const p of [...room.players.values()]) if (p.bot) room.players.delete(p.pid);
}

function startRace(room) {
  if (room.state === 'countdown' || room.state === 'racing') return;
  for (const p of [...room.players.values()]) if (p.bot) room.players.delete(p.pid);
  for (let i = 0; i < room.aiCount; i++) {
    const bot = addPlayer(room, 'AI', null, true);
    bot.name = driverOf(bot.driverId).name;
  }
  room.results = [];
  resetGrid(room);
  room.state = 'countdown';
  room.startAt = Date.now() + 5000;
  broadcast(room, {
    t: 'countdown', at: room.startAt, laps: room.laps, trackId: room.trackId,
    grid: [...room.players.values()].map(p => ({ id: p.pid, n: p.name, d: p.driverId, bot: p.bot, box: p.car.box }))
  });
}

/* ------------------------------------------------------------ sockets */

// Proxies drop idle WebSockets without telling either end, which leaves a
// client happily sending into a dead socket. Ping every 20s and cull the dead.
const HEARTBEAT = 20000;
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { try { ws.terminate(); } catch {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, HEARTBEAT);

wss.on('connection', (ws) => {
  ws.meta = {};
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const { room, player } = ws.meta.code ? { room: rooms.get(ws.meta.code), player: rooms.get(ws.meta.code)?.players.get(ws.meta.pid) } : {};

    switch (m.t) {
      case 'create': {
        const r = newRoom();
        const p = addPlayer(r, m.name, ws);
        ws.meta = { code: r.code, pid: p.pid, role: 'game' };
        send(ws, { t: 'joined', pid: p.pid, token: p.token, code: r.code, host: true });
        pushLobby(r);
        break;
      }
      case 'join': {
        const r = rooms.get(String(m.code || '').toUpperCase());
        if (!r) return send(ws, { t: 'err', msg: 'No room with that code.' });
        if (r.state !== 'lobby') return send(ws, { t: 'err', msg: 'That race has already started.' });
        if ([...r.players.values()].filter(x => !x.bot).length >= 12) return send(ws, { t: 'err', msg: 'Room is full.' });
        const p = addPlayer(r, m.name, ws);
        ws.meta = { code: r.code, pid: p.pid, role: 'game' };
        send(ws, { t: 'joined', pid: p.pid, token: p.token, code: r.code, host: r.hostId === p.pid });
        pushLobby(r);
        break;
      }
      case 'ctrl': {
        // phone controller pairing
        const r = rooms.get(String(m.code || '').toUpperCase());
        const p = r && [...r.players.values()].find(x => x.token === m.token);
        if (!p) return send(ws, { t: 'err', msg: 'Pairing failed. Check the code.' });
        if (p.ctrl && p.ctrl !== ws) try { p.ctrl.close(); } catch {}
        p.ctrl = ws; p.hasCtrl = true;
        ws.meta = { code: r.code, pid: p.pid, role: 'ctrl' };
        const drv = driverOf(p.driverId);
        send(ws, { t: 'paired', name: p.name, driver: drv, code: r.code, state: r.state });
        send(p.ws, { t: 'ctrlOn' });
        pushLobby(r);
        break;
      }
      case 'in': {
        if (!player) return;
        player.input = { s: m.s || 0, g: m.g || 0, b: m.b || 0 };
        // A pit request is a one-shot event arriving on a stream of state
        // messages: latch it, or the next input frame overwrites it before the
        // physics tick ever sees it.
        if (m.p) player.pitRequest = true;
        if (m.q !== undefined) player.seq = m.q;
        break;
      }
      case 'pick': {
        if (!room || !player || room.state !== 'lobby') return;
        const taken = [...room.players.values()].some(x => x !== player && x.driverId === m.driverId);
        if (taken) return send(ws, { t: 'err', msg: 'That driver is taken.' });
        player.driverId = m.driverId;
        if (player.ctrl) send(player.ctrl, { t: 'paired', name: player.name, driver: driverOf(player.driverId), code: room.code, state: room.state });
        pushLobby(room);
        break;
      }
      case 'ready': {
        if (!room || !player) return;
        player.ready = !!m.v;
        pushLobby(room);
        break;
      }
      case 'config': {
        if (!room || !player || room.hostId !== player.pid) return;
        if (m.trackId && TRACKS.some(t => t.id === m.trackId) && m.trackId !== room.trackId) {
          room.trackId = m.trackId;
          room.laps = getTrack(m.trackId).laps || 3;   // real circuits default to fewer laps
        }
        if (m.laps) room.laps = Math.max(1, Math.min(10, m.laps | 0));
        if (m.aiCount !== undefined) room.aiCount = Math.max(0, Math.min(15, m.aiCount | 0));
        if (m.aiSkill) room.aiSkill = Math.max(0.8, Math.min(1, +m.aiSkill));
        pushLobby(room);
        break;
      }
      case 'start': {
        if (!room || !player || room.hostId !== player.pid) return;
        startRace(room);
        break;
      }
      case 'again': {
        if (!room || !player || room.hostId !== player.pid) return;
        room.state = 'lobby';
        for (const p of room.players.values()) { p.ready = false; p.car = null; }
        pushLobby(room);
        break;
      }
      case 'retire': {
        if (!room || !player || !player.car) return;
        retire(room, player, 'retired');
        break;
      }
      case 'tyre': {
        if (!room || !player) return;
        const ok = COMPOUNDS.some(c => c.id === m.id);
        if (!ok) return;
        if (room.state === 'lobby') { player.tyre = m.id; player.pitTyre = m.id; pushLobby(room); }
        else if (player.car) { player.pitTyre = m.id; player.car.pitTyre = m.id; }  // next stop
        break;
      }
      // Development only: wears every tyre in the room out on the spot, so a
      // pit stop can be exercised end to end without driving four laps first.
      // Off unless APEX_DEV is set, so it cannot be reached in production.
      case 'devwear': {
        if (!process.env.APEX_DEV || !room) return;
        for (const p of room.players.values()) if (p.car) p.car.wear = Math.min(1, +m.w || 0.95);
        break;
      }
      // Development only: hands this player's car to the server-side bot, so a
      // stop can be watched without the client's input round trip in the way.
      case 'devbot': {
        if (!process.env.APEX_DEV || !player) return;
        player.autopilot = !!m.on;
        break;
      }
      // The phone asks the race screen to change camera. It goes to the game
      // client because the view is that machine's business, not the server's.
      case 'cam': {
        if (!player || !player.ws) return;
        send(player.ws, { t: 'cam' });
        break;
      }
      case 'recover': {
        if (!room || !player || !player.car || room.state !== 'racing') return;
        recover(room, player);
        break;
      }
      case 'ping': ws.isAlive = true; send(ws, { t: 'pong', c: m.c, srv: room ? room.raceTime : 0 }); break;
    }
  });

  ws.on('close', () => {
    const { code, pid, role } = ws.meta || {};
    const room = rooms.get(code);
    if (!room) return;
    const p = room.players.get(pid);
    if (!p) return;
    if (role === 'ctrl') {
      if (p.ctrl === ws) { p.ctrl = null; p.hasCtrl = false; p.input = { s: 0, g: 0, b: 0 }; }
      send(p.ws, { t: 'ctrlOff' });
      pushLobby(room);
      return;
    }
    room.players.delete(pid);
    if (p.ctrl) try { p.ctrl.close(); } catch {}
    const humans = [...room.players.values()].filter(x => !x.bot);
    if (humans.length === 0) { rooms.delete(code); return; }
    if (room.hostId === pid) room.hostId = humans[0].pid;
    pushLobby(room);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  APEX ONLINE`);
  console.log(`  Game screen : http://localhost:${PORT}`);
  console.log(`  On your LAN : http://${lanAddress()}:${PORT}\n`);
});
