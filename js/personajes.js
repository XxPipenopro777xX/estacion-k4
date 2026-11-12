/* =====================================================================
   PERSONAJES: astronautas (mismo traje para todos) y haz de luz.
   Copiado del prototipo v2 (apertura-v2/js/personajes.js), sin la criatura.
   ===================================================================== */
(function (G) {
'use strict';
const T = G.T, clamp = G.clamp, lerp = G.lerp;

// ---------------- haz de luz visible en la niebla ----------------
let beamTex = null;
G.makeBeam = (len, rad, op) => {
  if (!beamTex) beamTex = G.canvasTex(8, 128, (x) => { const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 8, 128); });
  const g = new T.CylinderGeometry(0.04, rad, len, 24, 1, true); g.translate(0, -len / 2, 0); g.rotateX(Math.PI / 2);
  const m = new T.Mesh(g, new T.MeshBasicMaterial({ map: beamTex, color: 0xfff1d8, transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
  m.frustumCulled = false; return m;
};

// ---------------- astronauta ----------------
let MAT = null;
function mats() {
  if (MAT) return MAT;
  const tex = G.canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#dcd7cc'; x.fillRect(0, 0, w, h);
    G.noiseFill(x, w, h, 1800, () => `rgba(${G.rnd(150, 200) | 0},${G.rnd(145, 195) | 0},${G.rnd(135, 185) | 0},0.35)`);
    x.strokeStyle = 'rgba(90,88,82,0.55)'; x.lineWidth = 2; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(0, i * 24 + 6); x.lineTo(w, i * 24 + 6); x.stroke(); }
    x.fillStyle = 'rgba(70,65,60,0.25)'; for (let i = 0; i < 18; i++) x.fillRect(G.rnd(0, w), G.rnd(0, h), G.rnd(4, 14), G.rnd(2, 8));
  }, true);
  MAT = {
    suit: new T.MeshLambertMaterial({ color: 0xe8e3d8, map: tex }), dark: new T.MeshLambertMaterial({ color: 0x31363b }),
    orange: new T.MeshLambertMaterial({ color: 0xc8692a }), metal: new T.MeshLambertMaterial({ color: 0x8b9298 }),
    visor: new T.MeshPhongMaterial({ color: 0x0c1218, specular: 0xb8d0e8, shininess: 110 }),
    glow: new T.MeshBasicMaterial({ color: 0x7fe9ff }), lamp: new T.MeshBasicMaterial({ color: 0xfff4d8 }),
  };
  return MAT;
}
G.makeAstronaut = function (withLamp) {
  const M = mats(), a = { root: new T.Group() };
  const hips = a.hips = new T.Group(); hips.position.y = 0.98; a.root.add(hips);
  G.mesh(new T.CylinderGeometry(0.2, 0.17, 0.22, 12), M.suit, hips, 0, 0, 0);
  G.mesh(new T.TorusGeometry(0.19, 0.035, 6, 16), M.dark, hips, 0, 0.09, 0, Math.PI / 2);
  const torso = a.torso = new T.Group(); torso.position.y = 0.1; hips.add(torso);
  G.mesh(new T.CylinderGeometry(0.25, 0.2, 0.52, 14), M.suit, torso, 0, 0.27, 0);
  G.mesh(new T.SphereGeometry(0.25, 14, 8, 0, 6.28, 0, 1.4), M.suit, torso, 0, 0.5, 0);
  G.box(0.32, 0.24, 0.07, M.dark, torso, 0, 0.36, -0.22); G.box(0.2, 0.03, 0.02, M.glow, torso, 0, 0.42, -0.26);
  for (let i = 0; i < 3; i++) G.box(0.035, 0.035, 0.02, i === 1 ? M.orange : M.metal, torso, -0.08 + i * 0.08, 0.32, -0.26);
  G.mesh(new T.TorusGeometry(0.17, 0.045, 8, 18), M.metal, torso, 0, 0.62, 0, Math.PI / 2);
  // mochila de soporte vital
  G.box(0.42, 0.56, 0.2, M.suit, torso, 0, 0.32, 0.26); [-1, 1].forEach((s) => G.mesh(new T.CylinderGeometry(0.07, 0.07, 0.5, 10), M.metal, torso, s * 0.13, 0.32, 0.4));
  G.box(0.03, 0.25, 0.03, M.dark, torso, 0.17, 0.72, 0.3);
  // casco con visor
  const head = a.head = new T.Group(); head.position.y = 0.78; torso.add(head);
  G.mesh(new T.SphereGeometry(0.21, 18, 14), M.suit, head);
  G.mesh(new T.SphereGeometry(0.195, 18, 12, Math.PI * 1.17, Math.PI * 0.66, Math.PI * 0.27, Math.PI * 0.42), M.visor, head, 0, 0, -0.025);
  G.box(0.06, 0.06, 0.12, M.dark, head, 0.19, 0.04, -0.04); const lampM = G.mesh(new T.CircleGeometry(0.025, 10), M.lamp, head, 0.19, 0.04, -0.105, 0, Math.PI, 0);
  G.box(0.24, 0.025, 0.05, M.orange, head, 0, 0.19, 0.02);
  // brazos y piernas con articulaciones
  const limb = (parent, x, y, z, l1, l2, r1, r2, endGeo) => {
    const up = new T.Group(); up.position.set(x, y, z); parent.add(up);
    G.mesh(new T.CylinderGeometry(r1, r1 * 0.9, l1, 10), M.suit, up, 0, -l1 / 2, 0); G.mesh(new T.SphereGeometry(r1 * 1.05, 10, 8), M.suit, up);
    const lo = new T.Group(); lo.position.y = -l1; up.add(lo);
    G.mesh(new T.SphereGeometry(r2 * 1.08, 10, 8), M.suit, lo); G.mesh(new T.CylinderGeometry(r2, r2 * 0.88, l2, 10), M.suit, lo, 0, -l2 / 2, 0);
    G.mesh(new T.TorusGeometry(r2 * 0.95, 0.018, 6, 14), M.orange, lo, 0, -l2 * 0.75, 0, Math.PI / 2);
    endGeo(lo, l2); return { up, lo };
  };
  const arm = (s) => limb(torso, s * 0.31, 0.48, 0, 0.3, 0.29, 0.075, 0.068, (lo, l) => G.mesh(new T.SphereGeometry(0.065, 10, 8), M.dark, lo, 0, -l - 0.04, 0).scale.set(1, 1.2, 0.8));
  const leg = (s) => limb(hips, s * 0.11, -0.04, 0, 0.42, 0.42, 0.095, 0.085, (lo, l) => G.box(0.15, 0.13, 0.28, M.dark, lo, 0, -l - 0.04, -0.05));
  const aL = arm(-1), aR = arm(1), lL = leg(-1), lR = leg(1);
  Object.assign(a, { shL: aL.up, elL: aL.lo, shR: aR.up, elR: aR.lo, hipL: lL.up, knL: lL.lo, hipR: lR.up, knR: lR.lo });
  if (withLamp) {
    const sp = new T.SpotLight(0xfff0d0, 1.5, 26, 0.5, 0.6, 1.4); sp.position.set(0.19, 0.04, -0.1); head.add(sp);
    sp.target.position.set(0.19, -0.6, -6); head.add(sp.target); a.light = sp;
    const beam = G.makeBeam(9, 2.4, 0.05); beam.position.set(0.19, 0.04, -0.1); beam.rotation.x = -0.1; head.add(beam); a.beam = beam;
  }
  a.ph = Math.random() * 6;
  return a;
};
// poses: 'idle', 'walk', 'run', 'sit', 'slump'
G.poseAstronaut = function (a, mode, dt, speed) {
  a.ph += dt * (mode === 'run' ? 11 : mode === 'walk' ? 7 : 1.2);
  const s = Math.sin(a.ph), c = Math.cos(a.ph);
  let hip = 0, knee = 0.08, arm = 0, elb = -0.15, lean = 0, bob = 0, hy = 0.98, head = 0;
  if (mode === 'walk') { hip = 0.45; knee = 0.6; arm = 0.35; elb = -0.35; bob = 0.03; lean = -0.05; }
  if (mode === 'run') { hip = 0.85; knee = 1.25; arm = 0.8; elb = -1.25; bob = 0.06; lean = -0.28; }
  if (mode === 'walk' || mode === 'run') {
    a.hipL.rotation.x = s * hip; a.hipR.rotation.x = -s * hip;
    a.knL.rotation.x = -0.1 - Math.max(0, -s) * knee; a.knR.rotation.x = -0.1 - Math.max(0, s) * knee;
    a.shL.rotation.x = -s * arm; a.shR.rotation.x = s * arm; a.elL.rotation.x = elb; a.elR.rotation.x = elb;
    a.hips.position.y = hy + Math.abs(c) * bob; a.torso.rotation.x = lean; a.head.rotation.x = -lean * 0.6;
    a.shL.rotation.z = 0.08; a.shR.rotation.z = -0.08;
  } else if (mode === 'sit' || mode === 'slump') {
    a.hips.position.y = 0.62; a.hipL.rotation.x = a.hipR.rotation.x = 1.45; a.knL.rotation.x = a.knR.rotation.x = -1.45;
    a.shL.rotation.x = a.shR.rotation.x = 0.55; a.elL.rotation.x = a.elR.rotation.x = -0.95; a.shL.rotation.z = 0.15; a.shR.rotation.z = -0.15;
    a.torso.rotation.x = mode === 'slump' ? -0.35 : 0.12 + Math.sin(a.ph) * 0.01; a.head.rotation.x = mode === 'slump' ? -0.5 : 0;
    a.head.rotation.y = 0;
  } else {
    a.hipL.rotation.x = a.hipR.rotation.x = 0; a.knL.rotation.x = a.knR.rotation.x = -0.05; a.hips.position.y = hy;
    a.shL.rotation.x = a.shR.rotation.x = 0.05; a.elL.rotation.x = a.elR.rotation.x = -0.2; a.shL.rotation.z = 0.12; a.shR.rotation.z = -0.12;
    a.torso.rotation.x = Math.sin(a.ph) * 0.02; a.head.rotation.x = -0.05 + Math.sin(a.ph * 0.7) * 0.04; a.head.rotation.y = Math.sin(a.ph * 0.31) * 0.35;
  }
};

})(window.G);
