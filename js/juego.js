/* =====================================================================
   JUEGO: jugador en primera persona, choques con las paredes, puertas
   con la tecla E, menú (solo / crear / unirse) y los demás jugadores.
   ===================================================================== */
(function (G) {
'use strict';
const T = G.T, Net = G.Net, E = G.Est, camera = G.camera, scene = G.scene, clamp = G.clamp;
const $ = (id) => document.getElementById(id);
const el = {};
['title', 'menu', 'lobby', 'name', 'code', 'btnSolo', 'btnCreate', 'btnJoin', 'btnReady', 'menuMsg', 'lobbyCode', 'lobbyList', 'lobbyMsg',
  'hud', 'plist', 'zona', 'prompt', 'aviso', 'codigo', 'pausa', 'end', 'endText', 'debug', 'barra'].forEach((k) => { el[k] = $(k); });

// medidas del jugador (metros) y controles
const CFG = { walk: 3.4, run: 6.6, sens: 0.0022, R: 0.3, H: 1.75, EYE: 1.62, STEP: 0.45, GRAV: 22, JUMP: 5.4, ALCANCE: 2.4 };
const S = { phase: 'title', pos: new T.Vector3(), vy: 0, yaw: Math.PI / 2, pitch: 0, ground: true, moving: false, running: false,
  flash: false, netT: 0, time: 0, eyeY: 0, bob: 0, avisoT: 0, mirada: null, zona: '' };
const keys = {}, just = {};
const MY = () => (Net.on ? Net.mySlot : 0);
const HOST = () => !Net.on || Net.isHost;

// ---------------- avisos en pantalla ----------------
function prompt(t) { el.prompt.innerHTML = t || ''; el.prompt.style.opacity = t ? 1 : 0; }
function aviso(t, seg = 2.5) { el.aviso.textContent = t; el.aviso.style.opacity = 1; S.avisoT = seg; }
function lockPointer() { try { const r = G.renderer.domElement.requestPointerLock && G.renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* sin bloqueo */ } }

// ---------------- sonido sintetizado (puertas) ----------------
let actx = null;
function audio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* sin audio */ } } if (actx && actx.state === 'suspended') actx.resume(); return actx; }
function sonidoPuerta(pos, abrir) {
  const a = actx; if (!a) return;
  const vol = clamp(1 - pos.distanceTo(S.pos) / 18, 0, 1) * 0.5; if (vol <= 0.01) return;
  const t = a.currentTime, n = a.sampleRate * 0.8, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.5);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
  f.frequency.setValueAtTime(abrir ? 500 : 1400, t); f.frequency.exponentialRampToValueAtTime(abrir ? 1600 : 400, t + 0.7);
  const g = a.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  src.connect(f); f.connect(g); g.connect(a.destination); src.start(t);
  const o = a.createOscillator(), og = a.createGain(); o.frequency.value = abrir ? 70 : 55; o.type = 'sine';
  og.gain.setValueAtTime(vol * (abrir ? 0.4 : 0.9), t + (abrir ? 0 : 0.65)); og.gain.exponentialRampToValueAtTime(0.001, t + (abrir ? 0.25 : 0.95));
  o.connect(og); og.connect(a.destination); o.start(t); o.stop(t + 1);
}
function sonidoBloqueo() {
  const a = actx; if (!a) return; const t = a.currentTime;
  [0, 0.16].forEach((dt) => { const o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.frequency.value = 220; g.gain.setValueAtTime(0.06, t + dt); g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.12); o.connect(g); g.connect(a.destination); o.start(t + dt); o.stop(t + dt + 0.13); });
}

// ---------------- choques: el jugador es una caja de 0.6 x 1.75 m ----------------
function todasLasCajas() {
  const out = E.cajas.slice();
  E.puertas.forEach((p) => { const c = E.cajaPuerta(p); if (c) out.push(c); });
  return out;
}
function choca(b, x, z, pies) {
  return x + CFG.R > b.x0 && x - CFG.R < b.x1 && z + CFG.R > b.z0 && z - CFG.R < b.z1 && b.y1 > pies + CFG.STEP && b.y0 < pies + CFG.H;
}
function moverEje(cajas, eje, d) {
  if (!d) return;
  const p = S.pos; p[eje] += d;
  for (const b of cajas) {
    if (!choca(b, p.x, p.z, p.y)) continue;
    if (eje === 'x') p.x = d > 0 ? b.x0 - CFG.R - 1e-4 : b.x1 + CFG.R + 1e-4;
    else p.z = d > 0 ? b.z0 - CFG.R - 1e-4 : b.z1 + CFG.R + 1e-4;
  }
}
// altura del suelo bajo los pies (lo más alto que se puede pisar subiendo como máximo un escalón)
function suelo(cajas, x, z, pies) {
  const r = CFG.R * 0.6; let g = -1e9;
  for (const b of cajas) {
    if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && b.y1 <= pies + CFG.STEP + 1e-3 && b.y1 > g) g = b.y1;
  }
  return g;
}
function techo(cajas, x, z, pies) {
  let t = 1e9;
  for (const b of cajas) {
    if (x + CFG.R > b.x0 && x - CFG.R < b.x1 && z + CFG.R > b.z0 && z - CFG.R < b.z1 && b.y0 >= pies + CFG.H - 0.05 && b.y0 < t) t = b.y0;
  }
  return t;
}

