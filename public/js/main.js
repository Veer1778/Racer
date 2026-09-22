import * as THREE from '../vendor/three.module.js';
import { TRACKS, DRIVERS, TEAMS, getTrack, buildTrack } from '../shared/tracks.js';
import { trackFor, gridCar, stepCar, driverOf, TUNE } from '../shared/sim.js';
import { carGeometry, buildWorld } from './scene.js';

const $ = s => document.querySelector(s);
const show = id => document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));
const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const TICK = 1 / 60;

/* ------------------------------------------------------------------ net */

let ws, me = { pid: null, token: null, code: null, host: false };
let lobby = null, hasCtrl = false, rtt = 60;
const buf = [];                 // snapshots, for interpolating the other cars
const DELAY = 90;               // ms of render lag applied to other cars only

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
    case 'state':
      buf.push({ at: performance.now(), cars: m.cars, time: m.time, ends: m.ends });
      if (buf.length > 24) buf.shift();
      reconcile(m);
      break;
    case 'finished':
      flash(m.pid === me.pid ? 'Finished — P' + m.pos : `${m.name} finished P${m.pos}`); break;
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
$('#ready').onclick = () => { const mine = lobby.players.find(p => p.pid === me.pid); send({ t: 'ready', v: !(mine && mine.ready) }); };
$('#start').onclick = () => send({ t: 'start' });
$('#again').onclick = () => { if (me.host) send({ t: 'again' }); else show('s-lobby'); };

/* ---------------------------------------------------------------- three */

