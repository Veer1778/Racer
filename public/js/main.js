import * as THREE from '../vendor/three.module.js';
import { TRACKS, DRIVERS, TEAMS, getTrack, buildTrack } from '../shared/tracks.js';
import { trackFor, gridCar, stepCar, driverOf, aiInput, pitGeometry, sectorOf, TUNE, COMPOUNDS, compound } from '../shared/sim.js';
import { carGeometry, carMesh, buildWorld, makeEffects, QUALITY } from './scene.js';

const $ = s => document.querySelector(s);
const show = id => document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));
const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const TICK = 1 / 60;

/* ------------------------------------------------------------------ net */

let ws, me = { pid: null, token: null, code: null, host: false };
let lobby = null, hasCtrl = false, rtt = 60;
const buf = [];                 // snapshots, for interpolating the other cars
let DELAY = 90;                 // ms of render lag applied to other cars only
let lastSnapAt = 0, jitter = 12; // measured spacing between snapshots

function connect(cb) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = () => { cb(); startPings(); };
  ws.onmessage = e => handle(JSON.parse(e.data));
  ws.onclose = () => {
    stopRace();
    $('#homeerr').textContent = 'Connection lost. Rejoin with your room code.';
    show('s-home');
  };
}
const send = o => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

let pingTimer = null;
function startPings() {
  clearInterval(pingTimer);
  // doubles as a keepalive: hosting proxies drop silent sockets after ~60s
  pingTimer = setInterval(() => send({ t: 'ping', c: performance.now() }), 5000);
  send({ t: 'ping', c: performance.now() });
}

function handle(m) {
  switch (m.t) {
    case 'joined':
      me = { pid: m.pid, token: m.token, code: m.code, host: m.host };
      show('s-lobby'); break;
    case 'lobby': lobby = m; renderLobby(); break;
    case 'pong': {
      const sample = performance.now() - m.c;
      rtt = rtt * 0.7 + sample * 0.3;
      break;
    }
    case 'err':
      $('#homeerr').textContent = m.msg; $('#lobbyerr').textContent = m.msg;
      setTimeout(() => { $('#lobbyerr').textContent = ''; }, 3000); break;
    case 'ctrlOn': hasCtrl = true; break;
    case 'ctrlOff': hasCtrl = false; break;
    case 'countdown': startRace(m); break;
    case 'go': lightsOut(); break;
    case 'state': {
      const now = performance.now();
      if (lastSnapAt) {
        const gap = now - lastSnapAt;
        jitter = jitter * 0.9 + Math.abs(gap - 33) * 0.1;
        // enough buffer to cover the worst recent gap, and no more
        DELAY = Math.max(55, Math.min(240, 40 + jitter * 3));
      }
      lastSnapAt = now;
      buf.push({ at: now, cars: m.cars, time: m.time, ends: m.ends });
      if (buf.length > 24) buf.shift();
      reconcile(m);
      break;
    }
    case 'finished':
      flash(m.pid === me.pid ? 'Finished — P' + m.pos : `${m.name} finished P${m.pos}`); break;
    case 'sector':
      lastSector = { i: m.i, time: m.time, pb: m.pb };
      if (m.pb) flash('Sector ' + (m.i + 1) + ' personal best');
      break;
    case 'crash': {
      flash(m.closing > 28 ? 'Heavy contact' : 'Contact');
      shake = Math.min(1, m.closing / 40);
      if (fx && my.car) fx.debris(my.car.x, my.car.z, my.car.h, m.closing, my.drv.color, my.drv.trim);
      break;
    }
    case 'pitstate':
      if (m.state === 'armed') flash('Pit lane armed');
      if (m.state === 'lane') flash('Pit limiter on');
      if (m.state === 'stopped') flash('Stopped for tyres');
      if (m.state === 'released') flash('Fresh ' + compound(m.tyre).name.toLowerCase() + 's');
      break;
    case 'retired':
      if (m.pid !== me.pid) { flash(m.name + ' retired'); break; }
      stopRace();
      show('s-lobby');
      $('#lobbyerr').textContent = 'You retired from the race.';
      setTimeout(() => { $('#lobbyerr').textContent = ''; }, 5000);
      break;
    case 'recovered': my.history = []; smooth.x = smooth.z = smooth.h = 0; flash('Rejoined the track'); break;
    case 'results': showResults(m); break;
  }
}

/* ----------------------------------------------------------------- home */

$('#create').onclick = () => connect(() => send({ t: 'create', name: $('#name').value || 'Driver' }));
$('#join').onclick = () => {
  const code = $('#joincode').value.trim().toUpperCase();
  if (code.length !== 4) return $('#homeerr').textContent = 'Room codes are 4 letters.';
  connect(() => send({ t: 'join', code, name: $('#name').value || 'Driver' }));
};
$('#joincode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#join').click(); });

/* ---------------------------------------------------------------- lobby */

// Circuit outlines are drawn from the same centreline the race uses, so the
// selector shows the layout you are actually about to drive.
const mapCache = new Map();
function trackMap(track) {
  if (mapCache.has(track.id)) return mapCache.get(track.id);
  const b = buildTrack(track, 12);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of b.line) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const W = 200, H = 96, pad = 12;
  const sc = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (z1 - z0));
  const ox = (W - (x1 - x0) * sc) / 2, oz = (H - (z1 - z0) * sc) / 2;
  const step = Math.max(1, Math.round(b.line.length / 150));
  let d = '';
  for (let i = 0; i < b.line.length; i += step) {
    const p = b.line[i];
    d += (d ? 'L' : 'M') + (ox + (p.x - x0) * sc).toFixed(1) + ' ' + (H - (oz + (p.z - z0) * sc)).toFixed(1) + ' ';
  }
  d += 'Z';
  const svg = `<svg class="trackmap" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <path class="road" d="${d}"/><path class="line" d="${d}"/></svg>`;
  const out = { svg, length: b.length };
  mapCache.set(track.id, out);
  return out;
}

