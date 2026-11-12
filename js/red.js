/* =====================================================================
   RED: multijugador simple entre navegadores (hasta 8 jugadores).
   Basado en el del prototipo v2, con un cambio: aquí se puede entrar
   a una partida que ya empezó (es solo para explorar).
   - Uno "crea la partida" (anfitrión) y recibe un código de 4 letras.
   - Los demás se unen con ese código. La conexión es directa entre PCs;
     PeerJS (servicio público gratuito) solo los ayuda a encontrarse.
   - El anfitrión manda: decide qué puertas están abiertas y avisa a todos.
   - Los nombres y posiciones viajan solo entre los jugadores.
   ===================================================================== */
(function (G) {
'use strict';
const PREFIX = 'estacion-k4-';
const MAX = 8;
const Net = G.Net = {
  on: false, isHost: false, peer: null, conn: null, conns: new Map(), players: [], mySlot: 0, myName: '', code: '', started: false,
  h: {},   // funciones del juego que reaccionan a mensajes: lobby, start, joined, ev, ps, act, left, lost
};
const PeerClass = () => window.Peer || (window.peerjs && window.peerjs.Peer);
const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const genCode = () => Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
const call = (name, ...a) => { if (Net.h[name]) Net.h[name](...a); };

// ---------- anfitrión ----------
Net.create = (name) => new Promise((resolve, reject) => {
  const P = PeerClass(); if (!P) { reject(new Error('No se cargó la librería de conexión.')); return; }
  const tryOpen = (attempt) => {
    Net.code = genCode();
    const peer = new P(PREFIX + Net.code);
    peer.on('open', () => {
      Object.assign(Net, { on: true, isHost: true, peer, myName: name, mySlot: 0, players: [{ id: 'host', name, slot: 0, ready: false }] });
      resolve(Net.code); call('lobby');
    });
    peer.on('error', (e) => { if (e.type === 'unavailable-id' && attempt < 5) { peer.destroy(); tryOpen(attempt + 1); } else if (!Net.on) reject(e); });
    peer.on('connection', (c) => hostAccept(c));
  };
  tryOpen(0);
});
function hostAccept(c) {
  c.on('data', (d) => hostRecv(c, d));
  c.on('close', () => {
    const p = Net.players.find((x) => x.id === c.peer); Net.conns.delete(c.peer);
    if (p) { Net.players = Net.players.filter((x) => x !== p); broadcastLobby(); call('left', p.slot, p.name); }
  });
}
function hostRecv(c, d) {
  if (d.t === 'hello') {
    const used = Net.players.map((p) => p.slot);
    const free = Array.from({ length: MAX - 1 }, (_, i) => i + 1).find((s) => !used.includes(s));
    if (free === undefined) { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); return; }
    Net.conns.set(c.peer, c); Net.players.push({ id: c.peer, name: String(d.name || 'Jugador').slice(0, 14), slot: free, ready: Net.started });
    c.send({ t: 'welcome', slot: free, code: Net.code }); broadcastLobby();
    // partida ya empezada: entra directo y recibe el estado actual (puertas)
    if (Net.started) { c.send({ t: 'start', players: Net.players }); call('joined', c, free); }
    return;
  }
  const p = Net.players.find((x) => x.id === c.peer); if (!p) return;
  if (d.t === 'ready') { p.ready = !!d.v; broadcastLobby(); checkStart(); }
  else if (d.t === 'p') { d.s = p.slot; call('ps', [d]); }                 // estado de un jugador (se reenvía en el paquete del anfitrión)
  else if (d.t === 'act') call('act', p.slot, d.id);
}
function broadcastLobby() { Net.broadcast({ t: 'lobby', players: Net.players }); call('lobby'); }
function checkStart() {
  if (Net.started || !Net.players.length || !Net.players.every((p) => p.ready)) return;
  Net.started = true; const msg = { t: 'start', players: Net.players };
  Net.broadcast(msg); call('start', msg);
}
Net.broadcast = (msg) => { if (!Net.isHost) return; Net.conns.forEach((c) => { if (c.open) c.send(msg); }); };
Net.sendTo = (c, msg) => { if (c && c.open) c.send(msg); };

// ---------- jugador que se une ----------
Net.join = (code, name) => new Promise((resolve, reject) => {
  const P = PeerClass(); if (!P) { reject(new Error('No se cargó la librería de conexión.')); return; }
  code = String(code || '').trim().toUpperCase();
  const peer = new P(); let done = false;
  const fail = (m) => { if (!done) { done = true; reject(new Error(m)); try { peer.destroy(); } catch (e) { /* nada */ } } };
  setTimeout(() => fail('No se encontró la partida (¿el código está bien? ¿el anfitrión sigue conectado?).'), 12000);
  peer.on('error', (e) => fail(e.type === 'peer-unavailable' ? 'No existe una partida con ese código.' : 'Error de conexión: ' + e.type));
  peer.on('open', () => {
    const c = peer.connect(PREFIX + code, { reliable: true });
    c.on('open', () => c.send({ t: 'hello', name }));
    c.on('data', (d) => {
      if (d.t === 'welcome') { done = true; Object.assign(Net, { on: true, isHost: false, peer, conn: c, mySlot: d.slot, myName: name, code }); resolve(d.slot); return; }
      if (d.t === 'full') { fail('La partida está llena (máximo ' + MAX + ').'); return; }
      if (d.t === 'lobby') { Net.players = d.players; call('lobby'); }
      else if (d.t === 'start') { if (Net.started) return; Net.started = true; Net.players = d.players; call('start', d); }
      else if (d.t === 'ev') call('ev', d.n, d.a);
      else if (d.t === 'ps') call('ps', d.l);
    });
    c.on('close', () => { if (Net.on) call('lost'); });
  });
});

// ---------- envío ----------
Net.send = (msg) => { if (Net.on && !Net.isHost && Net.conn && Net.conn.open) Net.conn.send(msg); };
Net.setReady = (v) => {
  if (Net.isHost) { const me = Net.players.find((p) => p.slot === 0); if (me) me.ready = v; broadcastLobby(); checkStart(); }
  else Net.send({ t: 'ready', v });
};
Net.nameOf = (slot) => { const p = Net.players.find((x) => x.slot === slot); return p ? p.name : null; };
})(window.G);