// ---------------- movimiento ----------------
function moverJugador(dt) {
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (keys.ArrowLeft) S.yaw += dt * 2.2; if (keys.ArrowRight) S.yaw -= dt * 2.2;
  S.running = !!(keys.ShiftLeft || keys.ShiftRight);
  const v = S.running ? CFG.run : CFG.walk, len = Math.hypot(f, s) || 1;
  const sy = Math.sin(S.yaw), cy = Math.cos(S.yaw);
  const dx = (-sy * f + cy * s) / len * v * dt, dz = (-cy * f - sy * s) / len * v * dt;
  S.moving = !!(f || s);
  const cajas = todasLasCajas();
  // pasos cortos para no atravesar paredes delgadas
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  for (let i = 0; i < n; i++) {
    moverEje(cajas, 'x', dx / n); moverEje(cajas, 'z', dz / n);
    const g = suelo(cajas, S.pos.x, S.pos.z, S.pos.y);
    if (S.ground && S.vy <= 0 && g > S.pos.y - CFG.STEP && g <= S.pos.y + CFG.STEP) S.pos.y = g;   // sube y baja escalones
  }
  // gravedad y salto
  if (just.Space && S.ground) { S.vy = CFG.JUMP; S.ground = false; }
  S.vy -= CFG.GRAV * dt;
  const antes = S.pos.y; S.pos.y += S.vy * dt;
  if (S.vy > 0) { const t = techo(cajas, S.pos.x, S.pos.z, antes); if (S.pos.y + CFG.H > t) { S.pos.y = t - CFG.H; S.vy = 0; } }
  const g = suelo(cajas, S.pos.x, S.pos.z, Math.max(antes, S.pos.y));
  if (S.pos.y <= g) { S.pos.y = g; S.vy = 0; S.ground = true; } else S.ground = S.pos.y - g < 0.02;
  if (S.pos.y < -30) { spawn(); aviso('Te caíste fuera del mapa. Vuelves al inicio.'); }
}
function spawn() {
  const sp = E.datos.spawn, k = MY() % 8, dz = [0, 1.2, -1.2, 2.4, -2.4, 3.6, -3.6, 4.8][k];
  S.pos.set(sp[0], sp[1], sp[2] + dz); S.vy = 0; S.yaw = Math.PI / 2; S.pitch = 0; S.eyeY = S.pos.y + CFG.EYE;
}
function actualizarCamara(dt) {
  S.eyeY += (S.pos.y + CFG.EYE - S.eyeY) * Math.min(1, dt * 16);   // suaviza los escalones
  S.bob = S.moving && S.ground ? S.bob + dt * (S.running ? 13 : 9) : S.bob * 0.9;
  const b = S.moving && S.ground ? Math.sin(S.bob) * (S.running ? 0.045 : 0.025) : 0;
  camera.position.set(S.pos.x, S.eyeY + b, S.pos.z);
  camera.rotation.set(S.pitch, S.yaw, 0);
}

// ---------------- linterna (tecla F) ----------------
const linterna = new T.SpotLight(0xfff0d8, 0, 22, 0.55, 0.5, 1.4);
linterna.position.set(0.25, -0.2, 0); camera.add(linterna);
linterna.target.position.set(0.1, -0.3, -5); camera.add(linterna.target);