const renderer = new THREE.WebGLRenderer({ canvas: $('#c'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, 1, 0.4, 3000);
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

const my = { car: null, drv: null, seq: 0, history: [], input: { s: 0, g: 0, b: 0 }, srvInput: { s: 0, g: 0, b: 0 } };
const smooth = { x: 0, z: 0, h: 0 };
const keys = {};

addEventListener('keydown', e => { keys[e.code] = true; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('keydown', e => { if (e.code === 'KeyR' && racing) send({ t: 'recover' }); });

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
    acc -= TICK; steps++;
    const k = readKeys();
    const usingKeys = !hasCtrl || k.g || k.b || k.s;
    my.input = usingKeys ? k : my.srvInput;
    if (usingKeys) {
      my.seq++;
      my.history.push({ seq: my.seq, in: { ...my.input } });
      if (my.history.length > 240) my.history.shift();
      send({ t: 'in', s: my.input.s, g: my.input.g, b: my.input.b, q: my.seq });
    }
    stepCar(built, my.car, my.input, my.drv, TICK, 0, null);
  }

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
  }
  const mag = Math.hypot(smooth.x, smooth.z), CAP = 4;
  if (mag > CAP) { smooth.x *= CAP / mag; smooth.z *= CAP / mag; }
  smooth.h = Math.max(-0.25, Math.min(0.25, smooth.h));
}

/* ----------------------------------------------------------------- race */

let flashTimer = null, audio = null, lastLap = 0, stuckFor = 0;
const camPos = new THREE.Vector3(), camAim = new THREE.Vector3();
let camReady = false;

function startRace(m) {
  lapCount = m.laps;
  buf.length = 0;
  clearScene();
  built = trackFor(m.trackId);
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
  acc = 0; lastStep = performance.now();
  camReady = false; lastLap = 0;
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
    const gap = r.time && winner.time && i > 0 ? '+' + fmt(r.time - winner.time) : (r.time ? fmt(r.time) : 'DNF');
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

window.__apex = { mineMesh: () => { const e = carMeshes.get(me.pid); return e ? { found: true, visible: e.mesh.visible, pos: e.mesh.position.toArray(), verts: e.mesh.geometry.attributes.position.count, inScene: !!e.mesh.parent } : { found: false, pid: me.pid, keys: [...carMeshes.keys()] }; }, get state() { return { car: my.car && { ...my.car }, cam: camera.position.toArray(), meshes: [...carMeshes].map(([id, e]) => [id, e.mesh.visible, e.mesh.position.toArray()]), rtt, smooth }; } };

function render() {
  requestAnimationFrame(render);
  stepLocal();
  if (!racing || !built || !my.car) { renderer.render(scene, camera); return; }
  const snap = otherCars();
  if (!snap) return;

  const px = my.car.x + smooth.x, pz = my.car.z + smooth.z, ph = my.car.h + smooth.h;

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
  const back = 13.5 + fast * 4.5, up = 5.4 + fast * 1.1;
  const target = new THREE.Vector3(px - Math.sin(ph) * back, up, pz - Math.cos(ph) * back);
  const aim = new THREE.Vector3(px + Math.sin(ph) * 18, 2.0, pz + Math.cos(ph) * 18);
  if (!camReady) { camPos.copy(target); camAim.copy(aim); camReady = true; }
  // time-based easing: at 20fps the camera must still keep up with the car
  camPos.lerp(target, 1 - Math.exp(-frameDt / 0.10));
  camAim.lerp(aim, 1 - Math.exp(-frameDt / 0.07));
  camera.position.copy(camPos);
  camera.lookAt(camAim);
  camera.fov = 64 + fast * 10;
  camera.updateProjectionMatrix();

  hud(snap, speed);
  renderer.render(scene, camera);
}
render();

const revCells = (() => {
  const el = $('#revs');
  el.innerHTML = Array.from({ length: 14 }, () => '<i></i>').join('');
  return [...el.children];
})();

function hud(snap, speed) {
  const srv = snap.cars.get(me.pid);
  const cars = [...snap.cars.values()].sort((a, b) => a.pos - b.pos);
  $('#posn').textContent = srv ? srv.pos : 1;
  $('#posof').textContent = '/' + cars.length;
  $('#lapn').textContent = `${Math.min(lapCount, Math.max(1, my.car.lap + 1))}/${lapCount}`;
  $('#kph').textContent = Math.round(speed * 3.6);
  $('#tbest').textContent = my.car.best ? fmt(my.car.best) : '--.--';
  $('#tcur').textContent = fmt(Math.max(0, srv ? srv.cur : 0));
  $('#ping').textContent = Math.round(rtt) + 'ms';

  // gears are cosmetic: eight bands across the car's speed range, with the
  // rev bar filling inside whichever band the car is in
  const top = 82 * my.drv.top;
  const band = Math.min(0.999, speed / top) * 8;
  const gear = Math.max(1, Math.ceil(band));
  const revs = speed < 0.5 ? 0 : band - (gear - 1);
  $('#gear').textContent = speed < 0.5 ? 'N' : gear;
  const lit = Math.round(revs * revCells.length);
  revCells.forEach((c, i) => {
    c.className = i < lit ? (i >= revCells.length - 3 ? 'red' : 'lit') : '';
  });

  if (my.car.lap !== lastLap) {
    lastLap = my.car.lap;
    if (my.car.lap > 0 && my.car.lap <= lapCount) flash('Lap ' + my.car.lap);
  }
  const left = snap.ends ? Math.max(0, snap.ends - snap.time) : 0;
  stuckFor = (speed < 3 && !my.car.finished) ? stuckFor + 1 : 0;
  $('#ctrlhint').textContent =
    left ? `Race ends in ${Math.ceil(left)}s`
    : stuckFor > 70 ? (hasCtrl ? 'Stuck? Tap rejoin on your phone' : 'Stuck? Press R to rejoin')
    : (hasCtrl ? 'Phone controller connected' : 'Arrow keys or WASD');

  // gaps: distance behind the leader, expressed as time at the current pace
  const leader = cars[0];
  $('#board').innerHTML = cars.map(c => {
    const d = DRIVERS.find(x => x.id === c.d) || DRIVERS[0];
    const behind = (leader.pr || 0) - (c.pr || 0);
    const gap = c.pos === 1 ? 'LEAD' : '+' + (behind / Math.max(25, speed)).toFixed(1);
    return `<div class="r ${c.id === me.pid ? 'me' : ''}">
      <span class="i">${c.pos}</span>
      <span class="sw" style="background:${d.color}"></span>
      <span class="n">${esc(c.n)}</span>
      <span class="g">${gap}</span></div>`;
  }).join('');

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
let miniBounds = null, miniTrack = null;

function drawMini(snap) {
  if (!built) return;
  if (miniTrack !== built) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of built.line) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const pad = 26, s = Math.min((mini.width - pad * 2) / (x1 - x0), (mini.height - pad * 2) / (z1 - z0));
    miniBounds = { x0, z0, s, pad, w: (x1 - x0) * s, h: (z1 - z0) * s };
    miniTrack = built;
  }
  const B = miniBounds;
  const px = p => B.pad + (p.x - B.x0) * B.s + (mini.width - B.pad * 2 - B.w) / 2;
  const pz = p => mini.height - (B.pad + (p.z - B.z0) * B.s + (mini.height - B.pad * 2 - B.h) / 2);

  mctx.clearRect(0, 0, mini.width, mini.height);
  mctx.lineWidth = 8; mctx.strokeStyle = 'rgba(255,255,255,.18)'; mctx.lineJoin = 'round';
  mctx.beginPath();
  for (let i = 0; i < built.line.length; i += 2) {
    const p = built.line[i];
    i ? mctx.lineTo(px(p), pz(p)) : mctx.moveTo(px(p), pz(p));
  }
  mctx.closePath(); mctx.stroke();

  for (const c of snap.cars.values()) {
    if (c.id === me.pid) continue;
    const d = DRIVERS.find(x => x.id === c.d) || DRIVERS[0];
    mctx.fillStyle = d.color;
    mctx.beginPath(); mctx.arc(px(c), pz(c), 5, 0, 7); mctx.fill();
  }
  mctx.fillStyle = '#ffd166';
  mctx.beginPath(); mctx.arc(px(my.car), pz(my.car), 7.5, 0, 7); mctx.fill();
}
