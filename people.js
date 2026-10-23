// Jointed low-poly people and city bikes for the beach crowd.
// Rigs are built at height 1 and scaled by the person's height; everything faces +z.
import * as THREE from 'three';

const P = { // proportions as fractions of height
  hipY: 0.53, thigh: 0.245, shin: 0.245, ankle: 0.04,
  shoulderY: 0.815, upper: 0.17, fore: 0.15, headY: 0.925,
};

const matCache = new Map();
const lambert = (hex) => {
  if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
  return matCache.get(hex);
};

// realistic, slightly muted palettes
const SKIN = [0xc99a7c, 0xb98566, 0xa8735a, 0xd9ad8f, 0x8f5f45, 0xe2bba0];
const HAIR = [0x16120f, 0x221a14, 0x2e221a, 0x3d2c20, 0x5a4434, 0x0e0e10];
const TOPS = [0xf2f0ea, 0xe8e2d4, 0x1d2330, 0x23272e, 0x4f6b8a, 0x8c2f33, 0x6f7d6a, 0xc9b08a, 0x3a4f78, 0xd8d3c8, 0x9aa7b5, 0xb85c4a, 0x2f3b2e, 0xe0a83c];
const BOTTOMS = [0x1f2430, 0x2a3242, 0x3e4b63, 0x1a1a1c, 0xb9a989, 0x6d655a, 0x4a5568, 0x2c2c30];
const SHOES = [0xf0f0ee, 0x1b1b1d, 0x3a3a3e, 0xd8d0c0, 0x6b4a32];

function lathe(profile, seg = 10) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}
// limb segment hanging down from its joint, tapered, with rounded ends
function limb(r0, r1, len, seg = 7) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, -len / 2, 0);
  return g;
}

const GEO = (() => {
  const torso = lathe([[0, -0.07], [0.07, -0.062], [0.098, -0.03], [0.102, 0.02], [0.092, 0.09], [0.086, 0.14],
    [0.094, 0.2], [0.103, 0.25], [0.1, 0.285], [0.07, 0.3], [0.03, 0.31], [0, 0.312]], 12);
  const neck = limb(0.026, 0.024, 0.05, 6);
  const head = new THREE.SphereGeometry(0.062, 12, 10); head.scale(0.92, 1.12, 1.0);
  const hairShort = new THREE.SphereGeometry(0.066, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58); hairShort.scale(0.95, 1.1, 1.04);
  hairShort.translate(0, 0.008, -0.006);
  const hairLong = new THREE.CapsuleGeometry(0.05, 0.12, 3, 8); hairLong.scale(1.15, 1, 0.55); hairLong.translate(0, -0.06, -0.045);
  const bun = new THREE.SphereGeometry(0.03, 8, 6); bun.translate(0, 0.05, -0.06);
  const cap = new THREE.SphereGeometry(0.068, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5); cap.translate(0, 0.012, 0);
  const brim = new THREE.CylinderGeometry(0.05, 0.05, 0.006, 10, 1, false, -Math.PI / 2, Math.PI); brim.scale(1, 1, 1.3); brim.translate(0, 0.014, 0.05);
  const upper = limb(0.033, 0.027, P.upper);
  const fore = limb(0.026, 0.02, P.fore);
  const hand = new THREE.SphereGeometry(0.02, 6, 5); hand.scale(0.8, 1.4, 0.6); hand.translate(0, -P.fore - 0.022, 0);
  const sleeve = limb(0.037, 0.034, P.upper * 0.45);
  const thigh = limb(0.058, 0.04, P.thigh);
  const shin = limb(0.04, 0.026, P.shin);
  const shorts = limb(0.064, 0.055, P.thigh * 0.55);
  const foot = new THREE.BoxGeometry(0.052, 0.035, 0.15, 1, 1, 2); foot.translate(0, -0.022, 0.035);
  const skirt = lathe([[0.1, 0.02], [0.13, -0.14], [0.155, -0.26], [0, -0.26]], 12);
  const pack = new THREE.CapsuleGeometry(0.06, 0.1, 3, 8); pack.scale(1.25, 1, 0.6); pack.translate(0, 0.17, -0.09);
  const phone = new THREE.BoxGeometry(0.04, 0.075, 0.006); phone.translate(0, -P.fore - 0.03, 0.02);
  return { torso, neck, head, hairShort, hairLong, bun, cap, brim, upper, fore, hand, sleeve, thigh, shin, shorts, foot, skirt, pack, phone };
})();