// ---------------- puertas con la tecla E (pasan por el anfitrión) ----------------
const _dir = new T.Vector3();
function puertaMirada() {
  camera.getWorldDirection(_dir);
  const cp = camera.position; let mejor = null, md = 1e9;
  for (const p of E.puertas) {
    const c = p.caja;
    if (Math.abs(S.pos.y - c.y0) > 2.5) continue;
    const qx = clamp(cp.x, c.x0, c.x1), qz = clamp(cp.z, c.z0, c.z1), d = Math.hypot(qx - cp.x, qz - cp.z);
    if (d > CFG.ALCANCE) continue;
    const vx = p.centro.x - cp.x, vz = p.centro.z - cp.z, dl = Math.hypot(vx, vz) || 1;
    const dot = (vx * _dir.x + vz * _dir.z) / dl / (Math.hypot(_dir.x, _dir.z) || 1);
    if (dot < 0.35 && d > 0.8) continue;
    const score = d - dot;
    if (score < md) { md = score; mejor = p; }
  }
  return mejor;
}
function textoPuerta(p) {
  if (p.bloqueada) {
    if (p.nombre.includes('Bahia')) return '🔒 Compuerta de la bahía: <b>bloqueada</b> (afuera está el vacío)';
    if (p.nombre.includes('EVA')) return '🔒 Esclusa exterior: <b>bloqueada</b>';
    return '🔒 Puerta bloqueada';
  }
  return `<b>[E]</b> ${p.abierta ? 'Cerrar' : 'Abrir'} puerta`;
}
const EV = {};
function emit(name, ...args) { if (Net.on && Net.isHost) Net.broadcast({ t: 'ev', n: name, a: args }); if (EV[name]) EV[name](...args); }
EV.puerta = (i, abierta) => { const p = E.puertas[i]; if (!p) return; if (p.abierta !== abierta) sonidoPuerta(p.centro, abierta); p.abierta = abierta; };
EV.estado = (lista) => { lista.forEach((v, i) => { if (E.puertas[i]) E.puertas[i].abierta = !!v; }); };
function accion(slot, i) {   // solo la ejecuta el anfitrión (o quien juega solo)
  const p = E.puertas[i]; if (!p || p.bloqueada) return;
  emit('puerta', i, !p.abierta);
}
function usarPuerta(p) {
  if (p.bloqueada) { sonidoBloqueo(); aviso(p.nombre.includes('Bahia') ? 'La compuerta de la bahía no se puede abrir: afuera está el vacío del espacio.' : 'Esta puerta está bloqueada.'); return; }
  if (HOST()) accion(MY(), p.i); else Net.send({ t: 'act', id: p.i });
}

// ---------------- otros jugadores ----------------
const OTROS = new Map();   // slot -> { a, pos, yaw, net, tag }
function tagSprite(text) {
  const tex = G.canvasTex(256, 64, (x) => { x.font = 'bold 30px Segoe UI, Arial'; x.textAlign = 'center'; x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillText(text, 129, 42); x.fillStyle = '#e8f6ff'; x.fillText(text, 128, 40); });
  const s = G.sprite(tex, 0xffffff, 0.9, false, true); s.scale.set(1.6, 0.4, 1); s.position.y = 2.15; return s;
}
function otro(slot) {
  let o = OTROS.get(slot);
  if (!o) {
    const a = G.makeAstronaut(false); scene.add(a.root);
    o = { a, pos: new T.Vector3(), yaw: 0, net: null, tag: null, nombre: '' };
    OTROS.set(slot, o);
  }
  const nombre = Net.nameOf(slot) || 'Jugador';
  if (o.nombre !== nombre) { if (o.tag) o.a.root.remove(o.tag); o.tag = tagSprite(nombre); o.a.root.add(o.tag); o.nombre = nombre; }
  return o;
}
function quitarOtro(slot) { const o = OTROS.get(slot); if (o) { scene.remove(o.a.root); OTROS.delete(slot); } }
function actualizarOtros(dt) {
  OTROS.forEach((o) => {
    const d = o.net; if (!d) return;
    o.pos.x += (d.x - o.pos.x) * Math.min(1, dt * 12); o.pos.y += (d.y - o.pos.y) * Math.min(1, dt * 12); o.pos.z += (d.z - o.pos.z) * Math.min(1, dt * 12);
    o.yaw += G.angDiff(o.yaw, d.yaw) * Math.min(1, dt * 12);
    o.a.root.position.copy(o.pos); o.a.root.rotation.y = o.yaw;
    G.poseAstronaut(o.a, d.anim || 'idle', dt);
  });
}
function listaJugadores() {
  const filas = Net.on ? Net.players.slice().sort((a, b) => a.slot - b.slot) : [{ slot: 0, name: Net.myName || 'Tú' }];
  el.plist.innerHTML = filas.map((p) => `<div class="pl">${p.slot === MY() ? '▶' : '·'} ${p.name}${p.slot === 0 && Net.on ? ' <em>(anfitrión)</em>' : ''}</div>`).join('');
}