function renderLobby() {
  if (!lobby) return;
  if (lobby.state === 'lobby') show('s-lobby');
  $('#code').textContent = lobby.code;
  $('#laps').textContent = lobby.laps;
  $('#ai').textContent = lobby.aiCount;
  $('#gridcount').textContent = lobby.players.length + lobby.aiCount;
  me.host = lobby.hostId === me.pid;
  $('#start').style.display = me.host ? '' : 'none';
  $('#hostonly').textContent = me.host ? 'You are the host' : 'Host controls the circuit';
  document.querySelectorAll('[data-skill]').forEach(b =>
    b.classList.toggle('on', Math.abs(+b.dataset.skill - lobby.aiSkill) < 0.01));
  const myRow = lobby.players.find(p => p.pid === me.pid);
  document.querySelectorAll('[data-tyre]').forEach(b =>
    b.classList.toggle('on', myRow && b.dataset.tyre === (myRow.tyre || 'medium')));

  // The pairing link uses this page's own origin, so it works on a LAN address,
  // a tunnel or a deployed host with no configuration.
  const url = `${location.origin}/c#${lobby.code}-${me.token}`;
  $('#pairurl').textContent = url.replace(/^https?:\/\//, '');
  if ($('#qr').dataset.url !== url) {
    $('#qr').dataset.url = url;
    fetch('/qr?d=' + encodeURIComponent(url)).then(r => r.text()).then(svg => { $('#qr').innerHTML = svg; });
  }

  const mine = lobby.players.find(p => p.pid === me.pid);
  if (mine) {
    const d = DRIVERS.find(x => x.id === mine.driverId);
    if (d) document.documentElement.style.setProperty('--accent', d.color);
  }

  $('#tracks').innerHTML = TRACKS.map(t => {
    const m = trackMap(t);
    return `<div class="card ${lobby.trackId === t.id ? 'sel' : ''} ${me.host ? '' : 'dis'}" data-trk="${t.id}">
      <div class="nm">${t.name}</div>
      <div class="sub">${t.country}</div>
      ${m.svg}
      <div class="stat"><span>Length <b>${(m.length / 1000).toFixed(1)} km</b></span>
        <span>Laps <b>${t.laps || 3}</b></span></div>
      <div class="blurb">${t.blurb}</div>
    </div>`;
  }).join('');

  const taken = new Set(lobby.players.filter(p => p.pid !== me.pid).map(p => p.driverId));
  const short = n => n.length > 12 ? n[0] + '. ' + n.split(' ').slice(1).join(' ') : n;
  $('#drivers').innerHTML = DRIVERS.map(d => `
    <div class="dcard ${mine && mine.driverId === d.id ? 'sel' : ''} ${taken.has(d.id) ? 'dis' : ''}"
         data-drv="${d.id}" style="--tc:${d.color}">
      <span class="no">${d.no}</span>
      <span class="who"><b>${short(d.name)}</b><span>${d.team}</span></span>
      <span class="helmet" style="background:${d.helmet}"></span>
    </div>`).join('');

  $('#plist').innerHTML = lobby.players.map(p => {
    const d = DRIVERS.find(x => x.id === p.driverId) || DRIVERS[0];
    return `<div class="rrow" style="--tc:${d.color}">
      <span class="no">${d.no}</span>
      <span class="who"><b>${esc(p.name)}</b><span class="sub">${d.name} · ${d.team}</span></span>
      <span class="tag">
        ${p.pid === lobby.hostId ? '<span>Host</span>' : ''}
        ${p.ctrl ? '<span class="ok">Phone</span>' : '<span>Keys</span>'}
        ${p.ready ? '<span class="ok">Ready</span>' : '<span class="hot">Waiting</span>'}
      </span></div>`;
  }).join('');

  const allReady = lobby.players.length > 0 && lobby.players.every(p => p.ready);
  $('#start').disabled = !allReady;
  $('#start').textContent = allReady ? 'Start race' : 'Waiting…';
  $('#ready').classList.toggle('on', !!(mine && mine.ready));
  if (mine) $('#ready').textContent = mine.ready ? 'Ready' : "I'm ready";
}

$('#drivers').onclick = e => { const o = e.target.closest('[data-drv]'); if (o && !o.classList.contains('dis')) send({ t: 'pick', driverId: o.dataset.drv }); };
$('#tracks').onclick = e => { const o = e.target.closest('[data-trk]'); if (o && me.host) send({ t: 'config', trackId: o.dataset.trk }); };
document.querySelectorAll('[data-laps]').forEach(b => b.onclick = () => me.host && send({ t: 'config', laps: lobby.laps + (+b.dataset.laps) }));
document.querySelectorAll('[data-ai]').forEach(b => b.onclick = () => me.host && send({ t: 'config', aiCount: lobby.aiCount + (+b.dataset.ai) }));
document.querySelectorAll('[data-skill]').forEach(b => b.onclick = () => me.host && send({ t: 'config', aiSkill: +b.dataset.skill }));
document.querySelectorAll('[data-tyre]').forEach(b => b.onclick = () => send({ t: 'tyre', id: b.dataset.tyre }));
$('#ready').onclick = () => { const mine = lobby.players.find(p => p.pid === me.pid); send({ t: 'ready', v: !(mine && mine.ready) }); };
$('#start').onclick = () => send({ t: 'start' });
$('#again').onclick = () => { if (me.host) send({ t: 'again' }); else show('s-lobby'); };

/* ---------------------------------------------------------------- three */

const renderer = new THREE.WebGLRenderer({ canvas: $('#c'), antialias: true, powerPreference: 'high-performance' });

// Adaptive quality. A machine that cannot hold 60 fps produces exactly the
// uneven frame pacing that reads as stutter, so the renderer gives things up
// until it can. The previous version measured once, decided once, and could
// only change the resolution — the shadow pass and the lighting, which are
// most of the cost, stayed on however slow the frame was, and any reduction
// waited for the NEXT race. This one acts on the race you are in and keeps
// watching, because the load changes: a grid start is not a lap of Spa.
const TIERS = [
  { id: 'low',    shadows: false, env: false, px: 0.7, map: 512,  soft: false, far: 950 },
  { id: 'medium', shadows: true,  env: true,  px: 1.0, map: 512,  soft: false, far: 1300 },
  { id: 'high',   shadows: true,  env: true,  px: Math.min(devicePixelRatio, 1.5), map: 1024, soft: false, far: 1650 }
];
let tier = TIERS.length - 1;
let quality = TIERS[tier].px;
renderer.setPixelRatio(quality);

const frameLog = [];
let tierHold = 0;              // seconds before the next change is allowed
let logSpan = 0;               // seconds of frames gathered so far
let tierChanges = 0;           // how many times quality has been stepped

function applyTier(announce) {
  const t = TIERS[tier];
  QUALITY.level = t.id === 'high' ? 'high' : t.id === 'medium' ? 'high' : 'low';
  renderer.shadowMap.enabled = t.shadows;
  renderer.shadowMap.type = t.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  if (world && world.sun) {
    world.sun.castShadow = t.shadows;
    if (world.sun.shadow.mapSize.x !== t.map) {
      world.sun.shadow.mapSize.set(t.map, t.map);
      if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
    }
  }
  scene.environment = t.env ? (world && world.env) || scene.environment : null;
  camera.far = t.far;
  camera.updateProjectionMatrix();
  if (scene.fog) scene.fog.far = t.far * 0.85;
  // turning the shadow map or the environment on or off changes the shader a
  // material needs, so every one of them has to be rebuilt once
  scene.traverse(o => { if (o.material) {
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.needsUpdate = true;
  } });
  if (Math.abs(t.px - quality) > 0.01) { quality = t.px; renderer.setPixelRatio(quality); resize(); }
  // Relinking those shaders costs a frame each, and left to itself the cost is
  // spread over the next forty as each material is drawn for the first time —
  // which is a burst of stutter right where the player was already unhappy.
  // Compiling them all up front pays it once, during the flash message.
  try { renderer.compile(scene, camera); } catch {}
  if (announce) flash(tier === 0 ? 'Detail reduced for frame rate'
                                 : tier === 1 ? 'Detail eased for frame rate'
                                              : 'Full detail restored');
}

function paceQuality(dt) {
  if (tierHold > 0) { tierHold -= dt; return; }
  // Measured over a span of TIME, not a count of frames. Counting frames means
  // the slower the machine the longer it takes to notice it is slow: at 4 fps a
  // 110-frame window is half a minute, so the one machine that needed help most
  // never got any.
  frameLog.push(dt);
  logSpan += dt;
  if (frameLog.length < 12 || logSpan < 1.5) return;
  frameLog.sort((a, b) => a - b);
  const median = frameLog[frameLog.length >> 1];
  frameLog.length = 0;
  logSpan = 0;
  // 22 ms is the point where 60 fps is clearly not happening; 12 ms means
  // there is room to spare. The gap between them stops it oscillating.
  if (median > 0.022 && tier > 0) { tier--; applyTier(true); tierHold = 6; tierChanges++; }
  else if (median < 0.012 && tier < TIERS.length - 1) { tier++; applyTier(true); tierHold = 10; tierChanges++; }
  else tierHold = 2;
}

// Physically-based shading with filmic tone mapping, rather than flat colours:
// this is what stops the world reading as untextured blocks.
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
// far plane sits just past where fog reaches full density, so distant chunks
// are culled rather than drawn into a wall of fog
const camera = new THREE.PerspectiveCamera(66, 1, 0.5, 1650);
let built = null, carMeshes = new Map(), racing = false, lapCount = 3;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

function clearScene() {
  while (scene.children.length) {
    const o = scene.children.pop();
    o.traverse && o.traverse(n => {
      n.geometry && n.geometry.dispose();
      if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => { m.map && m.map.dispose(); m.dispose(); });
    });
  }
  carMeshes.clear();
}