export function makeHuman(rnd, opts = {}) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const female = opts.female ?? rnd() < 0.48;
  const child = !!opts.child;
  const H = opts.height ?? (child ? 1.1 + rnd() * 0.25 : (female ? 1.56 : 1.66) + rnd() * 0.16);
  const skin = lambert(pick(SKIN)), hair = lambert(pick(HAIR));
  const top = lambert(opts.top ?? pick(TOPS)), bottom = lambert(pick(BOTTOMS)), shoe = lambert(pick(SHOES));
  const longSleeve = rnd() < 0.45, shortsOn = !female && rnd() < 0.35, skirtOn = female && rnd() < 0.3;
  const broad = female ? 0.9 + rnd() * 0.12 : 1.0 + rnd() * 0.16;

  const root = new THREE.Group();
  root.scale.setScalar(H);
  const pelvis = new THREE.Group(); pelvis.position.y = P.hipY; root.add(pelvis);
  const torso = new THREE.Mesh(GEO.torso, top);
  torso.scale.set((female ? 1.05 : 1.12) * broad, 1, 0.62);
  pelvis.add(torso);
  // pants cover the hip part of the torso: a short bottom-coloured lathe
  const hipWrap = new THREE.Mesh(GEO.torso, bottom); hipWrap.scale.set(torso.scale.x * 1.015, 0.33, 0.63); hipWrap.position.y = -0.023; pelvis.add(hipWrap);
  if (skirtOn) { const sk = new THREE.Mesh(GEO.skirt, bottom); sk.scale.set(broad, 1, 0.75); pelvis.add(sk); }

  const chest = new THREE.Group(); chest.position.y = 0.0; pelvis.add(chest);
  const neck = new THREE.Group(); neck.position.y = P.shoulderY - P.hipY + 0.012; chest.add(neck);
  neck.add(new THREE.Mesh(GEO.neck, skin));
  const head = new THREE.Group(); head.position.y = P.headY - P.shoulderY - 0.02; neck.add(head);
  head.add(new THREE.Mesh(GEO.head, skin));
  const hs = rnd();
  if (opts.cap || hs < 0.12) { head.add(new THREE.Mesh(GEO.cap, lambert(pick(TOPS)))); head.add(new THREE.Mesh(GEO.brim, lambert(pick(TOPS)))); }
  else {
    head.add(new THREE.Mesh(GEO.hairShort, hair));
    if (female && hs < 0.7) head.add(new THREE.Mesh(GEO.hairLong, hair));
    else if (female) head.add(new THREE.Mesh(GEO.bun, hair));
  }
  if (opts.pack ?? rnd() < 0.18) chest.add(new THREE.Mesh(GEO.pack, lambert(pick([0x1d1f24, 0x3b4a5e, 0x6d3b2f, 0x2f3a2c]))));

  const sw = (female ? 0.098 : 0.108) * broad;
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sw * s, P.shoulderY - P.hipY - 0.012, -0.005); chest.add(sh);
    sh.rotation.z = 0.06 * s;
    sh.add(new THREE.Mesh(GEO.upper, longSleeve ? top : skin));
    if (!longSleeve) sh.add(new THREE.Mesh(GEO.sleeve, top));
    const el = new THREE.Group(); el.position.y = -P.upper; sh.add(el);
    el.add(new THREE.Mesh(GEO.fore, longSleeve ? top : skin));
    el.add(new THREE.Mesh(GEO.hand, skin));
    arms.push({ sh, el });

    const hip = new THREE.Group(); hip.position.set(0.052 * broad * s, -0.035, 0); pelvis.add(hip);
    hip.add(new THREE.Mesh(GEO.thigh, (shortsOn || skirtOn) ? skin : bottom));
    if (shortsOn) hip.add(new THREE.Mesh(GEO.shorts, bottom));
    const knee = new THREE.Group(); knee.position.y = -P.thigh; hip.add(knee);
    knee.add(new THREE.Mesh(GEO.shin, (shortsOn || skirtOn) ? skin : bottom));
    const ankle = new THREE.Group(); ankle.position.y = -P.shin; knee.add(ankle);
    ankle.add(new THREE.Mesh(GEO.foot, shoe));
    legs.push({ hip, knee, ankle });
  }
  if (opts.phone) arms[1].el.add(new THREE.Mesh(GEO.phone, lambert(0x111114)));
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, pelvis, chest, neck, head, arms, legs, H, female, child };
}