// ---------------- red ----------------
Net.h.lobby = () => {
  renderLobby(); listaJugadores();
  const slots = Net.players.map((p) => p.slot);
  [...OTROS.keys()].forEach((s) => { if (!slots.includes(s)) quitarOtro(s); else otro(s); });
};
Net.h.start = () => { setTimeout(startGame, 300); };
Net.h.joined = (c, slot) => { Net.sendTo(c, { t: 'ev', n: 'estado', a: [E.puertas.map((p) => (p.abierta ? 1 : 0))] }); aviso((Net.nameOf(slot) || 'Alguien') + ' entró a la estación.'); };
Net.h.ev = (n, a) => { if (EV[n]) EV[n](...a); };
Net.h.ps = (list) => list.forEach((d) => {
  if (d.s === MY()) return;
  const o = otro(d.s); if (!o.net) { o.pos.set(d.x, d.y, d.z); o.yaw = d.yaw; }
  o.net = d; if (HOST()) o.relay = d;   // el anfitrión lo reenvía a los demás
});
Net.h.act = (slot, id) => accion(slot, id);
Net.h.left = (slot, name) => { quitarOtro(slot); if (S.phase === 'play') aviso((name || 'Alguien') + ' salió de la partida.'); };
Net.h.lost = () => { el.end.style.display = 'flex'; el.endText.textContent = 'Se perdió la conexión con quien creó la partida. Recarga la página y crea o únete a una partida nueva.'; S.phase = 'end'; document.exitPointerLock && document.exitPointerLock(); };
function netTick(dt) {
  if (!Net.on || !Net.started) return;
  S.netT -= dt; if (S.netT > 0) return; S.netT = 1 / 15;
  const anim = S.moving ? (S.running ? 'run' : 'walk') : 'idle';
  const me = { t: 'p', s: MY(), x: +S.pos.x.toFixed(2), y: +S.pos.y.toFixed(2), z: +S.pos.z.toFixed(2), yaw: +S.yaw.toFixed(3), anim };
  if (!Net.isHost) { Net.send(me); return; }
  const list = [me]; OTROS.forEach((o) => { if (o.relay) list.push(o.relay); });
  Net.broadcast({ t: 'ps', l: list });
}

// ---------------- bucle principal ----------------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  tick(dt);
  G.renderer.render(scene, camera);
}
function tick(dt) {
  S.time += dt;
  if (S.phase === 'play') {
    moverJugador(dt);
    if (just.KeyF) { S.flash = !S.flash; linterna.intensity = S.flash ? 1.6 : 0; }
    S.mirada = puertaMirada();
    prompt(S.mirada ? textoPuerta(S.mirada) : '');
    if (just.KeyE && S.mirada) usarPuerta(S.mirada);
    const z = E.zonaEn(S.pos.x, S.pos.z); if (z !== S.zona) { S.zona = z; el.zona.textContent = z; el.zona.style.opacity = z ? 1 : 0; }
    el.pausa.style.display = document.pointerLockElement ? 'none' : 'block';
  }
  if (S.phase === 'play') actualizarCamara(dt);
  else { const k = S.time * 0.05; camera.position.set(15.5, 3.2, -3.5 + Math.sin(k) * 6); camera.rotation.set(-0.12, Math.PI / 2 + Math.sin(k * 0.7) * 0.35, 0); }   // vista del menú
  E.actualizarPuertas(dt); E.actualizarLuces(camera.position); actualizarOtros(dt); netTick(dt);
  if (S.avisoT > 0) { S.avisoT -= dt; if (S.avisoT <= 0) el.aviso.style.opacity = 0; }
  if (G.DEBUG) el.debug.textContent = `pos ${S.pos.x.toFixed(1)}, ${S.pos.y.toFixed(2)}, ${S.pos.z.toFixed(1)} · suelo ${S.ground ? 'sí' : 'no'} · ${Net.on ? (Net.isHost ? 'anfitrión' : 'invitado ' + Net.mySlot) : 'solo'}`;
  for (const k in just) delete just[k];
}
// para pruebas: avanza el juego N segundos sin esperar (aunque la pestaña esté oculta)
function avanzar(seg) { for (let i = 0; i < seg * 60; i++) tick(1 / 60); G.renderer.render(scene, camera); return S.pos.toArray().map((v) => +v.toFixed(2)); }

// ---------------- entrada ----------------
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!e.repeat) just[e.code] = true; keys[e.code] = true;
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('mousemove', (e) => {
  if (S.phase !== 'play' || document.pointerLockElement !== G.renderer.domElement) return;
  S.yaw -= e.movementX * CFG.sens; S.pitch = clamp(S.pitch - e.movementY * CFG.sens, -1.45, 1.45);
});
G.renderer.domElement.addEventListener('mousedown', () => { if (S.phase === 'play') lockPointer(); });
el.pausa.addEventListener('mousedown', () => { if (S.phase === 'play') lockPointer(); });

