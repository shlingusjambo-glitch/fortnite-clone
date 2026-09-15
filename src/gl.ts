import { M4, V3, mul, lookAt, ortho, add, scale, norm, cross } from './math.js';

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aCol;
uniform mat4 uVP, uM, uLVP; uniform vec3 uTint;
out vec3 vNrm, vCol, vWorld, vObj; out vec4 vSh;
void main(){ vec4 w = uM * vec4(aPos,1.0); vWorld = w.xyz; vObj = aPos; vNrm = mat3(uM) * aNrm; vCol = aCol * uTint; vSh = uLVP * w; gl_Position = uVP * w; }`;
const FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vNrm, vCol, vWorld, vObj; in vec4 vSh;
uniform vec3 uCam, uSun, uFog; uniform float uAlpha, uStyle, uTexel, uT, uFogD, uShadowQ; uniform sampler2DShadow uShadow;
out vec4 o;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * vn(p); p = p * 2.08 + 3.7; a *= 0.5; } return v; }
// planar uv from the dominant axis of the normal (object space)
vec2 puv(vec3 n, vec3 p){ vec3 a = abs(n); return a.y > a.x && a.y > a.z ? p.xz : (a.x > a.z ? p.zy : p.xy); }
void main(){
  vec3 n = normalize(vNrm);
  vec3 col = vCol; float rough = 0.85; float emit = 0.0;
  int st = int(uStyle + 0.5);
  if (st == 1) { vec3 g = abs(fract(vObj * 4.0) - 0.5); float l = 1.0 - smoothstep(0.42, 0.47, max(max(g.x, g.y), g.z)); col = mix(col, vec3(1.0), (1.0 - l) * 0.85); }
  else if (st == 2) {            // wood planks
    vec2 uv = puv(n, vObj); float pw = 0.35; float row = floor(uv.y / pw); float off = h2(vec2(row, 1.0)) * 3.0;
    float grain = fbm(vec2(uv.x * 2.2 + off, uv.y * 18.0)); col *= 0.80 + 0.38 * grain;
    float edge = smoothstep(0.0, 0.06, abs(fract(uv.y / pw) - 0.5) * pw); col *= mix(0.55, 1.0, edge);
    float seam = step(0.975, fract((uv.x + off) / 2.2)); col *= 1.0 - seam * 0.4;
  }
  else if (st == 3) {            // stone masonry
    vec2 uv = puv(n, vObj); float bh = 0.28, bw = 0.55; float row = floor(uv.y / bh); float x = uv.x / bw + (mod(row, 2.0) * 0.5);
    vec2 f = vec2(fract(x), fract(uv.y / bh)); float m = smoothstep(0.0, 0.08, f.x) * smoothstep(0.0, 0.12, f.y) * smoothstep(0.0, 0.08, 1.0 - f.x) * smoothstep(0.0, 0.12, 1.0 - f.y);
    float id = h2(vec2(floor(x), row)); col *= mix(1.15, 0.82 + 0.3 * id, m); col *= 0.92 + 0.15 * vn(uv * 18.0);
  }
  else if (st == 4) {            // metal panels
    vec2 uv = puv(n, vObj); vec2 f = fract(uv / 1.0); float line = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    col *= mix(0.6, 1.0, smoothstep(0.0, 0.05, line)); float diag = smoothstep(0.02, 0.05, abs(fract((uv.x + uv.y) * 1.5) - 0.5)); col *= 0.88 + 0.14 * diag;
    vec2 b = abs(f - 0.12); float bolt = step(length(b), 0.04) + step(length(abs(f - 0.88)), 0.04); col *= 1.0 - bolt * 0.45; rough = 0.38;
  }
  else if (st == 5) {            // terrain: grass detail, dirt speckle, rock strata on cliffs
    float v = fbm(vWorld.xz * 0.06), v2 = vn(vWorld.xz * 0.7), v3 = vn(vWorld.xz * 2.5);
    vec3 grass = col * (0.88 + 0.22 * v + 0.08 * v2 + 0.05 * v3);
    float slope = 1.0 - n.y;
    float band = 0.5 + 0.5 * sin(vWorld.y * 2.2 + vn(vWorld.xz * 0.3) * 3.0);
    vec3 rock = mix(vec3(0.62, 0.58, 0.50), vec3(0.82, 0.78, 0.68), band) * (0.85 + 0.3 * vn(vWorld.xz * 1.3 + vWorld.y));
    float rk = smoothstep(0.32, 0.5, slope);
    vec3 dirt = vec3(0.66, 0.54, 0.36) * (0.9 + 0.2 * v3);
    float dk = smoothstep(0.2, 0.32, slope) * (1.0 - rk);
    col = mix(mix(grass, dirt, dk), rock, rk);
    if (rk > 0.5) rough = 0.9;
  }
  else if (st == 6) {            // animated cartoon water with specular
    vec2 wuv1 = vWorld.xz * 0.2 + vec2(uT * 0.12, uT * 0.08);
    vec2 wuv2 = vWorld.xz * 0.45 - vec2(uT * 0.16, -uT * 0.05);
    float w = vn(wuv1) * 0.55 + vn(wuv2) * 0.45;
    col = mix(vec3(0.18, 0.62, 0.85), vec3(0.35, 0.88, 0.96), w);
    rough = 0.12; emit = 0.05;
  }
  else if (st == 8) {            // holographic build preview (blue grid as in Image 1)
    vec3 g = abs(fract(vObj * 2.0) - 0.5);
    float line = smoothstep(0.44, 0.48, max(max(g.x, g.y), g.z));
    vec3 blueGlow = vec3(0.25, 0.65, 1.0);
    vec3 whiteLine = vec3(0.95, 0.98, 1.0);
    col = mix(blueGlow, whiteLine, line);
    emit = 0.4 + line * 0.5;
    rough = 0.1;
  }
  if (st == 7) { o = vec4(col, uAlpha); return; }   // unlit (storm wall, fx)

  float d = max(dot(n, uSun), 0.0);
  vec3 s = vSh.xyz / vSh.w * 0.5 + 0.5;
  float lit = 1.0;
  if (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0 && s.z < 1.0) {
    float bias = 0.0012 + 0.0025 * (1.0 - d);
    if (uShadowQ > 1.5) { lit = 0.0; for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) lit += texture(uShadow, vec3(s.xy + vec2(i, j) * uTexel, s.z - bias)); lit /= 9.0; }
    else if (uShadowQ > 0.5) lit = texture(uShadow, vec3(s.xy, s.z - bias));
  }
  float hemi = 0.5 + 0.5 * n.y;
  vec3 v = normalize(uCam - vWorld); vec3 hv = normalize(v + uSun);
  float spec = pow(max(dot(n, hv), 0.0), 32.0) * (1.0 - rough) * (lit * 0.8 + 0.2);
  // Stylized character rim lighting for the cartoon silhouette (Image 2)
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.2) * 0.28 * max(dot(uSun, -v), 0.2);

  // Chapter 1 look: warm key light, cool sky-tinted ambient in shadow, painterly soft wrap on the terminator
  float wrap = smoothstep(-0.25, 0.6, dot(n, uSun));
  vec3 ambient = mix(vec3(0.42, 0.50, 0.66), vec3(0.62, 0.68, 0.78), hemi);
  float cloud = 0.72 + 0.28 * smoothstep(0.35, 0.7, vn(vWorld.xz * 0.012 + vec2(uT * 0.012, uT * 0.006)));   // drifting cloud shadows
  vec3 key = vec3(1.0, 0.94, 0.82) * (0.30 * d + 0.28 * wrap) * lit * cloud;
  vec3 c = col * (ambient + key + emit) + vec3(1.0, 0.96, 0.88) * spec * 0.45 + vec3(0.4, 0.7, 1.0) * rim;
  float dist = length(vWorld - uCam);
  float f = 1.0 - exp(-dist * uFogD);
  c = mix(c, uFog, clamp(f, 0.0, 0.92));
  c = pow(c * 1.08, vec3(0.94));                 // crisp vibrant tone curve
  c = mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, 1.12);   // slight saturation push
  o = vec4(c, uAlpha);
}`;
const DVS = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uLVP, uM; void main(){ gl_Position = uLVP * uM * vec4(aPos,1.0); }`;
const DFS = `#version 300 es
precision mediump float; void main(){}`;
const SKYVS = `#version 300 es
out vec2 vN; void main(){ vec2 p = vec2((gl_VertexID & 1) * 4 - 1, (gl_VertexID & 2) * 2 - 1); vN = p; gl_Position = vec4(p, 0.9999, 1.0); }`;
const SKYFS = `#version 300 es
precision highp float; in vec2 vN; out vec4 o;
uniform vec3 uF, uR, uU, uSun, uCam; uniform float uT, uAsp, uTan;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * vn(p); p *= 2.03; a *= 0.5; } return v; }
void main(){
  vec3 d = normalize(uF + uR * vN.x * uTan * uAsp + uU * vN.y * uTan);
  float y = max(d.y, 0.0);
  vec3 sky = mix(vec3(0.82, 0.91, 0.98), vec3(0.30, 0.62, 0.96), pow(y, 0.55));
  float sd = max(dot(d, uSun), 0.0); sky += vec3(1.0, 0.97, 0.85) * (smoothstep(0.9985, 0.9992, sd) * 1.5 + pow(sd, 12.0) * 0.35 + pow(sd, 3.0) * 0.08);
  if (d.y > 0.005) {
    vec2 p = (uCam.xz + d.xz / d.y * 900.0) * 0.0012 + vec2(uT * 0.006, 0.0);
    float c = fbm(p * vec2(1.0, 2.6)); c = smoothstep(0.38, 0.62, c);
    float c2 = fbm(p * 2.7 + 5.0); c *= 0.6 + 0.4 * c2;
    float fade = smoothstep(0.0, 0.12, d.y);
    vec3 cc = mix(vec3(0.88, 0.91, 0.95), vec3(1.0), c2);
    sky = mix(sky, cc, c * fade);
  }
  o = vec4(sky, 1.0);
}`;

export interface Mesh { vao: WebGLVertexArrayObject; n: number; data?: Float32Array; }
interface Item { m: Mesh; mat: M4; tint: V3; alpha: number; style: number; shadow: boolean; two: boolean; }
export interface Cam { pos: V3; fwd: V3; fov: number; aspect: number; }

// 1024 keeps the stylized soft shadow look while cutting shadow fill-rate by 75%.
const SM = 1024;
export class Renderer {
  gl: WebGL2RenderingContext; prog: WebGLProgram; dprog: WebGLProgram; sprog: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null> = {}; du: Record<string, WebGLUniformLocation | null> = {}; su: Record<string, WebGLUniformLocation | null> = {};
  fog: V3 = [0.80, 0.90, 0.98]; shadows = 2; scale = 1; items: Item[] = []; fbo: WebGLFramebuffer; shadowTex: WebGLTexture; emptyVao: WebGLVertexArrayObject;
  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false })!;
    this.gl = gl;
    const mk = (vs: string, fs: string, names: string[], into: Record<string, WebGLUniformLocation | null>) => {
      const sh = (t: number, s: string) => { const o = gl.createShader(t)!; gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; };
      const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw gl.getProgramInfoLog(p);
      for (const k of names) into[k] = gl.getUniformLocation(p, k);
      return p;
    };
    this.prog = mk(VS, FS, ['uVP', 'uM', 'uLVP', 'uTint', 'uAlpha', 'uCam', 'uSun', 'uFog', 'uStyle', 'uTexel', 'uShadow', 'uT', 'uFogD', 'uShadowQ'], this.u);
    this.dprog = mk(DVS, DFS, ['uLVP', 'uM'], this.du);
    this.sprog = mk(SKYVS, SKYFS, ['uF', 'uR', 'uU', 'uSun', 'uCam', 'uT', 'uAsp', 'uTan'], this.su);
    // shadow map
    this.shadowTex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SM, SM, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.fbo = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.emptyVao = gl.createVertexArray()!;
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
  }
  upload(data: Float32Array): Mesh {
    const gl = this.gl, vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12); }
    gl.bindVertexArray(null);
    return { vao, n: data.length / 9, data };
  }
  draw(m: Mesh, mat: M4, tint: V3 = [1, 1, 1], alpha = 1, style = 0, shadow = true, two = false) { if (!m) { console.error('draw(): undefined mesh', new Error().stack); return; } this.items.push({ m, mat, tint, alpha, style, shadow, two }); }

  /** render everything queued: shadow pass → sky → opaque → transparent */
  flush(cam: Cam, vp: M4, sun: V3, focus: V3, t: number, sky = true, shadowRange = 90) {
    const gl = this.gl, c = this.canvas;
    const cw = Math.round(c.clientWidth * this.scale), chh = Math.round(c.clientHeight * this.scale);
    if (c.width !== cw || c.height !== chh) { c.width = cw; c.height = chh; }
    // light matrix (ortho box around focus, texel-snapped)
    const ts = shadowRange * 2 / SM, fx = Math.round(focus[0] / ts) * ts, fz = Math.round(focus[2] / ts) * ts, f: V3 = [fx, focus[1], fz];
    const lvp = mul(ortho(-shadowRange, shadowRange, -shadowRange, shadowRange, 1, 400), lookAt(add(f, scale(sun, 200)), f));
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, SM, SM); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.dprog); gl.uniformMatrix4fv(this.du.uLVP, false, lvp); gl.cullFace(gl.FRONT);
    const sr2 = (shadowRange * 1.3) ** 2;
    if (this.shadows > 0) for (const it of this.items) if (it.shadow && it.alpha >= 1 && (it.mat[12] - f[0]) ** 2 + (it.mat[14] - f[2]) ** 2 < sr2) { gl.uniformMatrix4fv(this.du.uM, false, it.mat); gl.bindVertexArray(it.m.vao); gl.drawArrays(gl.TRIANGLES, 0, it.m.n); }
    gl.cullFace(gl.BACK); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, c.width, c.height);
    gl.clearColor(0, 0, 0, sky ? 1 : 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (sky) {
      const r = norm(cross(cam.fwd, [0, 1, 0])), u = cross(r, cam.fwd);
      gl.useProgram(this.sprog); gl.depthMask(false); gl.disable(gl.CULL_FACE);
      gl.uniform3fv(this.su.uF, cam.fwd); gl.uniform3fv(this.su.uR, r); gl.uniform3fv(this.su.uU, u); gl.uniform3fv(this.su.uSun, sun); gl.uniform3fv(this.su.uCam, cam.pos);
      gl.uniform1f(this.su.uT, t); gl.uniform1f(this.su.uAsp, cam.aspect); gl.uniform1f(this.su.uTan, Math.tan(cam.fov / 2));
      gl.bindVertexArray(this.emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.depthMask(true); gl.enable(gl.CULL_FACE);
    }
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uVP, false, vp); gl.uniformMatrix4fv(this.u.uLVP, false, lvp); gl.uniform3fv(this.u.uCam, cam.pos); gl.uniform3fv(this.u.uSun, sun); gl.uniform3fv(this.u.uFog, this.fog); gl.uniform1f(this.u.uTexel, 1 / SM); gl.uniform1f(this.u.uT, t); gl.uniform1f(this.u.uFogD, 0.0032 / (1 + Math.max(0, cam.pos[1] - 25) / 30));
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex); gl.uniform1i(this.u.uShadow, 0); gl.uniform1f(this.u.uShadowQ, this.shadows);
    const one = (it: Item) => { gl.uniformMatrix4fv(this.u.uM, false, it.mat); gl.uniform3fv(this.u.uTint, it.tint); gl.uniform1f(this.u.uAlpha, it.alpha); gl.uniform1f(this.u.uStyle, it.style); gl.bindVertexArray(it.m.vao); gl.drawArrays(gl.TRIANGLES, 0, it.m.n); };
    for (const it of this.items) if (it.alpha >= 1 && !it.two) one(it);
    gl.disable(gl.CULL_FACE); for (const it of this.items) if (it.alpha >= 1 && it.two) one(it); gl.enable(gl.CULL_FACE);
    gl.depthMask(false); gl.disable(gl.CULL_FACE);
    for (const it of this.items) if (it.alpha < 1) one(it);
    gl.depthMask(true); gl.enable(gl.CULL_FACE);
    this.items.length = 0;
  }
}