/* -------------------------------------------------- prediction / inputs */

const my = { car: null, drv: null, seq: 0, history: [], input: { s: 0, g: 0, b: 0 }, srvInput: { s: 0, g: 0, b: 0 },
             prev: { x: 0, z: 0, h: 0 } };

// Physics advances in fixed 60 Hz steps, but frames almost never land on those
// boundaries: a display at 75 or 144 Hz, or any frame-time jitter, makes some
// frames consume two steps and some none. Drawing the newest state directly is
// what shows up as stutter, so the renderer draws between the last two states.
let LERP = true;          // window.__apex.lerp(false) disables, for A/B testing
let AUTO = false;         // window.__apex.auto(true) hands the car to the bot driver
function interpolated() {
  const a = LERP ? Math.max(0, Math.min(1, acc / TICK)) : 1;
  const c = my.car, p = my.prev;
  let dh = c.h - p.h;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  return {
    x: p.x + (c.x - p.x) * a + smooth.x,
    z: p.z + (c.z - p.z) * a + smooth.z,
    h: p.h + dh * a + smooth.h
  };
}
const smooth = { x: 0, z: 0, h: 0 };
const keys = {};

addEventListener('keydown', e => { keys[e.code] = true; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e => { keys[e.code] = false; });
let pitLatch = 0;
addEventListener('keydown', e => {
  if (!racing) return;
  if (e.code === 'KeyR') send({ t: 'recover' });
  if (e.code === 'KeyC') cycleView();
  if (e.code === 'KeyP') { pitLatch = 1; flash('Pit requested'); }
  if (e.code === 'Escape') retire();
});

// Two-step, in-game: a native confirm() blocks the render loop and the input
// stream behind a modal, which on a live race is worse than the mistake it
// guards against.
let retireArmed = 0;
function retire() {
  if (!racing) return;
  const now = performance.now();
  if (now - retireArmed < 4000) {
    retireArmed = 0;
    $('#retire').textContent = 'Retire';
    $('#retire').classList.remove('armed');
    send({ t: 'retire' });
    return;
  }
  retireArmed = now;
  $('#retire').textContent = 'Confirm?';
  $('#retire').classList.add('armed');
  flash('Press retire again to quit');
  setTimeout(() => {
    if (performance.now() - retireArmed >= 4000) {
      $('#retire').textContent = 'Retire';
      $('#retire').classList.remove('armed');
    }
  }, 4100);
}
$('#retire').onclick = retire;

function readKeys() {
  return {
    s: (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0),
    g: (keys.ArrowUp || keys.KeyW) ? 1 : 0,
    b: (keys.ArrowDown || keys.KeyS || keys.Space) ? 1 : 0
  };
}

// Local prediction runs on a fixed-timestep accumulator driven by the render
// loop. A frame-rate dip must not make the local car fall behind the server's
// clock, or the correction from every snapshot piles up into a visible drift.
let acc = 0, lastStep = performance.now(), frameDt = 1 / 60;

function stepLocal() {
  const now = performance.now();
  let dt = (now - lastStep) / 1000;
  lastStep = now;
  frameDt = Math.min(0.1, dt);
  if (!racing || !my.car || !built) { acc = 0; return; }
  if (dt > 0.25) dt = 0.25;                 // after a stall, skip ahead rather than spiral
  acc += dt;

  let steps = 0;
  while (acc >= TICK && steps < 20) {
    // remember the state entering this step so the renderer can draw between
    // the last two physics states instead of snapping to the newest one
    my.prev.x = my.car.x; my.prev.z = my.car.z; my.prev.h = my.car.h;
    acc -= TICK; steps++;
    const k = AUTO && my.car ? aiInput(built, my.car, my.drv, raceClock, 0, 1) : readKeys();
    const usingKeys = AUTO || !hasCtrl || k.g || k.b || k.s;
    my.input = usingKeys ? k : my.srvInput;
    if (usingKeys) {
      my.seq++;
      my.history.push({ seq: my.seq, in: { ...my.input } });
      if (my.history.length > 240) my.history.shift();
      // In AUTO the bot decides when to pit, and that decision has to reach
      // the server like a keypress would; predicting it locally only made the
      // client disagree with the authoritative car for a lap.
      const wantPit = pitLatch || (AUTO && k.pit ? 1 : 0);
      send({ t: 'in', s: my.input.s, g: my.input.g, b: my.input.b, q: my.seq, p: wantPit });
      stepCar(built, my.car, { ...my.input, pit: wantPit }, my.drv, TICK, raceClock, null);
    } else {
      stepCar(built, my.car, { ...my.input, pit: pitLatch }, my.drv, TICK, raceClock, null);
    }
    pitLatch = 0;
  }

  paceQuality(frameDt);

  // ease the visual correction out over ~0.3s, frame rate independent
  const k = Math.pow(0.02, dt / 0.3);
  smooth.x *= k; smooth.z *= k; smooth.h *= k;
}

// Server truth arrives; rewind to it and replay everything it has not seen yet.
function reconcile(msg) {
  if (!racing || !my.car || !built) return;
  const s = msg.cars.find(c => c.id === me.pid);
  if (!s) return;
  my.srvInput = s.in || my.srvInput;

  const before = { x: my.car.x, z: my.car.z, h: my.car.h };
  const c = my.car;
  c.x = s.x; c.z = s.z; c.h = s.h; c.v = s.v;
  c.lap = s.lap; c.off = s.off; c.finished = s.fin; c.best = s.best; c.cur = s.cur;
  c.tyre = s.ty || c.tyre; c.wear = s.w ?? c.wear; c.damage = s.dmg ?? c.damage;
  c.stops = s.st ?? c.stops;      // the server owns the count, not the prediction
  c.pit = s.pit || 'no'; c.retired = !!s.ret; c.yaw = s.yaw || 0; c.stops = s.st || 0;
  // the stop clock and the jack are server state: without them the local
  // car's own pit stop plays with no crew and no car lift
  c.pitClock = s.pcl || 0; c.jack = s.jk || 0;
  raceClock = msg.time;
  c.hint = s.hint !== undefined ? s.hint : c.hint;
  c.prevDist = s.pd !== undefined ? s.pd : c.prevDist;

  my.history = my.history.filter(h => h.seq > (s.q || 0));
  for (const h of my.history) stepCar(built, c, h.in, my.drv, TICK, msg.time, null);

  // Replay is for position, not for the pit stop. Running it through the state
  // machine again ticks the stop clock down once per unacknowledged input, so
  // on a slow connection the local car finished its stop the instant it began
  // and the crew never came out. The server owns all of this.
  c.pit = s.pit || 'no';
  c.pitClock = s.pcl || 0;
  c.jack = s.jk || 0;
  c.served = !!s.sv;
  c.stops = s.st || 0;
  c.wear = s.w ?? c.wear;
  c.tyre = s.ty || c.tyre;

  // a phone sends its inputs straight to the server, so the only way to hide
  // that leg is to run the last known input forward by half a round trip
  if (hasCtrl) {
    let extra = Math.min(0.3, rtt / 2000);
    while (extra > 0) { stepCar(built, c, my.srvInput, my.drv, Math.min(TICK, extra), msg.time, null); extra -= TICK; }
  }

  const dx = before.x - c.x, dz = before.z - c.z;
  if (Math.hypot(dx, dz) < 9) {
    smooth.x += dx; smooth.z += dz;
    let dh = before.h - c.h;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    smooth.h += dh;
  } else {
    smooth.x = smooth.z = smooth.h = 0;     // real divergence: take the server's word
    my.prev = { x: c.x, z: c.z, h: c.h };
  }
  const mag = Math.hypot(smooth.x, smooth.z), CAP = 4;
  if (mag > CAP) { smooth.x *= CAP / mag; smooth.z *= CAP / mag; }
  smooth.h = Math.max(-0.25, Math.min(0.25, smooth.h));
}

/* ----------------------------------------------------------------- race */

let flashTimer = null, audio = null, lastLap = 0, stuckFor = 0, lastSector = null, raceClock = 0;
const camPos = new THREE.Vector3(), camAim = new THREE.Vector3();
// scratch objects, so the render loop allocates nothing per frame
const stops = [];
const vTarget = new THREE.Vector3(), vAim = new THREE.Vector3(), Y_AXIS = new THREE.Vector3(0, 1, 0);
let camReady = false, shake = 0, camRoll = 0, fx = null, smokeClock = 0, world = null;

// Three views, cycled with C. Chase sits close and low so the car fills the
// frame; the far view is for reading traffic; the cockpit is bolted to the car.
const VIEWS = [
  // A wide field of view shrinks the car; these are deliberately tighter than
  // the defaults so the car has presence against a 14 m wide track.
  { id: 'chase',   back: 8.0,   up: 2.85, aim: 16, fov: 58, roll: 0.10, grow: 5 },
  // T-cam: above and just behind the driver, looking over the halo
  { id: 'cockpit', back: 0.75, up: 2.05, aim: 45, fov: 66, roll: 0.20, grow: 6 },
  { id: 'far',     back: 14.5,  up: 5.4,  aim: 22, fov: 62, roll: 0.05, grow: 8 }
];
let specId = null;
let freeCam = null;
let pitCam = 0;
let viewIdx = 0;
try { const v = +localStorage.getItem('apex.view'); if (v >= 0 && v < VIEWS.length) viewIdx = v; } catch {}
function cycleView() {
  viewIdx = (viewIdx + 1) % VIEWS.length;
  try { localStorage.setItem('apex.view', viewIdx); } catch {}
  camReady = false;
  flash(VIEWS[viewIdx].id + ' camera');
}

function startRace(m) {
  lapCount = m.laps;
  buf.length = 0;
  clearScene();
  built = trackFor(m.trackId);
  world = buildWorld(scene, built, getTrack(m.trackId).theme, renderer,
                     m.grid.map(c => DRIVERS.find(x => x.id === c.d) || DRIVERS[0]));
  fx = makeEffects(scene);
  applyTier(false);              // the new world has to obey the current tier

  m.grid.forEach((c, i) => {
    const d = DRIVERS.find(x => x.id === c.d) || DRIVERS[0];
    const mesh = carMesh(damagedGeometry(d, 0));
    scene.add(mesh);
    carMeshes.set(c.id, { mesh, name: c.n, driver: d, bot: c.bot, box: c.box ?? i });
    if (c.id === me.pid) {
      my.drv = d;
      my.car = gridCar(built, i);
      my.car.box = c.box ?? i;
      my.seq = 0; my.history = [];
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.7, 3.15, 22),
        new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
      mesh.add(ring);
    }
  });

  smooth.x = smooth.z = smooth.h = 0;
  lastSector = null;
  frameLog.length = 0; logSpan = 0; tierHold = 1.5;
  my.prev = { x: my.car.x, z: my.car.z, h: my.car.h };
  acc = 0; lastStep = performance.now();
  camReady = false; lastLap = 0; shake = 0;
  for (const el of $('#sectors').children) { el.textContent = 'S' + (+el.dataset.s + 1); el.className = ''; }
  $('#pitcue').className = '';
  show('');
  $('#hud').classList.add('on');
  $('#lapn').textContent = `1/${lapCount}`;
  racing = true;
  runLights(m.at);
  initAudio();
}

