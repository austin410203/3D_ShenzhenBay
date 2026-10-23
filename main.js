// 深圳灣・晚霞 — real-time recreation of a Shenzhen Bay sunset time-lapse.
// Sky + volumetric cumulus are ray-marched into a reduced-resolution target,
// composited behind the scene and reused (by mirrored direction) on the water.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeHuman, poseWalk, poseIdle, makeCyclist, poseRide } from './people.js';

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
const DPR = Math.min(window.devicePixelRatio, 1.75);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(24, innerWidth / innerHeight, 0.5, 120000);
camera.position.set(0, 3.0, 24);
const view = { yaw: 0, pitch: 0.045, fov: 24 };

// ---------------------------------------------------------------- tiling 3D noise (R: perlin-worley, G: worley fbm)
function makeNoise3D(N) {
  const hash = (i, j, k, s) => {
    let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1274126177) + Math.imul(s, 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const G = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
  const wrap = (a, P) => ((a % P) + P) % P;
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function perlin(x, y, z, P, s) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const u = fade(fx), v = fade(fy), w = fade(fz);
    let r = 0;
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
      const g = G[Math.floor(hash(wrap(ix + dx, P), wrap(iy + dy, P), wrap(iz + dz, P), s) * 12)];
      const d = g[0] * (fx - dx) + g[1] * (fy - dy) + g[2] * (fz - dz);
      r += d * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    }
    return r;
  }
  function worley(x, y, z, P, s) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let md = 9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx, cy = iy + dy, cz = iz + dz;
      const a = wrap(cx, P), b = wrap(cy, P), c = wrap(cz, P);
      const px = cx + hash(a, b, c, s) - x, py = cy + hash(a, b, c, s + 7) - y, pz = cz + hash(a, b, c, s + 13) - z;
      const d = px * px + py * py + pz * pz;
      if (d < md) md = d;
    }
    return Math.min(1, Math.sqrt(md));
  }
  const data = new Uint8Array(N * N * N * 2);
  let o = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, w = z / N;
    let pf = 0, amp = 1, tot = 0;
    for (let k = 0, P = 4; k < 3; k++, P *= 2) { pf += perlin(u * P, v * P, w * P, P, 11 + k) * amp; tot += amp; amp *= 0.5; }
    pf = clamp(pf / tot * 1.1 + 0.5, 0, 1);
    const w1 = 1 - worley(u * 4, v * 4, w * 4, 4, 31), w2 = 1 - worley(u * 8, v * 8, w * 8, 8, 41), w3 = 1 - worley(u * 16, v * 16, w * 16, 16, 51);
    const wf = w1 * 0.625 + w2 * 0.25 + w3 * 0.125;
    const pw = clamp(wf * 0.7 + pf * 0.5 - 0.12, 0, 1);
    const d1 = 1 - worley(u * 8, v * 8, w * 8, 8, 61), d2 = 1 - worley(u * 16, v * 16, w * 16, 16, 71), d3 = 1 - worley(u * 32, v * 32, w * 32, 32, 81);
    data[o++] = pw * 255;
    data[o++] = (d1 * 0.625 + d2 * 0.25 + d3 * 0.125) * 255;
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGFormat;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- shared GLSL: sky gradient & sun light
const SKY_GLSL = /* glsl */`
uniform vec3 uSunDir;
vec3 skyColor(vec3 d){
  float s = uSunDir.y;
  float el = max(d.y, 0.0);
  float cs = dot(d, uSunDir);
  float day = smoothstep(-0.17, 0.10, s);
  float dusk = 1.0 - smoothstep(0.0, 0.2, s);
  vec3 zen = mix(vec3(0.012,0.022,0.07), vec3(0.15,0.30,0.64), day);
  vec3 hor = mix(vec3(0.06,0.06,0.13), vec3(0.62,0.64,0.76), day);
  float hz = pow(1.0 - el, 4.5);
  vec3 c = mix(zen, hor, hz);
  // warm glow on the sun side
  float sw = max(cs, 0.0);
  float glow = dusk * smoothstep(-0.24, -0.02, s);
  c += vec3(1.0,0.40,0.12) * glow * (pow(sw, 10.0)*2.2 + pow(sw, 2.0)*0.45) * pow(1.0 - el, 3.0);
  // anti-solar side: earth shadow + belt of Venus
  float anti = smoothstep(-0.2, 0.9, -cs);
  float shTop = clamp(-s*1.15, 0.0, 0.22);
  float bv = smoothstep(0.10, 0.0, s) * smoothstep(-0.22, -0.05, s);
  float band = exp(-pow((el - shTop - 0.07)/0.06, 2.0));
  float shadow = smoothstep(shTop + 0.015, shTop - 0.015, el) * smoothstep(0.02, -0.04, s);
  c = mix(c, c*vec3(0.52,0.58,0.86), anti*shadow*0.75);
  c += vec3(0.95,0.48,0.58) * band * bv * (0.25 + 0.75*anti) * 0.5;
  // pastel pink-lavender haze at the horizon during golden hour
  c += vec3(0.55,0.32,0.38) * pow(1.0 - el, 14.0) * dusk * day * 0.35;
  return c;
}
vec3 sunLight(float s){
  vec3 hi  = vec3(1.0,0.84,0.66) * 3.2;
  vec3 low = vec3(1.0,0.38,0.2) * 2.6;
  vec3 red = vec3(1.0,0.30,0.28) * 2.2;
  vec3 c = mix(low, hi, smoothstep(0.02, 0.16, s));
  c = mix(red, c, smoothstep(-0.05, 0.015, s));
  return c * smoothstep(-0.16, -0.07, s);
}
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

// ---------------------------------------------------------------- sky + volumetric clouds pass
const skyRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
skyRT.texture.minFilter = skyRT.texture.magFilter = THREE.LinearFilter;
const skyCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const skyUniforms = {
  uSunDir: { value: new THREE.Vector3() },
  uNoise: { value: null },
  uProjInv: { value: new THREE.Matrix4() },
  uCamWorld: { value: new THREE.Matrix4() },
  uCamPos: { value: new THREE.Vector3() },
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2() },
  uSteps: { value: 64 },
  uToon: { value: 1 },
};
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  depthTest: false, depthWrite: false,
  vertexShader: /* glsl */`
    varying vec2 vNdc;
    void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    precision highp sampler3D;
    uniform sampler3D uNoise;
    uniform mat4 uProjInv, uCamWorld;
    uniform vec3 uCamPos;
    uniform float uTime;
    uniform vec2 uWind;
    uniform int uSteps;
    uniform float uToon;
    varying vec2 vNdc;
    ${SKY_GLSL}
    #define RE 6371000.0
    const float CB = 750.0, CT = 8200.0, SIG = 0.02;

    float hgt(vec3 p){ return p.y + dot(p.xz, p.xz) / (2.0*RE); }
    // distance along rd to the (curved) altitude H, camera below H
    float toAlt(vec3 ro, vec3 rd, float H){
      float a = dot(rd.xz, rd.xz) / (2.0*RE), b = rd.y, c = ro.y - H;
      return -2.0*c / (b + sqrt(max(b*b - 4.0*a*c, 0.0)));
    }
    float blob(vec2 p, vec2 c, float r){ return smoothstep(1.0, 0.25, length((p - c)/vec2(r, r*0.8))); }
    float coverage(vec2 xz){
      vec2 w = xz + uWind;
      float c = texture(uNoise, vec3(w / 46000.0, 0.17)).r;
      c = smoothstep(0.42, 0.88, c) * 0.8 * smoothstep(9000.0, 20000.0, length(xz));
      // hand-placed towering cumulus to echo the reference framing
      c = max(c, blob(xz, vec2(-9500.0, -33000.0), 7000.0) * 1.0);
      c = max(c, blob(xz, vec2(17000.0, -38000.0), 6500.0) * 0.8);
      c = max(c, blob(xz, vec2(-21000.0, -17000.0), 5000.0) * 0.62);
      c = max(c, blob(xz, vec2(4200.0, -36000.0), 6500.0) * 0.55);
      float tur = texture(uNoise, vec3(w / 7000.0, 0.71)).r;
      c *= mix(0.55, 1.25, smoothstep(0.25, 0.8, tur));
      return c;
    }
    float density(vec3 p, float h, bool detail){
      float cov = coverage(p.xz);
      float shape = clamp((cov - h*h*1.05 - 0.04) * 4.0, 0.0, 1.0) * smoothstep(0.0, 0.04, h);
      if (shape <= 0.0) return 0.0;
      vec3 q = p + vec3(uWind.x, -uTime*9.0, uWind.y);
      float n = texture(uNoise, q / 3300.0).r * 0.65 + texture(uNoise, q / 8000.0 + 0.37).r * 0.35;
      float d = (shape - (1.0 - n) * (0.72 - 0.2*h)) * 1.8;
      if (detail && d > 0.0) {
        float dn = texture(uNoise, (q + vec3(0.0, uTime*14.0, 0.0)) / 2100.0).g;
        d -= (1.0 - dn) * 0.16 * (1.0 - clamp(d*3.0, 0.0, 1.0)) * (0.5 + h);
      }
      return clamp(d, 0.0, 1.0);
    }
    float HG(float c, float g){ float g2 = g*g; return (1.0 - g2) / pow(1.0 + g2 - 2.0*g*c, 1.5); }

    void main(){
      vec4 v = uProjInv * vec4(vNdc, 1.0, 1.0); v /= v.w;
      vec3 rd = normalize((uCamWorld * vec4(v.xyz, 0.0)).xyz);
      vec3 ro = uCamPos;
      vec3 sky = skyColor(rd);
      float s = uSunDir.y;
      float sa = asin(clamp(s, -1.0, 1.0));
      vec2 sunAz = normalize(uSunDir.xz + 1e-5);
      vec3 sunC = sunLight(s);

      // sun disk
      float cs = dot(rd, uSunDir);
      sky += sunC * 14.0 * smoothstep(0.99975, 0.9999, cs) * step(0.0, rd.y);

      // high altostratus streaks (stay lit after sunset)
      if (rd.y > 0.0) {
        float t2 = toAlt(ro, rd, 9200.0);
        vec3 p2 = ro + rd*t2;
        vec2 uv = (p2.xz + uWind*1.6) * vec2(1.0/34000.0, 1.0/9000.0);
        float a = texture(uNoise, vec3(uv, 0.61)).g * 0.7 + texture(uNoise, vec3(uv*2.7, 0.33)).r * 0.5;
        a = smoothstep(0.55, 0.95, a) * smoothstep(0.0, 0.08, rd.y) * exp(-t2 / 140000.0);
        float X = dot(p2.xz, sunAz);
        float hs = sa < 0.0 ? pow(X + sa*RE, 2.0) / (2.0*RE) : 0.0;
        float lit = smoothstep(hs - 900.0, hs + 900.0, 9200.0);
        vec3 ac = sunC * lit * 0.42 + skyColor(vec3(0.0,1.0,0.0)) * 0.55;
        sky = mix(sky, ac, a * 0.75);
      }

      // cumulus slab
      vec3 col = vec3(0.0); float T = 1.0; float tHit = -1.0;
      if (rd.y > -0.015) {
        float t0 = max(toAlt(ro, rd, CB), 0.0);
        float t1 = toAlt(ro, rd, CT);
        float tEnd = min(min(t1, t0 + 26000.0), 75000.0);
        if (t0 < 75000.0 && tEnd > t0) {
          float dt = (tEnd - t0) / float(uSteps);
          float t = t0 + dt * hash12(gl_FragCoord.xy);
          vec3 ambTop = skyColor(vec3(0.0, 1.0, 0.0)) * 0.42 + vec3(0.03,0.025,0.04);
          vec3 ambBot = ambTop * vec3(0.42,0.36,0.5);
          float ph = (HG(cs, 0.65)*0.45 + HG(cs, -0.22)*0.55) * 0.62;
          for (int i = 0; i < 160; i++) {
            if (i >= uSteps || T < 0.015) break;
            vec3 p = ro + rd*t;
            float h = (hgt(p) - CB) / (CT - CB);
            float d = density(p, h, true);
            if (d > 0.002) {
              if (tHit < 0.0) tHit = t;
              // light march toward the sun
              float od = 0.0, ls = 160.0; vec3 lp = p;
              for (int j = 0; j < 5; j++) {
                lp += uSunDir * ls;
                float lh = (hgt(lp) - CB) / (CT - CB);
                if (lh > 1.0) break;
                if (lh > 0.0) od += density(lp, lh, false) * ls;
                ls *= 1.75;
              }
              float tl = max(exp(-od*SIG), exp(-od*SIG*0.18)*0.22);
              tl = mix(tl, smoothstep(0.0, 1.0, floor(tl*4.0 + 0.5) / 4.0 + 0.06), uToon * 0.8);
              float powder = 1.0 - exp(-d*SIG*600.0);
              // earth shadow: lower parts lose the sun first
              float X = dot(p.xz, sunAz);
              float hs = sa < 0.0 ? pow(X + sa*RE, 2.0) / (2.0*RE) : 0.0;
              float lit = smoothstep(hs - 350.0, hs + 350.0, hgt(p));
              vec3 sc = sunC * mix(vec3(1.0,0.55,0.6), vec3(1.0), smoothstep(hs, hs + 2600.0, hgt(p)));
              vec3 S = (sc * (lit * tl * ph * 1.3 * mix(0.5, 1.0, powder)) + mix(ambBot, ambTop, clamp(h*1.4, 0.0, 1.0))) * (d*SIG);
              float sd = d*SIG;
              float Ts = exp(-sd*dt);
              col += T * (S - S*Ts) / sd;
              T *= Ts;
            }
            t += dt;
          }
        }
      }
      vec3 outc = sky*T + col;
      if (tHit > 0.0) {
        float haze = 1.0 - exp(-tHit / 120000.0);
        outc = mix(outc, sky, haze * (1.0 - T) * 0.85);
      }
      gl_FragColor = vec4(outc, 1.0);
    }`,
});
const skyScene = new THREE.Scene();
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const tri = new THREE.Mesh(g, skyMat); tri.frustumCulled = false; skyScene.add(tri);
}

// sky composite into main scene (full-res upsample of the sky target)
const skyQuad = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uSky: { value: skyRT.texture }, uRes: { value: new THREE.Vector2(1, 1) } },
    depthTest: false, depthWrite: false,
    vertexShader: `void main(){ gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: `uniform sampler2D uSky; uniform vec2 uRes;
      void main(){ vec2 uv = gl_FragCoord.xy / uRes; vec2 px = 0.7 / (uRes * 0.5);
      gl_FragColor = texture2D(uSky, uv) * 0.4 + (texture2D(uSky, uv + vec2(px.x, px.y)) + texture2D(uSky, uv - vec2(px.x, px.y))
        + texture2D(uSky, uv + vec2(px.x, -px.y)) + texture2D(uSky, uv + vec2(-px.x, px.y))) * 0.15;
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -1000;
  scene.add(mesh);
  return mesh;
})();

// ---------------------------------------------------------------- hand-drawn post pass
// scene → linear HDR target → painterly filter (Kuwahara wash, boiling ink lines, paper, hatching)
const sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
const postMat = new THREE.ShaderMaterial({
  uniforms: {
    tScene: { value: sceneRT.texture }, uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 }, uExposure: { value: 1 }, uScale: { value: 1 },
  },
  depthTest: false, depthWrite: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy*0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tScene; uniform vec2 uRes; uniform float uTime, uExposure, uScale;
    varying vec2 vUv;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03)) / (x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }
    float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
      return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
    vec3 tex(vec2 uv){ return pow(aces(texture2D(tScene, uv).rgb * uExposure), vec3(1.0/2.2)); }
    float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main(){
      vec2 px = uScale / uRes;
      float tq = floor(uTime * 5.0);                       // lines "boil" at 5 fps like redrawn frames
      vec2 wob = (vec2(vn(vUv*vec2(11.0, 8.0) + tq*1.7), vn(vUv*vec2(9.0, 13.0) - tq*2.3)) - 0.5) * 3.2 * px;
      vec2 uv = vUv + wob;
      // Kuwahara (4 quadrants, r=2): flat painterly washes with soft edges
      vec3 m[4]; vec3 s2[4];
      for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s2[k] = vec3(0.0); }
      for (int j = 0; j <= 2; j++) for (int i = 0; i <= 2; i++) {
        vec3 a = tex(uv + vec2(-i, -j)*px), b = tex(uv + vec2(i, -j)*px), c = tex(uv + vec2(-i, j)*px), d = tex(uv + vec2(i, j)*px);
        m[0] += a; s2[0] += a*a; m[1] += b; s2[1] += b*b; m[2] += c; s2[2] += c*c; m[3] += d; s2[3] += d*d;
      }
      vec3 col = vec3(0.0); float best = 1e9;
      for (int k = 0; k < 4; k++) {
        vec3 mu = m[k] / 9.0; vec3 v = abs(s2[k] / 9.0 - mu*mu);
        float sv = v.r + v.g + v.b;
        if (sv < best) { best = sv; col = mu; }
      }
      // soft value banding (gouache-like steps) keeping hue
      float L = lum(col);
      float Lq = (floor(L*6.0) + smoothstep(0.3, 0.7, fract(L*6.0))) / 6.0;
      col *= mix(1.0, Lq / max(L, 1e-3), 0.55);
      col = mix(vec3(lum(col)), col, 1.3);               // a touch more saturated
      // ink outlines: sobel on luminance, broken into strokes
      vec2 lp = px * 1.15;
      float tl = lum(tex(uv + vec2(-lp.x, lp.y))), tc = lum(tex(uv + vec2(0.0, lp.y))), tr = lum(tex(uv + lp));
      float ml = lum(tex(uv - vec2(lp.x, 0.0))), mr = lum(tex(uv + vec2(lp.x, 0.0)));
      float bl = lum(tex(uv - lp)), bc = lum(tex(uv - vec2(0.0, lp.y))), br = lum(tex(uv + vec2(lp.x, -lp.y)));
      float gx = tr + 2.0*mr + br - tl - 2.0*ml - bl, gy = tl + 2.0*tc + tr - bl - 2.0*bc - br;
      float e = length(vec2(gx, gy));
      float ink = smoothstep(0.12, 0.34, e) * mix(0.45, 1.0, smoothstep(0.3, 0.7, vn(gl_FragCoord.xy / (16.0*uScale) + tq*3.1)));
      col = mix(col, vec3(0.17, 0.12, 0.14), ink * 0.8);
      // watercolour pigment pooling at colour edges + granulation
      col *= 1.0 - smoothstep(0.03, 0.12, e) * 0.08;
      float gran = vn(gl_FragCoord.xy / (2.2*uScale)) * 0.55 + vn(gl_FragCoord.xy / (9.0*uScale)) * 0.45;
      col *= 0.965 + 0.05 * gran;
      // cross-hatching in the shadows
      vec2 fc = gl_FragCoord.xy / uScale;
      float jit = vn(fc / 30.0) * 2.0;
      float h1 = smoothstep(0.55, 0.75, fract((fc.x + fc.y) / 6.0 + jit));
      float h2 = smoothstep(0.55, 0.75, fract((fc.x - fc.y) / 6.0 + jit));
      float dark = 1.0 - smoothstep(0.08, 0.36, L);
      col *= 1.0 - h1 * dark * 0.14 - h2 * smoothstep(0.6, 1.0, dark) * 0.12;
      // paper: cream tint, fibres, vignette
      float fib = vn(vec2(fc.x / 1.5, fc.y / 40.0)) * 0.5 + vn(vec2(fc.x / 40.0, fc.y / 1.5)) * 0.5;
      col = col * vec3(0.99, 0.96, 0.9) * (0.985 + 0.025 * fib) + vec3(0.03, 0.025, 0.015);
      col = mix(col, col * vec3(0.86, 0.79, 0.7), smoothstep(0.45, 1.05, length((vUv - 0.5) * vec2(1.3, 1.0))));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const postScene = new THREE.Scene();
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const tri = new THREE.Mesh(g, postMat); tri.frustumCulled = false; postScene.add(tri);
}

// ---------------------------------------------------------------- far shader (skyline, hills, land) with aerial perspective
const farUniforms = {
  uSunDir: skyUniforms.uSunDir,
  uSunCol: { value: new THREE.Color() },
  uAmb: { value: new THREE.Color() },
  uNight: { value: 0 },
  uTime: { value: 0 },
  uShow: { value: 0 },
};
function farMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: farUniforms,
    vertexShader: /* glsl */`
      attribute vec4 aB;   // seed, height, kind(0 tower,1 landmark,2 hill,3 land), x-center
      varying vec3 vW, vN; varying vec4 vB;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vB = aB;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunCol, uAmb; uniform float uNight, uTime, uShow;
      varying vec3 vW, vN; varying vec4 vB;
      ${SKY_GLSL}
      #include <logdepthbuf_pars_fragment>
      vec3 hue(float h){ return clamp(abs(fract(h + vec3(0.0, 2.0/3.0, 1.0/3.0))*6.0 - 3.0) - 1.0, 0.0, 1.0); }
      void main(){
        #include <logdepthbuf_fragment>
        vec3 N = normalize(vN);
        float kind = vB.z, seed = vB.x;
        vec3 base;
        if (kind < 1.5) { base = mix(vec3(0.16,0.19,0.27), vec3(0.30,0.31,0.35), fract(seed*7.31));
          base = mix(base, vec3(0.38,0.30,0.26), step(0.72, fract(seed*5.17)) * 0.8) * (kind > 0.5 ? 1.15 : 1.0); }
        else if (kind < 2.5) base = vec3(0.13,0.17,0.15);
        else base = vec3(0.10,0.12,0.11);
        float concrete = kind < 0.5 ? step(fract(seed*11.3), 0.34) : 0.0;
        if (concrete > 0.5) base = mix(vec3(0.42,0.40,0.37), vec3(0.52,0.48,0.42), fract(seed*3.7));
        float diff = max(dot(N, uSunDir), 0.0);
        vec3 V = vW - cameraPosition; float dist = length(V); vec3 dir = V / dist;
        vec3 col = base * 0.7 * (uAmb * (0.45 + 0.35*max(N.y, 0.0)) + uSunCol * diff * (0.1 + concrete*0.18));
        if (kind < 1.5 && N.y < 0.5) {
          // floor slabs and mullions, faded out once they get sub-pixel
          float u = vW.x * (-N.z) + vW.z * N.x;
          float fy = vW.y / (concrete > 0.5 ? 3.0 : 4.0);
          float aa = fwidth(fy);
          float fl = smoothstep(0.0, 0.14 + aa, fract(fy)) * smoothstep(1.0, 0.8 - aa, fract(fy));
          float mull = smoothstep(0.06, 0.16, fract(u / (concrete > 0.5 ? 3.2 : 1.6)));
          float vis = 1.0 - smoothstep(0.3, 0.85, aa);
          col *= mix(1.0, mix(concrete > 0.5 ? 0.62 : 0.78, 1.0, fl) * mix(0.88, 1.0, mull), vis);
          // glass: fresnel sky reflection + warm sunset glints
          vec3 R = reflect(dir, N);
          float F = (1.0 - concrete) * (0.06 + 0.5 * pow(1.0 - max(dot(-dir, N), 0.0), 4.0));
          col += skyColor(vec3(R.x, abs(R.y), R.z)) * F * 0.35;
          col += uSunCol * pow(max(dot(R, uSunDir), 0.0), 60.0) * (1.0 - concrete) * 0.25 * fl;
        }
        // contact darkening toward the street
        if (kind < 1.5) col *= mix(0.6, 1.0, smoothstep(0.0, 70.0, vW.y));
        if (kind < 1.5 && N.y < 0.5) {
          // lit windows (coarse cells: these are ~8 km away)
          vec2 cell = vec2(floor(vW.y / 7.0), floor((vW.x + vW.z*0.7) / 6.0));
          float r = hash12(cell + seed*97.0);
          float onAt = fract(seed*13.7)*0.6;
          float lit = step(r, 0.12 + 0.3*uNight) * step(onAt, uNight*1.2) * step(6.0, vW.y);
          vec3 wc = mix(vec3(1.0,0.72,0.42), vec3(0.78,0.88,1.0), step(0.55, fract(seed*3.1)));
          col += wc * lit * uNight * (0.25 + 0.35*hash12(cell*1.7));
          // façade outline lights on landmarks
          if (kind > 0.5) col += vec3(0.75,0.85,1.0) * uNight * 0.6 * smoothstep(0.85, 1.0, fract(vW.y / 40.0));
          // skyline light show: colour waves sweeping the towers
          if (uShow > 0.0 && vB.y > 90.0) {
            float ph = vW.x / 2600.0 - uTime*0.45 + vW.y/900.0;
            vec3 lc = hue(fract(ph*0.5 + 0.55)) * (0.6 + 0.4*sin(vW.y/14.0 - uTime*3.0));
            float band = smoothstep(0.2, 0.9, sin(ph*6.2831)*0.5 + 0.5);
            col = mix(col, lc * 0.45, uShow * uNight * mix(0.15, 0.8, band) * step(10.0, vW.y));
          }
        }
        // aerial perspective
        vec3 fd = normalize(vec3(dir.x, max(dir.y, 0.0) + 0.012, dir.z));
        float f = 1.0 - exp(-dist / (kind > 1.5 ? 16000.0 : 90000.0));
        col = mix(col, skyColor(fd) * 0.7, clamp(f, 0.0, 0.9));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function tagged(geo, seed, h, kind, cx) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) a.set([seed, h, kind, cx], i * 4);
  geo.setAttribute('aB', new THREE.BufferAttribute(a, 4));
  if (geo.index) geo = geo.toNonIndexed();
  geo.deleteAttribute('uv');
  return geo;
}

