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

// ---------------- color: "AgX", el mismo ajuste de color que usa Blender ----------------
// (three r128 no lo trae; es la versión de three.js r160 puesta como "CustomToneMapping")
T.ShaderChunk.tonemapping_pars_fragment = T.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }', `
const mat3 AGX_SRGB_A_2020 = mat3( vec3( 0.6274, 0.0691, 0.0164 ), vec3( 0.3293, 0.9195, 0.0880 ), vec3( 0.0433, 0.0113, 0.8956 ) );
const mat3 AGX_2020_A_SRGB = mat3( vec3( 1.6605, - 0.1246, - 0.0182 ), vec3( - 0.5876, 1.1329, - 0.1006 ), vec3( - 0.0728, - 0.0083, 1.1187 ) );
vec3 agxContraste( vec3 x ) {
  vec3 x2 = x * x; vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 CustomToneMapping( vec3 color ) {
  const mat3 inset = mat3( vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ), vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ), vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 ) );
  const mat3 outset = mat3( vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ), vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ), vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 ) );
  const float minEv = - 12.47393; const float maxEv = 4.026069;
  color *= toneMappingExposure;
  color = inset * ( AGX_SRGB_A_2020 * color );
  color = clamp( ( log2( max( color, 1e-10 ) ) - minEv ) / ( maxEv - minEv ), 0.0, 1.0 );
  color = outset * agxContraste( color );
  color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
  return clamp( AGX_2020_A_SRGB * color, 0.0, 1.0 );
}`);

// ---------------- motor 3D ----------------
const renderer = G.renderer = new T.WebGLRenderer({ antialias: !G.LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, G.LOW ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x05070a);
renderer.outputEncoding = T.sRGBEncoding;          // las texturas del .glb vienen en sRGB
renderer.toneMapping = T.CustomToneMapping;   // AgX (arriba)
renderer.toneMappingExposure = Number(Q.get('exposicion')) || 1;
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