function stopRace() { racing = false; my.car = null; $('#hud').classList.remove('on'); }

function runLights(at) {
  const lights = [...document.querySelectorAll('.light')];
  $('#lights').style.display = 'flex';
  $('#go').style.opacity = 0;
  lights.forEach(l => l.classList.remove('on'));
  const tick = () => {
    const left = at - Date.now();
    const lit = Math.min(5, Math.max(0, 5 - Math.ceil(left / 800)));
    lights.forEach((l, i) => l.classList.toggle('on', i < lit));
    if (left > -200 && racing) requestAnimationFrame(tick);
  };
  tick();
}
function lightsOut() {
  document.querySelectorAll('.light').forEach(l => l.classList.remove('on'));
  $('#go').style.opacity = 1;
  setTimeout(() => { $('#go').style.opacity = 0; $('#lights').style.display = 'none'; }, 800);
}
function flash(text) {
  $('#flash').textContent = text; $('#flash').style.opacity = 1;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { $('#flash').style.opacity = 0; }, 2400);
}

const fmt = t => {
  const mn = Math.floor(t / 60), s = t % 60;
  return mn ? `${mn}:${s.toFixed(2).padStart(5, '0')}` : s.toFixed(2);
};

function showResults(m) {
  stopRace();
  const winner = m.results[0];
  $('#rbody').innerHTML = m.results.map((r, i) => {
    const d = DRIVERS.find(x => x.id === r.driverId) || DRIVERS[0];
    const gap = r.time && winner.time && i > 0 ? '+' + fmt(r.time - winner.time)
      : r.time ? fmt(r.time) : (r.retired ? 'RET' : 'DNF');
    return `<tr class="${r.pid === me.pid ? 'me' : ''} ${i < 3 ? 'podium' : ''}">
      <td class="pos">${i + 1}</td>
      <td><span class="sw" style="background:${d.color}"></span><b>${esc(r.name)}</b>${r.bot ? ' <span class="team">AI</span>' : ''}</td>
      <td class="team">${d.team}</td>
      <td class="t">${gap}</td>
      <td class="t">${r.best ? fmt(r.best) : '--'}</td></tr>`;
  }).join('');
  $('#rtitle').textContent = getTrack(m.trackId).name + ' — classification';
  $('#again').textContent = me.host ? 'Back to garage' : 'Waiting for host';
  $('#again').disabled = !me.host;
  show('s-results');
}

