import * as THREE from '../vendor/three.module.js';
import { TRACKS, DRIVERS, buildTrack, getTrack } from '../shared/tracks.js';

const $ = s => document.querySelector(s);
const show = id => document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));

/* ------------------------------------------------------------------ net */

let ws, me = { pid: null, token: null, code: null, host: false };
let lobby = null, info = null, hasCtrl = false;
let raceCfg = null;                 // { laps, trackId, grid }
const buf = [];                     // snapshot buffer for interpolation
const DELAY = 100;                  // ms of render lag for smoothing

fetch('/api/info').then(r => r.json()).then(d => { info = d; });

function connect(cb) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = cb;
  ws.onmessage = e => handle(JSON.parse(e.data));
  ws.onclose = () => { $('#homeerr').textContent = 'Disconnected from the server.'; show('s-home'); stopRace(); };
}
const send = o => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

function handle(m) {
  switch (m.t) {
    case 'joined':
      me = { pid: m.pid, token: m.token, code: m.code, host: m.host };
      show('s-lobby');
      break;
    case 'lobby':
      lobby = m; renderLobby(); break;
    case 'err':
      $('#homeerr').textContent = m.msg; $('#lobbyerr').textContent = m.msg;
      setTimeout(() => { $('#lobbyerr').textContent = ''; }, 3000);
      break;
    case 'ctrlOn': hasCtrl = true; $('#ctrlhint').textContent = 'Phone controller connected'; break;
    case 'ctrlOff': hasCtrl = false; $('#ctrlhint').textContent = 'Phone not paired — using arrow keys'; break;
    case 'countdown': startRace(m); break;
    case 'go': lightsOut(); break;
    case 'state': buf.push({ at: performance.now(), cars: m.cars, time: m.time, ends: m.ends }); if (buf.length > 20) buf.shift(); break;
    case 'finished':
      if (m.pid === me.pid) flash('Finished — P' + m.pos);
      else flash(m.name + ' finished P' + m.pos);
      break;
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

function renderLobby() {
  if (!lobby) return;
  if (lobby.state === 'lobby') show('s-lobby');
  $('#code').textContent = lobby.code;
  $('#laps').textContent = lobby.laps;
  $('#ai').textContent = lobby.aiCount;
  document.querySelectorAll('[data-skill]').forEach(b =>
    b.style.borderColor = Math.abs(+b.dataset.skill - lobby.aiSkill) < 0.01 ? 'var(--accent)' : 'var(--line)');
  me.host = lobby.hostId === me.pid;
  $('#start').style.display = me.host ? '' : 'none';
  $('#hostonly').textContent = me.host ? '' : '(host picks)';

  const host = (info && info.lan) ? `http://${info.lan}:${info.port}` : location.origin;
  const url = `${host}/c#${lobby.code}-${me.token}`;
  $('#pairurl').textContent = url;
  fetch('/qr?d=' + encodeURIComponent(url)).then(r => r.text()).then(svg => { $('#qr').innerHTML = svg; });

  const taken = new Set(lobby.players.filter(p => p.pid !== me.pid).map(p => p.driverId));
  const mine = lobby.players.find(p => p.pid === me.pid);
  $('#drivers').innerHTML = DRIVERS.map(d => `
    <div class="opt ${mine && mine.driverId === d.id ? 'sel' : ''} ${taken.has(d.id) ? 'dis' : ''}" data-drv="${d.id}">
      <div class="nm"><span class="swatch" style="background:${d.color}"></span>${d.name}</div>
      <div class="sm">${d.team}</div>
    </div>`).join('');

  $('#tracks').innerHTML = TRACKS.map(t => `
    <div class="opt ${lobby.trackId === t.id ? 'sel' : ''} ${me.host ? '' : 'dis'}" data-trk="${t.id}">
      <div class="nm">${t.name}</div><div class="sm">${t.blurb}</div>
    </div>`).join('');

  $('#plist').innerHTML = lobby.players.map(p => {
    const d = DRIVERS.find(x => x.id === p.driverId) || DRIVERS[0];
    return `<div class="p">
      <span><span class="swatch" style="background:${d.color}"></span><b>${esc(p.name)}</b>
        <span style="color:var(--dim)"> · ${d.name}</span>${p.pid === lobby.hostId ? ' <span class="pill">host</span>' : ''}</span>
      <span>${p.ctrl ? '<span class="pill ok">phone</span>' : '<span class="pill warn">keys</span>'}
        ${p.ready ? '<span class="pill ok">ready</span>' : '<span class="pill">waiting</span>'}</span>
    </div>`;
  }).join('');

  const allReady = lobby.players.length > 0 && lobby.players.every(p => p.ready);
  $('#start').disabled = !allReady;
  $('#start').textContent = allReady ? 'Start race' : 'Waiting for drivers…';
  if (mine) $('#ready').textContent = mine.ready ? "Not ready" : "I'm ready";
}
const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

$('#drivers').onclick = e => { const o = e.target.closest('[data-drv]'); if (o && !o.classList.contains('dis')) send({ t: 'pick', driverId: o.dataset.drv }); };
$('#tracks').onclick = e => { const o = e.target.closest('[data-trk]'); if (o && me.host) send({ t: 'config', trackId: o.dataset.trk }); };
document.querySelectorAll('[data-laps]').forEach(b => b.onclick = () => me.host && send({ t: 'config', laps: lobby.laps + (+b.dataset.laps) }));
document.querySelectorAll('[data-ai]').forEach(b => b.onclick = () => me.host && send({ t: 'config', aiCount: lobby.aiCount + (+b.dataset.ai) }));
document.querySelectorAll('[data-skill]').forEach(b => b.onclick = () => me.host && send({ t: 'config', aiSkill: +b.dataset.skill }));
$('#ready').onclick = () => { const mine = lobby.players.find(p => p.pid === me.pid); send({ t: 'ready', v: !(mine && mine.ready) }); };
$('#start').onclick = () => send({ t: 'start' });
$('#again').onclick = () => { if (me.host) send({ t: 'again' }); else show('s-lobby'); };

/* ---------------------------------------------------------------- three */

const renderer = new THREE.WebGLRenderer({ canvas: $('#c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 4000);
let built = null, trackDef = null, carMeshes = new Map(), racing = false;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

function clearScene() {
  while (scene.children.length) {
    const o = scene.children.pop();
    o.traverse && o.traverse(n => { n.geometry && n.geometry.dispose(); n.material && (Array.isArray(n.material) ? n.material.forEach(m => m.dispose()) : n.material.dispose()); });
  }
  carMeshes.clear();
}

function ribbon(line, inner, outer, color, y = 0.02, closed = true) {
  const pos = [], N = line.length;
  const last = closed ? N : N - 1;
  for (let i = 0; i < last; i++) {
    const a = line[i], b = line[(i + 1) % N];
    const a1 = [a.x + a.nx * inner, y, a.z + a.nz * inner], a2 = [a.x + a.nx * outer, y, a.z + a.nz * outer];
    const b1 = [b.x + b.nx * inner, y, b.z + b.nz * inner], b2 = [b.x + b.nx * outer, y, b.z + b.nz * outer];
    pos.push(...a1, ...a2, ...b2, ...a1, ...b2, ...b1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
}

function buildScene(trackId) {
  clearScene();
  trackDef = getTrack(trackId);
  built = buildTrack(trackDef);
  const half = built.width / 2;

  scene.background = new THREE.Color(trackDef.sky);
  scene.fog = new THREE.Fog(trackDef.sky, 260, 900);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, trackDef.ground, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(180, 300, 120);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshLambertMaterial({ color: trackDef.ground }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
  scene.add(ground);

  scene.add(ribbon(built.line, -half - 5.5, half + 5.5, 0x2a2f38, 0.005));   // runoff
  scene.add(ribbon(built.line, -half, half, 0x23262c, 0.02));                // asphalt
  scene.add(ribbon(built.line, -half * 0.03, half * 0.03, 0x3a3f48, 0.03));  // faint centre line

  // kerbs: short alternating blocks either side, drawn as open strips
  const N = built.line.length;
  const STEP = 3;
  for (let i = 0; i < N; i += STEP) {
    const seg = [];
    for (let k = 0; k <= STEP; k++) seg.push(built.line[(i + k) % N]);
    const c = (i / STEP) % 2 ? trackDef.kerb : 0xf2f2f2;
    scene.add(ribbon(seg, half, half + 1.1, c, 0.05, false));
    scene.add(ribbon(seg, -half - 1.1, -half, c, 0.05, false));
  }

  // barriers: a continuous vertical wall down each side, capped with a light rail
  const barrier = (off, height, base, color) => {
    const pos = [];
    for (let i = 0; i < N; i++) {
      const a = built.line[i], b = built.line[(i + 1) % N];
      const ax = a.x + a.nx * off, az = a.z + a.nz * off;
      const bx = b.x + b.nx * off, bz = b.z + b.nz * off;
      pos.push(ax, base, az, ax, base + height, az, bx, base + height, bz);
      pos.push(ax, base, az, bx, base + height, bz, bx, base, bz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  };
  for (const s of [1, -1]) {
    scene.add(barrier((half + 5.6) * s, 1.9, 0, 0x1b2231));
    scene.add(barrier((half + 5.6) * s, 0.35, 1.9, 0xc9d3e4));
  }

  // start/finish line
  const s0 = built.line[0];
  const line = new THREE.Mesh(new THREE.PlaneGeometry(built.width, 2.4),
    new THREE.MeshBasicMaterial({ color: 0xffffff }));
  line.rotation.x = -Math.PI / 2;
  line.rotation.z = -Math.atan2(s0.tx, s0.tz);
  line.position.set(s0.x, 0.07, s0.z);
  scene.add(line);

  // start gantry
  const pm = new THREE.MeshLambertMaterial({ color: 0x2b3448 });
  const ang = Math.atan2(s0.tx, s0.tz);
  for (const s of [1, -1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1), pm);
    post.position.set(s0.x + s0.nx * (half + 1.5) * s, 4.5, s0.z + s0.nz * (half + 1.5) * s);
    scene.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(built.width + 4, 1.4, 1), pm);
  beam.position.set(s0.x, 9.2, s0.z);
  beam.rotation.y = ang;
  scene.add(beam);

  miniBounds = null;
}

/* car model */
function makeCar(color, isMe) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 4.2), new THREE.MeshLambertMaterial({ color }));
  body.position.y = 0.62; g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 1.6), new THREE.MeshLambertMaterial({ color }));
  nose.position.set(0, 0.5, 2.7); g.add(nose);
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 1.2), new THREE.MeshLambertMaterial({ color: 0x0d1018 }));
  cockpit.position.set(0, 1.0, 0.1); g.add(cockpit);
  const rw = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.25), new THREE.MeshLambertMaterial({ color }));
  rw.position.set(0, 1.15, -2.1); g.add(rw);
  const fw = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.16, 0.7), new THREE.MeshLambertMaterial({ color }));
  fw.position.set(0, 0.32, 3.4); g.add(fw);
  const tyre = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 14);
  const tm = new THREE.MeshLambertMaterial({ color: 0x14171d });
  for (const [x, z] of [[1.05, 1.5], [-1.05, 1.5], [1.1, -1.5], [-1.1, -1.5]]) {
    const w = new THREE.Mesh(tyre, tm);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.55, z); g.add(w);
  }
  if (isMe) {
    const halo = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.0, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; g.add(halo);
  }
  g.userData.color = color;
  return g;
}

