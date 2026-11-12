/* =====================================================================
   ESTACIÓN: carga el mapa hecho en Blender (modelos/estacion.glb) y sus
   datos (modelos/estacion_datos.json: colisiones, puertas, luces, inicio).
   Ambos archivos los genera el script de Blender:
     blender -b --python estacion/run.py -- --web
   Aquí también viven: las luces (un grupo pequeño que sigue al jugador),
   las puertas que se deslizan y la lista de cajas de colisión.
   ===================================================================== */
(function (G) {
'use strict';
const T = G.T;
const E = G.Est = {
  ready: false, datos: null, cajas: [], puertas: [], luces: [], pool: [],
};

// ---------------- zonas (para mostrar dónde estás) ----------------
// rectángulos en el plano x/z (coordenadas de three.js); el primero que contiene al jugador gana
const ZONAS = [
  ['Bahía de carga del hangar', -16, 17, -28, 28],
  ['Pasillo de enlace', 17, 30, -5, -2],
  ['Sala de control', 17, 30, -18, -5],
  ['Bodega de carga', 17, 30, -2, 18],
  ['Núcleo del reactor', 33, 57, -15, 15],
  ['Anillo de pasillos', 30, 60, -18, 18],
  ['Comedor', 30, 45, -28, -18],
  ['Dormitorios', 45, 60, -28, -18],
  ['Laboratorio', 30, 46, 18, 28],
  ['Enfermería', 46, 60, 18, 28],
  ['Esclusa EVA', 60, 66, -2, 2],
];
E.zonaEn = (x, z) => { const r = ZONAS.find((q) => x >= q[1] && x <= q[2] && z >= q[3] && z <= q[4]); return r ? r[0] : ''; };

// ---------------- carga ----------------
E.cargar = (progreso) => Promise.all([
  fetch('modelos/estacion_datos.json').then((r) => { if (!r.ok) throw new Error('No se encontró estacion_datos.json'); return r.json(); }),
  new Promise((resolve, reject) => new T.GLTFLoader().load('modelos/estacion.glb', resolve,
    (e) => { if (e.total) progreso(e.loaded / e.total); }, reject)),
]).then(([datos, gltf]) => { montar(datos, gltf); return E; });

function montar(datos, gltf) {
  E.datos = datos;
  const raiz = gltf.scene; G.scene.add(raiz);
  // materiales: sin mapa de reflejos, el metal puro se ve negro; se baja el "metalness"
  const vistos = new Set();
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    o.matrixAutoUpdate = o.name.startsWith('Puerta_') || o.name.startsWith('Costilla');
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      if (vistos.has(m)) return; vistos.add(m);
      m.metalness = Math.min(m.metalness, 0.35);
      m.roughness = Math.max(m.roughness, 0.45);
      if (m.map) m.map.anisotropy = G.renderer.capabilities.getMaxAnisotropy();
      if (m.emissiveMap || (m.emissive && m.emissive.getHex() !== 0)) m.emissiveIntensity = 1.6;
      if (m.transparent) m.depthWrite = false;
    });
  });
  raiz.updateMatrixWorld(true);

  // cajas de colisión fijas
  E.cajas = datos.colisiones.map((b) => ({ x0: b[0], y0: b[1], z0: b[2], x1: b[3], y1: b[4], z1: b[5] }));

  // puertas: nodo del .glb con el mismo nombre que en los datos
  E.puertas = datos.puertas.map((p, i) => {
    const nodo = raiz.getObjectByName(p.nombre);
    const b = p.caja;
    return {
      i, nombre: p.nombre, nodo, base: nodo ? nodo.position.clone() : new T.Vector3(),
      eje: p.eje, dist: p.dist, bloqueada: !!p.bloqueada, zona: p.zona,
      caja: { x0: b[0], y0: b[1], z0: b[2], x1: b[3], y1: b[4], z1: b[5] },
      centro: new T.Vector3((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2),
      abierta: false, t: 0,   // t: 0 cerrada ... 1 abierta (animación)
    };
  });

  // luces: la estación tiene ~70; three.js solo puede con unas pocas a la vez,
  // así que un grupo pequeño se mueve a las luces más cercanas al jugador
  E.luces = datos.luces.map((l) => {
    const grande = l.w >= 600;
    return {
      p: new T.Vector3(l.p[0], l.p[1], l.p[2]), c: new T.Color(l.c[0], l.c[1], l.c[2]),
      fuerza: grande ? 2.2 : G.clamp(l.w / 110, 0.6, 1.6), alcance: grande ? 34 : G.clamp(7 + Math.sqrt(l.w) * 0.7, 9, 18),
    };
  });
  const N = G.LOW ? 5 : 9;
  for (let i = 0; i < N; i++) { const pl = new T.PointLight(0xffffff, 0, 10, 1); G.scene.add(pl); E.pool.push(pl); }
  G.scene.add(new T.HemisphereLight(0xb8c8d8, 0x2a2824, 0.75));
  G.scene.add(new T.AmbientLight(0x404650, 0.35));
  E.ready = true;
}

// ---------------- luces: grupo que sigue al jugador ----------------
const _orden = [];
E.actualizarLuces = (pos) => {
  _orden.length = 0;
  E.luces.forEach((l) => { _orden.push({ l, d: l.p.distanceTo(pos) - l.alcance * 0.35 }); });
  _orden.sort((a, b) => a.d - b.d);
  const N = E.pool.length, corte = _orden[N] ? _orden[N].d : 1e9;
  E.pool.forEach((pl, k) => {
    const o = _orden[k]; if (!o) { pl.intensity = 0; return; }
    // la última luz del grupo se apaga suave antes de saltar a otro lugar (sin parpadeos)
    const f = G.clamp((corte - o.d) / 4, 0, 1);
    pl.position.copy(o.l.p); pl.color.copy(o.l.c); pl.distance = o.l.alcance; pl.intensity = o.l.fuerza * f;
  });
};

// ---------------- puertas ----------------
E.offsetPuerta = (p) => {
  const s = G.smooth(p.t) * p.dist;
  return p.eje === 'x' ? [s, 0, 0] : p.eje === 'z' ? [0, 0, s] : [0, s, 0];
};
E.actualizarPuertas = (dt) => {
  E.puertas.forEach((p) => {
    const objetivo = p.abierta ? 1 : 0;
    if (p.t === objetivo) return;
    p.t = objetivo > p.t ? Math.min(1, p.t + dt / 0.7) : Math.max(0, p.t - dt / 0.7);
    if (p.nodo) { const o = E.offsetPuerta(p); p.nodo.position.set(p.base.x + o[0], p.base.y + o[1], p.base.z + o[2]); }
  });
};
// caja de colisión actual de una puerta (se mueve con ella; abierta deja pasar)
E.cajaPuerta = (p) => {
  if (p.t > 0.85) return null;
  const o = E.offsetPuerta(p), c = p.caja;
  return { x0: c.x0 + o[0], y0: c.y0 + o[1], z0: c.z0 + o[2], x1: c.x1 + o[0], y1: c.y1 + o[1], z1: c.z1 + o[2] };
};
})(window.G);