// seeded RNG for repeatable skyline
let _s = 1337;
const rnd = () => ((_s = Math.imul(_s ^ (_s >>> 15), 2246822519) + 0x6d2b79f5 | 0) >>> 0) / 4294967296;
const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

function buildSkyline() {
  const parts = [];
  const box = (x, z, w, d, h, kind = 0, rot = 0) => {
    const g = new THREE.BoxGeometry(w, h, d); g.rotateY(rot); g.translate(x, h / 2, z);
    parts.push(tagged(g, rnd(), h, kind, x));
  };
  // generic city fabric across the bay
  for (let i = 0; i < 1100; i++) {
    const x = (rnd() * 2 - 1) * 17000;
    const z = -4300 - rnd() * 3600;
    const h = 18 + Math.pow(rnd(), 2.2) * 110;
    box(x, z, 25 + rnd() * 50, 25 + rnd() * 45, h, 0, (rnd() - 0.5) * 0.4);
  }
  // dense high-rise clusters (Futian / Houhai / Qianhai / Luohu)
  const clusters = [
    { x: -300, z: -6600, sx: 1500, sz: 600, n: 230, hmin: 80, hmax: 360 },
    { x: -3300, z: -5200, sx: 900, sz: 500, n: 120, hmin: 70, hmax: 300 },
    { x: -7000, z: -4900, sx: 1400, sz: 400, n: 90, hmin: 50, hmax: 220 },
    { x: 3500, z: -7200, sx: 1300, sz: 600, n: 110, hmin: 60, hmax: 260 },
    { x: 7600, z: -6400, sx: 1600, sz: 600, n: 70, hmin: 40, hmax: 160 },
  ];
  for (const c of clusters) for (let i = 0; i < c.n; i++) {
    const x = c.x + gauss() * c.sx, z = c.z + gauss() * c.sz;
    const core = 1 - Math.min(1, Math.abs(x - c.x) / (c.sx * 1.3));
    const h = c.hmin + Math.pow(rnd(), 1.6) * (c.hmax - c.hmin) * (0.45 + 0.55 * core);
    const w = 30 + rnd() * 30, r0 = rnd();
    if (h > 120 && rnd() < 0.5) box(x, z, w * 2.2, w * 1.8, 18 + rnd() * 14, 0); // podium
    if (r0 < 0.2) { // round / octagonal tower
      const g = new THREE.CylinderGeometry(w * 0.5, w * 0.55, h, rnd() < 0.5 ? 8 : 20); g.rotateY(rnd()); g.translate(x, h / 2, z);
      parts.push(tagged(g, 0.2 + rnd() * 0.6, h, 0, x));
    } else if (r0 < 0.45) { // stepped setbacks
      box(x, z, w * 1.3, w * 1.2, h * 0.55, 0);
      box(x, z, w, w * 0.95, h * 0.85, 0);
      box(x, z, w * 0.7, w * 0.7, h, 0);
    } else box(x, z, w, w * (0.8 + rnd() * 0.5), h, 0, (rnd() - 0.5) * 0.3);
    if (h > 150) { // crown + mast
      box(x, z, w * 0.55, w * 0.55, h + 6 + rnd() * 10, 0);
      if (rnd() < 0.45) { const g = new THREE.CylinderGeometry(0.6, 1.4, 30 + rnd() * 40, 5); g.translate(x, h + 30, z); parts.push(tagged(g, 0.5, h, 0, x)); }
    }
  }
  // rows of identical residential towers (Nanshan / Shekou style)
  for (let r = 0; r < 16; r++) {
    const x0 = (rnd() * 2 - 1) * 14000, z0 = -4500 - rnd() * 2400, n = 4 + Math.floor(rnd() * 5);
    const h = 85 + rnd() * 90, rot = (rnd() - 0.5) * 0.3, sd = 0.01 + rnd() * 0.02;
    for (let k = 0; k < n; k++) {
      const g = new THREE.BoxGeometry(32, h, 17); g.rotateY(rot); g.translate(x0 + k * 55, h / 2, z0 + k * 6);
      parts.push(tagged(g, sd, h, 0, x0));
      const cap = new THREE.BoxGeometry(14, 6, 10); cap.translate(x0 + k * 55, h + 3, z0 + k * 6); parts.push(tagged(cap, sd, h, 0, x0));
    }
  }
  // Ping An Finance Centre — 599 m, tapering octagon + spire
  {
    const x = -150, z = -6800;
    let g = new THREE.CylinderGeometry(24, 40, 555, 8, 6); g.rotateY(Math.PI / 8); g.translate(x, 277, z);
    parts.push(tagged(g, 0.31, 599, 1, x));
    g = new THREE.CylinderGeometry(0.8, 10, 50, 8); g.translate(x, 580, z); parts.push(tagged(g, 0.31, 599, 1, x));
  }
  // China Resources "Spring Bamboo" — 393 m
  {
    const x = -3200, z = -5200;
    let g = new THREE.CylinderGeometry(22, 32, 360, 28, 4); g.translate(x, 180, z); parts.push(tagged(g, 0.77, 393, 1, x));
    g = new THREE.SphereGeometry(22, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 1.5, 1); g.translate(x, 360, z);
    parts.push(tagged(g, 0.77, 393, 1, x));
  }
  // a few other recognisable heights
  box(700, -6500, 50, 50, 330, 1); box(-900, -6900, 46, 46, 300, 1); box(-3900, -5400, 42, 54, 280, 1);
  box(3800, -7400, 52, 40, 442, 1); box(3900, -7400, 22, 22, 470, 1);
  // shore land strip & tree line
  {
    const g = new THREE.BoxGeometry(46000, 10, 7000); g.translate(0, 2, -7700);
    parts.push(tagged(g, 0.1, 0, 3, 0));
    const blob = new THREE.IcosahedronGeometry(1, 0);
    for (let x = -17000; x < 17000; x += 9 + rnd() * 10) {
      const r = 5 + rnd() * 8, t = blob.clone();
      t.scale(r * (1.2 + rnd() * 0.6), r * (0.6 + rnd() * 0.5), r); t.translate(x, 6 + r * 0.4, -4215 - rnd() * 60);
      parts.push(tagged(t, rnd(), 0, 2, x));
    }
  }
  return mergeGeometries(parts);
}