/* ----------------------------------------------------------------- race */

let lapCount = 3, flashTimer = null, audio = null, lastLap = 0;
const camPos = new THREE.Vector3(), camAim = new THREE.Vector3();
let camReady = false;

function startRace(m) {
  raceCfg = m; lapCount = m.laps;
  buf.length = 0;
  buildScene(m.trackId);
  for (const c of m.grid) {
    const d = DRIVERS.find(x => x.id === c.d) || DRIVERS[0];
    const mesh = makeCar(new THREE.Color(d.color), c.id === me.pid);
    scene.add(mesh);
    carMeshes.set(c.id, { mesh, name: c.n, driver: d, bot: c.bot, sm: null });
  }
  show('');                       // hide all overlay screens
  $('#hud').classList.add('on');
  $('#lapn').textContent = `1/${lapCount}`;
  racing = true;
  camReady = false;
  lastLap = 0;
  runLights(m.at);
  initAudio();
}

function stopRace() { racing = false; $('#hud').classList.remove('on'); }

function runLights(at) {
  const lights = [...document.querySelectorAll('.light')];
  $('#lights').style.display = 'flex';
  lights.forEach(l => l.classList.remove('on'));
  $('#go').style.opacity = 0;
  const tick = () => {
    const left = at - Date.now();
    const lit = Math.min(5, Math.max(0, 5 - Math.ceil(left / 700)));
    lights.forEach((l, i) => l.classList.toggle('on', i < lit));
    if (left > 0) requestAnimationFrame(tick);
  };
  tick();
}
function lightsOut() {
  document.querySelectorAll('.light').forEach(l => l.classList.remove('on'));
  $('#go').style.opacity = 1;
  setTimeout(() => { $('#go').style.opacity = 0; $('#lights').style.display = 'none'; }, 900);
}
function flash(text) {
  $('#flash').textContent = text; $('#flash').style.opacity = 1;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { $('#flash').style.opacity = 0; }, 2600);
}