const legReach = (t, k) => P.thigh * Math.cos(t) + P.shin * Math.cos(t - k) + P.ankle;

// natural walk / run cycle; phase in radians
export function poseWalk(h, phase, run = 0) {
  const A = 0.38 + run * 0.42, K = 0.75 + run * 0.9;
  let reach = 0;
  for (let s = 0; s < 2; s++) {
    const ph = phase + s * Math.PI;
    const t = A * Math.sin(ph) + run * 0.12;            // + = forward
    const swing = Math.max(0, Math.cos(ph));            // leg moving forward → flexed knee
    const k = 0.06 + K * Math.pow(swing, 1.4) + 0.12 * Math.max(0, Math.sin(ph)) * (1 - run);
    const L = h.legs[s];
    L.hip.rotation.x = -t;
    L.knee.rotation.x = k;
    L.ankle.rotation.x = (t - k) * 0.75 - 0.08 * Math.max(0, -Math.cos(ph));
    reach = Math.max(reach, legReach(t, k));
    const arm = h.arms[s];
    arm.sh.rotation.x = A * 0.75 * Math.sin(ph) * (1 + run * 0.5); // swings opposite its own leg
    arm.el.rotation.x = -(0.22 + 0.18 * Math.max(0, Math.sin(ph)) + run * 1.1);
  }
  h.pelvis.position.y = reach + 0.004;
  h.pelvis.rotation.set(run * 0.18, 0.09 * Math.sin(phase), 0.025 * Math.cos(phase));
  h.chest.rotation.y = -0.14 * Math.sin(phase);
  h.neck.rotation.set(-run * 0.12, 0.05 * Math.sin(phase), 0);
}

// idle poses: 'stand', 'phone', 'look', 'sit', 'hands'
export function poseIdle(h, kind, t, seed) {
  const sway = Math.sin(t * 0.7 + seed * 6) * 0.025;
  for (let s = 0; s < 2; s++) {
    const L = h.legs[s];
    L.hip.rotation.set(s ? -0.05 : 0.04, s ? -0.12 : 0.1, 0);
    L.knee.rotation.x = s ? 0.12 : 0.02;
    L.ankle.rotation.x = s ? -0.06 : -0.02;
    h.arms[s].sh.rotation.set(0.04, 0, (s ? 1 : -1) * 0.07);
    h.arms[s].el.rotation.x = -0.18;
  }
  h.pelvis.position.y = legReach(0.04, 0.02) + 0.004;
  h.pelvis.rotation.set(0, 0, sway * 0.5);
  h.chest.rotation.set(0, 0, -sway * 0.6);
  h.neck.rotation.set(0.05, Math.sin(t * 0.21 + seed * 3) * 0.35, 0);
  if (kind === 'phone') {             // holding up a phone to film the sunset
    const a = h.arms[1]; a.sh.rotation.set(-1.25, 0.25, -0.15); a.el.rotation.x = -1.35;
    const b = h.arms[0]; b.sh.rotation.set(-1.0, -0.35, 0.25); b.el.rotation.x = -1.5;
    h.neck.rotation.set(-0.12, 0, 0);
  } else if (kind === 'hands') {      // hands clasped behind the back
    for (let s = 0; s < 2; s++) { h.arms[s].sh.rotation.set(0.35, 0, (s ? -1 : 1) * 0.1); h.arms[s].el.rotation.x = -0.9; }
    h.arms[0].el.rotation.x = 0.9; h.arms[1].el.rotation.x = 0.9;
  } else if (kind === 'sit') {        // sitting on the sand, knees up, arms around them
    h.pelvis.position.y = 0.075;
    h.pelvis.rotation.x = -0.18;
    for (let s = 0; s < 2; s++) {
      const L = h.legs[s];
      L.hip.rotation.set(-1.15, s ? -0.12 : 0.12, 0); L.knee.rotation.x = 2.0; L.ankle.rotation.x = -0.75;
      h.arms[s].sh.rotation.set(-0.85, 0, (s ? 1 : -1) * 0.2); h.arms[s].el.rotation.x = -0.9;
    }
    h.chest.rotation.x = 0.3;
  }
}