function buildHills() {
  const parts = [];
  const ridge = (z0, hBase, hVar, seed, xs = 32000) => {
    const pos = [], n = 260;
    const f = (x) => {
      let y = 0, a = 1, fr = 1 / 5200;
      for (let k = 0; k < 5; k++) { y += a * Math.sin(x * fr + seed * (k + 1) * 1.7) * Math.cos(x * fr * 0.63 + seed * k); a *= 0.5; fr *= 2.1; }
      return Math.max(0, hBase + y * hVar);
    };
    for (let i = 0; i < n; i++) {
      const x0 = -xs + (2 * xs) * i / n, x1 = -xs + (2 * xs) * (i + 1) / n;
      const z0a = z0 - Math.cos(x0 / xs * 1.2) * 1500, z1a = z0 - Math.cos(x1 / xs * 1.2) * 1500;
      const y0 = f(x0), y1 = f(x1);
      pos.push(x0, -5, z0a, x1, -5, z1a, x1, y1, z1a, x0, -5, z0a, x1, y1, z1a, x0, y0, z0a);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    parts.push(tagged(g, seed, 0, 2, 0));
  };
  ridge(-10500, 140, 240, 0.37, 24000);
  ridge(-15500, 330, 420, 1.91, 32000);
  return mergeGeometries(parts);
}

const farMat = farMaterial();
scene.add(new THREE.Mesh(buildSkyline(), farMat));
scene.add(new THREE.Mesh(buildHills(), farMat));

// aviation warning lights on top of the tall towers
const beacons = (() => {
  const pts = [];
  const add = (x, y, z) => pts.push(x, y, z);
  add(-150, 603, -6800); add(-3200, 396, -5200); add(3900, 472, -7400); add(700, 332, -6500); add(-900, 302, -6900);
  for (let i = 0; i < 26; i++) add(-300 + gauss() * 1500, 200 + rnd() * 100, -6600 + gauss() * 500);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const ph = new Float32Array(pts.length / 3).map(() => rnd() * 6.28);
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: farUniforms.uTime, uNight: farUniforms.uNight },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aPh; uniform float uTime; varying float vA;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vA = step(0.55, fract(uTime*0.55 + aPh)); vec4 mv = modelViewMatrix*vec4(position,1.0);
      gl_Position = projectionMatrix*mv; gl_PointSize = 4.0;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform float uNight; varying float vA;
      #include <logdepthbuf_pars_fragment>
      void main(){
      #include <logdepthbuf_fragment>
      float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0,0.12,0.08)*3.0, smoothstep(0.5,0.1,d) * vA * smoothstep(0.1,0.5,uNight));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p);
  return p;
})();