function showResults(m) {
  stopRace();
  const rows = m.results.map((r, i) => {
    const d = DRIVERS.find(x => x.id === r.driverId) || DRIVERS[0];
    return `<tr${r.pid === me.pid ? ' style="color:#ffd166"' : ''}>
      <td>${i + 1}</td>
      <td><span class="swatch" style="background:${d.color}"></span>${esc(r.name)}${r.bot ? ' <span class="pill">AI</span>' : ''}</td>
      <td>${r.time ? fmt(r.time) : 'DNF'}</td>
      <td>${r.best ? fmt(r.best) : '--'}</td></tr>`;
  }).join('');
  $('#rbody').innerHTML = rows;
  $('#rtitle').textContent = (getTrack(m.trackId).name) + ' · classification';
  $('#again').textContent = me.host ? 'Back to lobby' : 'Waiting for host…';
  show('s-results');
}
const fmt = t => {
  const mn = Math.floor(t / 60), s = (t % 60);
  return mn ? `${mn}:${s.toFixed(2).padStart(5, '0')}` : s.toFixed(2);
};

/* ---------------------------------------------------------------- input */

const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e => { keys[e.code] = false; });

setInterval(() => {
  if (!racing || hasCtrl) return;
  const s = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  const g = (keys.ArrowUp || keys.KeyW) ? 1 : 0;
  const b = (keys.ArrowDown || keys.KeyS || keys.Space) ? 1 : 0;
  send({ t: 'in', s, g, b });
}, 33);