// ---------------- menú: solo, crear partida, unirse ----------------
function playerName() { const n = (el.name.value || '').trim().slice(0, 14); try { localStorage.setItem('ek4-name', n); } catch (e) { /* sin almacenamiento */ } return n || 'Jugador'; }
try { el.name.value = localStorage.getItem('ek4-name') || localStorage.getItem('po-name') || ''; } catch (e) { /* sin almacenamiento */ }
const botones = (on) => { el.btnSolo.disabled = el.btnCreate.disabled = el.btnJoin.disabled = !on; };
function startGame() {
  if (S.phase === 'play') return;
  el.title.style.display = 'none'; el.hud.style.display = 'block';
  if (!Net.on) Net.myName = playerName();
  spawn(); S.phase = 'play'; listaJugadores();
  el.codigo.innerHTML = Net.on ? `Partida <b>${Net.code}</b>${Net.isHost ? '<br><span>tus amigos pueden entrar con este código</span>' : ''}` : 'Jugando solo';
  lockPointer();
}
el.btnSolo.onclick = () => { audio(); startGame(); };
el.btnCreate.onclick = async () => {
  audio(); const name = playerName(); el.menuMsg.textContent = 'Creando partida…'; botones(false);
  try { const code = await Net.create(name); el.menu.style.display = 'none'; el.lobby.style.display = 'block'; el.lobbyCode.innerHTML = `Código de la partida<b>${code}</b>Compártelo con tus amigos. Cuando todos marquen "Estoy listo", entran a la estación.<br>Quien llegue tarde entra directo.`; renderLobby(); }
  catch (e) { el.menuMsg.textContent = 'No se pudo crear la partida: ' + (e.message || e.type || e); botones(true); }
};
el.btnJoin.onclick = async () => {
  audio(); const name = playerName(), code = el.code.value.trim().toUpperCase();
  if (code.length !== 4) { el.menuMsg.textContent = 'Escribe el código de 4 letras que te pasó quien creó la partida.'; return; }
  el.menuMsg.textContent = 'Conectando…'; botones(false);
  try { await Net.join(code, name); if (!Net.started) { el.menu.style.display = 'none'; el.lobby.style.display = 'block'; el.lobbyCode.innerHTML = `Conectado a la partida<b>${code}</b>Marca "Estoy listo" cuando quieras entrar.`; renderLobby(); } }
  catch (e) { el.menuMsg.textContent = e.message || 'No se pudo conectar.'; botones(true); }
};
let listo = false;
el.btnReady.onclick = () => { audio(); listo = !listo; el.btnReady.classList.toggle('on', listo); el.btnReady.textContent = listo ? '✔ Listo (clic para cancelar)' : 'Estoy listo'; Net.setReady(listo); };
function renderLobby() {
  if (S.phase !== 'title') return;
  el.lobbyList.innerHTML = Net.players.slice().sort((a, b) => a.slot - b.slot).map((p) =>
    `<div class="lp ${p.ready ? 'ok' : ''}"><span>${p.name}${p.slot === Net.mySlot ? ' (tú)' : ''}${p.slot === 0 ? ' · anfitrión' : ''}</span><span>${p.ready ? '✔ listo' : '…'}</span></div>`).join('');
  const n = Net.players.length, r = Net.players.filter((p) => p.ready).length;
  el.lobbyMsg.textContent = Net.started ? '¡Entrando!' : `${r} de ${n} listos.`;
}

// ---------------- cargar la estación ----------------
el.menuMsg.textContent = 'Cargando la estación… 0%';
E.cargar((f) => { el.menuMsg.textContent = `Cargando la estación… ${Math.round(f * 100)}%`; el.barra.style.width = (f * 100).toFixed(0) + '%'; })
  .then(() => {
    camera.position.set(15.5, 3.2, -3.5); camera.rotation.set(-0.12, Math.PI / 2, 0);
    G.renderer.compile(scene, camera);
    botones(true); el.menuMsg.textContent = ''; el.barra.parentNode.style.display = 'none';
    requestAnimationFrame(loop);
  })
  .catch((e) => {
    console.error(e);
    el.menuMsg.innerHTML = 'No se pudo cargar la estación: ' + (e.message || e) +
      '<br><small>Ábrelo con el servidor local (abrir.bat o python -m http.server), no con doble clic en index.html.</small>';
  });
if (G.DEBUG) el.debug.style.display = 'block';
window.__est = { S, E, CFG, keys, just, Net, OTROS, spawn, avanzar };
})(window.G);