// ---------------------------------------------------------------- water (planar reflection + mirrored sky lookup)
const waterUniforms = {
  color: { value: new THREE.Color(0xffffff) },
  tDiffuse: { value: null },
  textureMatrix: { value: null },
  uSky: { value: null },
  uNoise: { value: null },
  uRes: { value: new THREE.Vector2(1, 1) },
  uTime: { value: 0 },
  uSunDir: { value: null },
  uAmb: { value: null },
  uSunCol: { value: null },
  uProjM: { value: new THREE.Matrix4() },
};
const water = new Reflector(new THREE.PlaneGeometry(90000, 46000), {
  textureWidth: 512, textureHeight: 512, clipBias: 0.003,
  shader: {
    name: 'BayWater',
    uniforms: waterUniforms,
    vertexShader: /* glsl */`
      uniform mat4 textureMatrix;
      varying vec4 vUv; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vUv = textureMatrix * vec4(position, 1.0);
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      precision highp sampler3D;
      uniform sampler2D tDiffuse, uSky; uniform sampler3D uNoise;
      uniform vec2 uRes; uniform float uTime; uniform vec3 uSunDir, uAmb, uSunCol; uniform mat4 uProjM;
      varying vec4 vUv; varying vec3 vW;
      #include <logdepthbuf_pars_fragment>
      float hN(vec2 p){
        return texture(uNoise, vec3(p.x*0.011, p.y*0.045, uTime*0.012)).r * 0.65
             + texture(uNoise, vec3(p.x*0.037 + uTime*0.01, p.y*0.12, 0.5 + uTime*0.02)).r * 0.35;
      }
      void main(){
        #include <logdepthbuf_fragment>
        vec3 V = vW - cameraPosition; float dist = length(V); V /= dist;
        // ripple slopes (crests run parallel to the shore → vertical streaks)
        float e = 0.8, h0 = hN(vW.xz);
        vec2 g = vec2(hN(vW.xz + vec2(e, 0.0)) - h0, hN(vW.xz + vec2(0.0, e)) - h0) / e;
        float amp = 0.8 / (1.0 + dist / 160.0) + 0.025;
        vec3 n = normalize(vec3(-g.x*amp*0.4, 1.0, -g.y*amp*1.6));
        // geometry reflection (skyline, people, birds)
        vec2 ruv = vUv.xy / vUv.w + vec2(n.x*0.5, n.z*1.6) * 0.035 / (1.0 + dist/300.0);
        vec4 geo = texture2D(tDiffuse, ruv);
        // sky reflection: project the mirrored ray back into the sky target
        vec3 R = reflect(V, n); R.y = max(abs(R.y), 0.002);
        vec4 c = uProjM * vec4((viewMatrix * vec4(R, 0.0)).xyz, 0.0);
        vec2 suv = clamp(c.xy / max(c.w, 1e-4) * 0.5 + 0.5, vec2(0.001), vec2(0.999));
        vec3 sky = texture2D(uSky, suv).rgb;
        vec3 refl = mix(sky, geo.rgb, geo.a);
        float cosv = max(dot(-V, n), 0.0);
        float F = 0.02 + 0.98 * pow(1.0 - cosv, 5.0);
        F = mix(F, 1.0, 0.25);
        vec3 body = vec3(0.04, 0.07, 0.09) * (uAmb * 2.2 + uSunCol*0.08);
        // shallow sandy water near the beach
        float shallow = smoothstep(-26.0, -13.5, vW.z);
        body = mix(body, vec3(0.30,0.26,0.20) * uAmb * 1.6, shallow * 0.7);
        vec3 col = mix(body, refl * 0.94, F * (1.0 - shallow*0.45));
        // lapping foam line
        float wave = sin(vW.x*0.21 + uTime*1.3)*0.45 + sin(vW.x*0.07 - uTime*0.8)*0.6 + sin(uTime*0.9)*0.5;
        float foam = smoothstep(-16.6 + wave, -14.2, vW.z) * smoothstep(0.35, 0.7, hN(vW.xz*3.0));
        col = mix(col, (uAmb*1.4 + uSunCol*0.12) * 0.9, foam * 0.55);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  },
});
water.rotation.x = -Math.PI / 2;
water.position.set(0, 0, -23000 + 9);
scene.add(water);
{
  const wu = water.material.uniforms;
  wu.uSky.value = skyRT.texture;
  wu.uSunDir = skyUniforms.uSunDir;
  wu.uAmb = farUniforms.uAmb;
  wu.uSunCol = farUniforms.uSunCol;
  water.material.uniforms = wu;
  // keep the reflection pass free of the screen-space sky (the water samples the sky target itself)
  const orig = water.onBeforeRender;
  const cc = new THREE.Color();
  water.onBeforeRender = function (r, s, c) {
    skyQuad.visible = false;
    const a = r.getClearAlpha(); r.getClearColor(cc); r.setClearColor(0x000000, 0);
    orig.call(this, r, s, c);
    r.setClearColor(cc, a); skyQuad.visible = true;
  };
}

// ---------------------------------------------------------------- lights for near objects
const hemi = new THREE.HemisphereLight(0x8899cc, 0x332a28, 1.0);
const sun = new THREE.DirectionalLight(0xffaa77, 1.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 30, bottom: -30, near: 1, far: 400 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(hemi, sun, sun.target);

// ---------------------------------------------------------------- beach
{
  const g = new THREE.PlaneGeometry(600, 90, 1, 90);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -12 + 45 - 33);
  const p = g.attributes.position, col = [];
  const wet = new THREE.Color(0.26, 0.22, 0.18), dry = new THREE.Color(0.66, 0.56, 0.44), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    p.setY(i, (z + 14) * 0.035 + (z < -14 ? (z + 14) * 0.03 : 0));
    c.copy(wet).lerp(dry, smooth(-14, -6, z)); col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const sand = sandTextures();
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: sand.map, bumpMap: sand.bump, bumpScale: 2.5 });
  const beach = new THREE.Mesh(g, m); beach.receiveShadow = true;
  scene.add(beach);
}
const groundY = (z) => (z + 14) * 0.035;
// procedural sand: fine grain, wind ripples, scattered footprints
function sandTextures() {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'), img = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const rip = Math.sin((i * 0.9 + Math.sin(j * 0.05) * 9 + Math.sin(i * 0.013) * 20) * 0.32) * 0.5 + 0.5;
    const v = 215 + (Math.random() - 0.5) * 44 + rip * 14;
    const o = (j * N + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  x.fillStyle = 'rgba(120,120,120,0.3)';
  for (let k = 0; k < 70; k++) {
    let px = Math.random() * N, py = Math.random() * N; const a = Math.random() * 6.28;
    for (let st = 0; st < 6; st++) {
      const side = st % 2 ? 1 : -1;
      x.beginPath(); x.ellipse(px + Math.cos(a + 1.57) * 4 * side, py + Math.sin(a + 1.57) * 4 * side, 3, 6.5, a + 1.57, 0, 6.28); x.fill();
      px += Math.cos(a) * 14; py += Math.sin(a) * 14;
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(120, 18); map.anisotropy = 8;
  const bump = map.clone(); bump.colorSpace = THREE.NoColorSpace; bump.needsUpdate = true;
  return { map, bump };
}

// ---------------------------------------------------------------- people, cyclists, lamp, birds
const metal = new THREE.MeshLambertMaterial({ color: 0x16171a });
const G = { bar: new THREE.CylinderGeometry(0.012, 0.012, 1, 5) };

const walkers = [];
function addWalker(opts = {}) {
  const h = makeHuman(rnd, opts);
  const z = opts.z ?? (-1 - rnd() * 12.5);
  const run = opts.run ?? 0;
  const w = {
    h, kind: opts.kind ?? 'walk', x: opts.x ?? (rnd() * 2 - 1) * 55, z, run, seed: rnd(),
    v: opts.v ?? (rnd() < 0.5 ? -1 : 1) * (1.05 + rnd() * 0.45) * (run ? 2.6 : 1), ph: rnd() * 6.28,
    face: opts.face ?? Math.PI + (rnd() - 0.5) * 1.2,
  };
  if (w.kind !== 'walk') w.v = 0;
  h.root.rotation.y = w.kind === 'walk' ? (w.v > 0 ? Math.PI / 2 : -Math.PI / 2) : w.face;
  scene.add(h.root);
  walkers.push(w);
  return w;
}
for (let i = 0; i < 26; i++) addWalker();
// couples walking side by side
for (let i = 0; i < 4; i++) {
  const a = addWalker(); addWalker({ x: a.x + 0.15, z: a.z - 0.6, v: a.v, female: !a.h.female });
}
const idleKinds = ['stand', 'phone', 'phone', 'hands', 'stand', 'sit', 'phone', 'stand', 'sit', 'hands', 'stand', 'phone'];
idleKinds.forEach((k, i) => addWalker({ kind: k, x: (rnd() * 2 - 1) * 30, z: k === 'sit' ? -6 - rnd() * 5 : -2 - rnd() * 10 }));
// kids running at the water's edge
for (let i = 0; i < 3; i++) addWalker({ child: true, run: 1, z: -12.3 - rnd() * 0.8, v: (rnd() < 0.5 ? -1 : 1) * 2.8 });

// photographer with a tripod (as in the reference)
{
  addWalker({ kind: 'hands', x: -6.5, z: -1.6, face: Math.PI, female: false });
  const tri = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const leg = new THREE.Mesh(G.bar, metal); leg.scale.y = 1.45; leg.castShadow = true;
    const a = k / 3 * Math.PI * 2 + 0.4;
    leg.position.set(Math.cos(a) * 0.2, 0.7, Math.sin(a) * 0.2); leg.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28);
    tri.add(leg);
  }
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.09), metal); cam.position.y = 1.44; cam.castShadow = true; tri.add(cam);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 8), metal); lens.rotation.x = Math.PI / 2; lens.position.set(0, 1.44, -0.1); tri.add(lens);
  tri.position.set(-6.5, groundY(-2.4), -2.4); scene.add(tri);
}

const cyclists = [];
for (let i = 0; i < 9; i++) {
  const c = makeCyclist(rnd);
  const dir = rnd() < 0.5 ? -1 : 1;
  c.bike.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  Object.assign(c, { x: (rnd() * 2 - 1) * 60, z: -4.5 - rnd() * 7, v: dir * (3.0 + rnd() * 2.0), ph: rnd() * 6.28 });
  scene.add(c.bike);
  cyclists.push(c);
}

// street lamp at the right edge
const lamp = (() => {
  const grp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 6.2, 8), metal); pole.position.y = 3.1; grp.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), metal); arm.rotation.z = Math.PI / 2; arm.position.set(-0.4, 6.1, 0); grp.add(arm);
  const headM = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.26, 10), headM); head.position.set(-0.85, 6.0, 0); grp.add(head);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(), color: 0xffc58a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.position.set(-0.85, 5.82, 0); glow.scale.setScalar(1.1); grp.add(glow);
  grp.position.set(6.2, groundY(-1), -1);
  scene.add(grp);
  return { headM, glow };
})();
function radialTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// migrating birds over the bay
const BIRDS = 46;
const birds = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, -0.55, 0.1, -0.05, 0, 0, -0.12, 0, 0, 0.12, 0.55, 0.1, -0.05, 0, 0, -0.12], 3));
  g.computeVertexNormals();
  const m = new THREE.MeshBasicMaterial({ color: 0x0d0d12, side: THREE.DoubleSide });
  const im = new THREE.InstancedMesh(g, m, BIRDS);
  im.frustumCulled = false;
  scene.add(im);
  const off = Array.from({ length: BIRDS }, () => ({ x: gauss() * 30, y: gauss() * 6, z: gauss() * 14, ph: rnd() * 6.28, f: 7 + rnd() * 3 }));
  return { im, off };
})();

// ---------------------------------------------------------------- simulation state
const START_MIN = 17 * 60 + 30, SPAN_MIN = 80; // 17:30 → 18:50
const state = { t: 0.0, playing: true, sketch: new URLSearchParams(location.search).get('style') !== 'real', speed: 1, cloudTime: 0, show: false, showAmt: 0, hold: 0, birdT: 0 };
const DURATION = 48; // seconds for the full time-lapse at 1×
const sunDir = new THREE.Vector3();
const tmpC = new THREE.Color();

function sunElevation(t) { // radians; sunset ≈ 17:50 in late October
  const minutes = t * SPAN_MIN;
  return THREE.MathUtils.degToRad(4.4 - minutes * 0.215);
}
function jsSunLight(s, out) { // mirrors sunLight() in GLSL
  const hi = [1.0, 0.84, 0.66].map((v) => v * 3.2), low = [1.0, 0.43, 0.19].map((v) => v * 2.6), red = [1.0, 0.3, 0.28].map((v) => v * 2.2);
  const a = smooth(0.02, 0.16, s), b = smooth(-0.05, 0.015, s), k = smooth(-0.16, -0.07, s);
  const c = [0, 1, 2].map((i) => lerp(red[i], lerp(low[i], hi[i], a), b) * k);
  return out.setRGB(c[0], c[1], c[2]);
}

function updateSim(dt) {
  if (state.playing) {
    if (state.t >= 1) { state.hold += dt; if (state.hold > 3) { state.t = 0; state.hold = 0; } }
    else state.t = Math.min(1, state.t + dt * state.speed / DURATION);
  }
  state.cloudTime += dt * (state.playing ? state.speed : 0.15);
  state.showAmt += ((state.show ? 1 : 0) - state.showAmt) * Math.min(1, dt * 2);

  const el = sunElevation(state.t);
  const az = 1.05; // behind-right of the viewer: clouds over the city are side/front-lit
  sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  skyUniforms.uSunDir.value.copy(sunDir);
  skyUniforms.uTime.value = state.cloudTime;
  skyUniforms.uWind.value.set(state.cloudTime * 26, -state.cloudTime * 9);

  const s = sunDir.y;
  const night = smooth(-0.02, -0.15, s);
  farUniforms.uNight.value = night;
  farUniforms.uTime.value = performance.now() / 1000;
  farUniforms.uShow.value = state.showAmt;
  jsSunLight(s, farUniforms.uSunCol.value);
  const day = smooth(-0.17, 0.1, s);
  farUniforms.uAmb.value.setRGB(lerp(0.035, 0.42, day), lerp(0.04, 0.42, day), lerp(0.09, 0.55, day));
  water.material.uniforms.uTime.value = performance.now() / 1000;

  // near lighting follows the sky
  sun.target.position.set(0, 0, -6);
  sun.position.copy(sunDir).multiplyScalar(160).add(sun.target.position);
  sun.color.copy(jsSunLight(s, tmpC)).multiplyScalar(0.75 * smooth(-0.01, 0.02, s));
  sun.intensity = 1;
  hemi.color.setRGB(lerp(0.06, 0.55, day), lerp(0.08, 0.6, day), lerp(0.18, 0.85, day));
  hemi.groundColor.setRGB(lerp(0.03, 0.32, day), lerp(0.025, 0.26, day), lerp(0.03, 0.24, day));
  hemi.intensity = 1.0;
  renderer.toneMappingExposure = lerp(0.82, 2.1, night);

  const lampOn = smooth(-0.005, -0.05, s);
  lamp.headM.color.setRGB(0.07 + lampOn * 3, 0.07 + lampOn * 2.2, 0.07 + lampOn * 1.3);
  lamp.glow.material.opacity = lampOn * 0.55;

  // clock
  const m = START_MIN + Math.round(state.t * SPAN_MIN);
  const label = s > 0.035 ? '黃金時刻' : s > -0.005 ? '日落' : s > -0.1 ? '暮光・魔幻時刻' : '藍調時刻';
  $('clock').innerHTML = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}<small>${label}</small>`;
  if (!dragging) $('t').value = Math.round(state.t * 1000);
}

function updateLife(dt) {
  const now = performance.now() / 1000;
  for (const w of walkers) {
    if (w.kind === 'walk') {
      w.x += w.v * dt;
      if (w.x > 60) w.x = -60; if (w.x < -60) w.x = 60;
      w.ph += Math.abs(w.v) * dt * (w.run ? 2.2 : 2.9) / w.h.H;
      poseWalk(w.h, w.ph, w.run);
    } else poseIdle(w.h, w.kind, now, w.seed);
    w.h.root.position.set(w.x, groundY(w.z), w.z);
  }
  for (const c of cyclists) {
    c.x += c.v * dt;
    if (c.x > 65) c.x = -65; if (c.x < -65) c.x = 65;
    c.ph += Math.abs(c.v) * dt / 0.34;
    for (const wh of c.wheels) wh.rotation.x = c.ph;
    poseRide(c, c.ph / 2.4);
    c.bike.position.set(c.x, groundY(c.z), c.z);
  }
  // birds: a loose flock drifting along the bay
  state.birdT += dt;
  const bt = state.birdT, cx = Math.sin(bt * 0.05) * 160, cz = -420 + Math.cos(bt * 0.037) * 90, cy = 34 + Math.sin(bt * 0.11) * 6;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  const head = Math.atan2(Math.cos(bt * 0.05) * 160 * 0.05, -Math.sin(bt * 0.037) * 60 * 0.037);
  birds.off.forEach((o, i) => {
    const flap = Math.sin(bt * o.f + o.ph);
    P.set(cx + o.x + Math.sin(bt * 0.3 + o.ph) * 3, cy + o.y + flap * 0.15, cz + o.z);
    E.set(0, head, 0); Q.setFromEuler(E);
    S.set(1.4, 1 + flap * 5, 1.4);
    M.compose(P, Q, S);
    // flapping: shear wings up/down via y-scale of the wingtip vertices is approximated by tilting
    birds.im.setMatrixAt(i, M);
  });
  birds.im.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- input
let dragging = false;
{
  const cv = renderer.domElement;
  let px = 0, py = 0, down = false;
  cv.addEventListener('pointerdown', (e) => { down = true; px = e.clientX; py = e.clientY; cv.setPointerCapture(e.pointerId); $('hint').style.opacity = 0; });
  cv.addEventListener('pointermove', (e) => {
    if (!down) return;
    const k = view.fov / innerHeight * Math.PI / 180;
    view.yaw = clamp(view.yaw + (e.clientX - px) * k, -1.35, 1.35);
    view.pitch = clamp(view.pitch + (e.clientY - py) * k, -0.12, 0.6);
    px = e.clientX; py = e.clientY;
  });
  cv.addEventListener('pointerup', () => { down = false; });
  cv.addEventListener('wheel', (e) => { view.fov = clamp(view.fov * Math.exp(e.deltaY * 0.001), 10, 60); e.preventDefault(); }, { passive: false });
  const slider = $('t');
  slider.addEventListener('pointerdown', () => { dragging = true; });
  window.addEventListener('pointerup', () => { dragging = false; });
  slider.addEventListener('input', () => { state.t = slider.value / 1000; state.hold = 0; });
  $('play').onclick = () => { state.playing = !state.playing; $('play').textContent = state.playing ? '❚❚' : '▶'; };
  const speeds = [1, 2, 4, 0.5];
  $('speed').onclick = () => { state.speed = speeds[(speeds.indexOf(state.speed) + 1) % speeds.length]; $('speed').textContent = state.speed + '×'; };
  const styleBtn = $('style');
  const syncStyle = () => { styleBtn.textContent = state.sketch ? '手繪' : '寫實'; styleBtn.classList.toggle('on', state.sketch); };
  styleBtn.onclick = () => { state.sketch = !state.sketch; syncStyle(); };
  syncStyle();
  $('show').onclick = () => { state.show = !state.show; $('show').classList.toggle('on', state.show); };
}

// ---------------------------------------------------------------- sizing & quality
const params = new URLSearchParams(location.search);
let skyScale = params.get('q') === 'high' ? 0.75 : params.get('q') === 'low' ? 0.33 : 0.5;
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  const w = Math.round(innerWidth * DPR), h = Math.round(innerHeight * DPR);
  skyRT.setSize(Math.max(2, Math.round(w * skyScale)), Math.max(2, Math.round(h * skyScale)));
  skyQuad.material.uniforms.uRes.value.set(w, h);
  sceneRT.setSize(w, h);
  postMat.uniforms.uRes.value.set(w, h);
  postMat.uniforms.uScale.value = Math.max(1, h / 900);
  water.getRenderTarget().setSize(Math.round(w * 0.5), Math.round(h * 0.5));
}
addEventListener('resize', resize);

// one synchronous GPU benchmark at boot (rAF intervals lie when the tab is throttled)
function benchmark() {
  if (params.has('q')) return;
  const gl = renderer.getContext(), px = new Uint8Array(4);
  const run = () => { renderFrame(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  run();
  const t0 = performance.now();
  for (let i = 0; i < 4; i++) run();
  const ms = (performance.now() - t0) / 4;
  if (ms < 9) { skyUniforms.uSteps.value = 88; skyScale = 0.62; }
  else if (ms > 40) { skyUniforms.uSteps.value = 40; skyScale = 0.34; }
  else if (ms > 22) { skyUniforms.uSteps.value = 52; skyScale = 0.42; }
  resize();
  window.__bench = ms;
}

function renderFrame(dt) {
  updateSim(dt);
  updateLife(dt);
  // keep a sensible horizontal field of view on portrait screens
  const minH = 34 * Math.PI / 180, vf = view.fov * Math.PI / 180;
  const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  camera.fov = hf < minH * view.fov / 24 ? 2 * Math.atan(Math.tan(minH * view.fov / 24 / 2) / camera.aspect) * 180 / Math.PI : view.fov;
  camera.rotation.set(view.pitch + (camera.aspect < 1 ? 0.1 : 0), -view.yaw, 0, 'YXZ');
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  skyUniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
  skyUniforms.uCamWorld.value.copy(camera.matrixWorld);
  skyUniforms.uCamPos.value.copy(camera.position);
  water.material.uniforms.uProjM.value.copy(camera.projectionMatrix);
  renderer.setRenderTarget(skyRT);
  renderer.render(skyScene, skyCam);
  skyUniforms.uToon.value = state.sketch ? 1 : 0;
  if (state.sketch) {
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    postMat.uniforms.uTime.value = performance.now() / 1000;
    postMat.uniforms.uExposure.value = renderer.toneMappingExposure / 0.6; // match three's ACES exposure scale
    renderer.render(postScene, skyCam);
  } else {
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }
}

// ---------------------------------------------------------------- boot
setTimeout(boot, 60);
function boot() {
  const noise = makeNoise3D(64);
  skyUniforms.uNoise.value = noise;
  water.material.uniforms.uNoise.value = noise;
  resize();
  benchmark();
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const ms = now - last; last = now;
    renderFrame(Math.min(ms, 100) / 1000);
  });
  const ld = $('loading'); ld.style.opacity = 0; setTimeout(() => ld.remove(), 900);
  setTimeout(() => { $('hint').style.opacity = 0; }, 7000);
}

// debug / playtest hooks (hidden panes throttle rAF)
window.__sz = {
  state, view, skyUniforms, renderer, sceneRT, farUniforms,
  setT(t) { state.t = t; },
  frame(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) renderFrame(dt); },
};