/* ---------------------------------------------------------------- audio */

function initAudio() {
  if (audio) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(), gain = ctx.createGain(), filt = ctx.createBiquadFilter();
    osc.type = 'sawtooth'; osc.frequency.value = 60;
    filt.type = 'lowpass'; filt.frequency.value = 900;
    gain.gain.value = 0.0;
    osc.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
    osc.start();
    audio = { ctx, osc, gain };
  } catch { audio = null; }
}

/* --------------------------------------------------------------- render */

function sample() {
  const now = performance.now() - DELAY;
  if (buf.length === 0) return null;
  let a = buf[0], b = buf[buf.length - 1];
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i].at <= now && buf[i + 1].at >= now) { a = buf[i]; b = buf[i + 1]; break; }
  }
  const span = Math.max(1, b.at - a.at);
  const t = Math.max(0, Math.min(1, (now - a.at) / span));
  const out = new Map();
  const bm = new Map(b.cars.map(c => [c.id, c]));
  const ends = a.ends || 0;
  for (const ca of a.cars) {
    const cb = bm.get(ca.id) || ca;
    let dh = cb.h - ca.h;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    out.set(ca.id, {
      ...ca,
      x: ca.x + (cb.x - ca.x) * t,
      z: ca.z + (cb.z - ca.z) * t,
      h: ca.h + dh * t,
      v: ca.v + (cb.v - ca.v) * t
    });
  }
  return { cars: out, time: a.time + (b.time - a.time) * t, ends };
}