/* ---------------------------------------------------------------- audio */

function initAudio() {
  if (audio) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(), sub = ctx.createOscillator();
    const gain = ctx.createGain(), filt = ctx.createBiquadFilter();
    osc.type = 'sawtooth'; sub.type = 'square';
    filt.type = 'lowpass'; filt.frequency.value = 1400; filt.Q.value = 3;
    gain.gain.value = 0;
    osc.connect(filt); sub.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
    osc.start(); sub.start();
    audio = { ctx, osc, sub, gain };
  } catch { audio = null; }
}

/* --------------------------------------------------------------- render */

// Interpolating other cars used to allocate a Map and a fresh object per car
// every frame. At 60 fps with a full grid that is tens of thousands of short
// lived objects a minute, and the garbage collector pauses show up as stutter.
// Everything below reuses the same objects for the life of the race.
const viewCars = new Map();      // id -> mutable view state, reused every frame
const snapOut = { cars: viewCars, time: 0, ends: 0 };
const bIndex = new Map();

function otherCars() {
  if (!buf.length) return null;
  const now = performance.now() - DELAY;
  let a = buf[0], b = buf[buf.length - 1];
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i].at <= now && buf[i + 1].at >= now) { a = buf[i]; b = buf[i + 1]; break; }
  }
  const t = Math.max(0, Math.min(1, (now - a.at) / Math.max(1, b.at - a.at)));

  bIndex.clear();
  for (let i = 0; i < b.cars.length; i++) bIndex.set(b.cars[i].id, b.cars[i]);

  for (const c of viewCars.values()) c.seen = false;
  for (let i = 0; i < a.cars.length; i++) {
    const ca = a.cars[i];
    const cb = bIndex.get(ca.id) || ca;
    let dh = cb.h - ca.h;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;

    let o = viewCars.get(ca.id);
    if (!o) { o = {}; viewCars.set(ca.id, o); }
    o.id = ca.id; o.n = ca.n; o.d = ca.d; o.bot = ca.bot;
    o.pos = ca.pos; o.lap = ca.lap; o.cur = ca.cur; o.best = ca.best;
    o.pit = ca.pit; o.dmg = ca.dmg; o.pr = ca.pr; o.off = ca.off; o.fin = ca.fin;
    o.jk = ca.jk || 0; o.pcl = ca.pcl || 0; o.pd = ca.pd || 0;
    o.x = ca.x + (cb.x - ca.x) * t;
    o.z = ca.z + (cb.z - ca.z) * t;
    o.h = ca.h + dh * t;
    o.v = ca.v + (cb.v - ca.v) * t;
    o.seen = true;
  }
  for (const [id, o] of viewCars) if (!o.seen) viewCars.delete(id);

  snapOut.time = a.time + (b.time - a.time) * t;
  snapOut.ends = a.ends || 0;
  return snapOut;
}

// (driver, damage stage) -> geometry, built on demand and never thrown away
const geoCache = new Map();
function damagedGeometry(drv, tier) {
  const key = drv.id + ':' + tier;
  let g = geoCache.get(key);
  if (!g) {
    g = carGeometry(drv.color, drv.trim, drv.helmet, tier);
    geoCache.set(key, g);
  }
  return g;
}