// ---------------------------------------------------------------- city bike
const BIKE = {
  rear: new THREE.Vector3(0, 0.34, -0.43), front: new THREE.Vector3(0, 0.34, 0.6),
  bb: new THREE.Vector3(0, 0.29, 0), seat: new THREE.Vector3(0, 0.93, -0.2),
  headTop: new THREE.Vector3(0, 0.86, 0.43), headBot: new THREE.Vector3(0, 0.7, 0.47),
  bar: new THREE.Vector3(0, 1.0, 0.38), crank: 0.17,
};
function tube(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  return m;
}
function wheel(mat) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.02, 6, 28), lambert(0x141416)); tire.castShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.008, 4, 28), mat);
  const pts = [];
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; pts.push(0, 0, 0, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const spokes = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0x8a8d92, transparent: true, opacity: 0.6 }));
  g.add(tire, rim, spokes);
  g.rotation.y = Math.PI / 2;
  const spin = new THREE.Group(); spin.add(g);
  return spin;
}

export function makeCyclist(rnd) {
  const frameCol = [0x1b1d22, 0xd9d6cf, 0x2d4f7c, 0x8c2a2a, 0x2f5a3f, 0xe0b23a][Math.floor(rnd() * 6)];
  const fm = lambert(frameCol), dark = lambert(0x18191c);
  const bike = new THREE.Group();
  const B = BIKE;
  const wr = wheel(fm), wf = wheel(fm);
  wr.position.copy(B.rear); wf.position.copy(B.front); bike.add(wr, wf);
  const seatStay = new THREE.Vector3(0, 0.86, -0.18);
  for (const s of [-1, 1]) {
    const o = new THREE.Vector3(0.045 * s, 0, 0);
    bike.add(tube(B.bb.clone().add(o), B.rear.clone().add(o), 0.011, fm));
    bike.add(tube(seatStay.clone().add(o), B.rear.clone().add(o), 0.01, fm));
    bike.add(tube(B.headBot.clone().add(o.clone().multiplyScalar(0.8)), B.front.clone().add(o), 0.011, fm));
  }
  bike.add(tube(B.bb, seatStay, 0.017, fm));
  bike.add(tube(seatStay, B.headTop, 0.016, fm));
  bike.add(tube(B.bb, B.headBot, 0.019, fm));
  bike.add(tube(B.headBot, B.headTop.clone().add(new THREE.Vector3(0, 0.06, -0.01)), 0.02, fm));
  bike.add(tube(B.headTop.clone().add(new THREE.Vector3(0, 0.06, -0.01)), B.bar, 0.012, dark));
  bike.add(tube(B.bar.clone().add(new THREE.Vector3(-0.28, 0, -0.02)), B.bar.clone().add(new THREE.Vector3(0.28, 0, -0.02)), 0.011, dark));
  bike.add(tube(seatStay, B.seat, 0.012, dark));
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.26), dark); saddle.position.copy(B.seat).add(new THREE.Vector3(0, 0.02, 0.02)); bike.add(saddle);
  const fender = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.012, 3, 14, Math.PI * 0.8), fm);
  fender.rotation.set(0, Math.PI / 2, Math.PI * 0.1); fender.position.copy(B.rear); bike.add(fender);
  if (rnd() < 0.5) { // front basket
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.26), lambert(0x2a2622)); bk.position.copy(B.bar).add(new THREE.Vector3(0, -0.12, 0.2)); bike.add(bk);
  }
  const crank = new THREE.Group(); crank.position.copy(B.bb); bike.add(crank);
  const chainring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.01, 4, 16), dark); chainring.rotation.y = Math.PI / 2; chainring.position.x = 0.06; crank.add(chainring);
  const pedals = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, B.crank), dark); arm.position.set(0.08 * s, 0, B.crank / 2 * s); crank.add(arm);
    pedals.push(s);
  }
  bike.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const rider = makeHuman(rnd, { pack: rnd() < 0.3 });
  bike.add(rider.root);
  return { bike, rider, wheels: [wr, wf], crank, lean: 0.38 + rnd() * 0.25 };
}