function render() {
  requestAnimationFrame(render);
  if (!racing || !built) { renderer.render(scene, camera); return; }
  const snap = sample();
  if (!snap) return;

  for (const [id, entry] of carMeshes) {
    const c = snap.cars.get(id);
    if (!c) { entry.mesh.visible = false; continue; }
    entry.mesh.visible = true;
    entry.mesh.position.set(c.x, 0, c.z);
    entry.mesh.rotation.y = c.h;
    entry.last = c;
  }

  const mine = snap.cars.get(me.pid) || [...snap.cars.values()][0];
  if (mine) {
    // camera eases back and rises a little with speed
    const fast = Math.min(1, Math.abs(mine.v) / 70);
    const back = 15 + fast * 3.5, up = 6.2 + fast * 0.8;
    const tx = mine.x - Math.sin(mine.h) * back, tz = mine.z - Math.cos(mine.h) * back;
    const target = new THREE.Vector3(tx, up, tz);
    const aim = new THREE.Vector3(mine.x + Math.sin(mine.h) * 16, 1.8, mine.z + Math.cos(mine.h) * 16);
    if (!camReady) { camPos.copy(target); camAim.copy(aim); camReady = true; }
    camPos.lerp(target, 0.12);
    camAim.lerp(aim, 0.18);
    camera.position.copy(camPos);
    camera.lookAt(camAim);
    hud(mine, snap);
  }
  renderer.render(scene, camera);
}
render();

function hud(mine, snap) {
  $('#posn').textContent = mine.pos;
  $('#lapn').textContent = `${Math.min(lapCount, Math.max(1, mine.lap + 1))}/${lapCount}`;
  $('#kph').textContent = Math.round(Math.abs(mine.v) * 3.6);
  $('#tbest').textContent = mine.best ? fmt(mine.best) : '--.--';

  if (mine.lap !== lastLap) { lastLap = mine.lap; if (mine.lap > 0 && mine.lap <= lapCount) flash('Lap ' + mine.lap); }
  const left = snap.ends ? Math.max(0, snap.ends - snap.time) : 0;
  $('#ctrlhint').textContent = left
    ? `Race ends in ${Math.ceil(left)}s`
    : (hasCtrl ? 'Phone controller connected' : 'Phone not paired — using arrow keys');
  $('#tcur').textContent = fmt(Math.max(0, mine.cur || 0));

  const ord = [...snap.cars.values()].sort((a, b) => a.pos - b.pos);
  $('#board').innerHTML = ord.map(c =>
    `<div class="r ${c.id === me.pid ? 'me' : ''}"><span><i>${c.pos}</i>${esc(c.n)}</span><span style="color:${(DRIVERS.find(d => d.id === c.d) || {}).color}">●</span></div>`
  ).join('');

  if (audio) {
    const f = 55 + Math.abs(mine.v) * 3.4;
    audio.osc.frequency.setTargetAtTime(f, audio.ctx.currentTime, 0.05);
    audio.gain.gain.setTargetAtTime(Math.min(0.05, 0.012 + Math.abs(mine.v) / 2600), audio.ctx.currentTime, 0.1);
  }
  drawMini(snap);
}

const mini = $('#mini'), mctx = mini.getContext('2d');
let miniBounds = null;
function drawMini(snap) {
  if (!built) return;
  if (!miniBounds) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of built.line) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const pad = 26;
    const sx = (mini.width - pad * 2) / (x1 - x0), sz = (mini.height - pad * 2) / (z1 - z0);
    const s = Math.min(sx, sz);
    miniBounds = { x0, z0, s, pad, w: (x1 - x0) * s, h: (z1 - z0) * s };
  }
  const B = miniBounds;
  const px = p => B.pad + (p.x - B.x0) * B.s + (mini.width - B.pad * 2 - B.w) / 2;
  const pz = p => mini.height - (B.pad + (p.z - B.z0) * B.s + (mini.height - B.pad * 2 - B.h) / 2);

  mctx.clearRect(0, 0, mini.width, mini.height);
  mctx.lineWidth = 9; mctx.strokeStyle = 'rgba(255,255,255,.14)';
  mctx.beginPath();
  built.line.forEach((p, i) => i ? mctx.lineTo(px(p), pz(p)) : mctx.moveTo(px(p), pz(p)));
  mctx.closePath(); mctx.stroke();

  for (const c of snap.cars.values()) {
    const d = DRIVERS.find(x => x.id === c.d) || DRIVERS[0];
    mctx.fillStyle = c.id === me.pid ? '#ffd166' : d.color;
    mctx.beginPath();
    mctx.arc(px(c), pz(c), c.id === me.pid ? 7 : 5, 0, 7);
    mctx.fill();
  }
}