window.__apex = {
  view: () => interpolated(),
  cycle: () => cycleView(),
  quality: () => quality,
  debug: () => {
    const car = carMeshes.get(me.pid);
    return {
      quality: QUALITY.level, tier: TIERS[tier].id, tierChanges, pixelRatio: quality,
      shadowsOn: renderer.shadowMap.enabled,
      carCasts: car ? car.mesh.castShadow : null,
      carMaterial: car ? car.mesh.material.type : null,
      sunCasts: world && world.sun ? world.sun.castShadow : 'no sun',
      env: !!scene.environment,
      shadowCalls: renderer.info.render.calls
    };
  },
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
                 objects: scene.children.length }),
  viewName: () => viewIdx,
  hide: (name, on = true) => { let n = 0; scene.traverse(o => { if (o.name === name) { o.visible = !on; n++; } }); return n; },
  names: () => scene.children.map(c => c.name || c.type),
  tier: (t) => { if (t != null) { tier = Math.max(0, Math.min(TIERS.length - 1, t)); applyTier(false); tierHold = 1e9; } return TIERS[tier].id; },
  fps: (ms = 1800) => new Promise(res => { const d = []; let last = performance.now(), t0 = last;
    const tick = () => { const t = performance.now(); d.push(t - last); last = t;
      if (t - t0 < ms) requestAnimationFrame(tick);
      else { d.sort((a, b) => a - b); res(+d[d.length >> 1].toFixed(1)); } };
    requestAnimationFrame(tick); }),
  pit: () => { const p = pitGeometry(built); return { usable: p.usable, entry: p.entry, exit: p.exit, total: p.total, ramp: p.ramp, boxes: p.boxCount, laneW: p.laneW, full: p.full }; },
  pitState: () => { const p = pitGeometry(built), c = my.car;
    return { pit: c.pit, pd: +pitGeometry(built).pd(c.prevDist).toFixed(1), lat: +c.lateral.toFixed(1),
             centre: +p.centre(Math.min(p.pd(c.prevDist), p.total)).toFixed(1), v: +c.v.toFixed(1),
             wear: +c.wear.toFixed(2), stops: c.stops, box: c.box, clock: +(c.pitClock || 0).toFixed(2) }; },
  wear: (w) => { send({ t: 'devwear', w }); return w; },
  autopilot: (on = true) => { send({ t: 'devbot', on }); AUTO = false; return on; },
  crew: () => ({ stops: stops.map(s => ({ box: s.box, phase: +s.phase.toFixed(2), released: s.released })),
                 anim: world && world.crew ? world.crew.anim().filter(v => v > 0.01) : [] }),
  cars: () => [...viewCars.values()].map(c => ({ id: c.id, n: c.n, pit: c.pit, pd: c.pd, x: c.x, z: c.z })),
  // point the camera at whatever is going on in the pit lane
  spec: (id) => { specId = id; camReady = false; return specId; },
  // fixed debug camera: pins the view so geometry can be inspected from outside
  freecam: (pos, look) => { freeCam = pos && { pos, look }; return !!freeCam; },
  // a bird's eye over the pit lane, `k` metres up
  // `pd` is a pit distance; pass an absolute lap distance as `dist` instead
  pitView: (k = 90, pd = null, dist = null) => {
    const p = pitGeometry(built), N = built.line.length;
    const at = dist != null ? p.pd(dist)
             : pd == null ? p.boxOrigin + (p.boxCount - 1) * p.boxSpacing / 2 : pd;
    const d = ((p.entry + at) % built.length + built.length) % built.length;
    const s = built.line[Math.round(d / built.step) % N];
    const o = p.centre(at);
    const cx = s.x + s.nx * o, cz = s.z + s.nz * o;
    freeCam = { pos: [cx + s.nx * -k * 0.15, k, cz + s.nz * -k * 0.15 - 0.001], look: [cx, 0, cz] };
    return { pd: at, centre: +o.toFixed(1) };
  },
  lerp: (v) => { LERP = v; return LERP; },
  auto: (v) => { AUTO = v; return AUTO; },
  // debug helper: drop the local car at a distance along the lap
  tp(dist) {
    if (!built || !my.car) return 'not racing';
    const i = Math.round(dist / built.step) % built.line.length;
    const p = built.line[i];
    my.car.x = p.x; my.car.z = p.z; my.car.h = Math.atan2(p.tx, p.tz);
    my.car.v = 0; my.car.hint = i; my.car.prevDist = p.dist;
    camReady = false;
    return { dist: p.dist, radius: Math.round(p.radius) };
  },
  mineMesh: () => { const e = carMeshes.get(me.pid); return e ? { found: true, visible: e.mesh.visible, pos: e.mesh.position.toArray(), verts: e.mesh.geometry.attributes.position.count, inScene: !!e.mesh.parent } : { found: false, pid: me.pid, keys: [...carMeshes.keys()] }; }, get state() { return { car: my.car && { ...my.car }, cam: camera.position.toArray(), meshes: [...carMeshes].map(([id, e]) => [id, e.mesh.visible, e.mesh.position.toArray()]), rtt, smooth }; } };

