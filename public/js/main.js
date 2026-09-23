import * as THREE from '../vendor/three.module.js';
import { TRACKS, DRIVERS, TEAMS, getTrack, buildTrack } from '../shared/tracks.js';
import { trackFor, gridCar, stepCar, driverOf, aiInput, pitGeometry, sectorOf, TUNE, COMPOUNDS, compound } from '../shared/sim.js';
import { carGeometry, buildWorld, makeEffects } from './scene.js';

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
let quality = Math.min(devicePixelRatio, 1.75);
renderer.setPixelRatio(quality);

// Adaptive resolution. A laptop GPU that cannot hold 60 fps at full device
// pixel ratio produces exactly the uneven frame pacing that reads as stutter,
// so trade resolution for smoothness and give it back when there is headroom.
const frameLog = [];
function paceQuality(dt) {
  frameLog.push(dt);
  if (frameLog.length < 90) return;
  frameLog.sort((a, b) => a - b);
  const median = frameLog[45];
  frameLog.length = 0;
  const want = median > 0.024 ? Math.max(0.75, quality - 0.25)
             : median < 0.0135 ? Math.min(Math.min(devicePixelRatio, 1.75), quality + 0.25)
             : quality;
  if (want !== quality) {
    quality = want;
    renderer.setPixelRatio(quality);
    resize();
  }
}
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
      send({ t: 'in', s: my.input.s, g: my.input.g, b: my.input.b, q: my.seq, p: pitLatch });
    }
    stepCar(built, my.car, { ...my.input, pit: pitLatch }, my.drv, TICK, raceClock, null);
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
  raceClock = msg.time;
  c.hint = s.hint !== undefined ? s.hint : c.hint;
  c.prevDist = s.pd !== undefined ? s.pd : c.prevDist;

  my.history = my.history.filter(h => h.seq > (s.q || 0));
  for (const h of my.history) stepCar(built, c, h.in, my.drv, TICK, msg.time, null);

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
let camReady = false, shake = 0, camRoll = 0, fx = null, smokeClock = 0;

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
  fx = makeEffects(scene);
  buildWorld(scene, built, getTrack(m.trackId).theme);

  m.grid.forEach((c, i) => {
    const d = DRIVERS.find(x => x.id === c.d) || DRIVERS[0];
    const mesh = new THREE.Mesh(carGeometry(d.color, d.trim, d.helmet),
      new THREE.MeshLambertMaterial({ vertexColors: true }));
    scene.add(mesh);
    carMeshes.set(c.id, { mesh, name: c.n, driver: d, bot: c.bot });
    if (c.id === me.pid) {
      my.drv = d;
      my.car = gridCar(built, i);
      my.seq = 0; my.history = [];
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.7, 3.15, 22),
        new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
      mesh.add(ring);
    }
  });

  smooth.x = smooth.z = smooth.h = 0;
  lastSector = null;
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

function otherCars() {
  const now = performance.now() - DELAY;
  if (!buf.length) return null;
  let a = buf[0], b = buf[buf.length - 1];
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i].at <= now && buf[i + 1].at >= now) { a = buf[i]; b = buf[i + 1]; break; }
  }
  const t = Math.max(0, Math.min(1, (now - a.at) / Math.max(1, b.at - a.at)));
  const bm = new Map(b.cars.map(c => [c.id, c]));
  const out = new Map();
  for (const ca of a.cars) {
    const cb = bm.get(ca.id) || ca;
    let dh = cb.h - ca.h;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    out.set(ca.id, { ...ca, x: ca.x + (cb.x - ca.x) * t, z: ca.z + (cb.z - ca.z) * t, h: ca.h + dh * t, v: ca.v + (cb.v - ca.v) * t });
  }
  return { cars: out, time: a.time + (b.time - a.time) * t, ends: a.ends || 0 };
}