// two-bone IK in the sagittal plane; target (z forward, y up) relative to the root joint
function ik2(tz, ty, L1, L2, bendForward) {
  let d = Math.hypot(tz, ty);
  d = Math.min(d, (L1 + L2) * 0.999);
  const phi = Math.atan2(tz, -ty);
  const a1 = Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const k = Math.PI - Math.acos(THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  return bendForward ? [phi + a1, k] : [phi - a1, k];
}

export function poseRide(c, crankAngle) {
  const r = c.rider, H = r.H, B = BIKE;
  c.crank.rotation.x = crankAngle;
  // pelvis sits on the saddle, torso leans to the bars
  const hipPt = B.seat.clone().add(new THREE.Vector3(0, 0.07, -0.02)).divideScalar(H);
  r.pelvis.position.copy(hipPt);
  r.pelvis.rotation.set(c.lean, 0, 0);
  r.chest.rotation.set(0.05, 0, 0);
  r.neck.rotation.set(-c.lean * 0.9, 0, 0);
  const cosL = Math.cos(-c.lean), sinL = Math.sin(-c.lean);
  const toPelvis = (v) => { // root-local → pelvis-local (rotation about x by -lean)
    const y = v.y - hipPt.y, z = v.z - hipPt.z;
    return [z * cosL + y * sinL, y * cosL - z * sinL];
  };
  for (let s = 0; s < 2; s++) {
    const a = crankAngle + s * Math.PI;
    const pedal = new THREE.Vector3(0, B.bb.y - Math.sin(a) * B.crank, B.bb.z + Math.cos(a) * B.crank).divideScalar(H);
    pedal.y += 0.045; // ankle above the pedal
    const L = r.legs[s];
    const [pz, py] = toPelvis(pedal);
    const [t, k] = ik2(pz, py - L.hip.position.y, P.thigh, P.shin, true);
    L.hip.rotation.set(-t, 0, 0);
    L.knee.rotation.x = k;
    L.ankle.rotation.x = (t - k) * 0.6 - 0.15;
    // hands on the grips
    const arm = r.arms[s];
    const grip = B.bar.clone().add(new THREE.Vector3(0, 0, -0.03)).divideScalar(H);
    const [gz, gy] = toPelvis(grip);
    const sy = arm.sh.position.y; // chest is ~unrotated relative to pelvis
    const [u, e] = ik2(gz, gy - sy, P.upper, P.fore + 0.02, false);
    arm.sh.rotation.set(-u, 0, (s ? -1 : 1) * 0.12);
    arm.el.rotation.x = -e;
  }
}