function render() {
  requestAnimationFrame(render);
  stepLocal();
  if (!racing || !built || !my.car) { renderer.render(scene, camera); return; }
  const snap = otherCars();
  if (!snap) return;

  const view = interpolated();
  // spectating another car is a debug aid, but it also means the camera code
  // has exactly one source of truth for "where am I looking"
  const spec = specId ? snap.cars.get(specId) : null;
  const px = spec ? spec.x : view.x, pz = spec ? spec.z : view.z, ph = spec ? spec.h : view.h;

  // Cars, and the pit stops going on around them. A car on the jack sits a
  // hand's width higher; the crew system is told where every stationary car is
  // so its box can send its people out to it.
  stops.length = 0;
  for (const [id, entry] of carMeshes) {
    let x, z, h, dist = 0, jack = 0, clock = 0, pitting = false;
    if (id === me.pid) {
      x = px; z = pz; h = ph; dist = my.car.prevDist;
      jack = my.car.jack || 0; clock = my.car.pitClock || 0;
      pitting = my.car.pit === 'stopped';
      entry.mesh.visible = true;
    } else {
      const c = snap.cars.get(id);
      if (!c) { entry.mesh.visible = false; continue; }
      x = c.x; z = c.z; h = c.h; jack = c.jk; clock = c.pcl; dist = c.pd;
      pitting = c.pit === 'stopped';
      entry.mesh.visible = true;
    }
    entry.mesh.position.set(x, jack * 0.13, z);
    entry.mesh.rotation.y = h;
    if (pitting && world.pit && world.pit.usable) {
      const pd = world.pit.pd(dist);
      stops.push({ box: world.crew.boxOf(pd), x, z, h,
                   phase: 1 - clock / TUNE.pitService, released: clock < 0.45 });
    }
  }
  if (world.crew) world.crew.update(stops, frameDt);

  const speed = Math.abs(my.car.v);
  const fast = Math.min(1, speed / 70);
  const V = VIEWS[viewIdx];
  const cockpit = V.id === 'cockpit';

  // lateral load leans the camera, which is most of what sells speed
  const latG = Math.max(-1, Math.min(1, (my.car.yaw || 0) * speed / 26));
  camRoll += ((-latG * V.roll) - camRoll) * Math.min(1, frameDt * 6);

  if (shake > 0.001) {
    shake *= Math.max(0, 1 - frameDt * 4);
    const k = shake * 1.4;
    camAim.x += Math.sin(performance.now() * 0.07) * k;
    camAim.y += Math.sin(performance.now() * 0.11) * k * 0.6;
  }

  const back = V.back + (cockpit ? 0 : fast * 2.2);
  const up = V.up + (cockpit ? 0 : fast * 0.6);
  const target = vTarget.set(px - Math.sin(ph) * back, up, pz - Math.cos(ph) * back);
  const aim = vAim.set(px + Math.sin(ph) * V.aim, cockpit ? 1.9 : 2.0, pz + Math.cos(ph) * V.aim);

  // In the pit lane the chase camera sits inside a garage, which is no view at
  // all. Swing it out over the pit wall instead and look back at the box, so
  // the stop is something you watch rather than something you hear about.
  const followCar = spec ? null : my.car;
  const pitting = followCar ? (followCar.pit === 'lane' || followCar.pit === 'stopped')
                            : (spec && spec.pit && spec.pit !== 'no' && spec.pit !== 'armed');
  pitCam += ((pitting && !cockpit ? 1 : 0) - pitCam) * Math.min(1, frameDt * 3.2);
  if (pitCam > 0.002 && world && world.pit && world.pit.usable) {
    const s = built.line[Math.round((spec ? spec.pd : followCar.prevDist) / built.step)
                         % built.line.length];
    if (s) {
      // Above the lane looking down it, not beside it: the pit wall is on one
      // side and the garages on the other, and a camera swung out either way
      // ends up inside a building.
      const back = 10.5, out = 1.5, lift = 8.5;
      const cx = px - s.tx * back + s.nx * out, cz = pz - s.tz * back + s.nz * out;
      target.set(target.x + (cx - target.x) * pitCam,
                 target.y + (lift - target.y) * pitCam,
                 target.z + (cz - target.z) * pitCam);
      aim.set(aim.x + (px - aim.x) * pitCam, aim.y + (0.8 - aim.y) * pitCam,
              aim.z + (pz - aim.z) * pitCam);
    }
  }
  if (!camReady) { camPos.copy(target); camAim.copy(aim); camReady = true; }
  // the cockpit is bolted to the car: no easing, or the view lags the chassis
  const posEase = cockpit ? 1 : 1 - Math.exp(-frameDt / 0.10);
  const aimEase = cockpit ? 1 - Math.exp(-frameDt / 0.04) : 1 - Math.exp(-frameDt / 0.07);
  camPos.lerp(target, posEase);
  camAim.lerp(aim, aimEase);
  camera.position.copy(camPos);
  camera.up.set(Math.sin(camRoll), Math.cos(camRoll), 0).applyAxisAngle(Y_AXIS, ph);
  camera.lookAt(camAim);
  camera.fov = V.fov + fast * V.grow;
  camera.updateProjectionMatrix();
  if (freeCam) {
    camera.position.set(freeCam.pos[0], freeCam.pos[1], freeCam.pos[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(freeCam.look[0], freeCam.look[1], freeCam.look[2]);
  }

  // damage is visible on the car itself: wings come off in two stages
  for (const [id, entry] of carMeshes) {
    const c = id === me.pid ? my.car : snap.cars.get(id);
    if (!c) continue;
    const tier = (c.damage || c.dmg || 0) > 0.72 ? 2 : (c.damage || c.dmg || 0) > 0.4 ? 1 : 0;
    if (entry.tier !== tier) {
      entry.tier = tier;
      // Built once per driver per damage stage and kept. Rebuilding the
      // geometry the moment a wing came off meant every contact in the race
      // cost a frame, which is precisely the stutter you feel in a scrap.
      entry.mesh.geometry = damagedGeometry(entry.driver, tier);
    }
  }

  if (fx) {
    const scraping = my.car.touching && speed > 12;
    if (scraping) fx.sparks(px, pz, ph, Math.min(1, speed / 60));
    if ((my.car.damage || 0) > 0.55) {
      smokeClock += frameDt;
      if (smokeClock > 0.14) { smokeClock = 0; fx.smoke(px, pz, ph); }
    }
    fx.update(frameDt);
  }

  // keep the shadow frustum centred on the car: a fixed one either covers the
  // whole circuit at useless resolution, or leaves the car unshadowed
  if (world && world.sun) {
    world.sun.position.set(px + 90, 160, pz + 70);
    world.sun.target.position.set(px, 0, pz);
    world.sun.target.updateMatrixWorld();
  }

  hud(snap, speed);
  renderer.render(scene, camera);
}
render();

// Pool of tower rows, grown on demand and never rebuilt.
const towerPool = [];
function towerRows(n) {
  const host = $('#tower');
  while (towerPool.length < n) {
    const el = document.createElement('div');
    el.className = 't';
    const pos = document.createElement('span'); pos.className = 'p';
    const col = document.createElement('span'); col.className = 'c';
    const name = document.createElement('span'); name.className = 'n';
    const gap = document.createElement('span'); gap.className = 'n gap';
    el.append(pos, col, name, gap);
    host.appendChild(el);
    towerPool.push({ el, pos, col, name, gap, posTxt: null, colTxt: null, nameTxt: null, gapTxt: null });
  }
  for (let i = 0; i < towerPool.length; i++) {
    const want = i < n ? '' : 'none';
    if (towerPool[i].el.style.display !== want) towerPool[i].el.style.display = want;
  }
}

const revCells = (() => {
  const el = $('#revs');
  el.innerHTML = Array.from({ length: 14 }, () => '<i></i>').join('');
  return [...el.children];
})();

// The readouts that must track the car exactly run every frame. Rebuilding the
// standings DOM and re-stroking the circuit outline are far too expensive for
// that, so they run a few times a second instead: doing them per frame is what
// made the car look like it was stuttering.
let hudSlow = 0;

function hud(snap, speed) {
  const srv = snap.cars.get(me.pid);
  const car = my.car;

  $('#lapn').textContent = `${Math.min(lapCount, Math.max(1, car.lap + 1))}/${lapCount}`;
  $('#kph').textContent = Math.round(speed * 3.6);
  $('#tcur').textContent = fmt(Math.max(0, srv ? srv.cur : 0));

  // Gears are cosmetic: eight bands across the car's speed range, with the rev
  // bar filling inside whichever band the car is in.
  const top = 82 * my.drv.top;
  const band = Math.min(0.999, speed / top) * 8;
  const gear = Math.max(1, Math.ceil(band));
  const revs = speed < 0.5 ? 0 : band - (gear - 1);
  $('#gear').textContent = car.pit === 'stopped' ? 'P' : speed < 0.5 ? 'N' : gear;
  const lit = Math.round(revs * revCells.length);
  for (let i = 0; i < revCells.length; i++) {
    const want = i < lit ? (i >= revCells.length - 3 ? 'red' : 'lit') : '';
    if (revCells[i].className !== want) revCells[i].className = want;
  }

  if (car.lap !== lastLap) {
    lastLap = car.lap;
    if (car.lap > 0 && car.lap <= lapCount) flash('Lap ' + car.lap);
  }

  // everything below changes slowly; rebuilding it every frame is wasted work
  const now = performance.now();
  if (now - hudSlow > 150) {
    hudSlow = now;
    const cars = [...snap.cars.values()].sort((a, b) => a.pos - b.pos);
    const leader = cars[0];

    $('#tbest').textContent = car.best ? fmt(car.best) : '--.--';
    // delta is against your own best for the sector you just completed
    const dEl = $('#tdelta');
    const pbFor = lastSector ? car.bestSectors[lastSector.i] : 0;
    if (lastSector && pbFor) {
      const d = lastSector.time - pbFor;
      dEl.textContent = (d >= 0 ? '+' : '') + d.toFixed(2);
      dEl.className = 'v ' + (d > 0.001 ? 'up' : 'down');
    } else { dEl.textContent = '--.--'; dEl.className = 'v'; }
    $('#ping').textContent = Math.round(rtt) + 'ms';

    // sector lights: green beats nothing, purple is a personal best
    const cur = sectorOf(built, car.prevDist);
    for (const el of $('#sectors').children) {
      const i = +el.dataset.s;
      const t = car.sectors[i], pb = car.bestSectors[i];
      el.className = i === cur ? 'now' : t ? (pb && t <= pb + 0.001 ? 'pb' : 'ok') : '';
      el.textContent = t ? t.toFixed(1) : 'S' + (i + 1);
    }

    // tyres, damage, stops
    const c = compound(car.tyre);
    const badge = $('#tcomp');
    badge.textContent = c.short;
    badge.style.background = c.color;
    badge.style.color = c.id === 'hard' ? '#0b0e15' : '#0b0e15';
    const left = Math.max(0, 1 - car.wear);
    const wb = $('#wearbar');
    wb.style.width = (left * 100).toFixed(0) + '%';
    wb.style.background = left < 0.2 ? '#ff5f6d' : left < 0.45 ? '#ffc46b' : '#3ddc84';
    $('#stops').textContent = (car.stops || 0) + (car.stops === 1 ? ' stop' : ' stops');
    $('#dmgbar').style.width = ((car.damage || 0) * 100).toFixed(0) + '%';

    // pit cue: where the entry is, then the limiter, then the countdown
    const cue = $('#pitcue');
    const pit = pitGeometry(built);
    const toEntry = ((pit.entry - car.prevDist) + built.length) % built.length;
    const pd = pit.usable ? pit.pd(car.prevDist) : 1e9;
    if (car.pit === 'stopped') {
      cue.className = 'on limit';
      cue.textContent = 'Tyres on · ' + Math.max(0, car.pitClock || 0).toFixed(1) + 's';
    } else if (car.pit === 'lane') {
      cue.className = 'on limit';
      const toBox = pit.boxPd(car.box || 0) - pd;
      const toExit = pit.total - pd;
      cue.textContent = car.served
        ? `Pit limiter · exit in ${Math.max(0, Math.round(toExit))} m`
        : toBox > 0 ? `Pit limiter · box ${(car.box || 0) + 1} in ${Math.round(toBox)} m`
                    : 'Pit limiter · box on your left';
    } else if (car.pit === 'armed') {
      cue.className = 'on';
      cue.textContent = toEntry < 900 ? `Pit entry in ${Math.round(toEntry)} m · keep left` : 'Pitting this lap';
    } else cue.className = '';

    const ends = snap.ends ? Math.max(0, snap.ends - snap.time) : 0;
    $('#ctrlhint').textContent =
      ends ? `Race ends in ${Math.ceil(ends)}s`
      : stuckFor > 2.5 ? (hasCtrl ? 'Stuck? Tap rejoin on your phone' : 'Stuck? Press R to rejoin')
      : 'Arrow keys · C camera · P pits · R rejoin';

    // Driver tower. Rows are built once and then mutated: rebuilding innerHTML
    // several times a second forces a full style and layout pass on every row,
    // and that lands as a periodic hitch rather than a steady cost.
    towerRows(cars.length);
    for (let i = 0; i < cars.length; i++) {
      const x = cars[i], row = towerPool[i];
      const d = DRIVERS.find(y => y.id === x.d) || DRIVERS[0];
      const behind = (leader.pr || 0) - (x.pr || 0);
      const gap = x.pos === 1 ? '' : (behind / Math.max(25, speed)).toFixed(1);
      const cls = 't' + (x.id === me.pid ? ' me' : '') + (x.pit && x.pit !== 'no' ? ' pitting' : '');
      if (row.el.className !== cls) row.el.className = cls;
      if (row.posTxt !== x.pos) { row.pos.textContent = row.posTxt = x.pos; }
      if (row.colTxt !== d.color) { row.col.style.background = row.colTxt = d.color; }
      if (row.nameTxt !== d.short) { row.name.textContent = row.nameTxt = d.short; }
      if (row.gapTxt !== gap) { row.gap.textContent = row.gapTxt = gap; }
    }
  }
  stuckFor = (speed < 3 && !car.finished) ? stuckFor + frameDt : 0;

  if (audio) {
    const f = 46 + speed * 3.1 + revs * 26;
    audio.osc.frequency.setTargetAtTime(f, audio.ctx.currentTime, 0.04);
    audio.sub.frequency.setTargetAtTime(f / 2, audio.ctx.currentTime, 0.04);
    audio.gain.gain.setTargetAtTime(Math.min(0.06, 0.014 + speed / 2400), audio.ctx.currentTime, 0.08);
  }
  drawMini(snap);
}

/* -------------------------------------------------------------- minimap */

const mini = $('#mini'), mctx = mini.getContext('2d');
let miniBounds = null, miniTrack = null, miniBase = null;

function buildMiniBase() {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of built.line) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const pad = 26, s = Math.min((mini.width - pad * 2) / (x1 - x0), (mini.height - pad * 2) / (z1 - z0));
  miniBounds = { x0, z0, s, pad, w: (x1 - x0) * s, h: (z1 - z0) * s };
  miniTrack = built;

  // the outline never changes during a race, so stroke it once
  miniBase = document.createElement('canvas');
  miniBase.width = mini.width; miniBase.height = mini.height;
  const c = miniBase.getContext('2d');
  c.lineWidth = 9; c.strokeStyle = 'rgba(255,255,255,.17)'; c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath();
  const step = Math.max(1, Math.round(built.line.length / 160));
  for (let i = 0; i < built.line.length; i += step) {
    const p = built.line[i];
    i ? c.lineTo(miniX(p), miniZ(p)) : c.moveTo(miniX(p), miniZ(p));
  }
  c.closePath(); c.stroke();

  // start line marker
  const s0 = built.line[0];
  c.strokeStyle = '#e9edf5'; c.lineWidth = 3;
  c.beginPath();
  c.moveTo(miniX(s0) - s0.nx * 5, miniZ(s0) + s0.nz * 5);
  c.lineTo(miniX(s0) + s0.nx * 5, miniZ(s0) - s0.nz * 5);
  c.stroke();
}

const miniX = p => miniBounds.pad + (p.x - miniBounds.x0) * miniBounds.s + (mini.width - miniBounds.pad * 2 - miniBounds.w) / 2;
const miniZ = p => mini.height - (miniBounds.pad + (p.z - miniBounds.z0) * miniBounds.s + (mini.height - miniBounds.pad * 2 - miniBounds.h) / 2);

function drawMini(snap) {
  if (!built) return;
  if (miniTrack !== built) buildMiniBase();
  mctx.clearRect(0, 0, mini.width, mini.height);
  mctx.drawImage(miniBase, 0, 0);

  for (const c of snap.cars.values()) {
    if (c.id === me.pid) continue;
    const d = DRIVERS.find(x => x.id === c.d) || DRIVERS[0];
    mctx.fillStyle = d.color;
    mctx.beginPath(); mctx.arc(miniX(c), miniZ(c), 5, 0, 7); mctx.fill();
  }
  mctx.fillStyle = '#ffd166';
  mctx.beginPath(); mctx.arc(miniX(my.car), miniZ(my.car), 7.5, 0, 7); mctx.fill();
}