window.__apex = {
  view: () => interpolated(),
  cycle: () => cycleView(),
  quality: () => quality,
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
                 objects: scene.children.length }),
  viewName: () => viewIdx,
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
  const px = view.x, pz = view.z, ph = view.h;

  for (const [id, entry] of carMeshes) {
    if (id === me.pid) {
      entry.mesh.position.set(px, 0, pz);
      entry.mesh.rotation.y = ph;
      continue;
    }
    const c = snap.cars.get(id);
    if (!c) { entry.mesh.visible = false; continue; }
    entry.mesh.visible = true;
    entry.mesh.position.set(c.x, 0, c.z);
    entry.mesh.rotation.y = c.h;
  }

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
  const target = new THREE.Vector3(px - Math.sin(ph) * back, up, pz - Math.cos(ph) * back);
  const aim = new THREE.Vector3(px + Math.sin(ph) * V.aim, cockpit ? 1.9 : 2.0, pz + Math.cos(ph) * V.aim);
  if (!camReady) { camPos.copy(target); camAim.copy(aim); camReady = true; }
  // the cockpit is bolted to the car: no easing, or the view lags the chassis
  const posEase = cockpit ? 1 : 1 - Math.exp(-frameDt / 0.10);
  const aimEase = cockpit ? 1 - Math.exp(-frameDt / 0.04) : 1 - Math.exp(-frameDt / 0.07);
  camPos.lerp(target, posEase);
  camAim.lerp(aim, aimEase);
  camera.position.copy(camPos);
  camera.up.set(Math.sin(camRoll), Math.cos(camRoll), 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ph);
  camera.lookAt(camAim);
  camera.fov = V.fov + fast * V.grow;
  camera.updateProjectionMatrix();

  // damage is visible on the car itself: wings come off in two stages
  for (const [id, entry] of carMeshes) {
    const c = id === me.pid ? my.car : snap.cars.get(id);
    if (!c) continue;
    const tier = (c.damage || c.dmg || 0) > 0.72 ? 2 : (c.damage || c.dmg || 0) > 0.4 ? 1 : 0;
    if (entry.tier !== tier) {
      entry.tier = tier;
      entry.mesh.geometry.dispose();
      entry.mesh.geometry = carGeometry(entry.driver.color, entry.driver.trim, entry.driver.helmet, tier);
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

  hud(snap, speed);
  renderer.render(scene, camera);
}
render();

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
    if (car.pit === 'stopped') {
      cue.className = 'on limit';
      cue.textContent = 'Tyres on · ' + Math.max(0, car.pitClock || 0).toFixed(1) + 's';
    } else if (car.pit === 'lane') {
      const toBox = ((pit.box - car.prevDist) + built.length) % built.length;
      cue.className = 'on limit';
      cue.textContent = toBox < 400 ? `Pit limiter · box in ${Math.round(toBox)} m` : 'Pit limiter';
    } else if (car.pit === 'armed') {
      cue.className = 'on';
      cue.textContent = toEntry < 900 ? `Pit entry in ${Math.round(toEntry)} m · keep left` : 'Pitting this lap';
    } else cue.className = '';

    const ends = snap.ends ? Math.max(0, snap.ends - snap.time) : 0;
    $('#ctrlhint').textContent =
      ends ? `Race ends in ${Math.ceil(ends)}s`
      : stuckFor > 2.5 ? (hasCtrl ? 'Stuck? Tap rejoin on your phone' : 'Stuck? Press R to rejoin')
      : 'Arrow keys · C camera · P pits · R rejoin';

    // driver tower down the left edge, gaps to the leader in seconds
    $('#tower').innerHTML = cars.map(x => {
      const d = DRIVERS.find(y => y.id === x.d) || DRIVERS[0];
      const behind = (leader.pr || 0) - (x.pr || 0);
      const gap = x.pos === 1 ? '' : (behind / Math.max(25, speed)).toFixed(1);
      return `<div class="t ${x.id === me.pid ? 'me' : ''} ${x.pit && x.pit !== 'no' ? 'pitting' : ''}">
        <span class="p">${x.pos}</span><span class="c" style="background:${d.color}"></span>
        <span class="n">${d.short}</span>
        <span class="n" style="margin-left:auto;color:var(--dim)">${gap}</span></div>`;
    }).join('');
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
