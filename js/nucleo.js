/* =====================================================================
   NÚCLEO: utilidades y motor 3D. Todo lo compartido vive en el objeto G.
   Orden de carga: nucleo -> personajes -> red -> estacion -> juego
   (versión reducida del núcleo del prototipo v2)
   ===================================================================== */
window.G = {};
(function (G) {
'use strict';
const T = THREE; G.T = T;
const Q = new URLSearchParams(location.search);
G.DEBUG = Q.has('debug');
G.LOW = Q.get('calidad') === 'baja';

// ---------------- utilidades ----------------
G.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
G.lerp = (a, b, t) => a + (b - a) * t;
G.smooth = (t) => t * t * (3 - 2 * t);
G.rnd = (a, b) => a + Math.random() * (b - a);
G.angDiff = (a, b) => ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

// ---------------- geometría ----------------
G.mesh = (g, m, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const o = new T.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); if (parent) parent.add(o); return o;
};
G.box = (w, h, d, m, parent, x, y, z, rx, ry, rz) => G.mesh(new T.BoxGeometry(w, h, d), m, parent, x, y, z, rx, ry, rz);

// ---------------- texturas por código ----------------
G.canvasTex = (w, h, draw, repeat) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
  t.anisotropy = 4; return t;
};
G.noiseFill = (x, w, h, n, colorFn) => { for (let i = 0; i < n; i++) { x.fillStyle = colorFn(); const s = G.rnd(1, 3.5); x.fillRect(G.rnd(0, w), G.rnd(0, h), s, s); } };
G.sprite = (tex, color, opacity, additive, fog) => new T.Sprite(new T.SpriteMaterial({
  map: tex, color: color || 0xffffff, transparent: true, opacity: opacity === undefined ? 1 : opacity, depthWrite: false,
  blending: additive ? T.AdditiveBlending : T.NormalBlending, fog: !!fog,
}));

// ---------------- motor 3D ----------------
const renderer = G.renderer = new T.WebGLRenderer({ antialias: !G.LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, G.LOW ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x05070a);
renderer.outputEncoding = T.sRGBEncoding;          // las texturas del .glb vienen en sRGB
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById('game').appendChild(renderer.domElement);
const scene = G.scene = new T.Scene();
scene.fog = new T.FogExp2(0x05070a, 0.012);
const camera = G.camera = new T.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});
})(window.G);
