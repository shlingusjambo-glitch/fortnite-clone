"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: !0, configurable: !0, writable: !0, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key != "symbol" ? key + "" : key, value);

  // src/math.ts
  var add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len = (a) => Math.hypot(a[0], a[1], a[2]), norm = (a) => {
    let l = len(a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }, lerp = (a, b, t2) => a + (b - a) * t2, clamp = (x, a, b) => Math.max(a, Math.min(b, x)), rand = (a = 0, b = 1) => a + Math.random() * (b - a), ident = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  function mul(a, b, out = new Float32Array(16)) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      out[i * 4 + j] = s;
    }
    return out;
  }
  var translate = (x, y, z) => {
    let m = ident();
    return m[12] = x, m[13] = y, m[14] = z, m;
  }, scaleM = (x, y, z) => {
    let m = ident();
    return m[0] = x, m[5] = y, m[10] = z, m;
  };
  function rotY(a) {
    let c = Math.cos(a), s = Math.sin(a), m = ident();
    return m[0] = c, m[2] = -s, m[8] = s, m[10] = c, m;
  }
  function rotX(a) {
    let c = Math.cos(a), s = Math.sin(a), m = ident();
    return m[5] = c, m[6] = s, m[9] = -s, m[10] = c, m;
  }
  function rotZ(a) {
    let c = Math.cos(a), s = Math.sin(a), m = ident();
    return m[0] = c, m[1] = s, m[4] = -s, m[5] = c, m;
  }
  function trs(p, yaw = 0, pitch = 0, s = 1) {
    let sc = typeof s == "number" ? [s, s, s] : s, m = mul(translate(p[0], p[1], p[2]), rotY(yaw));
    return pitch && (m = mul(m, rotX(pitch))), mul(m, scaleM(sc[0], sc[1], sc[2]));
  }
  function perspective(fov2, aspect, near, far) {
    let f = 1 / Math.tan(fov2 / 2), m = new Float32Array(16);
    return m[0] = f / aspect, m[5] = f, m[10] = (far + near) / (near - far), m[11] = -1, m[14] = 2 * far * near / (near - far), m;
  }
  function lookAt(eye, target, up = [0, 1, 0]) {
    let z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  }
  function transformPoint(m, p) {
    let w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] || 1;
    return [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w, (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w];
  }
  function transformDir(m, p) {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
  }
  function ortho(l, r, b, t2, n, f) {
    let m = new Float32Array(16);
    return m[0] = 2 / (r - l), m[5] = 2 / (t2 - b), m[10] = -2 / (f - n), m[12] = -(r + l) / (r - l), m[13] = -(t2 + b) / (t2 - b), m[14] = -(f + n) / (f - n), m[15] = 1, m;
  }

  // src/gl.ts
  var VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aCol;
uniform mat4 uVP, uM, uLVP; uniform vec3 uTint;
out vec3 vNrm, vCol, vWorld, vObj; out vec4 vSh;
void main(){ vec4 w = uM * vec4(aPos,1.0); vWorld = w.xyz; vObj = aPos; vNrm = mat3(uM) * aNrm; vCol = aCol * uTint; vSh = uLVP * w; gl_Position = uVP * w; }`, FS = `#version 300 es
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
}`, DVS = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uLVP, uM; void main(){ gl_Position = uLVP * uM * vec4(aPos,1.0); }`, DFS = `#version 300 es
precision mediump float; void main(){}`, SKYVS = `#version 300 es
out vec2 vN; void main(){ vec2 p = vec2((gl_VertexID & 1) * 4 - 1, (gl_VertexID & 2) * 2 - 1); vN = p; gl_Position = vec4(p, 0.9999, 1.0); }`, SKYFS = `#version 300 es
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
}`, SM = 1024, Renderer = class {
    constructor(canvas2) {
      __publicField(this, "canvas", canvas2);
      __publicField(this, "gl");
      __publicField(this, "prog");
      __publicField(this, "dprog");
      __publicField(this, "sprog");
      __publicField(this, "u", {});
      __publicField(this, "du", {});
      __publicField(this, "su", {});
      __publicField(this, "fog", [0.8, 0.9, 0.98]);
      __publicField(this, "shadows", 2);
      __publicField(this, "scale", 1);
      __publicField(this, "items", []);
      __publicField(this, "fbo");
      __publicField(this, "shadowTex");
      __publicField(this, "emptyVao");
      let gl = canvas2.getContext("webgl2", { antialias: !0, alpha: !0, premultipliedAlpha: !1 });
      this.gl = gl;
      let mk = (vs, fs, names, into) => {
        let sh = (t2, s) => {
          let o = gl.createShader(t2);
          if (gl.shaderSource(o, s), gl.compileShader(o), !gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o);
          return o;
        }, p = gl.createProgram();
        if (gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)), gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)), gl.linkProgram(p), !gl.getProgramParameter(p, gl.LINK_STATUS)) throw gl.getProgramInfoLog(p);
        for (let k of names) into[k] = gl.getUniformLocation(p, k);
        return p;
      };
      this.prog = mk(VS, FS, ["uVP", "uM", "uLVP", "uTint", "uAlpha", "uCam", "uSun", "uFog", "uStyle", "uTexel", "uShadow", "uT", "uFogD", "uShadowQ"], this.u), this.dprog = mk(DVS, DFS, ["uLVP", "uM"], this.du), this.sprog = mk(SKYVS, SKYFS, ["uF", "uR", "uU", "uSun", "uCam", "uT", "uAsp", "uTan"], this.su), this.shadowTex = gl.createTexture(), gl.bindTexture(gl.TEXTURE_2D, this.shadowTex), gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SM, SM, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL), this.fbo = gl.createFramebuffer(), gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo), gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0), gl.drawBuffers([gl.NONE]), gl.readBuffer(gl.NONE), gl.bindFramebuffer(gl.FRAMEBUFFER, null), this.emptyVao = gl.createVertexArray(), gl.enable(gl.DEPTH_TEST), gl.enable(gl.CULL_FACE), gl.enable(gl.BLEND), gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
    }
    upload(data) {
      let gl = this.gl, vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      let buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf), gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      for (let i = 0; i < 3; i++)
        gl.enableVertexAttribArray(i), gl.vertexAttribPointer(i, 3, gl.FLOAT, !1, 36, i * 12);
      return gl.bindVertexArray(null), { vao, n: data.length / 9 };
    }
    draw(m, mat, tint = [1, 1, 1], alpha = 1, style = 0, shadow = !0, two = !1) {
      if (!m) {
        console.error("draw(): undefined mesh", new Error().stack);
        return;
      }
      this.items.push({ m, mat, tint, alpha, style, shadow, two });
    }
    /** render everything queued: shadow pass → sky → opaque → transparent */
    flush(cam, vp, sun, focus, t2, sky = !0, shadowRange = 90) {
      let gl = this.gl, c = this.canvas, cw = Math.round(c.clientWidth * this.scale), chh = Math.round(c.clientHeight * this.scale);
      (c.width !== cw || c.height !== chh) && (c.width = cw, c.height = chh);
      let ts = shadowRange * 2 / SM, fx2 = Math.round(focus[0] / ts) * ts, fz = Math.round(focus[2] / ts) * ts, f = [fx2, focus[1], fz], lvp = mul(ortho(-shadowRange, shadowRange, -shadowRange, shadowRange, 1, 400), lookAt(add(f, scale(sun, 200)), f));
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo), gl.viewport(0, 0, SM, SM), gl.clear(gl.DEPTH_BUFFER_BIT), gl.useProgram(this.dprog), gl.uniformMatrix4fv(this.du.uLVP, !1, lvp), gl.cullFace(gl.FRONT);
      let sr2 = (shadowRange * 1.3) ** 2;
      if (this.shadows > 0) for (let it of this.items) it.shadow && it.alpha >= 1 && (it.mat[12] - f[0]) ** 2 + (it.mat[14] - f[2]) ** 2 < sr2 && (gl.uniformMatrix4fv(this.du.uM, !1, it.mat), gl.bindVertexArray(it.m.vao), gl.drawArrays(gl.TRIANGLES, 0, it.m.n));
      if (gl.cullFace(gl.BACK), gl.bindFramebuffer(gl.FRAMEBUFFER, null), gl.viewport(0, 0, c.width, c.height), gl.clearColor(0, 0, 0, sky ? 1 : 0), gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT), sky) {
        let r = norm(cross(cam.fwd, [0, 1, 0])), u = cross(r, cam.fwd);
        gl.useProgram(this.sprog), gl.depthMask(!1), gl.disable(gl.CULL_FACE), gl.uniform3fv(this.su.uF, cam.fwd), gl.uniform3fv(this.su.uR, r), gl.uniform3fv(this.su.uU, u), gl.uniform3fv(this.su.uSun, sun), gl.uniform3fv(this.su.uCam, cam.pos), gl.uniform1f(this.su.uT, t2), gl.uniform1f(this.su.uAsp, cam.aspect), gl.uniform1f(this.su.uTan, Math.tan(cam.fov / 2)), gl.bindVertexArray(this.emptyVao), gl.drawArrays(gl.TRIANGLES, 0, 3), gl.depthMask(!0), gl.enable(gl.CULL_FACE);
      }
      gl.useProgram(this.prog), gl.uniformMatrix4fv(this.u.uVP, !1, vp), gl.uniformMatrix4fv(this.u.uLVP, !1, lvp), gl.uniform3fv(this.u.uCam, cam.pos), gl.uniform3fv(this.u.uSun, sun), gl.uniform3fv(this.u.uFog, this.fog), gl.uniform1f(this.u.uTexel, 1 / SM), gl.uniform1f(this.u.uT, t2), gl.uniform1f(this.u.uFogD, 32e-4 / (1 + Math.max(0, cam.pos[1] - 25) / 30)), gl.activeTexture(gl.TEXTURE0), gl.bindTexture(gl.TEXTURE_2D, this.shadowTex), gl.uniform1i(this.u.uShadow, 0), gl.uniform1f(this.u.uShadowQ, this.shadows);
      let one = (it) => {
        gl.uniformMatrix4fv(this.u.uM, !1, it.mat), gl.uniform3fv(this.u.uTint, it.tint), gl.uniform1f(this.u.uAlpha, it.alpha), gl.uniform1f(this.u.uStyle, it.style), gl.bindVertexArray(it.m.vao), gl.drawArrays(gl.TRIANGLES, 0, it.m.n);
      };
      for (let it of this.items) it.alpha >= 1 && !it.two && one(it);
      gl.disable(gl.CULL_FACE);
      for (let it of this.items) it.alpha >= 1 && it.two && one(it);
      gl.enable(gl.CULL_FACE), gl.depthMask(!1), gl.disable(gl.CULL_FACE);
      for (let it of this.items) it.alpha < 1 && one(it);
      gl.depthMask(!0), gl.enable(gl.CULL_FACE), this.items.length = 0;
    }
  };

  // src/models.ts
  var rgb = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255], dk = (c, k) => [c[0] * k, c[1] * k, c[2] * k], lt = (c, k) => [Math.min(1, c[0] + (1 - c[0]) * k), Math.min(1, c[1] + (1 - c[1]) * k), Math.min(1, c[2] + (1 - c[2]) * k)], MB = class {
    constructor() {
      __publicField(this, "d", []);
      __publicField(this, "m", ident());
      __publicField(this, "stack", []);
    }
    push(m) {
      return this.stack.push(this.m), this.m = mul(this.m, m), this;
    }
    pop() {
      return this.m = this.stack.pop(), this;
    }
    tri(a, b, c, col) {
      a = transformPoint(this.m, a), b = transformPoint(this.m, b), c = transformPoint(this.m, c);
      let n = norm(cross(sub(b, a), sub(c, a)));
      for (let p of [a, b, c]) this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2]);
    }
    triN(a, b, c, na, nb, nc, col) {
      for (let [p, n] of [[a, na], [b, nb], [c, nc]]) {
        let q = transformPoint(this.m, p), m = norm(transformDir(this.m, n));
        this.d.push(q[0], q[1], q[2], m[0], m[1], m[2], col[0], col[1], col[2]);
      }
    }
    quad(a, b, c, d, col) {
      this.tri(a, b, c, col), this.tri(a, c, d, col);
    }
    quadN(a, b, c, d, na, nb, nc, nd, col) {
      this.triN(a, b, c, na, nb, nc, col), this.triN(a, c, d, na, nc, nd, col);
    }
    box(c, s, col) {
      let [x, y, z] = c, [w, h, l] = [s[0] / 2, s[1] / 2, s[2] / 2], p = (i) => [x + (i & 1 ? w : -w), y + (i & 2 ? h : -h), z + (i & 4 ? l : -l)];
      return this.quad(p(2), p(6), p(7), p(3), col), this.quad(p(0), p(1), p(5), p(4), dk(col, 0.65)), this.quad(p(4), p(5), p(7), p(6), dk(col, 0.92)), this.quad(p(1), p(0), p(2), p(3), dk(col, 0.92)), this.quad(p(5), p(1), p(3), p(7), dk(col, 0.82)), this.quad(p(0), p(4), p(6), p(2), dk(col, 0.82)), this;
    }
    /** High-poly smooth cylinder with optional beveled caps and normals */
    cyl(c, r0, r1, h, col, seg = 16, caps = !0, smooth = !0) {
      let [x, y, z] = c;
      for (let i = 0; i < seg; i++) {
        let a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1), b0 = [x + c0 * r0, y, z + s0 * r0], b1 = [x + c1 * r0, y, z + s1 * r0], t0 = [x + c0 * r1, y + h, z + s0 * r1], t1 = [x + c1 * r1, y + h, z + s1 * r1];
        if (smooth) {
          let ny = (r0 - r1) / (h || 1e-3), n0 = norm([c0, ny, s0]), n1 = norm([c1, ny, s1]);
          this.triN(b1, b0, t0, n1, n0, n0, col), this.triN(b1, t0, t1, n1, n0, n1, col);
        } else
          r1 > 0 ? this.quad(b1, b0, t0, t1, col) : this.tri(b1, b0, t0, col);
        caps && (r0 > 0 && this.tri([x, y, z], b0, b1, dk(col, 0.72)), r1 > 0 && this.tri([x, y + h, z], t1, t0, lt(col, 0.12)));
      }
      return this;
    }
    /** Smooth high-poly sphere / spheroid with per-vertex normals */
    sphere(c, r, col, seg = 12, sy = 1, smooth = !0, rows = [0, 1]) {
      let p = (i, j) => {
        let ph = i / seg * Math.PI, th = j / (seg * 2) * Math.PI * 2;
        return [c[0] + r * Math.sin(ph) * Math.cos(th), c[1] + r * sy * Math.cos(ph), c[2] + r * Math.sin(ph) * Math.sin(th)];
      }, n = (i, j) => norm(sub(p(i, j), c)), startRow = Math.max(0, Math.round(rows[0] * seg)), endRow = Math.min(seg, Math.round(rows[1] * seg));
      for (let i = startRow; i < endRow; i++)
        for (let j = 0; j < seg * 2; j++) {
          let jNext = (j + 1) % (seg * 2), p00 = p(i, j), p01 = p(i, jNext), p11 = p(i + 1, jNext), p10 = p(i + 1, j);
          if (smooth) {
            let n00 = n(i, j), n01 = n(i, jNext), n11 = n(i + 1, jNext), n10 = n(i + 1, j);
            i === 0 ? this.triN(p00, p11, p10, n00, n11, n10, col) : i === seg - 1 ? this.triN(p00, p01, p11, n00, n01, n11, col) : (this.triN(p00, p01, p11, n00, n01, n11, col), this.triN(p00, p11, p10, n00, n11, n10, col));
          } else
            this.quad(p00, p01, p11, p10, col);
        }
      return this;
    }
    /** Smooth chamfer box (curved edges and rounded corners) */
    rbox(c, s, col, r = 0.05) {
      let [x, y, z] = c, [w, h, l] = [s[0] / 2, s[1] / 2, s[2] / 2];
      this.box([x, y, z], [s[0] - 2 * r, s[1], s[2] - 2 * r], col), this.box([x, y, z], [s[0], s[1] - 2 * r, s[2] - 2 * r], col), this.box([x, y, z], [s[0] - 2 * r, s[1] - 2 * r, s[2]], col);
      for (let sx of [-1, 1]) for (let sy of [-1, 1])
        this.box([x + sx * (w - r), y + sy * (h - r), z], [r * 1.5, r * 1.5, s[2] - 2 * r], dk(col, 0.92));
      for (let sx of [-1, 1]) for (let sz of [-1, 1])
        this.box([x + sx * (w - r), y, z + sz * (l - r)], [r * 1.5, s[1] - 2 * r, r * 1.5], dk(col, 0.92));
      for (let sy of [-1, 1]) for (let sz of [-1, 1])
        this.box([x, y + sy * (h - r), z + sz * (l - r)], [s[0] - 2 * r, r * 1.5, r * 1.5], dk(col, 0.92));
      return this;
    }
    /** Torus / ring (for sights, collars, belts, rims) */
    torus(c, R2, r, col, segR = 16, segr = 8) {
      for (let i = 0; i < segR; i++) {
        let u0 = i / segR * Math.PI * 2, u1 = (i + 1) / segR * Math.PI * 2;
        for (let j = 0; j < segr; j++) {
          let v0 = j / segr * Math.PI * 2, v1 = (j + 1) / segr * Math.PI * 2, pt = (u, v) => [
            c[0] + (R2 + r * Math.cos(v)) * Math.cos(u),
            c[1] + r * Math.sin(v),
            c[2] + (R2 + r * Math.cos(v)) * Math.sin(u)
          ];
          this.quad(pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1), col);
        }
      }
      return this;
    }
    /** High-poly timber plank with beveled border and end-grain */
    plank(c, s, col, r = 0.02) {
      return this.rbox(c, s, col, r), this.box([c[0], c[1], c[2] + s[2] * 0.49], [s[0] * 0.96, s[1] * 0.96, 0.01], dk(col, 0.85)), this.box([c[0], c[1], c[2] - s[2] * 0.49], [s[0] * 0.96, s[1] * 0.96, 0.01], dk(col, 0.85)), this;
    }
    build(r) {
      return r.upload(new Float32Array(this.d));
    }
  }, C = {
    wood: rgb(14205595),
    woodDark: rgb(10320466),
    woodLight: rgb(15456437),
    stone: rgb(12892584),
    stoneDark: rgb(9340023),
    stoneLight: rgb(14867151),
    metal: rgb(11715279),
    metalDark: rgb(6649736),
    metalLight: rgb(14411504),
    leaf: rgb(6277444),
    leaf2: rgb(4565298),
    leaf3: rgb(7790158),
    pine: rgb(3115846),
    pine2: rgb(4499035),
    pineDark: rgb(2122546),
    trunk: rgb(8544320),
    trunkDark: rgb(6046248),
    rock: rgb(9605e3),
    rockDark: rgb(7038816),
    gold: rgb(15775780),
    dark: rgb(1710624),
    white: rgb(16777215),
    red: rgb(15088443),
    blue: rgb(2918645),
    green: rgb(3523157),
    purple: rgb(9850342),
    orange: rgb(16747038),
    yellow: rgb(16765490),
    bus: rgb(2649830),
    balloon: rgb(5161670),
    cream: rgb(15657172),
    asphalt: rgb(4869458),
    glass: rgb(13692156),
    holographic: rgb(4044287)
  }, SKINS = [
    { name: "Jonesy", skin: rgb(16042395), top: rgb(7042898), top2: rgb(4871476), pants: rgb(6508347), boots: rgb(2236966), hair: rgb(15912784), hat: "blonde", style: 0 },
    { name: "Ramirez", skin: rgb(14392184), top: rgb(16417834), top2: rgb(3949133), pants: rgb(5002568), boots: rgb(2236966), hair: rgb(2104866), hat: "hair", style: 0, female: !0 },
    { name: "Skull Trooper", skin: rgb(14606054), top: rgb(1447452), top2: rgb(9068520), pants: rgb(1776418), boots: rgb(1118484), hair: rgb(1118484), hat: "beanie", style: 0, ribs: !0 },
    { name: "Wildcat", skin: rgb(13405026), top: rgb(15107874), top2: rgb(2501168), pants: rgb(3357509), boots: rgb(1579551), hair: rgb(9185304), hat: "spiky", style: 0, female: !0 },
    { name: "Renegade", skin: rgb(10710087), top: rgb(8537142), top2: rgb(4009001), pants: rgb(6049085), boots: rgb(2367516), hair: rgb(1709588), hat: "cap", style: 0, female: !0 },
    { name: "Arctic Ace", skin: rgb(15454898), top: rgb(15659767), top2: rgb(9484244), pants: rgb(8427691), boots: rgb(3292746), hair: rgb(14413560), hat: "beanie", style: 1 },
    { name: "Neon Striker", skin: rgb(7556152), top: rgb(2237501), top2: rgb(3205316), pants: rgb(1975350), boots: rgb(1184796), hair: rgb(11815679), hat: "spiky", style: 1 },
    { name: "Black Knight", skin: rgb(14201999), top: rgb(1776418), top2: rgb(13111342), pants: rgb(2302763), boots: rgb(1315864), hair: rgb(2829107), hat: "beanie", style: 0 },
    { name: "Rust Lord", skin: rgb(14726284), top: rgb(11880223), top2: rgb(3947588), pants: rgb(4864556), boots: rgb(2761760), hair: rgb(9067050), hat: "cap", style: 0 },
    { name: "Brite Bomber", skin: rgb(15845797), top: rgb(16727753), top2: rgb(9167103), pants: rgb(7093503), boots: rgb(16727753), hair: rgb(12078335), hat: "hair", style: 0, female: !0 },
    { name: "Raven", skin: rgb(10132136), top: rgb(1381664), top2: rgb(5913855), pants: rgb(1052696), boots: rgb(789522), hair: rgb(921108), hat: "beanie", style: 1 },
    { name: "Renegade Raider", skin: rgb(15253658), top: rgb(9050642), top2: rgb(2763312), pants: rgb(3881796), boots: rgb(1710622), hair: rgb(3810328), hat: "cap", style: 0, female: !0 },
    { name: "Aerial Assault Trooper", skin: rgb(14266508), top: rgb(2834218), top2: rgb(6978106), pants: rgb(4872762), boots: rgb(1973794), hair: rgb(2760212), hat: "beanie", style: 0 },
    { name: "Blue Squire", skin: rgb(15780004), top: rgb(2250188), top2: rgb(14212584), pants: rgb(1719434), boots: rgb(2763312), hair: rgb(5913114), hat: "hair", style: 0 },
    { name: "Tower Recon Specialist", skin: rgb(13208168), top: rgb(12034940), top2: rgb(4868666), pants: rgb(6974026), boots: rgb(2761760), hair: rgb(1709072), hat: "cap", style: 0 },
    { name: "Grid Leader", skin: rgb(10213882), top: rgb(15704804), top2: rgb(9229823), pants: rgb(10213882), boots: rgb(15704804), hair: rgb(10213882), hat: "spiky", style: 1 }
  ];
  function buildCharacter(r, s, bulk = 1) {
    let mk = (f) => {
      let b = new MB();
      return f(b), b.build(r);
    }, sw = (s.female ? 0.88 : 1.02) * bulk, black = rgb(1973796), darkGrey = rgb(3158843), gold = rgb(15119394);
    return {
      style: s.style,
      torso: mk((b) => {
        if (b.cyl([0, 0.72, 0], 0.26 * sw, 0.25 * sw, 0.14, s.pants, 20, !0, !0), b.cyl([0, 0.85, 0], 0.24 * sw, 0.28 * sw, 0.24, s.top, 20, !1, !0), b.cyl([0, 1.08, 0], 0.28 * sw, 0.36 * sw, 0.32, s.top, 20, !1, !0), b.sphere([0, 1.36, 0.04 * sw], 0.35 * sw, s.top, 14, 0.52, !0, [0, 0.65]), b.cyl([0, 1.44, 0], 0.11, 0.12, 0.14, s.skin, 14, !1, !0), b.torus([0, 1.45, 0], 0.14 * sw, 0.025, s.top2, 16, 8), !s.female && !s.ribs && (b.torus([0, 1.41, 0.05], 0.13 * sw, 8e-3, rgb(11184810), 16, 6), b.box([0.02, 1.28, 0.22 * sw], [0.035, 0.05, 8e-3], rgb(13421772))), s.ribs) {
          for (let i = 0; i < 5; i++) {
            let y = 1.34 - i * 0.09, rw = (0.34 - i * 0.028) * sw;
            b.cyl([0, y, 0.18 * sw], rw * 0.5, rw * 0.5, 0.028, C.white, 12, !0, !0);
          }
          b.box([0, 1.16, 0.2 * sw], [0.06, 0.44, 0.025], C.white);
        } else {
          b.rbox([0, 1.22, 0.19 * sw], [0.52 * sw, 0.46, 0.08], s.top2, 0.03), b.rbox([0, 1.22, -0.19 * sw], [0.5 * sw, 0.48, 0.08], s.top2, 0.03);
          for (let sx of [-0.18, 0.18])
            b.box([sx * sw, 1.38, 0], [0.09, 0.04, 0.42 * sw], black), b.box([sx * sw, 1.32, 0.23 * sw], [0.07, 0.05, 0.02], rgb(8947848));
          for (let x of [-0.14, 0.14])
            b.rbox([x * sw, 1.18, 0.24 * sw], [0.11, 0.14, 0.07], darkGrey, 0.02), b.box([x * sw, 1.22, 0.28 * sw], [0.025, 0.025, 0.01], gold);
          b.box([-0.22 * sw, 1.26, 0.22 * sw], [0.06, 0.12, 0.05], black), b.cyl([-0.22 * sw, 1.32, 0.22 * sw], 8e-3, 6e-3, 0.14, black, 8), b.box([0, 0.85, 0], [0.58 * sw, 0.08, 0.44 * sw], black), b.box([0, 0.85, 0.23 * sw], [0.12, 0.09, 0.03], gold), b.box([0, 0.85, 0.24 * sw], [0.07, 0.05, 0.02], black), b.cyl([0.28 * sw, 0.85, 0], 0.06, 0.06, 0.11, darkGrey, 10, !0, !0), b.rbox([-0.27 * sw, 0.85, 0], [0.08, 0.11, 0.14], darkGrey, 0.02), b.rbox([0, 1.12, -0.28 * sw], [0.3 * sw, 0.34, 0.15], dk(s.top2, 0.85), 0.03);
        }
      }),
      head: mk((b) => {
        b.sphere([0, 0.27, 0.01], 0.235, s.skin, 16, 1.12, !0), b.sphere([0, 0.18, 0.12], 0.11, s.skin, 12, 0.85, !0);
        for (let sx of [-0.082, 0.082])
          b.sphere([sx, 0.285, 0.19], 0.045, C.white, 10, 0.7, !0), b.sphere([sx, 0.288, 0.218], 0.024, C.dark, 8, 0.7, !0), b.sphere([sx + 8e-3, 0.298, 0.228], 9e-3, C.white, 6, 1, !0), b.box([sx, 0.345, 0.21], [0.075, 0.022, 0.02], dk(s.hair, 0.45)), b.sphere([sx * 1.3, 0.23, 0.16], 0.06, lt(s.skin, 0.08), 8, 0.6, !0);
        b.cyl([0, 0.22, 0.22], 0.032, 0.018, 0.075, dk(s.skin, 0.94), 10, !0, !0), b.sphere([0, 0.225, 0.245], 0.032, dk(s.skin, 0.96), 10, 1, !0), b.box([0, 0.155, 0.215], [0.08, 0.018, 0.02], dk(s.skin, 0.65));
        for (let sx of [-0.225, 0.225])
          b.push(mul(translate(sx, 0.26, 0), rotY(sx > 0 ? 0.3 : -0.3))), b.sphere([0, 0, 0], 0.065, s.skin, 8, 1.4, !0), b.sphere([0, 0, 0.01], 0.04, dk(s.skin, 0.8), 8, 1.2, !0), b.pop();
        if (s.hat === "blonde") {
          b.sphere([0, 0.32, -0.04], 0.255, s.hair, 16, 1.05, !0), b.rbox([0, 0.43, 0.08], [0.34, 0.13, 0.28], s.hair, 0.04), b.rbox([0.05, 0.46, 0.18], [0.22, 0.09, 0.16], lt(s.hair, 0.15), 0.03), b.rbox([-0.08, 0.42, 0.2], [0.14, 0.07, 0.12], s.hair, 0.02);
          for (let sx of [-0.2, 0.2])
            b.cyl([sx, 0.3, 0.05], 0.04, 0.02, 0.12, s.hair, 8, !0, !0);
        } else if (s.female && s.hat === "hair")
          b.sphere([0, 0.31, -0.03], 0.255, s.hair, 16, 1.05, !0), b.sphere([0, 0.36, -0.22], 0.13, s.hair, 14, 1, !0), b.torus([0, 0.36, -0.16], 0.07, 0.02, C.orange, 12, 6), b.rbox([0, 0.39, 0.14], [0.32, 0.06, 0.12], s.hair, 0.02);
        else if (s.hat === "beanie")
          b.sphere([0, 0.32, 0], 0.265, s.hair, 16, 1.08, !0, [0, 0.5]), b.cyl([0, 0.31, 0], 0.255, 0.265, 0.11, dk(s.hair, 0.85), 18, !1, !0), b.sphere([0, 0.48, -0.02], 0.06, dk(s.hair, 0.7), 10, 1, !0);
        else if (s.hat === "spiky") {
          b.sphere([0, 0.31, -0.02], 0.255, s.hair, 16, 1.05, !0);
          for (let i = 0; i < 12; i++) {
            let a = i / 12 * Math.PI * 2, rr = 0.16;
            b.cyl([Math.cos(a) * rr, 0.44, Math.sin(a) * rr * 0.85 - 0.02], 0.045, 0.015, 0.16, s.hair, 8, !0, !0);
          }
          b.cyl([0, 0.48, 0], 0.06, 0.02, 0.18, s.hair, 8, !0, !0);
        } else
          b.sphere([0, 0.31, -0.02], 0.265, s.hair, 16, 1.08, !0);
      }),
      upperArm: mk((b) => {
        b.sphere([0, 0, 0], 0.14 * sw, s.top, 14, 1.1, !0), b.cyl([0, -0.3, 0], 0.1 * sw, 0.13 * sw, 0.3, s.top, 14, !1, !0), b.torus([0, -0.28, 0], 0.11 * sw, 0.022, s.top2, 14, 6), s.ribs && b.sphere([0, -0.05, 0], 0.16 * sw, s.top, 10, 1, !0);
      }),
      foreArm: mk((b) => {
        b.sphere([0, 0, 0], 0.105 * sw, s.skin, 12, 1, !0), b.cyl([0, -0.28, 0], 0.082, 0.1 * sw, 0.28, s.skin, 14, !1, !0), b.torus([0, -0.16, 0], 0.092 * sw, 0.022, s.top2, 14, 6), b.torus([0, -0.12, 0], 0.094 * sw, 0.022, s.top2, 14, 6), b.rbox([0, -0.29, 0.01], [0.12, 0.08, 0.09], black, 0.02), b.rbox([0, -0.36, 0.01], [0.13, 0.12, 0.08], darkGrey, 0.02), b.rbox([0, -0.34, 0.05], [0.11, 0.03, 0.03], black, 0.01), b.cyl([0.06, -0.34, 0.04], 0.022, 0.018, 0.06, s.skin, 8, !0, !0);
        for (let f = -1.5; f <= 1.5; f += 1)
          b.cyl([f * 0.03, -0.42, 0.01], 0.016, 0.014, 0.05, s.skin, 6, !0, !0);
      }),
      thigh: mk((b) => {
        b.sphere([0, 0, 0], 0.145, s.pants, 14, 1.1, !0), b.cyl([0, -0.4, 0], 0.125, 0.145, 0.4, s.pants, 16, !1, !0), b.rbox([0.06, -0.22, 0.08], [0.14, 0.16, 0.07], dk(s.pants, 0.85), 0.02), b.box([0.06, -0.15, 0.12], [0.14, 0.04, 0.02], dk(s.pants, 0.72));
      }),
      shin: mk((b) => {
        b.sphere([0, 0, 0], 0.125, s.pants, 12, 1, !0), b.rbox([0.01, -0.03, 0.11], [0.14, 0.15, 0.07], black, 0.025), b.box([0.01, -0.03, -0.11], [0.12, 0.1, 0.03], black), b.cyl([0, -0.3, 0], 0.11, 0.12, 0.3, s.pants, 14, !1, !0), b.push(scaleM(1, 1, 1.25)), b.cyl([0, -0.4, 0.02], 0.128, 0.115, 0.15, s.boots, 16, !0, !0), b.pop(), b.rbox([0, -0.36, 0.06], [0.22, 0.12, 0.34], s.boots, 0.03), b.box([0, -0.44, 0.06], [0.24, 0.06, 0.38], black);
        for (let k = 0; k < 3; k++) {
          let y = -0.32 - k * 0.04;
          b.box([-0.04, y, 0.17], [0.018, 0.018, 0.01], rgb(12303291)), b.box([0.04, y, 0.17], [0.018, 0.018, 0.01], rgb(12303291)), b.box([0, y, 0.175], [0.08, 0.01, 8e-3], rgb(8947848));
        }
      })
    };
  }
  var HOUSE_STYLES = [
    { wall: rgb(12900066), roof: rgb(5001820), trim: rgb(16316662), style: 0 },
    { wall: rgb(11565672), roof: rgb(4014150), trim: rgb(15722972), style: 3 },
    { wall: rgb(15131346), roof: rgb(5922664), trim: rgb(16777215), style: 0 },
    { wall: rgb(11123913), roof: rgb(4672082), trim: rgb(16185078), style: 0 },
    { wall: rgb(13621446), roof: rgb(9062972), trim: rgb(16447210), style: 0 },
    { wall: rgb(14272936), roof: rgb(5595246), trim: rgb(16777215), style: 0 }
  ], FH = 3.6;
  function editedPiece(r, type, mat, mask) {
    let b = new MB(), c = mat === "metal" ? C.metal : mat === "stone" ? C.stone : C.wood, c2 = mat === "metal" ? C.metalDark : mat === "stone" ? C.stoneDark : C.woodDark;
    if (type === "wall") {
      let T = 1.3333333333333333;
      for (let i = 0; i < 9; i++) {
        if (mask & 1 << i) continue;
        let row = Math.floor(i / 3), col = i % 3;
        b.plank([-2 + (col + 0.5) * T, (row + 0.5) * T, 0], [T * 0.98, T * 0.98, 0.22], c, 0.02);
      }
      for (let i = 0; i < 9; i++) {
        if (!(mask & 1 << i)) continue;
        let row = Math.floor(i / 3), col = i % 3, x = -2 + (col + 0.5) * T, y = (row + 0.5) * T, nb = (j) => j < 0 || j > 8 || mask & 1 << j;
        (!nb(i + 3) || row === 2) && b.rbox([x, y + T / 2, 0], [T, 0.12, 0.28], c2, 0.02), (!nb(i - 3) || row === 0) && b.rbox([x, y - T / 2, 0], [T, 0.12, 0.28], c2, 0.02), col < 2 && !nb(i + 1) && b.rbox([x + T / 2, y, 0], [0.12, T, 0.28], c2, 0.02), col > 0 && !nb(i - 1) && b.rbox([x - T / 2, y, 0], [0.12, T, 0.28], c2, 0.02);
      }
    } else
      for (let i = 0; i < 4; i++) {
        if (mask & 1 << i) continue;
        let cx = i % 2 ? 1 : -1, cz = i > 1 ? 1 : -1;
        b.plank([cx, -0.12, cz], [1.96, 0.24, 1.96], c, 0.02);
      }
    return b.build(r);
  }
  function buildModels(r) {
    let M2 = {}, mk = (f) => {
      let b = new MB();
      return f(b), b.build(r);
    };
    M2.pickaxe = mk((b) => {
      b.cyl([0, 0, 0], 0.032, 0.028, 0.95, rgb(6638130), 12, !0, !0);
      for (let i = 0; i < 6; i++)
        b.torus([0, 0.15 + i * 0.04, 0], 0.034, 8e-3, C.dark, 12, 6);
      b.rbox([0, 0.92, 0], [0.24, 0.14, 0.14], rgb(4343374), 0.02), b.box([0, 0.92, 0.07], [0.12, 0.08, 0.03], C.gold);
      for (let sx of [-1, 1])
        b.push(mul(translate(sx * 0.22, 0.9, 0), rotZ(sx * -0.25))), b.cyl([0, 0, 0], 0.065, 0.025, 0.32, rgb(10463412), 8, !0, !0), b.cyl([0, 0.3, 0], 0.025, 5e-3, 0.14, rgb(13687010), 6, !0, !0), b.pop();
    });
    let gunMetal = rgb(2631981), steelGrey = rgb(6647160), tanReceiver = rgb(13938024);
    return M2.ar = mk((b) => {
      b.rbox([0, 0, 0.12], [0.1, 0.16, 0.72], tanReceiver, 0.025), b.box([0, 0.09, 0.18], [0.055, 0.035, 0.58], gunMetal), b.cyl([0, 0.02, 0.85], 0.026, 0.026, 0.42, gunMetal, 12, !0, !0), b.cyl([0, 0.02, 1.25], 0.035, 0.035, 0.08, steelGrey, 8, !0, !0), b.box([0, 0.08, 1], [0.03, 0.08, 0.05], gunMetal), b.box([0, 0.12, 0.12], [0.04, 0.06, 0.04], gunMetal), b.push(mul(translate(0, -0.16, -0.04), rotX(0.35))), b.rbox([0, 0, 0], [0.065, 0.2, 0.09], gunMetal, 0.02), b.pop(), b.push(mul(translate(0, -0.22, 0.22), rotX(0.25))), b.rbox([0, 0, 0], [0.065, 0.3, 0.11], gunMetal, 0.015);
      for (let i = -1; i <= 1; i++) b.box([0, i * 0.07, 0.06], [0.068, 0.02, 0.015], tanReceiver);
      b.pop(), b.rbox([0, -0.01, -0.34], [0.075, 0.13, 0.34], tanReceiver, 0.02), b.rbox([0, -0.06, -0.51], [0.075, 0.17, 0.06], gunMetal, 0.015);
    }), M2.burst = mk((b) => {
      b.rbox([0, 0, 0.12], [0.095, 0.15, 0.72], rgb(9080958), 0.025), b.cyl([0, 0.02, 0.85], 0.028, 0.028, 0.36, gunMetal, 12, !0, !0), b.rbox([0, -0.16, -0.04], [0.065, 0.2, 0.09], gunMetal, 0.02), b.rbox([0, -0.22, 0.2], [0.065, 0.28, 0.11], gunMetal, 0.02), b.rbox([0, -0.01, -0.34], [0.075, 0.13, 0.32], rgb(9080958), 0.02), b.box([0, 0.12, 0.14], [0.05, 0.07, 0.32], gunMetal);
    }), M2.shotgun = mk((b) => {
      b.rbox([0, 0, -0.05], [0.095, 0.14, 0.46], gunMetal, 0.02), b.cyl([0, 0.035, 0.16], 0.032, 0.032, 0.85, gunMetal, 12, !0, !0), b.cyl([0, -0.042, 0.16], 0.03, 0.03, 0.6, steelGrey, 12, !0, !0), b.rbox([0, -0.042, 0.48], [0.095, 0.095, 0.24], rgb(7227950), 0.02);
      for (let i = 0; i < 5; i++) b.box([0, -0.042, 0.4 + i * 0.04], [0.1, 0.1, 0.012], rgb(4533531));
      b.push(mul(translate(0, -0.08, -0.22), rotX(0.2))), b.rbox([0, 0, 0], [0.075, 0.14, 0.18], rgb(7227950), 0.02), b.pop(), b.rbox([0, -0.05, -0.42], [0.08, 0.16, 0.32], rgb(7227950), 0.025), b.box([0, -0.05, -0.58], [0.082, 0.17, 0.04], gunMetal);
    }), M2.sniper = mk((b) => {
      b.rbox([0, 0, 0.05], [0.085, 0.14, 0.68], rgb(5920326), 0.025), b.cyl([0, 0.02, 0.38], 0.032, 0.028, 1.15, gunMetal, 14, !0, !0), b.box([0, 0.02, 1.54], [0.09, 0.06, 0.14], gunMetal), b.cyl([0, 0.15, -0.08], 0.05, 0.05, 0.46, gunMetal, 16, !0, !0), b.cyl([0, 0.15, -0.16], 0.06, 0.05, 0.1, gunMetal, 16, !0, !0), b.cyl([0, 0.15, 0.36], 0.05, 0.065, 0.12, gunMetal, 16, !0, !0), b.sphere([0, 0.15, 0.46], 0.055, C.holographic, 12, 0.3, !0), b.box([0, 0.08, -0.02], [0.04, 0.06, 0.06], steelGrey), b.box([0, 0.08, 0.22], [0.04, 0.06, 0.06], steelGrey), b.box([0.08, 0.04, -0.04], [0.09, 0.03, 0.03], steelGrey), b.sphere([0.13, 0.04, -0.04], 0.035, gunMetal, 8, 1, !0), b.rbox([0, -0.02, -0.42], [0.075, 0.16, 0.38], rgb(5920326), 0.02), b.box([0, 0.07, -0.38], [0.076, 0.05, 0.18], gunMetal);
    }), M2.pistol = mk((b) => {
      b.rbox([0, 0.02, 0.06], [0.07, 0.1, 0.34], gunMetal, 0.015), b.cyl([0, 0.02, 0.26], 0.018, 0.018, 0.1, steelGrey, 10, !0, !0), b.push(mul(translate(0, -0.11, -0.06), rotX(0.3))), b.rbox([0, 0, 0], [0.06, 0.2, 0.08], rgb(3812900), 0.015), b.pop(), b.box([0, -0.04, 0.02], [0.03, 0.05, 0.06], gunMetal);
      for (let i = 0; i < 4; i++) b.box([0.036, 0.04, -0.06 + i * 0.03], [4e-3, 0.06, 0.012], steelGrey);
    }), M2.tac = mk((b) => {
      b.rbox([0, 0, -0.02], [0.1, 0.15, 0.5], rgb(3093560), 0.02), b.cyl([0, 0.035, 0.2], 0.03, 0.03, 0.7, gunMetal, 12, !0, !0), b.cyl([0, -0.04, 0.2], 0.03, 0.03, 0.6, steelGrey, 12, !0, !0), b.rbox([0, -0.04, 0.42], [0.1, 0.1, 0.3], rgb(3093560), 0.02);
      for (let i = 0; i < 6; i++) b.box([0, 0.1, 0.05 + i * 0.05], [0.05, 0.03, 0.02], gunMetal);
      b.push(mul(translate(0, -0.16, -0.06), rotX(0.35))), b.rbox([0, 0, 0], [0.065, 0.2, 0.09], gunMetal, 0.02), b.pop(), b.rbox([0, -0.02, -0.4], [0.075, 0.14, 0.3], rgb(3093560), 0.02), b.rbox([0, -0.06, -0.56], [0.078, 0.17, 0.05], C.orange, 0.01);
    }), M2.hunting = mk((b) => {
      let wood = rgb(7227950);
      b.rbox([0, -0.02, -0.1], [0.08, 0.14, 0.9], wood, 0.025), b.cyl([0, 0.03, 0.5], 0.026, 0.024, 1, gunMetal, 12, !0, !0), b.box([0, 0.09, 0.95], [0.02, 0.06, 0.03], gunMetal), b.box([0, 0.1, -0.1], [0.06, 0.05, 0.03], gunMetal), b.box([0.07, 0.04, -0.06], [0.08, 0.03, 0.03], steelGrey), b.sphere([0.12, 0.04, -0.06], 0.03, gunMetal, 8, 1, !0), b.rbox([0, -0.05, -0.55], [0.075, 0.17, 0.3], wood, 0.02), b.box([0, -0.05, -0.7], [0.08, 0.18, 0.04], gunMetal), b.box([0, -0.09, 0.1], [0.05, 0.05, 0.14], gunMetal);
    }), M2.scar = mk((b) => {
      b.rbox([0, 0, 0.12], [0.1, 0.16, 0.72], rgb(12099930), 0.025), b.box([0, 0.09, 0.18], [0.055, 0.035, 0.58], gunMetal), b.cyl([0, 0.02, 0.85], 0.028, 0.028, 0.45, gunMetal, 12, !0, !0), b.cyl([0, 0.02, 1.28], 0.04, 0.04, 0.1, C.gold, 8, !0, !0), b.box([0, 0.14, 0.1], [0.05, 0.06, 0.2], gunMetal), b.box([0, 0.14, 0.1], [0.03, 0.03, 0.14], C.holographic), b.push(mul(translate(0, -0.16, -0.04), rotX(0.35))), b.rbox([0, 0, 0], [0.065, 0.2, 0.09], gunMetal, 0.02), b.pop(), b.push(mul(translate(0, -0.22, 0.22), rotX(0.25))), b.rbox([0, 0, 0], [0.065, 0.3, 0.11], rgb(12099930), 0.015), b.pop(), b.rbox([0, -0.01, -0.34], [0.075, 0.13, 0.34], rgb(12099930), 0.02), b.rbox([0, -0.06, -0.51], [0.075, 0.17, 0.06], gunMetal, 0.015);
    }), M2.rpg = mk((b) => {
      let od = rgb(7306578);
      b.cyl([0, 0.05, 0.1], 0.075, 0.075, 1.3, od, 14, !0, !0), b.torus([0, 0.05, -0.5], 0.08, 0.02, gunMetal, 12, 6), b.torus([0, 0.05, 0.7], 0.08, 0.02, gunMetal, 12, 6), b.cyl([0, 0.05, 0.85], 0.1, 0.075, 0.2, gunMetal, 12, !0, !0), b.box([0, 0.17, -0.1], [0.04, 0.12, 0.2], gunMetal), b.box([0, 0.24, -0.1], [0.06, 0.05, 0.12], C.holographic), b.push(mul(translate(0, -0.12, -0.15), rotX(0.3))), b.rbox([0, 0, 0], [0.06, 0.2, 0.08], gunMetal, 0.02), b.pop(), b.rbox([0, -0.06, 0.25], [0.06, 0.12, 0.1], gunMetal, 0.02), b.cyl([0, 0.05, 1], 0.07, 0.03, 0.22, rgb(14168112), 10, !0, !0);
    }), M2.rocket = mk((b) => {
      b.cyl([0, 0, 0.2], 0.06, 0.06, 0.5, rgb(7306578), 10, !0, !0), b.cyl([0, 0, 0.55], 0.06, 0, 0.18, rgb(14168112), 10, !0, !0);
      for (let k = 0; k < 4; k++)
        b.push(mul(translate(0, 0, -0.05), rotZ(k * 1.57))), b.box([0.08, 0, 0], [0.1, 0.02, 0.12], gunMetal), b.pop();
      b.sphere([0, 0, -0.15], 0.1, rgb(16756768), 8, 1, !0);
    }), M2.miniShield = mk((b) => {
      b.cyl([0, 0.02, 0], 0.09, 0.1, 0.22, rgb(3842815), 12, !0, !0), b.cyl([0, 0.26, 0], 0.05, 0.05, 0.06, C.white, 10, !0, !0), b.box([0, 0.14, 0.1], [0.1, 0.08, 0.01], C.white);
    }), M2.grenade = mk((b) => {
      b.sphere([0, 0.15, 0], 0.14, rgb(4876858), 10, 1.2, !0), b.cyl([0, 0.3, 0], 0.05, 0.05, 0.08, rgb(8947848), 8, !0, !0), b.box([0.06, 0.34, 0], [0.12, 0.02, 0.03], rgb(13421772));
      for (let k = 0; k < 3; k++) b.torus([0, 0.08 + k * 0.07, 0], 0.14, 8e-3, rgb(3033638), 10, 4);
    }), M2.boogie = mk((b) => {
      b.sphere([0, 0.16, 0], 0.16, rgb(13224408), 12, 1, !0);
      for (let k = 0; k < 10; k++) {
        let a = k * 2.4, y = 0.16 + Math.sin(k * 1.7) * 0.1;
        b.sphere([Math.cos(a) * 0.14, y, Math.sin(a) * 0.14], 0.03, [C.red, C.blue, C.yellow, rgb(16727753)][k % 4], 6, 1, !0);
      }
      b.cyl([0, 0.32, 0], 0.04, 0.04, 0.06, rgb(8947848), 8, !0, !0);
    }), M2.impulse = mk((b) => {
      b.sphere([0, 0.16, 0], 0.15, C.blue, 12, 1, !0), b.torus([0, 0.16, 0], 0.16, 0.02, C.holographic, 14, 6), b.cyl([0, 0.32, 0], 0.04, 0.04, 0.06, rgb(8947848), 8, !0, !0);
    }), M2.chug = mk((b) => {
      b.cyl([0, 0, 0], 0.2, 0.22, 0.55, rgb(3842815), 14, !0, !0), b.torus([0, 0.35, 0.22], 0.08, 0.025, rgb(2912176), 12, 6), b.cyl([0, 0.55, 0], 0.09, 0.09, 0.08, rgb(2912176), 10, !0, !0), b.box([0, 0.28, 0.21], [0.22, 0.18, 0.01], C.white);
    }), M2.smg = mk((b) => {
      b.rbox([0, 0, 0.1], [0.085, 0.14, 0.46], gunMetal, 0.02), b.cyl([0, 0.02, 0.32], 0.026, 0.026, 0.28, gunMetal, 10, !0, !0), b.rbox([0, -0.16, 0.04], [0.065, 0.22, 0.08], gunMetal, 0.02), b.rbox([0, -0.22, 0.16], [0.055, 0.26, 0.08], steelGrey, 0.015), b.box([0, 0.08, -0.24], [0.04, 0.07, 0.22], steelGrey);
    }), M2.fish = mk((b) => {
      b.sphere([0, 0.3, 0], 0.52, rgb(3703528), 14, 0.65, !0), b.tri([0, 0.3, -0.45], [0, 0.6, -0.88], [0, 0.02, -0.88], rgb(3703528)), b.sphere([0.16, 0.36, 0.26], 0.05, C.white, 8, 1, !0), b.sphere([0.18, 0.37, 0.28], 0.025, C.dark, 6, 1, !0), b.sphere([-0.16, 0.36, 0.26], 0.05, C.white, 8, 1, !0), b.sphere([-0.18, 0.37, 0.28], 0.025, C.dark, 6, 1, !0);
    }), M2.rod = mk((b) => {
      b.push(rotX(-0.6)), b.cyl([0, 0, 0], 0.024, 0.012, 1.7, rgb(13675119), 8, !0, !0), b.cyl([0.06, 0.35, 0], 0.05, 0.05, 0.06, steelGrey, 10, !0, !0), b.pop();
    }), M2.shieldPot = mk((b) => {
      b.cyl([0, 0, 0], 0.13, 0.13, 0.32, C.blue, 14, !0, !0), b.cyl([0, 0.32, 0], 0.05, 0.05, 0.09, C.white, 10, !0, !0), b.torus([0, 0.38, 0], 0.055, 0.015, rgb(10320466), 12, 6);
    }), M2.medkit = mk((b) => {
      b.rbox([0, 0.14, 0], [0.42, 0.26, 0.32], C.white, 0.04), b.box([0, 0.28, 0], [0.22, 0.04, 0.06], C.red), b.box([0, 0.28, 0], [0.06, 0.04, 0.22], C.red), b.rbox([0, 0.28, 0.17], [0.14, 0.08, 0.04], C.dark, 0.01);
    }), M2.bandage = mk((b) => {
      b.cyl([0, 0, 0], 0.15, 0.15, 0.13, C.white, 14, !0, !0), b.box([0, 0.065, 0], [0.32, 0.14, 0.06], C.red);
    }), M2.ammo = mk((b) => {
      b.rbox([0, 0.11, 0], [0.32, 0.22, 0.22], rgb(4357429), 0.02), b.box([0, 0.23, 0], [0.34, 0.035, 0.24], C.dark), b.box([0, 0.14, 0.115], [0.08, 0.05, 0.02], C.gold);
    }), M2.tracer = mk((b) => b.box([0, 0, 0.5], [0.035, 0.035, 1], rgb(16771717))), M2.wall_wood = mk((b) => {
      let plankCol = C.wood, frameCol = C.woodDark;
      for (let x of [-1.9, -0.65, 0.65, 1.9])
        b.box([x, 2, 0.08], [0.14, 4, 0.14], frameCol);
      b.box([0, 0.07, 0.08], [4, 0.14, 0.14], frameCol), b.box([0, 3.93, 0.08], [4, 0.14, 0.14], frameCol), b.push(mul(translate(0, 2, 0.08), rotZ(0.785))), b.box([0, 0, 0], [0.12, 5.4, 0.12], frameCol), b.pop();
      for (let i = 0; i < 8; i++) {
        let y = 0.25 + i * 0.5;
        b.plank([0, y, -0.04], [3.96, 0.46, 0.1], plankCol, 0.02);
        for (let x of [-1.9, -0.65, 0.65, 1.9])
          b.sphere([x, y, 0.02], 0.015, rgb(4473924), 6, 1, !0);
      }
    }), M2.ramp_wood = mk((b) => {
      let plankCol = C.wood, frameCol = C.woodDark;
      for (let x of [-1.9, 1.9])
        b.push(mul(translate(x, 2, 0), rotX(-0.785))), b.box([0, 0, -0.1], [0.16, 5.66, 0.18], frameCol), b.pop();
      b.box([-1.9, 2, 1.9], [0.15, 4, 0.15], frameCol), b.box([1.9, 2, 1.9], [0.15, 4, 0.15], frameCol);
      for (let i = 0; i < 8; i++) {
        let z = -1.75 + i * 0.5, y = 0.25 + i * 0.5;
        b.plank([0, y, z], [3.92, 0.08, 0.52], plankCol, 0.02), b.box([0, y - 0.22, z + 0.24], [3.9, 0.44, 0.06], frameCol);
      }
    }), M2.floor_wood = mk((b) => {
      let plankCol = C.wood, frameCol = C.woodDark;
      for (let x of [-1.9, 0, 1.9]) b.box([x, -0.18, 0], [0.15, 0.22, 4], frameCol);
      for (let z of [-1.9, 1.9]) b.box([0, -0.18, z], [4, 0.22, 0.15], frameCol);
      for (let i = 0; i < 8; i++) {
        let z = -1.75 + i * 0.5;
        b.plank([0, -0.04, z], [3.96, 0.08, 0.48], plankCol, 0.02);
      }
    }), M2.pyramid_wood = mk((b) => {
      let top = [0, 2, 0], a = [-2, 0, -2], bb = [2, 0, -2], cc = [2, 0, 2], d = [-2, 0, 2];
      b.tri(a, top, bb, C.wood), b.tri(bb, top, cc, C.wood), b.tri(cc, top, d, C.wood), b.tri(d, top, a, C.wood), b.quad(a, bb, cc, d, C.woodDark);
      for (let pt of [a, bb, cc, d])
        b.push(mul(translate(pt[0] * 0.5, 1, pt[2] * 0.5), rotY(Math.atan2(pt[0], pt[2])))), b.box([0, 0, 0], [0.14, 2.8, 0.14], C.woodDark), b.pop();
    }), M2.wall_stone = mk((b) => {
      b.box([0, 2, 0], [4, 4, 0.26], C.stone);
      for (let r2 = 0; r2 < 8; r2++) {
        let y = 0.25 + r2 * 0.5, off = r2 % 2 * 0.4;
        b.box([0, y, 0.14], [4, 0.03, 0.02], C.stoneDark);
        for (let x = -1.6 + off; x <= 1.8; x += 0.8)
          b.box([x, y, 0.14], [0.03, 0.46, 0.02], C.stoneDark);
      }
      for (let sx of [-1.92, 1.92]) b.box([sx, 2, 0], [0.18, 4, 0.32], C.stoneLight);
    }), M2.ramp_stone = mk((b) => {
      b.quad([-2, 0, -2], [-2, 4, 2], [2, 4, 2], [2, 0, -2], C.stone), b.quad([2, -0.25, -2], [2, 3.75, 2], [-2, 3.75, 2], [-2, -0.25, -2], C.stoneDark);
      for (let i = 0; i < 8; i++) {
        let z = -1.75 + i * 0.5, y = 0.25 + i * 0.5;
        b.box([0, y, z], [3.96, 0.1, 0.5], C.stoneLight);
      }
    }), M2.floor_stone = mk((b) => {
      b.box([0, -0.12, 0], [4, 0.24, 4], C.stone), b.box([0, -0.12, 1.95], [4, 0.26, 0.1], C.stoneDark), b.box([0, -0.12, -1.95], [4, 0.26, 0.1], C.stoneDark);
    }), M2.pyramid_stone = mk((b) => {
      let top = [0, 2, 0], a = [-2, 0, -2], bb = [2, 0, -2], cc = [2, 0, 2], d = [-2, 0, 2];
      b.tri(a, top, bb, C.stone), b.tri(bb, top, cc, C.stone), b.tri(cc, top, d, C.stone), b.tri(d, top, a, C.stone), b.quad(a, bb, cc, d, C.stoneDark);
    }), M2.wall_metal = mk((b) => {
      b.box([0, 2, 0], [4, 4, 0.12], C.metal);
      for (let sx of [-1.92, 1.92]) b.box([sx, 2, 0], [0.16, 4, 0.24], C.metalDark);
      b.box([0, 0.08, 0], [4, 0.16, 0.24], C.metalDark), b.box([0, 3.92, 0], [4, 0.16, 0.24], C.metalDark);
      for (let x = -1.7; x <= 1.7; x += 0.22)
        b.cyl([x, 2, 0.07], 0.045, 0.045, 3.8, C.metalLight, 8, !1, !0);
    }), M2.ramp_metal = mk((b) => {
      b.quad([-2, 0, -2], [-2, 4, 2], [2, 4, 2], [2, 0, -2], C.metal);
      for (let sx of [-1.9, 1.9])
        b.push(mul(translate(sx, 2, 0), rotX(-0.785))), b.box([0, 0, 0], [0.18, 5.66, 0.18], C.metalDark), b.pop();
      for (let i = 0; i < 8; i++) {
        let z = -1.75 + i * 0.5, y = 0.25 + i * 0.5;
        b.box([0, y, z], [3.9, 0.08, 0.48], C.metalLight);
      }
    }), M2.floor_metal = mk((b) => {
      b.box([0, -0.12, 0], [4, 0.24, 4], C.metal);
      for (let x of [-1.9, 0, 1.9]) b.box([x, -0.14, 0], [0.16, 0.26, 4], C.metalDark);
    }), M2.pyramid_metal = mk((b) => {
      let top = [0, 2, 0], a = [-2, 0, -2], bb = [2, 0, -2], cc = [2, 0, 2], d = [-2, 0, 2];
      b.tri(a, top, bb, C.metal), b.tri(bb, top, cc, C.metal), b.tri(cc, top, d, C.metal), b.tri(d, top, a, C.metal), b.quad(a, bb, cc, d, C.metalDark);
    }), M2.pine = mk((b) => {
      b.cyl([0, 0, 0], 0.38, 0.14, 8.4, C.trunk, 12, !0, !0);
      for (let i = 0; i < 4; i++) {
        let a = i / 4 * Math.PI * 2;
        b.push(mul(translate(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3), rotY(a))), b.cyl([0, 0, 0], 0.14, 0.04, 0.7, C.trunkDark, 8, !0, !0), b.pop();
      }
      let tiers = 6;
      for (let i = 0; i < tiers; i++) {
        let y = 1.3 + i * 1.15, rB = 3.1 - i * 0.45, h = 1.9, col = i % 2 ? C.pine2 : C.pine;
        b.cyl([0, y, 0], rB, 0.15, h, col, 18, !1, !0);
        for (let k = 0; k < 8; k++) {
          let a = k / 8 * 6.283 + i * 0.4, rr = rB * 0.55;
          b.cyl([Math.cos(a) * rr, y - 0.15, Math.sin(a) * rr], rB * 0.5, 0.05, h * 0.7, dk(col, 0.92), 8, !1, !0);
        }
        b.cyl([0, y + h * 0.55, 0], rB * 0.45, 0.1, h * 0.45, lt(col, 0.12), 12, !1, !0);
      }
      b.cyl([0, 8, 0], 0.55, 0.04, 1.3, lt(C.pine, 0.1), 10, !0, !0);
    }), M2.tree = mk((b) => {
      b.cyl([0, 0, 0], 0.5, 0.34, 3.8, C.trunk, 14, !0, !0);
      for (let i = 0; i < 4; i++) {
        let a = i * 1.57 + 0.4;
        b.cyl([Math.cos(a) * 0.45, 0.12, Math.sin(a) * 0.45], 0.2, 0.05, 0.5, C.trunkDark, 8, !0, !0);
      }
      for (let i = 0; i < 5; i++) {
        let a = i / 5 * Math.PI * 2;
        b.push(mul(translate(Math.cos(a) * 0.22, 2.7 + i % 2 * 0.4, Math.sin(a) * 0.22), mul(rotY(a), rotX(0.95)))), b.cyl([0, 0, 0], 0.18, 0.07, 2.3, C.trunk, 10, !0, !0), b.pop();
      }
      b.sphere([0, 5.1, 0], 2.5, C.leaf, 16, 0.8, !0);
      for (let i = 0; i < 8; i++) {
        let a = i / 8 * Math.PI * 2, rr = 1.9;
        b.sphere([Math.cos(a) * rr, 4.5 + i % 2 * 0.7, Math.sin(a) * rr], 1.35 + i % 3 * 0.15, i % 2 ? C.leaf2 : C.leaf3, 12, 0.88, !0);
      }
      for (let i = 0; i < 6; i++) {
        let a = i / 6 * Math.PI * 2 + 0.5, rr = 1.3;
        b.sphere([Math.cos(a) * rr, 6.2, Math.sin(a) * rr], 1.1, i % 2 ? C.leaf : C.leaf3, 12, 0.85, !0);
      }
      b.sphere([0.3, 6.9, 0.2], 1.4, lt(C.leaf, 0.18), 12, 0.8, !0), b.sphere([-1.2, 3.9, 1.4], 0.9, dk(C.leaf2, 0.85), 10, 0.9, !0);
    }), M2.tree2 = mk((b) => {
      b.cyl([0, 0, 0], 0.36, 0.26, 2.8, C.trunk, 12, !0, !0), b.sphere([0, 3.8, 0], 2, C.leaf2, 12, 0.75, !0), b.sphere([1.1, 3.6, 0.6], 1.3, C.leaf, 10, 0.85, !0), b.sphere([-1, 4, -0.5], 1.2, C.leaf3, 10, 0.85, !0);
    }), M2.rock = mk((b) => {
      b.sphere([0, 0.45, 0], 1.6, C.rock, 7, 0.7, !1), b.sphere([1, 0.3, 0.7], 1, C.rockDark, 6, 0.8, !1), b.sphere([-0.8, 0.3, -0.6], 0.85, lt(C.rock, 0.1), 6, 0.75, !1), b.sphere([0.2, 0.2, -1.1], 0.5, C.rockDark, 6, 0.8, !1), b.sphere([0.1, 1.45, 0.1], 0.8, lt(C.leaf2, 0.1), 7, 0.35, !1), b.sphere([-0.9, 0.8, -0.3], 0.3, lt(C.leaf2, 0.05), 6, 0.4, !1);
    }), M2.bush = mk((b) => {
      b.cyl([0, 0, 0], 0.08, 0.05, 0.4, C.trunkDark, 6, !0, !0), b.sphere([0, 0.5, 0], 1, C.leaf2, 10, 0.75, !0);
      for (let i = 0; i < 7; i++) {
        let a = i / 7 * Math.PI * 2;
        b.sphere([Math.cos(a) * 0.65, 0.35 + i % 2 * 0.25, Math.sin(a) * 0.65], 0.6, i % 2 ? C.leaf : C.leaf3, 8, 0.8, !0);
      }
      b.sphere([0.2, 0.95, 0.1], 0.55, lt(C.leaf3, 0.15), 8, 0.7, !0);
      for (let i = 0; i < 6; i++) {
        let a = i * 1.1 + 0.3;
        b.sphere([Math.cos(a) * 0.9, 0.5 + i % 3 * 0.2, Math.sin(a) * 0.9], 0.07, C.red, 6, 1, !0);
      }
    }), M2.hedge = mk((b) => {
      b.rbox([0, 0.7, 0], [4, 1.4, 0.9], rgb(3706676), 0.12);
    }), M2.waterTower = mk((b) => {
      let steel = rgb(5923694), tankCol = rgb(9411238), roofCol = rgb(4343890), legR = 3.6, H2 = 14;
      for (let i = 0; i < 4; i++) {
        let a = i / 4 * Math.PI * 2 + Math.PI / 4, x0 = Math.cos(a) * legR, z0 = Math.sin(a) * legR, x1 = Math.cos(a) * (legR * 0.75), z1 = Math.sin(a) * (legR * 0.75);
        b.push(mul(translate((x0 + x1) / 2, H2 / 2, (z0 + z1) / 2), rotY(a))), b.box([0, 0, 0], [0.35, H2, 0.35], steel), b.pop();
      }
      for (let h = 3; h <= H2; h += 3.5)
        for (let i = 0; i < 4; i++) {
          let a0 = i / 4 * Math.PI * 2 + Math.PI / 4, a1 = (i + 1) / 4 * Math.PI * 2 + Math.PI / 4, k = 1 - h / H2 * 0.25, p0 = [Math.cos(a0) * legR * k, h, Math.sin(a0) * legR * k], p1 = [Math.cos(a1) * legR * k, h, Math.sin(a1) * legR * k];
          b.push(mul(translate((p0[0] + p1[0]) / 2, h, (p0[1] + p1[1]) / 2), rotY(Math.atan2(p1[0] - p0[0], p1[2] - p0[2])))), b.box([0, 0, 0], [0.15, 0.15, Math.hypot(p1[0] - p0[0], p1[2] - p0[2])], steel), b.pop();
        }
      b.cyl([0, H2 + 0.15, 0], 3.8, 3.8, 0.3, steel, 16, !0, !0), b.torus([0, H2 + 1.2, 0], 3.75, 0.05, steel, 16, 6), b.cyl([0, H2 + 0.3, 0], 3.4, 3.4, 5.6, tankCol, 24, !0, !0);
      for (let y = H2 + 1.2; y <= H2 + 5.2; y += 1.3)
        b.torus([0, y, 0], 3.42, 0.04, rgb(3685958), 24, 6);
      b.cyl([0, H2 + 5.9, 0], 3.6, 0.1, 1.8, roofCol, 24, !0, !0), b.sphere([0, H2 + 7.8, 0], 0.25, C.gold, 10, 1, !0);
    }), M2.barn = mk((b) => {
      let red = rgb(11022886), white = rgb(15790318), roof = rgb(4869458);
      b.box([0, 3.5, 0], [16, 7, 22], red);
      for (let sx of [-8.05, 8.05]) for (let sz of [-11.05, 11.05])
        b.box([sx, 3.5, sz], [0.35, 7, 0.35], white);
      b.box([0, 2.5, 11.08], [4.8, 5, 0.15], white), b.box([0, 2.5, 11.16], [4.6, 4.8, 0.08], red), b.box([0, 7.5, 11.08], [2.2, 2.2, 0.12], white), b.box([0, 7.5, 11.09], [1.8, 1.8, 0.04], C.dark), b.push(mul(translate(0, 7, 0), rotX(0))), b.cyl([0, 0, 0], 8.2, 8.2, 22.4, roof, 8, !0, !0), b.pop();
    }), M2.truck = mk((b) => {
      let red = rgb(13645868), chrome = rgb(13421772);
      b.rbox([0, 0.75, 0.8], [2, 0.65, 1.8], red, 0.08), b.rbox([0, 1.35, -0.3], [1.9, 0.85, 1.6], red, 0.08), b.box([0, 1.38, 0.52], [1.7, 0.55, 0.04], C.glass), b.box([0, 1.38, -0.3], [1.92, 0.48, 1.3], C.glass), b.rbox([0, 0.85, -1.8], [2, 0.55, 2.2], red, 0.06), b.box([0, 0.65, -1.8], [1.7, 0.12, 2], rgb(4473924)), b.box([0, 0.75, 1.72], [1.6, 0.35, 0.06], chrome), b.sphere([-0.7, 0.75, 1.74], 0.12, rgb(16775376), 10, 1, !0), b.sphere([0.7, 0.75, 1.74], 0.12, rgb(16775376), 10, 1, !0);
      for (let k = 0; k < 5; k++) b.box([0, 0.62 + k * 0.07, 1.73], [1.4, 0.02, 0.02], dk(chrome, 0.7));
      b.box([0, 0.45, 1.78], [2.1, 0.18, 0.1], chrome), b.box([0, 0.45, -2.95], [2.1, 0.18, 0.1], chrome);
      for (let sx of [-1, 1])
        b.box([sx, 1.4, 0.35], [0.2, 0.12, 0.1], red), b.box([sx * 0.96, 1.15, -0.3], [0.01, 0.5, 0.02], dk(red, 0.6)), b.box([sx * 0.98, 1.2, -0.1], [0.04, 0.03, 0.2], chrome);
      b.box([0, 1.82, -0.3], [1.7, 0.06, 1.4], dk(red, 0.9));
      for (let k = -1; k <= 1; k++) b.sphere([k * 0.5, 1.87, 0.2], 0.06, rgb(16756768), 8, 1, !0);
      for (let sx of [-1, 1]) for (let k = 0; k < 4; k++) b.box([sx, 1, -1 - k * 0.55], [0.05, 0.45, 0.06], dk(red, 0.75));
      b.box([0, 0.98, -2.88], [1.9, 0.4, 0.06], dk(red, 0.85)), b.box([0, 1, -2.92], [0.5, 0.15, 0.02], rgb(16053488));
      for (let sx of [-0.8, 0.8]) b.box([sx, 0.9, -2.93], [0.22, 0.14, 0.03], rgb(14168112));
      b.push(mul(translate(-0.4, 1.15, -1.8), rotY(0.3))), b.box([0, 0, 0], [0.8, 0.6, 0.8], rgb(11569754)), b.pop(), b.cyl([0.5, 0.71, -1.4], 0.3, 0.3, 0.7, rgb(3829672), 12, !0, !0);
      for (let sx of [-1.05, 1.05])
        for (let sz of [-1.6, 1])
          b.push(mul(translate(sx, 0.38, sz), rotZ(Math.PI / 2))), b.cyl([0, 0, 0], 0.38, 0.38, 0.26, rgb(2105894), 16, !0, !0), b.cyl([0, 0.02, 0], 0.22, 0.22, 0.28, chrome, 12, !0, !0), b.pop();
    }), M2.car = mk((b) => {
      let y = rgb(3700950), chrome = rgb(14540253);
      b.rbox([0, 0.55, 0], [1.9, 0.52, 4.2], y, 0.08), b.rbox([0, 1.05, -0.2], [1.65, 0.52, 2.2], y, 0.08), b.box([0, 1.05, -0.2], [1.68, 0.34, 2], C.glass), b.box([0, 1.05, 0.92], [1.45, 0.35, 0.08], C.glass), b.box([0, 0.52, 2.12], [1.65, 0.18, 0.08], chrome), b.sphere([-0.65, 0.62, 2.14], 0.11, rgb(16775376), 10, 1, !0), b.sphere([0.65, 0.62, 2.14], 0.11, rgb(16775376), 10, 1, !0);
      for (let sx of [-0.96, 0.96])
        b.box([sx, 0.7, -0.2], [0.01, 0.4, 0.02], dk(y, 0.6)), b.box([sx, 0.7, 0.6], [0.01, 0.4, 0.02], dk(y, 0.6)), b.box([sx, 0.85, 0.2], [0.03, 0.03, 0.18], chrome);
      for (let sx of [-0.9, 0.9]) b.box([sx, 1, 0.85], [0.18, 0.1, 0.08], y);
      b.box([0, 1.33, -0.2], [1.5, 0.05, 2.1], dk(y, 0.9)), b.box([0, 0.62, -2.12], [0.4, 0.15, 0.03], rgb(16053488)), b.box([0, 0.72, -2.12], [1.6, 0.16, 0.04], rgb(14168112)), b.box([0, 0.5, -2.12], [1.65, 0.18, 0.08], chrome);
      for (let sx of [-0.95, 0.95])
        for (let sz of [-1.3, 1.3]) {
          b.push(mul(translate(sx, 0.35, sz), rotZ(Math.PI / 2))), b.cyl([0, 0, 0], 0.35, 0.35, 0.24, rgb(2236966), 16, !0, !0), b.torus([0, 0.13 * Math.sign(sx), 0], 0.3, 0.03, rgb(3026483), 16, 6), b.cyl([0, 0.02, 0], 0.2, 0.2, 0.26, chrome, 12, !0, !0);
          for (let k = 0; k < 5; k++) {
            let a = k / 5 * 6.283;
            b.box([Math.cos(a) * 0.12, 0.14 * Math.sign(sx), Math.sin(a) * 0.12], [0.06, 0.02, 0.06], dk(chrome, 0.7));
          }
          b.pop();
        }
    }), M2.crate = mk((b) => {
      let c = rgb(11569754);
      b.box([0, 1, 0], [2, 2, 2], c);
      for (let e of [[0, 1], [0, -1], [1, 0], [-1, 0]])
        b.box([e[0], 1, e[1]], [e[0] ? 0.08 : 2.04, 2.04, e[1] ? 0.08 : 2.04], dk(c, 0.7)), b.box([e[0], 0.06, e[1]], [e[0] ? 0.08 : 2.04, 0.12, e[1] ? 0.08 : 2.04], dk(c, 0.7)), b.box([e[0], 1.94, e[1]], [e[0] ? 0.08 : 2.04, 0.12, e[1] ? 0.08 : 2.04], dk(c, 0.7));
      b.box([0, 2.02, 0], [2.04, 0.06, 2.04], dk(c, 0.8)), b.box([0.3, 1.2, 1.03], [0.7, 0.4, 0.02], rgb(3355443));
    }), M2.mountains = mk((b) => {
      let seed = 7, rr = () => (seed = seed * 16807 % 2147483647, seed / 2147483647);
      for (let i = 0; i < 44; i++) {
        let a = i / 44 * 6.283 + rr() * 0.1, rad = 470 + rr() * 90, h = 40 + rr() * 70, w = 45 + rr() * 50;
        b.cyl([Math.cos(a) * rad, -5, Math.sin(a) * rad], w, w * 0.08, h, i % 3 ? rgb(7309930) : rgb(9080710), 5, !1, !1), h > 85 && b.cyl([Math.cos(a) * rad, h * 0.62 - 5, Math.sin(a) * rad], w * 0.36, w * 0.08, h * 0.38, rgb(15791352), 5, !1, !1);
      }
    }), M2.glow = mk((b) => b.sphere([0, 0.4, 0], 1, rgb(16765498), 12, 0.9, !0)), M2.chest = mk((b) => {
      b.rbox([0, 0.35, 0], [1.44, 0.7, 0.94], C.woodDark, 0.04), b.rbox([0, 0.86, 0], [1.48, 0.34, 0.98], C.wood, 0.05);
      for (let sx of [-0.52, 0.52]) {
        b.box([sx, 0.52, 0], [0.1, 1.06, 1.02], rgb(3814962));
        for (let y = 0.15; y < 1; y += 0.25)
          b.sphere([sx, y, 0.52], 0.02, C.gold, 6, 1, !0), b.sphere([sx, y, -0.52], 0.02, C.gold, 6, 1, !0);
      }
      b.box([0, 0.58, 0.49], [0.32, 0.32, 0.08], C.gold), b.cyl([0, 0.58, 0.53], 0.04, 0.04, 0.02, C.dark, 8);
    }), M2.chestOpen = mk((b) => {
      b.rbox([0, 0.35, 0], [1.44, 0.7, 0.94], C.woodDark, 0.04), b.push(mul(translate(0, 0.85, -0.45), rotX(-1.2))), b.rbox([0, 0.2, 0], [1.48, 0.34, 0.98], C.wood, 0.05), b.pop(), b.box([0, 0.55, 0], [1.32, 0.12, 0.82], C.gold);
    }), M2.lamp = mk((b) => {
      b.cyl([0, 0, 0], 0.16, 0.09, 4.8, rgb(2763824), 12, !0, !0), b.cyl([0, 0, 0], 0.26, 0.18, 0.5, rgb(2763824), 12, !0, !0), b.push(mul(translate(0, 4.8, 0), rotZ(-1.35))), b.cyl([0, 0, 0], 0.07, 0.05, 1.15, rgb(2763824), 10, !0, !0), b.pop(), b.box([1.05, 4.9, 0], [0.7, 0.16, 0.36], rgb(2763824)), b.box([1.05, 4.78, 0], [0.6, 0.08, 0.3], rgb(16774864)), b.sphere([1.05, 4.7, 0], 0.16, rgb(16774864), 10, 0.8, !0);
    }), M2.bench = mk((b) => {
      b.box([0, 0.45, 0], [1.7, 0.08, 0.52], C.wood), b.box([0, 0.8, -0.22], [1.7, 0.48, 0.07], C.wood);
      for (let x of [-0.75, 0.75]) b.rbox([x, 0.25, 0], [0.09, 0.54, 0.54], rgb(2763824), 0.02);
    }), M2.fence = mk((b) => {
      for (let i = 0; i < 9; i++)
        b.box([-4 + i, 0.55, 0], [0.14, 1.1, 0.06], rgb(16053488)), b.push(mul(translate(-4 + i, 1.1, 0), rotZ(Math.PI / 4))), b.box([0, 0, 0], [0.14, 0.14, 0.06], rgb(16053488)), b.pop();
      b.box([0, 0.42, 0], [8.2, 0.09, 0.05], rgb(16053488)), b.box([0, 0.88, 0], [8.2, 0.09, 0.05], rgb(16053488));
    }), M2.mailbox = mk((b) => {
      b.cyl([0, 0, 0], 0.06, 0.06, 1.1, rgb(5917242), 8, !0, !0), b.rbox([0, 1.22, 0], [0.26, 0.26, 0.48], rgb(2909365), 0.06), b.box([0.16, 1.32, 0.12], [0.03, 0.22, 0.04], C.red);
    }), M2.dash = mk((b) => b.box([0, 0.03, 0], [0.5, 0.06, 2.4], rgb(16053492))), M2.fountain = mk((b) => {
      b.cyl([0, 0, 0], 3.2, 3.2, 0.5, rgb(11451330), 24, !0, !0), b.cyl([0, 0.48, 0], 2.8, 2.8, 0.2, rgb(4570846), 24, !0, !0), b.cyl([0, 0.5, 0], 0.6, 0.8, 2.6, rgb(13029845), 16, !0, !0), b.sphere([0, 3.2, 0], 0.78, rgb(14213603), 14, 0.9, !0);
    }), M2.dumpster = mk((b) => {
      b.rbox([0, 0.7, 0], [2.2, 1.35, 1.25], rgb(3042900), 0.05), b.push(rotX(-0.25)), b.rbox([0, 1.4, -0.1], [2.25, 0.16, 1.3], rgb(2250048), 0.03), b.pop();
      for (let x of [-0.85, 0.85]) b.cyl([x, 0.12, 0.55], 0.18, 0.18, 0.16, rgb(546), 10, !0, !0);
    }), M2.bus = mk((b) => {
      b.rbox([0, 1.4, 0], [3.3, 2.6, 10.2], C.bus, 0.14);
      for (let i = 0; i < 6; i++)
        b.box([1.68, 1.9, -3.8 + i * 1.5], [0.06, 1, 1.1], C.glass), b.box([-1.68, 1.9, -3.8 + i * 1.5], [0.06, 1, 1.1], C.glass);
      b.box([0, 1.9, 5.12], [2.9, 1, 0.06], C.glass), b.box([0, 0.3, 5.2], [3.3, 0.35, 0.22], rgb(13421772)), b.box([0, 1.15, 0], [3.34, 0.22, 10.2], C.white), b.box([0, 0.95, 0], [3.34, 0.1, 10.2], C.yellow), b.box([0, 2.55, 0], [3.34, 0.1, 10.2], dk(C.bus, 0.7));
      for (let i = 0; i < 6; i++)
        b.box([0, 1.9, -3.05 + i * 1.5], [3.4, 1.06, 0.06], dk(C.bus, 0.75));
      for (let sx of [-1.2, 1.2])
        b.sphere([sx, 1, 5.15], 0.22, rgb(16775376), 10, 1, !0), b.box([sx, 0.62, -5.12], [0.5, 0.25, 0.05], rgb(14168112));
      b.box([0, 0.75, 5.18], [2.2, 0.45, 0.06], rgb(3355443));
      for (let k = 0; k < 4; k++) b.box([0, 0.6 + k * 0.1, 5.2], [2, 0.02, 0.02], rgb(8947848));
      b.box([0, 2.25, 5.14], [2.4, 0.3, 0.06], rgb(1710624)), b.box([0, 2.25, 5.18], [1.6, 0.14, 0.02], C.yellow);
      for (let sx of [-1.85, 1.85]) b.box([sx, 2, 4.6], [0.3, 0.35, 0.12], rgb(1973794));
      b.box([0, 0.45, -5.15], [1.5, 0.3, 0.06], C.white), b.rbox([0, 2.8, 0], [3.1, 0.16, 9.8], rgb(7506592), 0.04);
      for (let sx of [-1.8, 1.8])
        b.cyl([sx, 1.6, -3.2], 0.42, 0.36, 1.8, rgb(3817030), 14, !0, !0), b.sphere([sx, 1.6, -4.2], 0.25, C.orange, 10, 1, !0);
      for (let x of [-1.25, 1.25])
        for (let z of [-3.2, 3.2])
          b.push(mul(translate(x, 0.55, z), rotZ(Math.PI / 2))), b.cyl([0, 0, 0], 0.58, 0.58, 0.34, rgb(1973794), 16, !0, !0), b.pop();
      b.cyl([0, 3, 0], 0.55, 0.5, 2.4, rgb(13684936), 12, !0, !0), b.cyl([0, 5.4, 0], 0.3, 0.35, 1.3, rgb(13684936), 10, !0, !0);
    }), M2.balloon = mk((b) => {
      b.sphere([0, 0, 0], 7.8, C.balloon, 20, 1.12, !0, [0, 0.56]), b.sphere([0, 0, 0], 7.8, C.cream, 20, 1.12, !0, [0.56, 0.82]), b.cyl([0, -9.8, 0], 1.8, 4.6, 4.6, C.cream, 20, !1, !0);
      for (let i = 0; i < 16; i++) {
        let a = i / 16 * Math.PI * 2;
        b.cyl([Math.cos(a) * 2.3, -12.4, Math.sin(a) * 2.3], 0.03, 0.03, 5.4, rgb(11575392), 6);
      }
      for (let i = 0; i < 8; i++) {
        let a = i / 8 * 6.283;
        b.push(mul(translate(0, 0, 0), rotY(a))), b.box([7.9 * 0.999, 0, 0], [0.12, 8.5, 0.35], dk(C.balloon, 0.7)), b.pop();
      }
      b.torus([0, -6.6, 0], 5.2, 0.12, rgb(11575392), 24, 6), b.box([0, 2, 0], [0.4, 9, 0.4], dk(C.balloon, 0.6)), b.box([0, 2, 0], [0.4, 9, 0.4], dk(C.balloon, 0.6));
    }), M2.glider = mk((b) => {
      let tan = rgb(14198890), brown = rgb(8018490);
      b.rbox([-2.3, 0, 0], [2.6, 0.08, 1.1], tan, 0.03), b.rbox([2.3, 0, 0], [2.6, 0.08, 1.1], tan, 0.03), b.box([-3.6, -0.05, 0.5], [0.65, 0.52, 0.52], brown), b.box([3.6, -0.05, 0.5], [0.65, 0.52, 0.52], brown);
      for (let i = 0; i < 12; i++) {
        let a0 = i / 12 * Math.PI, a1 = (i + 1) / 12 * Math.PI, x0 = -Math.cos(a0) * 2.6, y0 = Math.sin(a0) * 1.6, x1 = -Math.cos(a1) * 2.6, y1 = Math.sin(a1) * 1.6;
        b.push(mul(translate((x0 + x1) / 2, (y0 + y1) / 2, 0), rotZ(Math.atan2(y1 - y0, x1 - x0)))), b.box([0, 0, 0], [Math.hypot(x1 - x0, y1 - y0) + 0.06, 0.11, 0.11], brown), b.pop();
      }
      for (let x of [-0.55, 0.55])
        b.cyl([x, -0.6, 0], 0.025, 0.025, 1.1, rgb(819), 8, !0, !0);
    }), M2.pad = mk((b) => {
      b.cyl([0, 0, 0], 2.4, 2.4, 0.38, rgb(6324373), 24, !0, !0), b.cyl([0, 0.38, 0], 2.1, 2.1, 0.14, rgb(14216438), 24, !0, !0), b.torus([0, 0.42, 0], 2.12, 0.04, C.blue, 24, 6);
    }), M2.shadow = mk((b) => b.cyl([0, 0.02, 0], 0.48, 0.48, 1e-3, rgb(0), 16)), M2.water = mk((b) => b.quad([-1e3, 0, -1e3], [-1e3, 0, 1e3], [1e3, 0, 1e3], [1e3, 0, -1e3], rgb(2661576))), M2.hitbox = mk((b) => b.box([0, 0, 0], [1, 1, 1], C.white)), M2.storm = mk((b) => {
      b.cyl([0, -50, 0], 1, 1, 400, rgb(7361279), 64, !1, !0);
    }), M2;
  }

  // src/buildings.ts
  var PALETTES = [
    { wall: rgb(12900066), wall2: rgb(11123913), roof: rgb(5001820), trim: rgb(16316662), floor: rgb(12160866), interior: rgb(15328472) },
    { wall: rgb(15131346), wall2: rgb(13682864), roof: rgb(5922664), trim: rgb(16777215), floor: rgb(11045472), interior: rgb(15789284) },
    { wall: rgb(11565672), wall2: rgb(10119256), roof: rgb(4014150), trim: rgb(15722972), floor: rgb(11901550), interior: rgb(14999252) },
    { wall: rgb(13621446), wall2: rgb(12108974), roof: rgb(9062972), trim: rgb(16447210), floor: rgb(12623984), interior: rgb(15657696) },
    { wall: rgb(14272936), wall2: rgb(12890766), roof: rgb(5595246), trim: rgb(16777215), floor: rgb(11569754), interior: rgb(15525592) },
    { wall: rgb(10467273), wall2: rgb(8954034), roof: rgb(4146768), trim: rgb(16053492), floor: rgb(11901550), interior: rgb(15263972) }
  ], DARK = rgb(2369067), GLASSF = rgb(16054008), BRICK = rgb(12087388), CONCRETE = rgb(12039340), ASPH = rgb(5066837), STEEL = rgb(10135217), RUST = rgb(9067066), Kit = class {
    constructor(b, p) {
      __publicField(this, "b", b);
      __publicField(this, "p", p);
      __publicField(this, "boxes", []);
      __publicField(this, "loot", []);
      __publicField(this, "chests", []);
    }
    solid(c, s, col) {
      this.b.box(c, s, col), this.boxes.push({ min: [c[0] - s[0] / 2, c[1] - s[1] / 2, c[2] - s[2] / 2], max: [c[0] + s[0] / 2, c[1] + s[1] / 2, c[2] + s[2] / 2] });
    }
    /** wall segment builder in a local frame: k=0 wall spans x at z=cz; k=1 wall spans z at x=cx */
    wall(axis, at, from, to, y0, h, col, openings = [], T = 0.3, trim = this.p.trim) {
      let put = (a0, a1, b0, b1, c) => {
        if (a1 - a0 < 0.02 || b1 - b0 < 0.02) return;
        let mid = (a0 + a1) / 2, len2 = a1 - a0, yc = (b0 + b1) / 2, hh = b1 - b0;
        axis === "x" ? this.solid([mid, yc, at], [len2, hh, T], c) : this.solid([at, yc, mid], [T, hh, len2], c);
      }, ops = [...openings].sort((a, b) => a.x - b.x), cur = from;
      for (let o of ops) {
        let x0 = o.x - o.w / 2, x1 = o.x + o.w / 2;
        put(cur, x0, y0, y0 + h, col), put(x0, x1, o.y + o.h, y0 + h, col), o.y > y0 + 0.01 && put(x0, x1, y0, o.y, col);
        let fr = (a0, a1, b0, b1) => {
          let mid = (a0 + a1) / 2, len2 = a1 - a0, yc = (b0 + b1) / 2, hh = b1 - b0;
          axis === "x" ? this.b.box([mid, yc, at], [len2, hh, T + 0.12], trim) : this.b.box([at, yc, mid], [T + 0.12, hh, len2], trim);
        };
        if (fr(x0 - 0.12, x0, o.y - (o.door ? 0 : 0.12), o.y + o.h + 0.12), fr(x1, x1 + 0.12, o.y - (o.door ? 0 : 0.12), o.y + o.h + 0.12), fr(x0 - 0.12, x1 + 0.12, o.y + o.h, o.y + o.h + 0.12), !o.door) {
          fr(x0 - 0.12, x1 + 0.12, o.y - 0.12, o.y);
          let mid = (x0 + x1) / 2, ym = o.y + o.h / 2;
          axis === "x" ? (this.b.box([mid, ym, at], [0.06, o.h, 0.05], trim), this.b.box([mid, ym, at], [o.w, 0.06, 0.05], trim), this.b.box([mid, o.y - 0.16, at + T / 2 + 0.1], [o.w + 0.4, 0.1, 0.28], trim)) : (this.b.box([at, ym, mid], [0.05, o.h, 0.06], trim), this.b.box([at, ym, mid], [0.05, 0.06, o.w], trim));
        }
        cur = x1;
      }
      put(cur, to, y0, y0 + h, col);
    }
    floorSlab(x0, x1, z0, z1, y, col, thick = 0.25) {
      this.solid([(x0 + x1) / 2, y - thick / 2, (z0 + z1) / 2], [x1 - x0, thick, z1 - z0], col);
    }
    /** open wooden stairs along z (rising toward +z) inside a 1.5-wide bay at x */
    stairs(x, z0, y0, rise, len2, col) {
      let sl = len2 / 9, sh = rise / 9;
      for (let k = 0; k < 9; k++) {
        let yy = y0 + (k + 1) * sh, zz = z0 + (k + 0.5) * sl;
        this.solid([x, yy - 0.1, zz], [1.5, 0.2, sl], col), this.b.box([x, yy - 0.1 - sh / 2, zz - sl / 2 + 0.03], [1.45, sh, 0.06], dk(col, 0.85));
      }
      this.b.box([x + 0.8, y0 + rise / 2 + 0.5, z0 + len2 / 2], [0.06, 0.06, len2], DARK);
      for (let k = 0; k < 4; k++) this.b.box([x + 0.8, y0 + (k + 0.5) * rise / 4 + 0.45, z0 + (k + 0.5) * len2 / 4], [0.05, 0.9, 0.05], DARK);
    }
    gableRoof(w, d, H2, rh, ov, rc, along = "x") {
      let b = this.b, hw = w / 2 + ov, hd = d / 2 + ov;
      if (along === "x") {
        b.quad([-hw, H2, -hd], [-hw, H2 + rh, 0], [hw, H2 + rh, 0], [hw, H2, -hd], rc), b.quad([hw, H2, hd], [hw, H2 + rh, 0], [-hw, H2 + rh, 0], [-hw, H2, hd], rc), b.quad([-hw, H2, -hd], [hw, H2, -hd], [hw, H2 + rh, 0], [-hw, H2 + rh, 0], dk(rc, 0.65)), b.quad([hw, H2, hd], [-hw, H2, hd], [-hw, H2 + rh, 0], [hw, H2 + rh, 0], dk(rc, 0.65));
        for (let k = 0; k < 8; k++) {
          let t0 = k / 8, t1 = (k + 1) / 8;
          this.boxes.push({ min: [-hw, H2 + rh * t0, -hd * (1 - t0)], max: [hw, H2 + rh * t1, hd * (1 - t0)] });
        }
        b.box([0, H2 + rh + 0.05, 0], [w + 2 * ov, 0.14, 0.3], dk(rc, 0.8));
        for (let k = 1; k < 6; k++) {
          let t2 = k / 6;
          b.box([0, H2 + rh * t2 + 0.02, -hd * (1 - t2)], [w + 2 * ov, 0.05, 0.08], dk(rc, 0.88)), b.box([0, H2 + rh * t2 + 0.02, hd * (1 - t2)], [w + 2 * ov, 0.05, 0.08], dk(rc, 0.88));
        }
        b.box([0, H2 - 0.12, hd + 0.02], [w + 2 * ov, 0.28, 0.08], this.p.trim), b.box([0, H2 - 0.12, -hd - 0.02], [w + 2 * ov, 0.28, 0.08], this.p.trim), b.tri([w / 2, H2, -d / 2], [w / 2, H2 + rh, 0], [w / 2, H2, d / 2], this.p.wall2), b.tri([-w / 2, H2, d / 2], [-w / 2, H2 + rh, 0], [-w / 2, H2, -d / 2], this.p.wall2);
      } else {
        b.quad([-hw, H2, -hd], [hw, H2, -hd], [0, H2 + rh, -hd], [0, H2 + rh, -hd], rc), b.quad([-hw, H2, hd], [0, H2 + rh, hd], [0, H2 + rh, -hd], [-hw, H2, -hd], rc), b.quad([hw, H2, -hd], [0, H2 + rh, -hd], [0, H2 + rh, hd], [hw, H2, hd], rc), b.quad([-hw, H2, hd], [-hw, H2, -hd], [0, H2 + rh, -hd], [0, H2 + rh, hd], dk(rc, 0.65)), b.quad([hw, H2, -hd], [hw, H2, hd], [0, H2 + rh, hd], [0, H2 + rh, -hd], dk(rc, 0.65));
        for (let k = 0; k < 8; k++) {
          let t0 = k / 8, t1 = (k + 1) / 8;
          this.boxes.push({ min: [-hw * (1 - t0), H2 + rh * t0, -hd], max: [hw * (1 - t0), H2 + rh * t1, hd] });
        }
        b.box([0, H2 + rh + 0.05, 0], [0.3, 0.14, d + 2 * ov], dk(rc, 0.8)), b.tri([-w / 2, H2, d / 2], [0, H2 + rh, d / 2], [w / 2, H2, d / 2], this.p.wall2), b.tri([w / 2, H2, -d / 2], [0, H2 + rh, -d / 2], [-w / 2, H2, -d / 2], this.p.wall2);
      }
    }
    siding(w, d, y0, h, col) {
      let b = this.b, lc = dk(col, 0.84);
      for (let yy = y0 + 0.3; yy < y0 + h - 0.1; yy += 0.36)
        b.box([0, yy, d / 2 + 5e-3], [w, 0.03, 0.02], lc), b.box([0, yy, -d / 2 - 5e-3], [w, 0.03, 0.02], lc), b.box([w / 2 + 5e-3, yy, 0], [0.02, 0.03, d], lc), b.box([-w / 2 - 5e-3, yy, 0], [0.02, 0.03, d], lc);
      for (let sx of [-1, 1]) for (let sz of [-1, 1]) b.box([sx * w / 2, y0 + h / 2, sz * d / 2], [0.22, h, 0.22], this.p.trim);
    }
    // ---- furniture (local positions) ----
    table(x, y, z, w = 1.8, d = 1) {
      this.solid([x, y + 0.75, z], [w, 0.08, d], rgb(8018490));
      for (let [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.b.box([x + dx * (w / 2 - 0.1), y + 0.37, z + dz * (d / 2 - 0.1)], [0.1, 0.74, 0.1], rgb(5914672));
    }
    chair(x, y, z, yaw = 0) {
      this.b.push(mul(translate(x, y, z), rotY(yaw))), this.b.box([0, 0.46, 0], [0.5, 0.06, 0.5], rgb(6965808)), this.b.box([0, 0.85, -0.22], [0.5, 0.75, 0.06], rgb(6965808));
      for (let [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.b.box([dx * 0.21, 0.22, dz * 0.21], [0.05, 0.44, 0.05], rgb(4861984));
      this.b.pop();
    }
    couch(x, y, z, yaw = 0, col = rgb(4878234)) {
      this.b.push(mul(translate(x, y, z), rotY(yaw))), this.b.rbox([0, 0.32, 0], [2.4, 0.5, 1], col, 0.08), this.b.rbox([0, 0.75, -0.4], [2.4, 0.6, 0.25], col, 0.08);
      for (let sx of [-1, 1]) this.b.rbox([sx * 1.1, 0.6, 0], [0.2, 0.4, 1], dk(col, 0.9), 0.06);
      for (let sx of [-0.55, 0.55]) this.b.rbox([sx, 0.58, 0.05], [1, 0.12, 0.8], lt(col, 0.15), 0.05);
      this.b.pop(), this.boxes.push({ min: [x - 1.2, y, z - 0.5], max: [x + 1.2, y + 0.9, z + 0.5] });
    }
    bed(x, y, z, yaw = 0, col = rgb(13228266)) {
      this.b.push(mul(translate(x, y, z), rotY(yaw))), this.b.box([0, 0.3, 0], [1.7, 0.5, 2.3], rgb(6965808)), this.b.rbox([0, 0.62, 0], [1.6, 0.25, 2.2], col, 0.06), this.b.rbox([0, 0.8, -0.8], [1.4, 0.16, 0.5], C.white, 0.05), this.b.rbox([0, 0.72, 0.35], [1.62, 0.1, 1.3], dk(col, 0.7), 0.04), this.b.box([0, 0.85, -1.2], [1.7, 1.2, 0.1], rgb(6965808)), this.b.pop(), this.boxes.push({ min: [x - 0.85, y, z - 1.15], max: [x + 0.85, y + 0.75, z + 1.15] });
    }
    cabinet(x, y, z, w, h, d, col, top) {
      this.solid([x, y + h / 2, z], [w, h, d], col), top && this.b.box([x, y + h + 0.03, z], [w + 0.04, 0.06, d + 0.04], top);
      for (let i = 0; i < Math.round(w / 0.6); i++) this.b.box([x - w / 2 + (i + 0.5) * w / Math.round(w / 0.6), y + h * 0.6, z + d / 2 + 0.02], [0.04, 0.16, 0.03], rgb(4473924));
    }
    fridge(x, y, z) {
      this.solid([x, y + 1, z], [0.9, 2, 0.8], rgb(14673128)), this.b.box([x, y + 1.25, z], [0.92, 0.03, 0.82], rgb(10133670)), this.b.box([x + 0.35, y + 1.5, z + 0.42], [0.04, 0.5, 0.04], rgb(10133670)), this.b.box([x + 0.35, y + 0.7, z + 0.42], [0.04, 0.7, 0.04], rgb(10133670));
    }
    stove(x, y, z) {
      this.solid([x, y + 0.45, z], [0.9, 0.9, 0.7], rgb(15132390)), this.b.box([x, y + 0.92, z], [0.9, 0.04, 0.7], DARK);
      for (let [dx, dz] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) this.b.cyl([x + dx, y + 0.94, z + dz], 0.12, 0.12, 0.02, rgb(5592405), 10);
      this.b.box([x, y + 0.5, z + 0.36], [0.6, 0.4, 0.03], rgb(3355443));
    }
    toilet(x, y, z, yaw = 0) {
      this.b.push(mul(translate(x, y, z), rotY(yaw))), this.b.box([0, 0.4, -0.25], [0.45, 0.8, 0.25], C.white), this.b.cyl([0, 0.2, 0.1], 0.25, 0.28, 0.4, C.white, 12), this.b.cyl([0, 0.4, 0.1], 0.3, 0.3, 0.05, rgb(15658734), 12), this.b.pop(), this.boxes.push({ min: [x - 0.3, y, z - 0.4], max: [x + 0.3, y + 0.8, z + 0.4] });
    }
    sink(x, y, z) {
      this.solid([x, y + 0.42, z], [0.7, 0.84, 0.55], rgb(15790314)), this.b.box([x, y + 0.86, z], [0.74, 0.05, 0.58], rgb(14540253)), this.b.cyl([x, y + 0.88, z - 0.15], 0.02, 0.02, 0.2, STEEL, 6), this.b.box([x, y + 1.5, z - 0.25], [0.6, 0.7, 0.03], rgb(13625074));
    }
    tub(x, y, z) {
      this.solid([x, y + 0.3, z], [1.7, 0.6, 0.8], C.white), this.b.box([x, y + 0.45, z], [1.5, 0.35, 0.6], rgb(14216436));
    }
    bookshelf(x, y, z, yaw = 0, w = 1.2) {
      this.b.push(mul(translate(x, y, z), rotY(yaw))), this.b.box([0, 1, 0], [w, 2, 0.35], rgb(6965808));
      for (let s = 0; s < 4; s++) {
        this.b.box([0, 0.3 + s * 0.5, 0.02], [w - 0.1, 0.04, 0.32], rgb(9071176));
        for (let i = 0; i < Math.floor(w / 0.12); i++) Math.random() < 0.8 && this.b.box([-w / 2 + 0.1 + i * 0.12, 0.5 + s * 0.5, 0.05], [0.09, 0.36 + Math.random() * 0.06, 0.24], [Math.random() * 0.6 + 0.2, Math.random() * 0.5 + 0.2, Math.random() * 0.6 + 0.2]);
      }
      this.b.pop(), this.boxes.push({ min: [x - w / 2, y, z - 0.2], max: [x + w / 2, y + 2, z + 0.2] });
    }
    tv(x, y, z, yaw = 0) {
      this.b.push(mul(translate(x, y, z), rotY(yaw))), this.b.box([0, 0.3, 0], [1.4, 0.6, 0.5], rgb(4864554)), this.b.box([0, 1.05, 0], [1.3, 0.8, 0.08], DARK), this.b.box([0, 1.05, 0.045], [1.2, 0.7, 0.01], rgb(2047839)), this.b.pop();
    }
    rug(x, y, z, w, d, col) {
      this.b.box([x, y + 0.015, z], [w, 0.03, d], col), this.b.box([x, y + 0.02, z], [w - 0.3, 0.03, d - 0.3], lt(col, 0.2));
    }
    lamp(x, y, z) {
      this.b.cyl([x, y, z], 0.2, 0.2, 0.04, DARK, 10), this.b.cyl([x, y, z], 0.03, 0.03, 1.5, DARK, 6), this.b.cyl([x, y + 1.45, z], 0.28, 0.2, 0.32, rgb(16049856), 12, !1);
    }
    crate(x, y, z, s = 1, col = rgb(11569754)) {
      this.solid([x, y + 0.5 * s, z], [s, s, s], col);
      for (let e of [[0, 1], [0, -1], [1, 0], [-1, 0]]) this.b.box([x + e[0] * s * 0.5, y + 0.5 * s, z + e[1] * s * 0.5], [e[0] ? 0.04 : s, s, e[1] ? 0.04 : s], dk(col, 0.75));
    }
    barrel(x, y, z, col = rgb(3829672)) {
      this.b.cyl([x, y, z], 0.42, 0.42, 1.1, col, 14), this.b.torus([x, y + 0.25, z], 0.43, 0.03, dk(col, 0.6), 14, 6), this.b.torus([x, y + 0.85, z], 0.43, 0.03, dk(col, 0.6), 14, 6), this.boxes.push({ min: [x - 0.42, y, z - 0.42], max: [x + 0.42, y + 1.1, z + 0.42] });
    }
    shelfRack(x, y, z, yaw = 0, w = 3, tiers = 3, stock = !0) {
      this.b.push(mul(translate(x, y, z), rotY(yaw)));
      for (let sx of [-1, 1]) for (let sz of [-1, 1]) this.b.box([sx * (w / 2 - 0.04), 1.05, sz * 0.45], [0.06, 2.1, 0.06], STEEL);
      for (let s = 0; s < tiers; s++) {
        let yy = 0.2 + s * 0.65;
        if (this.b.box([0, yy, 0], [w, 0.05, 1], rgb(13489112)), stock) for (let i = 0; i < Math.floor(w / 0.45); i++) Math.random() < 0.75 && this.b.rbox([-w / 2 + 0.25 + i * 0.45, yy + 0.22, (Math.random() - 0.5) * 0.4], [0.32, 0.36, 0.32], [0.3 + Math.random() * 0.6, 0.3 + Math.random() * 0.5, 0.3 + Math.random() * 0.6], 0.03);
      }
      this.b.pop(), this.boxes.push({ min: [x - w / 2, y, z - 0.5], max: [x + w / 2, y + 2.1, z + 0.5] });
    }
    counter(x, y, z, w, yaw = 0) {
      this.b.push(mul(translate(x, y, z), rotY(yaw))), this.b.box([0, 0.5, 0], [w, 1, 0.8], rgb(7301730)), this.b.box([0, 1.02, 0], [w + 0.1, 0.06, 0.9], rgb(3815994)), this.b.box([w * 0.3, 1.25, 0], [0.5, 0.4, 0.4], DARK), this.b.pop(), this.boxes.push({ min: [x - w / 2, y, z - 0.45], max: [x + w / 2, y + 1.05, z + 0.45] });
    }
    hayBale(x, y, z, yaw = 0) {
      this.b.push(mul(translate(x, y, z), rotY(yaw))), this.b.rbox([0, 0.45, 0], [1.4, 0.9, 0.9], rgb(14268778), 0.08), this.b.box([-0.4, 0.45, 0], [0.05, 0.92, 0.92], rgb(10123834)), this.b.box([0.4, 0.45, 0], [0.05, 0.92, 0.92], rgb(10123834)), this.b.pop(), this.boxes.push({ min: [x - 0.7, y, z - 0.45], max: [x + 0.7, y + 0.9, z + 0.45] });
    }
    door(x, y, z, yaw, col = rgb(5917242)) {
      this.b.push(mul(translate(x, y, z), rotY(yaw))), this.b.box([0.55, 1.15, 0], [1.1, 2.3, 0.08], col), this.b.box([0.55, 1.5, 0.05], [0.8, 0.9, 0.02], dk(col, 0.85)), this.b.box([0.55, 0.6, 0.05], [0.8, 0.7, 0.02], dk(col, 0.85)), this.b.sphere([0.95, 1.1, 0.08], 0.05, C.gold, 8), this.b.pop();
    }
    interiorWall(axis, at, from, to, y0, h, doorAt) {
      this.wall(axis, at, from, to, y0, h, this.p.interior, doorAt === void 0 ? [] : [{ x: doorAt, w: 1.2, y: y0, h: 2.3, door: !0 }], 0.18, this.p.trim);
    }
    baseboard(x0, x1, z0, z1, y) {
      let c = this.p.trim;
      this.b.box([(x0 + x1) / 2, y + 0.08, z0 + 0.1], [x1 - x0, 0.16, 0.04], c), this.b.box([(x0 + x1) / 2, y + 0.08, z1 - 0.1], [x1 - x0, 0.16, 0.04], c), this.b.box([x0 + 0.1, y + 0.08, (z0 + z1) / 2], [0.04, 0.16, z1 - z0], c), this.b.box([x1 - 0.1, y + 0.08, (z0 + z1) / 2], [0.04, 0.16, z1 - z0], c);
    }
    ceilingLight(x, y, z) {
      this.b.cyl([x, y - 0.05, z], 0.35, 0.3, 0.06, rgb(16774352), 10);
    }
  };
  function colonial(pi = 0, seed = 0) {
    let p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p), w = 16 + seed % 2 * 2, d = 11 + seed % 3, hw = w / 2, hd = d / 2, H2 = FH * 2, T = 0.3, garage = seed % 3 !== 1;
    k.solid([0, 0.2, 0], [w + 0.5, 0.4, d + 0.5], rgb(9407878)), k.floorSlab(-hw + T, hw - T, -hd + T, hd - T, 0.46, p.floor, 0.12);
    let winsF = [], winsB = [], winsL = [], winsR = [], nx = Math.round(w / 4);
    for (let f = 0; f < 2; f++) {
      let y = f * FH + 1.1;
      for (let i = 0; i < nx; i++) {
        let x = -hw + (i + 0.5) * w / nx;
        f === 0 && Math.abs(x) < 1.6 || (winsF.push({ x, w: 1.5, y, h: 1.7, sill: !0 }), winsB.push({ x, w: 1.5, y, h: 1.7 }));
      }
      winsL.push({ x: -hd * 0.4, w: 1.4, y, h: 1.6 }, { x: hd * 0.4, w: 1.4, y, h: 1.6 }), winsR.push({ x: 0, w: 1.4, y, h: 1.6 });
    }
    winsF.push({ x: 0, w: 1.4, y: 0.4, h: 2.4, door: !0 }), k.wall("x", hd - T / 2, -hw, hw, 0.4, H2 - 0.4, p.wall, winsF), k.wall("x", -hd + T / 2, -hw, hw, 0.4, H2 - 0.4, p.wall, winsB), k.wall("z", -hw + T / 2, -hd, hd, 0.4, H2 - 0.4, p.wall, winsL), k.wall("z", hw - T / 2, -hd, hd, 0.4, H2 - 0.4, p.wall, garage ? [...winsR, { x: 0.2, w: 1.2, y: 0.4, h: 2.3, door: !0 }] : winsR), k.siding(w, d, 0.4, H2 - 0.4, p.wall);
    let y0 = 0.52;
    k.interiorWall("z", 1.5, -hd + T, hd - T, y0, FH - 0.2, 2.5), k.interiorWall("x", 0, -hw + T, 1.5, y0, FH - 0.2, -hw + 3), k.interiorWall("x", -hd * 0.25, 1.5, hw - T, y0, FH - 0.2, hw - 2.2), k.stairs(hw - 1.3, -hd + T + 0.2, y0, FH, 6.4, p.floor), k.floorSlab(-hw + T, hw - 2.1, -hd + T, hd - T, FH, p.floor), k.floorSlab(hw - 2.1, hw - T, -hd + 6.9, hd - T, FH, p.floor), b.box([hw - 2.1, FH + 0.5, -hd + 3.3], [0.06, 1, 6.6], DARK), k.ceilingLight(-hw * 0.5, FH - 0.1, hd * 0.5), k.ceilingLight(-hw * 0.5, FH - 0.1, -hd * 0.5), k.ceilingLight(hw * 0.5, FH - 0.1, hd * 0.5), k.rug(-hw * 0.5, y0, hd * 0.5, 4, 3, rgb(9058874)), k.couch(-hw * 0.5, y0, hd * 0.75, Math.PI), k.tv(-hw * 0.5, y0, hd * 0.2, 0), k.table(-hw * 0.5, y0, hd * 0.5, 1.2, 0.7), k.lamp(-hw + 1, y0, hd - 1), k.bookshelf(-hw + 0.5, y0, hd * 0.5, Math.PI / 2), k.cabinet(-hw * 0.55, y0, -hd + 0.75, 5, 0.9, 0.7, rgb(15262416), rgb(5921370)), k.fridge(-hw + 0.8, y0, -hd + 0.75), k.stove(-hw * 0.25 + 0.2, y0, -hd + 0.75), k.table(-hw * 0.5, y0, -hd * 0.45, 1.6, 1), k.chair(-hw * 0.5 - 0.5, y0, -hd * 0.45 + 0.9, Math.PI), k.chair(-hw * 0.5 + 0.5, y0, -hd * 0.45 + 0.9, Math.PI), k.chair(-hw * 0.5, y0, -hd * 0.45 - 0.9, 0);
    for (let i = 0; i < 3; i++) b.rbox([-hw * 0.7 + i * 1.2, y0 + 1.9, -hd + 0.6], [1, 0.7, 0.4], rgb(15262416), 0.03);
    k.toilet(hw - 1.2, y0, -hd * 0.25 + 1.6, -Math.PI / 2), k.sink(hw - 3.2, y0, -hd * 0.25 - 1), k.tub(3.2, y0, -hd * 0.25 - 1.5);
    let y1 = FH + 0.02;
    k.interiorWall("z", -1, -hd + T, hd - T, y1, FH - 0.2, hd * 0.5), k.bed(-hw * 0.55, y1, -hd * 0.3, 0), k.bed(hw * 0.35, y1, -hd * 0.25, 0, rgb(15122624)), k.bookshelf(-hw + 0.5, y1, hd * 0.6, Math.PI / 2), k.rug(hw * 0.35, y1, hd * 0.3, 3, 2.5, rgb(3824266)), k.lamp(hw - 1, y1, -hd + 1), k.cabinet(-hw * 0.5, y1, hd - 0.8, 2.2, 1.2, 0.6, rgb(8018490)), k.tv(hw * 0.35, y1, hd * 0.75, Math.PI), k.baseboard(-hw + T, hw - T, -hd + T, hd - T, y0), k.baseboard(-hw + T, hw - T, -hd + T, hd - T, y1), k.gableRoof(w, d, H2, d * 0.42, 0.6, p.roof, "x"), b.box([hw * 0.4, H2 + d * 0.42 * 0.7, -hd * 0.25], [0.9, d * 0.42 * 1.3, 0.9], BRICK), b.box([0, 3.1, hd + 1], [3.4, 0.15, 2], p.roof);
    for (let x of [-1.5, 1.5]) k.solid([x, 1.55, hd + 1.8], [0.18, 3.1, 0.18], p.trim);
    if (k.solid([0, 0.2, hd + 1.2], [3.2, 0.4, 1.8], CONCRETE), k.solid([0, 0.1, hd + 2.4], [3.2, 0.2, 0.7], CONCRETE), k.door(0.7, 0.4, hd - 0.1, Math.PI * 0.55), garage) {
      let gx = hw + 3, gz = hd - 6.5 / 2;
      k.wall("x", gz - 6.5 / 2 + T / 2, hw, hw + 6, 0.4, 3.2, p.wall2), k.wall("z", hw + 6 - T / 2, gz - 6.5 / 2, gz + 6.5 / 2, 0.4, 3.2, p.wall2), k.wall("x", gz + 6.5 / 2 - T / 2, hw, hw + 6, 0.4, 3.2, p.wall2, [{ x: gx, w: 3.6, y: 0.4, h: 2.6, door: !0 }]), k.solid([gx, 0.2, gz], [6, 0.4, 6.5], CONCRETE), b.box([gx, 3.25, gz], [6 + 0.4, 0.2, 6.5 + 0.4], p.roof), b.box([gx, 3.6, gz], [6 + 0.6, 0.5, 6.5 + 0.6], dk(p.roof, 0.9)), k.shelfRack(hw + 0.8, 0.4, gz - 6.5 / 2 + 1.2, Math.PI / 2, 2.5, 3), k.crate(hw + 6 - 1, 0.4, gz - 2, 0.9), k.barrel(hw + 6 - 1, 0.4, gz - 0.6), k.loot.push([gx, 0.5, gz + 1]), k.chests.push([hw + 6 - 1.4, 0.4, gz + 6.5 / 2 - 1.5]);
    }
    return k.loot.push([-hw * 0.5, y0, hd * 0.5], [-hw * 0.5, y0, -hd * 0.5], [hw * 0.35, y1, hd * 0.3], [-hw * 0.55, y1, hd * 0.3]), k.chests.push([-hw + 1.5, y1, -hd + 1.5]), { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w: garage ? w + 6 : w, d, h: H2 + d * 0.42, kind: "colonial" };
  }
  function cottage(pi = 1, seed = 0) {
    let p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p), w = 12, d = 9, hw = w / 2, hd = d / 2, H2 = FH, T = 0.3, y0 = 0.52;
    k.solid([0, 0.2, 0], [w + 0.5, 0.4, d + 0.5], rgb(9407878)), k.floorSlab(-hw + T, hw - T, -hd + T, hd - T, 0.46, p.floor, 0.12), k.wall("x", hd - T / 2, -hw, hw, 0.4, H2 - 0.4, p.wall, [{ x: -hw * 0.5, w: 1.6, y: 1.1, h: 1.6 }, { x: hw * 0.5, w: 1.6, y: 1.1, h: 1.6 }, { x: 0, w: 1.3, y: 0.4, h: 2.3, door: !0 }]), k.wall("x", -hd + T / 2, -hw, hw, 0.4, H2 - 0.4, p.wall, [{ x: -hw * 0.5, w: 1.4, y: 1.1, h: 1.6 }, { x: hw * 0.5, w: 1.4, y: 1.1, h: 1.6 }]), k.wall("z", -hw + T / 2, -hd, hd, 0.4, H2 - 0.4, p.wall, [{ x: 0, w: 1.4, y: 1.1, h: 1.6 }]), k.wall("z", hw - T / 2, -hd, hd, 0.4, H2 - 0.4, p.wall, [{ x: -hd * 0.3, w: 1.4, y: 1.1, h: 1.6 }]), k.siding(w, d, 0.4, H2 - 0.4, p.wall), k.interiorWall("z", 1.2, -hd + T, hd - T, y0, FH - 0.2, -hd * 0.4), k.interiorWall("x", -hd * 0.1, 1.2, hw - T, y0, FH - 0.2, hw - 1.6), k.couch(-hw * 0.5, y0, hd * 0.55, Math.PI), k.tv(-hw * 0.5, y0, -hd * 0.1, 0), k.rug(-hw * 0.5, y0, hd * 0.3, 3, 2.4, rgb(5929530)), k.cabinet(-hw * 0.5, y0, -hd + 0.75, 4, 0.9, 0.7, rgb(15262416), rgb(5921370)), k.fridge(-hw + 0.8, y0, -hd + 0.75), k.stove(-hw * 0.2, y0, -hd + 0.75), k.bed(hw * 0.4, y0, -hd * 0.5, 0, rgb(14214848)), k.bookshelf(hw - 0.5, y0, hd * 0.6, -Math.PI / 2, 1), k.toilet(hw - 1, y0, hd - 1.2, -Math.PI / 2), k.sink(3, y0, hd - 1), k.baseboard(-hw + T, hw - T, -hd + T, hd - T, y0), k.ceilingLight(-hw * 0.5, H2 - 0.1, 0), k.ceilingLight(hw * 0.4, H2 - 0.1, 0), k.gableRoof(w, d, H2, d * 0.5, 0.7, p.roof, "x"), b.box([-hw * 0.5, H2 + d * 0.5 * 0.7, -hd * 0.3], [0.8, d * 0.5 * 1.3, 0.8], BRICK), b.box([0, 2.9, hd + 1], [3, 0.15, 2], p.roof);
    for (let x of [-1.3, 1.3]) k.solid([x, 1.45, hd + 1.8], [0.16, 2.9, 0.16], p.trim);
    return k.solid([0, 0.2, hd + 1.1], [3, 0.4, 1.6], CONCRETE), k.door(0.65, 0.4, hd - 0.1, Math.PI * 0.6), k.loot.push([-hw * 0.5, y0, hd * 0.3], [hw * 0.4, y0, hd * 0.2]), k.chests.push([-hw + 1.2, y0, -hd + 3]), { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w, d, h: H2 + d * 0.5, kind: "cottage" };
  }
  function shop(pi = 2, seed = 0) {
    let p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p), w = 20, d = 14, hw = w / 2, hd = d / 2, H2 = 5.2, T = 0.35, y0 = 0.42, brick = seed % 2 ? BRICK : rgb(14208952);
    k.solid([0, 0.2, 0], [w + 1, 0.4, d + 1], CONCRETE), k.floorSlab(-hw + T, hw - T, -hd + T, hd - T, 0.4, rgb(13223096), 0.08), k.wall("x", hd - T / 2, -hw, hw, 0.4, H2, brick, [{ x: -6, w: 4.5, y: 1.2, h: 2.6 }, { x: 6, w: 4.5, y: 1.2, h: 2.6 }, { x: 0, w: 2.6, y: 0.4, h: 2.8, door: !0 }], T, DARK), k.wall("x", -hd + T / 2, -hw, hw, 0.4, H2, brick, [{ x: hw - 3, w: 1.6, y: 0.4, h: 2.4, door: !0 }], T, DARK), k.wall("z", -hw + T / 2, -hd, hd, 0.4, H2, brick, [{ x: 0, w: 2.4, y: 1.4, h: 2 }], T, DARK), k.wall("z", hw - T / 2, -hd, hd, 0.4, H2, brick, [], T, DARK), b.box([0, H2 + 0.6, hd + 0.3], [w + 0.6, 1.4, 0.4], rgb(2902638)), b.box([0, H2 + 0.6, hd + 0.52], [8, 0.9, 0.05], rgb(16765498)), b.box([0, H2 + 0.6, hd + 0.55], [7, 0.45, 0.02], rgb(2902638)), b.box([0, H2 + 0.2, 0], [w + 0.6, 0.4, d + 0.6], rgb(6975092)), b.box([0, H2 + 0.5, 0], [w + 0.8, 0.2, d + 0.8], rgb(5330267));
    for (let x of [-6, 0, 6]) b.box([x, H2 + 0.9, -hd * 0.3], [1.6, 1, 1.6], rgb(10133670));
    b.box([0, 3.9, hd + 1.2], [w * 0.8, 0.12, 2.4], rgb(2902638));
    for (let x of [-7, 0, 7]) k.solid([x, 2.1, hd + 2.2], [0.2, 3.6, 0.2], DARK);
    k.interiorWall("x", -hd + 4, -hw + T, hw - T, y0, H2 - 0.4, hw - 3);
    for (let i = 0; i < 3; i++) k.shelfRack(-hw + 4 + i * 4.5, y0, 1, 0, 5, 3);
    for (let i = 0; i < 3; i++) k.shelfRack(-hw + 4 + i * 4.5, y0, 4.2, 0, 5, 3);
    k.counter(hw - 3, y0, hd - 3, 4, Math.PI / 2), k.shelfRack(-hw + 1, y0, 0, Math.PI / 2, 8, 4);
    for (let i = 0; i < 4; i++) k.fridge(-hw + 3 + i * 1, y0, -hd + 4.7);
    k.crate(-hw + 2, y0, -hd + 1.5), k.crate(-hw + 3.2, y0, -hd + 1.5, 0.8), k.crate(-hw + 2.6, y0 + 1, -hd + 1.5, 0.8), k.barrel(hw - 2, y0, -hd + 1.5), k.shelfRack(2, y0, -hd + 2, 0, 6, 3);
    for (let x of [-6, 0, 6]) for (let z of [-2, 3]) k.ceilingLight(x, H2 - 0.1, z);
    return k.loot.push([-hw + 6, y0, 2.6], [2, y0, 2.6], [hw - 3, y0, 0], [0, y0, -hd + 2]), k.chests.push([-hw + 1.5, y0, -hd + 1.4], [hw - 2, y0, hd - 1.5]), { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w, d, h: H2 + 1.5, kind: "shop" };
  }
  function gas(pi = 3, seed = 0) {
    let p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p), w = 12, d = 9, hw = w / 2, hd = d / 2, H2 = 4.2, T = 0.3, y0 = 0.42;
    k.solid([0, 0.2, 0], [w + 0.6, 0.4, d + 0.6], CONCRETE), k.floorSlab(-hw + T, hw - T, -hd + T, hd - T, 0.4, rgb(13223096), 0.08), k.wall("x", hd - T / 2, -hw, hw, 0.4, H2, rgb(15262936), [{ x: -3.5, w: 3.6, y: 1, h: 2.4 }, { x: 3.2, w: 2.6, y: 1, h: 2.4 }, { x: 0, w: 1.6, y: 0.4, h: 2.6, door: !0 }], T, rgb(12595248)), k.wall("x", -hd + T / 2, -hw, hw, 0.4, H2, rgb(15262936), [{ x: -hw + 2, w: 1.4, y: 0.4, h: 2.3, door: !0 }], T, rgb(12595248)), k.wall("z", -hw + T / 2, -hd, hd, 0.4, H2, rgb(15262936), [], T), k.wall("z", hw - T / 2, -hd, hd, 0.4, H2, rgb(15262936), [{ x: 0, w: 1.6, y: 1.2, h: 1.6 }], T), b.box([0, H2 + 0.15, 0], [w + 0.6, 0.3, d + 0.6], rgb(6975092)), b.box([0, H2 + 0.6, hd + 0.2], [w + 0.6, 0.9, 0.3], rgb(12595248)), b.box([0, H2 + 0.6, hd + 0.4], [5, 0.6, 0.05], rgb(16777215)), k.counter(-hw + 2.5, y0, hd - 2.2, 3.5, 0), k.shelfRack(1, y0, 0.5, 0, 6, 3), k.shelfRack(1, y0, -2.2, 0, 6, 3);
    for (let i = 0; i < 3; i++) k.fridge(-hw + 1 + i * 1, y0, -hd + 0.8);
    k.ceilingLight(-2, H2 - 0.1, 0), k.ceilingLight(3, H2 - 0.1, 0);
    let cz = hd + 9;
    for (let x of [-4.5, 4.5]) k.solid([x, 2.6, cz], [0.5, 5.2, 0.5], rgb(14540253));
    b.box([0, 5.4, cz], [16, 0.5, 9], rgb(15790320)), b.box([0, 5, cz], [16.2, 0.35, 9.2], rgb(12595248)), b.box([0, 5.75, cz], [16.2, 0.2, 9.2], rgb(3815994)), k.solid([0, 0.1, cz], [4.5, 0.2, 2.4], CONCRETE);
    for (let x of [-1.2, 1.2])
      k.solid([x, 1, cz], [0.9, 1.8, 0.5], rgb(15263976)), b.box([x, 1.5, cz + 0.26], [0.7, 0.5, 0.03], rgb(2109504)), b.box([x, 0.9, cz + 0.27], [0.5, 0.3, 0.03], rgb(12595248)), b.box([x + 0.3, 1.2, cz - 0.3], [0.1, 0.9, 0.1], DARK), b.cyl([x + 0.3, 1.65, cz - 0.3], 0.06, 0.06, 0.4, DARK, 6);
    return b.box([-6.5, 0.8, cz - 2], [1.4, 1.6, 0.6], rgb(2902638)), b.box([-6.5, 1.5, cz - 2], [1.2, 0.3, 0.62], rgb(16765498)), k.loot.push([1, y0, -0.9], [-hw + 2, y0, hd - 3.5], [2, 0.3, cz]), k.chests.push([hw - 1.5, y0, -hd + 1.5]), { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w: 18, d: d + 18, h: H2 + 1, kind: "gas" };
  }
  function barn(pi = 2, seed = 0) {
    let p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p), w = 14, d = 20, hw = w / 2, hd = d / 2, H2 = 6.5, T = 0.3, red = rgb(11023918), redD = rgb(8005152), y0 = 0.42;
    k.solid([0, 0.2, 0], [w + 0.4, 0.4, d + 0.4], CONCRETE), k.floorSlab(-hw + T, hw - T, -hd + T, hd - T, 0.4, rgb(10123856), 0.08), k.wall("x", hd - T / 2, -hw, hw, 0.4, H2, red, [{ x: 0, w: 4.6, y: 0.4, h: 4.2, door: !0 }], T, C.white), k.wall("x", -hd + T / 2, -hw, hw, 0.4, H2, red, [{ x: 0, w: 3, y: 0.4, h: 3.2, door: !0 }, { x: 0, w: 1.6, y: 4.6, h: 1.4 }], T, C.white), k.wall("z", -hw + T / 2, -hd, hd, 0.4, H2, red, [{ x: -5, w: 1.2, y: 1.6, h: 1.2 }, { x: 5, w: 1.2, y: 1.6, h: 1.2 }], T, C.white), k.wall("z", hw - T / 2, -hd, hd, 0.4, H2, red, [{ x: 0, w: 1.2, y: 1.6, h: 1.2 }], T, C.white);
    for (let z of [-hd, hd]) for (let s of [-1, 1])
      b.push(mul(translate(s * hw * 0.5, 2.4, z + (z > 0 ? 0.18 : -0.18)), rotZ(s * 0.5))), b.box([0, 0, 0], [0.14, 5.5, 0.06], C.white), b.pop();
    for (let x = -hw + 1; x < hw; x += 1)
      b.box([x, 3.4, hd + 0.17], [0.05, 6, 0.02], redD), b.box([x, 3.4, -hd - 0.17], [0.05, 6, 0.02], redD);
    let rh = 5.5;
    b.quad([-hw - 0.5, H2, -hd - 0.5], [-hw * 0.55, H2 + rh * 0.7, -hd - 0.5], [-hw * 0.55, H2 + rh * 0.7, hd + 0.5], [-hw - 0.5, H2, hd + 0.5], rgb(4868688)), b.quad([-hw * 0.55, H2 + rh * 0.7, -hd - 0.5], [0, H2 + rh, -hd - 0.5], [0, H2 + rh, hd + 0.5], [-hw * 0.55, H2 + rh * 0.7, hd + 0.5], rgb(4868688)), b.quad([hw + 0.5, H2, hd + 0.5], [hw * 0.55, H2 + rh * 0.7, hd + 0.5], [hw * 0.55, H2 + rh * 0.7, -hd - 0.5], [hw + 0.5, H2, -hd - 0.5], rgb(4868688)), b.quad([hw * 0.55, H2 + rh * 0.7, hd + 0.5], [0, H2 + rh, hd + 0.5], [0, H2 + rh, -hd - 0.5], [hw * 0.55, H2 + rh * 0.7, -hd - 0.5], rgb(4868688));
    for (let z of [-hd, hd])
      b.quad([-hw, H2, z], [hw, H2, z], [hw * 0.55, H2 + rh * 0.7, z], [-hw * 0.55, H2 + rh * 0.7, z], red), b.tri([-hw * 0.55, H2 + rh * 0.7, z], [hw * 0.55, H2 + rh * 0.7, z], [0, H2 + rh, z], red);
    for (let kk = 0; kk < 6; kk++) {
      let t0 = kk / 6, t1 = (kk + 1) / 6;
      k.boxes.push({ min: [-hw * (1 - t0 * 0.9), H2 + rh * t0, -hd], max: [hw * (1 - t0 * 0.9), H2 + rh * t1, hd] });
    }
    b.box([0, H2 + rh + 0.3, 0], [1.2, 0.6, 1.2], C.white), b.cyl([0, H2 + rh + 0.6, 0], 0.5, 0, 0.8, rgb(4868688), 8);
    for (let i = 0; i < 3; i++) {
      let z = -hd + 3 + i * 4.5;
      k.interiorWall("x", z, -hw + T, -hw + 4.5, y0, 1.5), b.box([-hw + 4.5, y0 + 0.75, z + 2.25], [0.08, 1.5, 4.4], rgb(10123856));
    }
    k.hayBale(-hw + 2, y0, -hd + 4.5), k.hayBale(-hw + 2, y0, -hd + 9, 0.3), k.hayBale(-hw + 2, y0 + 0.9, -hd + 4.5, 0.1), k.hayBale(hw - 2.5, y0, hd - 3), k.hayBale(hw - 4, y0, hd - 3, 0.5), k.hayBale(hw - 3.2, y0 + 0.9, hd - 3, 0.2), k.crate(hw - 2, y0, -hd + 2), k.crate(hw - 3.2, y0, -hd + 2, 0.8), k.barrel(hw - 1.5, y0, 0, RUST), k.barrel(hw - 2.5, y0, 0.6, RUST), k.floorSlab(-hw + T, hw - T, -hd + T, -hd + 8, 4, rgb(10123856)), b.box([0, 4.5, -hd + 8], [w - 0.6, 1, 0.06], rgb(10123856));
    for (let x = -hw + 1; x < hw; x += 1) b.box([x, 4.5, -hd + 8], [0.06, 1, 0.06], rgb(10123856));
    return k.stairs(hw - 1.4, -hd + 8.2, y0, 3.6, 5.5, rgb(10123856)), k.hayBale(-hw + 2, 4, -hd + 2), k.hayBale(-hw + 3.5, 4, -hd + 2, 0.4), k.hayBale(0, 4, -hd + 3), k.loot.push([0, y0, 0], [0, y0, hd - 4], [-2, 4, -hd + 5], [hw - 3, y0, -hd + 5]), k.chests.push([-hw + 1.5, 4, -hd + 6]), { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w, d, h: H2 + rh, kind: "barn" };
  }
  function warehouse(pi = 5, seed = 0) {
    let p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p), w = 24, d = 18, hw = w / 2, hd = d / 2, H2 = 7.5, T = 0.3, wallC = rgb(9411236), y0 = 0.42;
    k.solid([0, 0.2, 0], [w + 0.6, 0.4, d + 0.6], CONCRETE), k.floorSlab(-hw + T, hw - T, -hd + T, hd - T, 0.4, rgb(11053220), 0.06), k.wall("x", hd - T / 2, -hw, hw, 0.4, H2, wallC, [{ x: -5, w: 5, y: 0.4, h: 4.5, door: !0 }, { x: 6, w: 1.4, y: 0.4, h: 2.4, door: !0 }, { x: 9.5, w: 1.6, y: 4.8, h: 1.2 }, { x: -10, w: 1.6, y: 4.8, h: 1.2 }], T, DARK), k.wall("x", -hd + T / 2, -hw, hw, 0.4, H2, wallC, [{ x: 0, w: 5, y: 0.4, h: 4.5, door: !0 }], T, DARK), k.wall("z", -hw + T / 2, -hd, hd, 0.4, H2, wallC, [{ x: -4, w: 1.6, y: 4.8, h: 1.2 }, { x: 4, w: 1.6, y: 4.8, h: 1.2 }], T, DARK), k.wall("z", hw - T / 2, -hd, hd, 0.4, H2, wallC, [{ x: 0, w: 1.4, y: 0.4, h: 2.4, door: !0 }], T, DARK);
    for (let x = -hw + 0.6; x < hw; x += 0.6)
      b.box([x, H2 / 2 + 0.2, hd + 0.17], [0.08, H2 - 0.4, 0.04], dk(wallC, 0.8)), b.box([x, H2 / 2 + 0.2, -hd - 0.17], [0.08, H2 - 0.4, 0.04], dk(wallC, 0.8));
    for (let z = -hd + 0.6; z < hd; z += 0.6)
      b.box([hw + 0.17, H2 / 2 + 0.2, z], [0.04, H2 - 0.4, 0.08], dk(wallC, 0.8)), b.box([-hw - 0.17, H2 / 2 + 0.2, z], [0.04, H2 - 0.4, 0.08], dk(wallC, 0.8));
    k.gableRoof(w, d, H2, 2.2, 0.5, rgb(5922920), "x");
    for (let i = -2; i <= 2; i++) b.box([i * 4.5, H2 + 1.1, 0], [1.2, 0.1, d - 2], rgb(14216436));
    for (let r = 0; r < 3; r++) k.shelfRack(-hw + 5 + r * 6, y0, -hd + 5, 0, 5, 4);
    for (let r = 0; r < 3; r++) k.shelfRack(-hw + 5 + r * 6, y0, 0, 0, 5, 4);
    k.crate(hw - 3, y0, hd - 3, 1.2), k.crate(hw - 4.4, y0, hd - 3, 1), k.crate(hw - 3.7, y0 + 1.2, hd - 3, 1), k.crate(-hw + 3, y0, hd - 3, 1.2), k.barrel(-hw + 5, y0, hd - 3, rgb(3829672)), k.barrel(-hw + 5.9, y0, hd - 3.6, rgb(14204960)), k.barrel(-hw + 5.4, y0, hd - 2.4, RUST), k.floorSlab(hw - 8, hw - T, -hd + T, hd - T, 4.2, rgb(7305860), 0.3), k.stairs(hw - 8.8, -hd + 0.5, y0, 3.8, 6, rgb(7305860)), b.box([hw - 8, 4.7, -hd + 3.5], [0.06, 1, 6], DARK), b.box([hw - 4, 4.7, hd - T], [8, 1, 0.06], DARK), k.interiorWall("x", -hd + 5, hw - 8, hw - T, 4.2, 3, hw - 4), k.table(hw - 4, 4.2, -hd + 2.5, 1.6, 0.8), k.chair(hw - 4, 4.2, -hd + 1.6, 0), k.cabinet(hw - 1.2, 4.2, -hd + 2.5, 0.6, 1.4, 1.2, rgb(8028038));
    for (let x of [-6, 0, 6]) for (let z of [-3, 3]) k.ceilingLight(x, H2 - 0.1, z);
    return k.loot.push([-hw + 5, y0, -hd + 2.5], [0, y0, 2.5], [hw - 4, 4.3, 2], [-hw + 3, y0, hd - 5]), k.chests.push([hw - 2, 4.2, hd - 2], [-hw + 2, y0, -hd + 2]), { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w, d, h: H2 + 2.2, kind: "warehouse" };
  }
  function tower(pi = 0, seed = 0) {
    let p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p), wood = rgb(10123856), y = 0.2, H2 = 9;
    for (let [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) k.solid([x, H2 / 2, z], [0.35, H2, 0.35], wood);
    for (let lvl = 1; lvl <= 2; lvl++) {
      let yy = lvl * 3;
      for (let s of [-1, 1])
        b.push(mul(translate(s * 2, yy - 1.5, 0), rotX(0.93))), b.box([0, 0, 0], [0.16, 5.6, 0.16], wood), b.pop(), b.push(mul(translate(0, yy - 1.5, s * 2), rotZ(0.93))), b.box([0, 0, 0], [5.6, 0.16, 0.16], wood), b.pop();
    }
    k.floorSlab(-2.6, 2.6, -2.6, 2.6, H2, wood, 0.2), k.wall("x", 2.5, -2.6, 2.6, H2, 1.1, wood, [], 0.12, wood), k.wall("x", -2.5, -2.6, 2.6, H2, 1.1, wood, [], 0.12, wood), k.wall("z", -2.5, -2.6, 2.6, H2, 1.1, wood, [], 0.12, wood), k.wall("z", 2.5, -2.6, 0.9, H2, 1.1, wood, [], 0.12, wood);
    for (let [x, z] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) b.box([x, H2 + 1.6, z], [0.2, 3.2, 0.2], wood);
    b.quad([-3.2, H2 + 3.2, -3.2], [-3.2, H2 + 3.2, 3.2], [0, H2 + 4.6, 0], [0, H2 + 4.6, 0], rgb(4868688)), b.tri([-3.2, H2 + 3.2, -3.2], [0, H2 + 4.6, 0], [3.2, H2 + 3.2, -3.2], rgb(4868688)), b.tri([3.2, H2 + 3.2, -3.2], [0, H2 + 4.6, 0], [3.2, H2 + 3.2, 3.2], rgb(4868688)), b.tri([3.2, H2 + 3.2, 3.2], [0, H2 + 4.6, 0], [-3.2, H2 + 3.2, 3.2], rgb(4868688)), b.tri([-3.2, H2 + 3.2, 3.2], [0, H2 + 4.6, 0], [-3.2, H2 + 3.2, -3.2], rgb(4868688));
    for (let i = 0; i < 14; i++) k.solid([1.8, y + (i + 1) * H2 / 14 - 0.05, 2.9 - i * 0.02], [1, 0.1, 0.5], wood);
    return k.crate(-1.5, H2, -1.5, 0.9), k.loot.push([0, H2, 0]), k.chests.push([1.2, H2, -1.5]), { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w: 6, d: 6, h: H2 + 4.6, kind: "tower" };
  }
  function motel(pi = 4, seed = 0) {
    let p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p), rooms = 5, rw = 5, w = rooms * rw, d = 8, hw = w / 2, hd = d / 2, H2 = FH * 2, T = 0.3, wallC = rgb(14735040), y0 = 0.42;
    k.solid([0, 0.2, 0], [w + 0.5, 0.4, d + 0.5], CONCRETE), k.floorSlab(-hw + T, hw - T, -hd + T, hd - T, 0.4, rgb(9071178), 0.1);
    for (let f = 0; f < 2; f++) {
      let y = f * FH + 0.4, ops = [];
      for (let i = 0; i < rooms; i++) {
        let x = -hw + (i + 0.5) * rw;
        ops.push({ x: x - 1.4, w: 1, y, h: 2.3, door: !0 }, { x: x + 0.9, w: 1.6, y: y + 0.9, h: 1.4 });
      }
      k.wall("x", hd - T / 2, -hw, hw, y, FH - 0.4 + (f ? 0.4 : 0), wallC, ops, T, rgb(4881050));
      for (let i = 1; i < rooms; i++) k.interiorWall("z", -hw + i * rw, -hd + T, hd - T, y + (f ? 0 : 0.12), FH - 0.2);
      for (let i = 0; i < rooms; i++) {
        let x = -hw + (i + 0.5) * rw, yy = y + (f ? 0 : 0.12);
        k.bed(x - 1, yy, -hd + 1.8, Math.PI, [rgb(13228266), rgb(15122624), rgb(14214848)][i % 3]), k.cabinet(x + 1.6, yy, -hd + 1, 1.2, 1, 0.6, rgb(8018490)), k.tv(x + 1.6, yy + 1, -hd + 1, 0), k.chair(x + 1.5, yy, hd - 1.6, 0), k.lamp(x + 0.9, yy, -hd + 0.6), k.rug(x, yy, 0, 2.4, 1.6, rgb(6961722)), k.ceilingLight(x, y + FH - 0.2, 0), i % 2 === 0 && k.loot.push([x, yy, 0.5]);
      }
    }
    k.wall("x", -hd + T / 2, -hw, hw, 0.4, H2, wallC, [], T), k.wall("z", -hw + T / 2, -hd, hd, 0.4, H2, wallC, [], T), k.wall("z", hw - T / 2, -hd, hd, 0.4, H2, wallC, [], T), k.floorSlab(-hw - 0.2, hw + 3.2, hd, hd + 2.4, FH, rgb(9407878), 0.25), b.box([0, FH + 0.55, hd + 2.35], [w + 3.4, 1.1, 0.06], rgb(4881050));
    for (let x = -hw; x < hw + 3.2; x += 1.2) b.box([x, FH + 0.55, hd + 2.35], [0.06, 1.1, 0.06], rgb(4881050));
    for (let x of [-hw + 1, 0, hw - 1]) k.solid([x, FH / 2, hd + 2.2], [0.2, FH, 0.2], rgb(4881050));
    return k.stairs(hw + 2.5, hd + 2.4 - 6.4, 0.4, FH, 6.4, rgb(9407878)), b.box([0, H2 + 0.15, 0], [w + 0.6, 0.3, d + 5.4], rgb(6975092)), b.box([0, H2 + 0.5, 0], [w + 0.8, 0.2, d + 5.6], rgb(5330267)), b.box([-hw - 1.5, 5.5, hd + 3], [0.3, 11, 0.3], rgb(4881050)), b.box([-hw - 1.5, 10.5, hd + 3], [4.5, 2.2, 0.3], rgb(16049856)), b.box([-hw - 1.5, 10.5, hd + 3.2], [3.6, 1.2, 0.05], rgb(12595248)), k.chests.push([hw - 1.2, FH + 0.02, -hd + 1], [-hw + 1.2, 0.52, -hd + 1]), { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w, d: d + 3, h: H2 + 1, kind: "motel" };
  }
  var BUILDERS = { colonial, cottage, shop, gas, barn, warehouse, tower, motel };

  // src/world.ts
  var SIZE = 720, STEP = 3, hash = (x, z) => {
    let s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  function vnoise(x, z) {
    let xi = Math.floor(x), zi = Math.floor(z), fx2 = x - xi, fz = z - zi, sx = fx2 * fx2 * (3 - 2 * fx2), sz = fz * fz * (3 - 2 * fz), a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  }
  var sstep = (t2) => (t2 = clamp(t2, 0, 1), t2 * t2 * (3 - 2 * t2)), POIS = [
    // Chapter 1 Season 1 layout (north = -z)
    { name: "ANARCHY ACRES", x: -40, z: -250, h: 10, r: 55, houses: 5, kinds: ["barn", "barn", "cottage", "tower", "colonial"], layout: "scatter" },
    { name: "PLEASANT PARK", x: -190, z: -130, h: 9, r: 70, houses: 8, kinds: ["colonial", "colonial", "cottage", "colonial", "colonial", "cottage", "colonial", "colonial"], layout: "ring" },
    { name: "LOOT LAKE", x: 0, z: -40, h: 3.2, r: 10, houses: 1, kinds: ["colonial"], layout: "scatter" },
    { name: "WAILING WOODS", x: 215, z: -195, h: 12, r: 55, houses: 4, kinds: ["cottage", "tower", "cottage", "tower"], layout: "scatter" },
    { name: "TOMATO TOWN", x: 110, z: -175, h: 9, r: 48, houses: 5, kinds: ["shop", "gas", "cottage", "shop", "colonial"], layout: "street" },
    { name: "LONELY LODGE", x: 265, z: -40, h: 11, r: 50, houses: 4, kinds: ["tower", "cottage", "cottage", "barn"], layout: "scatter" },
    { name: "DUSTY DEPOT", x: 40, z: 60, h: 8, r: 55, houses: 4, kinds: ["warehouse", "warehouse", "warehouse", "tower"], layout: "grid" },
    { name: "SALTY SPRINGS", x: 40, z: 150, h: 8, r: 60, houses: 7, kinds: ["colonial", "cottage", "colonial", "gas", "cottage", "colonial", "tower"], layout: "street" },
    { name: "RETAIL ROW", x: 205, z: 110, h: 10, r: 68, houses: 8, kinds: ["shop", "shop", "gas", "warehouse", "motel", "colonial", "cottage", "colonial"], layout: "grid" },
    { name: "GREASY GROVE", x: -200, z: 120, h: 8, r: 62, houses: 7, kinds: ["gas", "shop", "colonial", "cottage", "colonial", "motel", "cottage"], layout: "street" },
    { name: "FATAL FIELDS", x: -40, z: 250, h: 9, r: 55, houses: 5, kinds: ["barn", "cottage", "barn", "tower", "colonial"], layout: "scatter" },
    { name: "MOISTY MIRE", x: 235, z: 240, h: 4, r: 50, houses: 3, kinds: ["cottage", "tower", "cottage"], layout: "scatter" },
    { name: "FLUSH FACTORY", x: -195, z: 260, h: 7, r: 50, houses: 4, kinds: ["warehouse", "warehouse", "shop", "tower"], layout: "grid" },
    { name: "LUCKY LANDING", x: 60, z: 300, h: 6, r: 40, houses: 3, kinds: ["motel", "shop", "cottage"], layout: "street" }
  ], LAKES = [[0, -40, 62], [150, 30, 26], [-110, -30, 22], [-260, 20, 30], [120, 230, 24], [-120, 190, 22], [280, 160, 26]], MESAS = [[0, -40, 13, 8], [-110, 40, 30, 16], [150, -100, 34, 20], [-270, -230, 34, 16], [280, 40, 26, 14], [-290, 200, 30, 18], [130, 300, 26, 12], [300, -270, 26, 12]], ROADS = [[0, 1], [0, 4], [4, 3], [4, 5], [1, 9], [1, 6], [4, 6], [6, 7], [7, 8], [8, 5], [9, 10], [7, 10], [10, 13], [8, 11], [12, 9], [12, 10], [13, 11], [3, 5]];
  function riverMask(x, z) {
    let a = Math.abs(vnoise(x * 4e-3 + 9, z * 4e-3 + 3) - 0.5), b = Math.abs(vnoise(x * 35e-4 + 40, z * 35e-4 + 70) - 0.5), c = Math.abs(vnoise(x * 3e-3 + 80, z * 3e-3 + 20) - 0.5);
    return Math.max(1 - Math.min(a, b, c) / 0.065, 0);
  }
  function terrainH(x, z) {
    let r = Math.hypot(x * 0.95, z * 1.05), h = 0;
    for (let o = 0, f = 45e-4, a = 26; o < 4; o++, f *= 2, a *= 0.42) h += vnoise(x * f + 31, z * f + 17) * a;
    let coast = vnoise(x * 0.01 + 5, z * 0.01 + 9) * 60;
    h = h - 8 + 16 * (1 - clamp((r - 200 + coast * 0.6) / 110, 0, 1)), h -= riverMask(x, z) * 10 * clamp((h + 2) / 6, 0, 1);
    for (let [lx, lz, lr] of LAKES) {
      let d = Math.hypot(x - lx, z - lz);
      if (d < lr) {
        let t2 = clamp((1 - d / lr) * 2.2, 0, 1), k = t2 * t2 * (3 - 2 * t2);
        h = h * (1 - k) + -4.5 * k;
      }
    }
    for (let [mx, mz, mr, mh] of MESAS) {
      let d = Math.hypot(x - mx, z - mz);
      if (d < mr + 10) {
        let k = sstep((mr - d) / 7 + 1), top = h + mh + vnoise(x * 0.05, z * 0.05) * 2;
        h = h * (1 - k) + top * k;
      }
    }
    for (let p of POIS) {
      let t2 = clamp((Math.hypot(x - p.x, z - p.z) - p.r) / 30, 0, 1);
      h = p.h * (1 - t2) + h * t2;
    }
    return h;
  }
  function segDist(x, z, a, b) {
    let dx = b.x - a.x, dz = b.z - a.z, t2 = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    return Math.hypot(x - (a.x + dx * t2), z - (a.z + dz * t2));
  }
  function roadDist(x, z) {
    let m = 1e9;
    for (let [ia, ib] of ROADS) m = Math.min(m, segDist(x, z, POIS[ia], POIS[ib]));
    return m;
  }
  function terrainColor(x, z, y) {
    if (y < -0.1) return rgb(15922406);
    if (y < 1.4) return rgb(15327130);
    if (y < 2.2) return rgb(13950090);
    let rd = roadDist(x, z);
    if (rd < 3.2) return rgb(7040626);
    if (rd < 4.4) return rgb(11049584);
    let v = vnoise(x * 0.03, z * 0.03);
    return vnoise(x * 0.09 + 50, z * 0.09 + 12) > 0.86 ? rgb(11048030) : v > 0.6 ? rgb(8376125) : v > 0.4 ? rgb(9690188) : rgb(8967748);
  }
  var TILES = (t2) => t2 === "wall" ? 9 : t2 === "floor" ? 4 : 0, MAT_HP = { wood: 150, stone: 300, metal: 500 }, _World = class _World {
    constructor(r) {
      __publicField(this, "terrain");
      __publicField(this, "terrainChunks", []);
      __publicField(this, "props", []);
      __publicField(this, "statics", []);
      __publicField(this, "houseMeshes", []);
      __publicField(this, "houseBoxes", []);
      __publicField(this, "pieces", /* @__PURE__ */ new Map());
      __publicField(this, "lootSpots", []);
      __publicField(this, "chestSpots", []);
      __publicField(this, "footprints", []);
      /** 32m spatial hash of props + statics so collision/raycast only touch nearby objects */
      __publicField(this, "grid", /* @__PURE__ */ new Map());
      /** lush 3D grass blade clusters with varied heights, wildflowers and wind sway */
      __publicField(this, "grassChunks", /* @__PURE__ */ new Map());
      let n = Math.floor(SIZE / STEP), CH = 6, per = Math.ceil(n / CH), N = (x, z) => norm([terrainH(x - 1, z) - terrainH(x + 1, z), 2, terrainH(x, z - 1) - terrainH(x, z + 1)]);
      for (let ci = 0; ci < CH; ci++) for (let cj = 0; cj < CH; cj++) {
        let b = new MB();
        for (let i = ci * per; i < Math.min(n, (ci + 1) * per); i++) for (let j = cj * per; j < Math.min(n, (cj + 1) * per); j++) {
          let x0 = -SIZE / 2 + i * STEP, z0 = -SIZE / 2 + j * STEP, x1 = x0 + STEP, z1 = z0 + STEP, p = (x, z) => [x, terrainH(x, z), z], a = p(x0, z0), bb = p(x1, z0), c = p(x1, z1), d = p(x0, z1);
          if (Math.max(a[1], bb[1], c[1], d[1]) < -2.5) continue;
          let mx = x0 + STEP / 2, mz = z0 + STEP / 2, col = terrainColor(mx, mz, (a[1] + c[1]) / 2);
          b.triN(a, d, c, N(x0, z0), N(x0, z1), N(x1, z1), col), b.triN(a, c, bb, N(x0, z0), N(x1, z1), N(x1, z0), col);
        }
        let cs = per * STEP;
        this.terrainChunks.push({ mesh: b.build(r), c: [-SIZE / 2 + (ci + 0.5) * cs, 0, -SIZE / 2 + (cj + 0.5) * cs], r: cs * 0.71 });
      }
      this.terrain = this.terrainChunks[0].mesh;
      for (let [ia, ib] of ROADS) {
        let A = POIS[ia], B = POIS[ib], L = Math.hypot(B.x - A.x, B.z - A.z), yaw = Math.atan2(B.x - A.x, B.z - A.z);
        for (let t2 = 0; t2 < L; t2 += 7) {
          let x = A.x + (B.x - A.x) * t2 / L, z = A.z + (B.z - A.z) * t2 / L, y = terrainH(x, z);
          y > 0.5 && this.statics.push({ mesh: "dash", pos: [x, y, z], yaw, boxes: [] });
        }
      }
      let rotBox = (bx, k, o) => {
        let rr = [bx.min, bx.max].flatMap((m) => [[bx.min[0], m[2]], [bx.max[0], m[2]]]).map(([x, z]) => {
          for (let i = 0; i < k; i++) [x, z] = [z, -x];
          return [x, z];
        });
        return { min: [Math.min(...rr.map((v) => v[0])) + o[0], bx.min[1] + o[1], Math.min(...rr.map((v) => v[1])) + o[2]], max: [Math.max(...rr.map((v) => v[0])) + o[0], bx.max[1] + o[1], Math.max(...rr.map((v) => v[1])) + o[2]] };
      }, rotPt = (p, k, o) => {
        let [x, z] = [p[0], p[2]];
        for (let i = 0; i < k; i++) [x, z] = [z, -x];
        return [x + o[0], p[1] + o[1], z + o[2]];
      }, addStatic = (mesh, pos, k, lboxes) => {
        let hp = mesh.startsWith("house") ? 900 : mesh === "car" || mesh === "truck" ? 400 : 220;
        this.statics.push({ mesh, pos, yaw: k * Math.PI / 2, boxes: lboxes.map((bx) => rotBox(bx, k, pos)), hp, maxHp: hp, shake: 0, dead: !1 });
      }, footprints = this.footprints, placeBuilding = (kind, x, z, k, pi, seed) => {
        let bd = BUILDERS[kind](pi, seed), rad = Math.hypot(bd.w, bd.d) / 2 + 2;
        for (let f of footprints) if (Math.hypot(f[0] - x, f[1] - z) < f[2] + rad) return !1;
        footprints.push([x, z, rad]), this.houseMeshes.push(r.upload(new Float32Array(bd.b.d)));
        let y = terrainH(x, z) - 0.15, pos = [x, y, z];
        addStatic("house" + (this.houseMeshes.length - 1), pos, k, bd.boxes), this.houseBoxes.push(...this.statics[this.statics.length - 1].boxes);
        for (let l of bd.loot) this.lootSpots.push(rotPt(l, k, pos));
        for (let c of bd.chests) this.chestSpots.push(rotPt(c, k, pos));
        let fa = k * Math.PI / 2, fx2 = Math.sin(fa), fz = Math.cos(fa), sx = Math.cos(fa), sz = -Math.sin(fa), front = bd.d / 2 + 5;
        return (kind === "colonial" || kind === "cottage") && (seed % 2 === 0 && addStatic(seed % 4 ? "car" : "truck", [x + fx2 * front + sx * 5, y + 0.15, z + fz * front + sz * 5], k, [{ min: [-1.3, 0, -2.2], max: [1.3, 2.8, 3.8] }]), addStatic("mailbox", [x + fx2 * (front + 1) - sx * 3, y + 0.15, z + fz * (front + 1) - sz * 3], k, []), seed % 3 === 0 && (addStatic("fence", [x + fx2 * (front + 2) - sx * 4, y + 0.15, z + fz * (front + 2) - sz * 4], k, []), addStatic("fence", [x + fx2 * (front + 2) + sx * 4, y + 0.15, z + fz * (front + 2) + sz * 4], k, [])), addStatic("hedge", [x - sx * (bd.w / 2 + 2.5), y + 0.15, z - sz * (bd.w / 2 + 2.5)], (k + 1) % 4, [])), (kind === "shop" || kind === "gas" || kind === "motel") && (addStatic("dumpster", [x - sx * (bd.w / 2 + 3), y, z - sz * (bd.w / 2 + 3)], k, [{ min: [-1.1, 0, -0.6], max: [1.1, 1.4, 0.6] }]), addStatic("lamp", [x + fx2 * (front + 2) + sx * (bd.w / 2 - 1), y + 0.15, z + fz * (front + 2) + sz * (bd.w / 2 - 1)], 0, [{ min: [-0.15, 0, -0.15], max: [0.15, 5, 0.15] }])), kind === "warehouse" && addStatic("truck", [x + fx2 * (front + 4) - sx * 6, y + 0.15, z + fz * (front + 4) - sz * 6], k, [{ min: [-1.3, 0, -2.2], max: [1.3, 2.8, 3.8] }]), !0;
      };
      for (let pi = 0; pi < POIS.length; pi++) {
        let p = POIS[pi], ty = pi % 4 * Math.PI / 2, ca = Math.cos(ty), sa = Math.sin(ty), slots = [];
        if (p.layout === "ring")
          for (let i = 0; i < p.houses; i++) {
            let a = i / p.houses * 6.28;
            slots.push([Math.cos(a) * 36, Math.sin(a) * 36, (Math.round(Math.atan2(-Math.cos(a), -Math.sin(a)) / (Math.PI / 2)) % 4 + 4) % 4]);
          }
        else if (p.layout === "street")
          for (let i = 0; i < p.houses; i++) {
            let row = i % 2, col = Math.floor(i / 2);
            slots.push([(col - (Math.ceil(p.houses / 2) - 1) / 2) * 30, row ? 20 : -20, row ? 2 : 0]);
          }
        else if (p.layout === "grid")
          for (let i = 0; i < p.houses; i++) {
            let row = Math.floor(i / 3), col = i % 3;
            slots.push([(col - 1) * 34, (row - 0.5) * 36, row ? 2 : 0]);
          }
        else
          for (let i = 0; i < p.houses; i++) {
            let a = i * 2.4 + 0.7, rr = 16 + i % 3 * 14;
            slots.push([Math.cos(a) * rr, Math.sin(a) * rr, i % 4]);
          }
        for (let i = 0; i < p.houses; i++) {
          let [lx, lz, lk] = slots[i], x = p.x + lx * ca + lz * sa, z = p.z - lx * sa + lz * ca, k = (lk + pi % 4) % 4;
          placeBuilding(p.kinds[i % p.kinds.length], x, z, k, pi + i, i + pi * 3);
        }
        for (let tt = -p.r * 0.7; tt < p.r * 0.7; tt += 7) {
          let x = p.x + ca * tt, z = p.z - sa * tt;
          this.statics.push({ mesh: "dash", pos: [x, p.h - 0.1, z], yaw: Math.PI / 2 + ty, boxes: [] });
        }
        for (let tt = -p.r * 0.6; tt < p.r * 0.6; tt += 24) {
          let x = p.x + ca * tt + sa * 7, z = p.z - sa * tt + ca * 7;
          addStatic("lamp", [x, p.h, z], 0, [{ min: [-0.15, 0, -0.15], max: [0.15, 5, 0.15] }]);
        }
        if (p.name === "WAILING WOODS") {
          for (let gx = -4; gx <= 4; gx++) for (let gz = -4; gz <= 4; gz++)
            (gx + gz) % 2 === 0 && Math.random() < 0.55 || Math.random() < 0.3 || addStatic("hedge", [p.x + 60 + gx * 4, p.h, p.z + 30 + gz * 4], (gx + gz) % 2 ? 1 : 0, [{ min: [-2, 0, -0.6], max: [2, 2.2, 0.6] }]);
          this.chestSpots.push([p.x + 60, p.h, p.z + 30]);
        }
        if (p.name === "DUSTY DEPOT" || p.name === "FLUSH FACTORY") {
          for (let k = 0; k < 14; k++) {
            let x = p.x + rand(-30, 30), z = p.z + rand(-12, 12), h = Math.random() < 0.4 ? 2 : 1, ok = !0;
            for (let f of footprints) Math.hypot(f[0] - x, f[1] - z) < f[2] && (ok = !1);
            if (ok)
              for (let l = 0; l < h; l++) addStatic("crate", [x, p.h + l * 2, z], Math.floor(rand(0, 4)), l ? [] : [{ min: [-1, 0, -1], max: [1, 2 * h, 1] }]);
          }
          this.chestSpots.push([p.x, p.h, p.z]);
        }
        if (p.name === "PLEASANT PARK") {
          for (let i = -3; i <= 3; i++)
            addStatic("fence", [p.x + 40 + i * 8, p.h, p.z - 62], 0, []), addStatic("fence", [p.x + 40 + i * 8, p.h, p.z - 38], 0, []);
          for (let i = -2; i <= 2; i++)
            this.statics.push({ mesh: "dash", pos: [p.x + 40 + i * 6, p.h, p.z - 50], yaw: Math.PI / 2, boxes: [] });
          this.statics.push({ mesh: "dash", pos: [p.x + 40, p.h, p.z - 56], yaw: 0, boxes: [] }, { mesh: "dash", pos: [p.x + 40, p.h, p.z - 44], yaw: 0, boxes: [] });
        }
        if (p.name === "PLEASANT PARK") {
          addStatic("fountain", [p.x, p.h, p.z], 0, [{ min: [-3, 0, -3], max: [3, 1, 3] }]);
          for (let a = 0; a < 6; a++) addStatic("bench", [p.x + Math.cos(a * Math.PI / 3) * 8, p.h, p.z + Math.sin(a * Math.PI / 3) * 8], a, []);
        }
        if ((p.name === "SALTY SPRINGS" || p.name === "RETAIL ROW" || p.name === "ANARCHY ACRES" || p.name === "DUSTY DEPOT") && addStatic("waterTower", [p.x - 44, p.h, p.z + 38], 0, [{ min: [-3.8, 0, -3.8], max: [3.8, 21, 3.8] }]), p.name === "ANARCHY ACRES" || p.name === "FATAL FIELDS") for (let i = -3; i <= 3; i++)
          addStatic("fence", [p.x + i * 8, p.h, p.z - 40], 0, []), addStatic("fence", [p.x + i * 8, p.h, p.z + 40], 0, []);
      }
      let put = (x, z, type, s) => {
        let y = terrainH(x, z);
        if (!(y < 2.2)) {
          for (let f of footprints) if (Math.hypot(f[0] - x, f[1] - z) < f[2] + 1) return;
          roadDist(x, z) < 6 || this.props.push({ type, pos: [x, y - 0.2, z], yaw: rand(0, 6.28), s, hp: type === "bush" ? 30 : 250, r: (type === "rock" ? 1.4 : type === "bush" ? 0.7 : 0.4) * s, h: (type === "rock" ? 1.2 : type === "bush" ? 1 : 6) * s, dead: 0 });
        }
      };
      for (let k = 0; k < 1500; k++) {
        let x = rand(-SIZE / 2, SIZE / 2), z = rand(-SIZE / 2, SIZE / 2), rv = Math.random(), ok = !0;
        for (let p of POIS) Math.hypot(x - p.x, z - p.z) < p.r * 0.7 && p.layout !== "scatter" && (ok = !1);
        if (!ok) continue;
        let type = rv < 0.4 ? "tree" : rv < 0.55 ? "tree2" : rv < 0.72 ? "pine" : rv < 0.9 ? "rock" : "bush";
        put(x, z, type, type === "pine" ? rand(1.1, 1.7) : type === "rock" ? rand(0.9, 1.8) : type === "bush" ? rand(1.2, 1.8) : rand(1.3, 1.9));
      }
      for (let [cx, cz, cr, pineK] of [[215, -195, 60, 0.85], [265, -40, 55, 0.9], [235, 240, 60, 0.2], [-120, 40, 50, 0.6], [-300, -60, 45, 0.5], [120, 10, 40, 0.4]])
        for (let k = 0; k < 220; k++) {
          let a = rand(0, 6.28), rr = Math.sqrt(Math.random()) * cr, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, pine = Math.random() < pineK;
          put(x, z, pine ? "pine" : Math.random() < 0.7 ? "tree" : "tree2", pine ? rand(1.3, 2) : rand(1.4, 2));
        }
      for (let [ia, ib] of ROADS) {
        let A = POIS[ia], B = POIS[ib], L = Math.hypot(B.x - A.x, B.z - A.z), nx = -(B.z - A.z) / L, nz = (B.x - A.x) / L;
        for (let tt = 30; tt < L - 30; tt += rand(10, 18)) {
          let s = Math.random() < 0.5 ? 1 : -1, x = A.x + (B.x - A.x) * tt / L + nx * s * rand(9, 14), z = A.z + (B.z - A.z) * tt / L + nz * s * rand(9, 14);
          put(x, z, Math.random() < 0.8 ? "tree" : "bush", rand(1.3, 1.8));
        }
      }
      for (let [mx, mz, mr] of MESAS) for (let k = 0; k < 10; k++) {
        let a = rand(0, 6.28);
        put(mx + Math.cos(a) * rand(0, mr * 0.7), mz + Math.sin(a) * rand(0, mr * 0.7), Math.random() < 0.5 ? "pine" : "rock", rand(1.2, 1.8));
        for (let q = 0; q < 2; q++) put(mx + Math.cos(a) * (mr + rand(6, 14)), mz + Math.sin(a) * (mr + rand(6, 14)), "rock", rand(1.4, 2.4));
      }
      this.buildGrid();
    }
    gkey(x, z) {
      return (Math.floor(x / _World.GC) + 512) * 4096 + Math.floor(z / _World.GC) + 512;
    }
    cell(x, z) {
      let k = this.gkey(x, z), c = this.grid.get(k);
      return c || (c = { props: [], statics: [] }, this.grid.set(k, c)), c;
    }
    buildGrid() {
      this.grid.clear();
      for (let q of this.props) this.cell(q.pos[0], q.pos[2]).props.push(q);
      for (let s of this.statics) {
        if (!s.boxes.length) continue;
        let a = { min: [1 / 0, 1 / 0, 1 / 0], max: [-1 / 0, -1 / 0, -1 / 0] };
        for (let b of s.boxes) for (let i = 0; i < 3; i++)
          a.min[i] = Math.min(a.min[i], b.min[i]), a.max[i] = Math.max(a.max[i], b.max[i]);
        s.aabb = a;
        for (let x = a.min[0]; x <= a.max[0] + _World.GC; x += _World.GC) for (let z = a.min[2]; z <= a.max[2] + _World.GC; z += _World.GC) {
          let c = this.cell(Math.min(x, a.max[0]), Math.min(z, a.max[2]));
          c.statics.includes(s) || c.statics.push(s);
        }
      }
    }
    /** cells within rad of (x,z) */
    near(x, z, rad) {
      let out = [];
      for (let cx = x - rad; cx <= x + rad + _World.GC; cx += _World.GC) for (let cz = z - rad; cz <= z + rad + _World.GC; cz += _World.GC) {
        let c = this.grid.get(this.gkey(Math.min(cx, x + rad), Math.min(cz, z + rad)));
        c && !out.includes(c) && out.push(c);
      }
      return out;
    }
    grassChunk(r, cx, cz) {
      let key = cx + "," + cz, m = this.grassChunks.get(key);
      if (m) return m;
      let g = new MB(), S2 = 24, rs = (cx * 73856093 ^ cz * 19349663) >>> 0 || 1, rnd = () => (rs ^= rs << 13, rs ^= rs >>> 17, rs ^= rs << 5, (rs >>> 0) % 1e4 / 1e4);
      for (let k = 0; k < 1e3; k++) {
        let x = cx * S2 + rnd() * S2, z = cz * S2 + rnd() * S2, y = terrainH(x, z);
        if (y < 2.3 || roadDist(x, z) < 4.6 || this.footprints.some((f) => Math.hypot(f[0] - x, f[1] - z) < f[2] - 1)) continue;
        let hgt = 0.45 + rnd() * 0.35, w = 0.05 + rnd() * 0.04, a = rnd() * 3.14, c = [0.36 + rnd() * 0.12, 0.82 + rnd() * 0.14, 0.25];
        for (let aa of [a, a + 1.05, a + 2.1]) {
          let dx = Math.cos(aa) * w, dz = Math.sin(aa) * w, tipX = x + dx * 0.5 + Math.cos(a + 1.5) * 0.12, tipZ = z + dz * 0.5 + Math.sin(a + 1.5) * 0.12;
          g.triN([x - dx, y, z - dz], [x + dx, y, z + dz], [tipX, y + hgt, tipZ], [0, 1, 0], [0, 1, 0], [0, 1, 0], c), g.triN([x + dx, y, z + dz], [x - dx, y, z - dz], [tipX, y + hgt, tipZ], [0, 1, 0], [0, 1, 0], [0, 1, 0], dk(c, 0.9));
        }
        if (rnd() < 0.08) {
          let flowerCol = rnd() < 0.6 ? [1, 0.92, 0.35] : [0.98, 0.98, 0.98];
          g.sphere([x, y + hgt * 0.85, z], 0.065, flowerCol, 6, 1, !0);
        }
      }
      return m = g.build(r), this.grassChunks.set(key, m), m;
    }
    /** top-down map image (used by minimap + fullscreen map) */
    drawMap(cv) {
      let ctx = cv.getContext("2d"), n = cv.width, px = SIZE / n, img = ctx.createImageData(n, n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        let x = -SIZE / 2 + i * px, z = -SIZE / 2 + j * px, y = terrainH(x, z), c = y < -0.2 ? y < -4 ? rgb(3840728) : rgb(6210278) : terrainColor(x, z, y);
        if (y > 0.5)
          for (let [ia, ib] of ROADS) segDist(x, z, POIS[ia], POIS[ib]) < 1.6 && (c = rgb(15263968));
        let o = (j * n + i) * 4;
        img.data[o] = c[0] * 255, img.data[o + 1] = c[1] * 255, img.data[o + 2] = c[2] * 255, img.data[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0), ctx.fillStyle = "#3f8a34";
      for (let q of this.props) if (q.type !== "bush" && q.type !== "rock") {
        let i = (q.pos[0] + SIZE / 2) / px, j = (q.pos[2] + SIZE / 2) / px;
        ctx.fillRect(i - 0.8, j - 0.8, 1.6, 1.6);
      }
      ctx.fillStyle = "#e4e6e8";
      for (let s of this.statics) if (s.mesh.startsWith("house")) {
        let i = (s.pos[0] + SIZE / 2) / px, j = (s.pos[2] + SIZE / 2) / px;
        ctx.fillRect(i - 3, j - 2.5, 6, 5);
      }
    }
    drawLabels(cv) {
      let ctx = cv.getContext("2d"), px = SIZE / cv.width;
      ctx.font = "italic bold 15px Impact, Arial", ctx.textAlign = "center", ctx.lineWidth = 3, ctx.strokeStyle = "#000a", ctx.fillStyle = "#fff";
      for (let p of POIS) {
        let i = (p.x + SIZE / 2) / px, j = (p.z + SIZE / 2) / px + 5;
        ctx.strokeText(p.name, i, j), ctx.fillText(p.name, i, j);
      }
    }
    // ---------------- building ----------------
    static key(type, p, dir) {
      return `${type}:${p[0]},${p[1]},${p[2]}:${type === "floor" || type === "pyramid" ? 0 : dir % 2}`;
    }
    place(type, mat, pos, dir) {
      let key = _World.key(type, pos, dir);
      if (this.pieces.has(key)) return null;
      let p = { type, mat, pos, dir, hp: MAT_HP[mat], maxHp: MAT_HP[mat], key, edit: 0, born: performance.now() / 1e3 };
      return this.pieces.set(key, p), p;
    }
    damagePiece(p, d) {
      p.hp -= d, p.hp <= 0 && this.pieces.delete(p.key);
    }
    pieceBox(p) {
      let [x, y, z] = p.pos;
      return p.type === "wall" ? p.dir % 2 === 0 ? { min: [x - 2, y, z - 0.13], max: [x + 2, y + 4, z + 0.13], ref: p } : { min: [x - 0.13, y, z - 2], max: [x + 0.13, y + 4, z + 2], ref: p } : p.type === "floor" ? { min: [x - 2, y - 0.22, z - 2], max: [x + 2, y + 0.02, z + 2], ref: p } : p.type === "ramp" ? { min: [x - 2, y - 0.25, z - 2], max: [x + 2, y + 4, z + 2], ref: p } : { min: [x - 2, y, z - 2], max: [x + 2, y + 2, z + 2], ref: p };
    }
    /** collision boxes honoring edits (removed tiles leave holes) */
    pieceBoxes(p) {
      if (!p.edit || !TILES(p.type)) return [this.pieceBox(p)];
      let [x, y, z] = p.pos, out = [];
      if (p.type === "wall") {
        let along = p.dir % 2 === 0 ? 0 : 2;
        for (let i = 0; i < 9; i++) {
          if (p.edit & 1 << i) continue;
          let r = Math.floor(i / 3), c = i % 3, lo = -2 + c * 4 / 3, hi = lo + 4 / 3, b = { min: [x - 0.13, y + r * 4 / 3, z - 0.13], max: [x + 0.13, y + (r + 1) * 4 / 3, z + 0.13], ref: p };
          b.min[along] = p.pos[along] + lo, b.max[along] = p.pos[along] + hi, out.push(b);
        }
      } else for (let i = 0; i < 4; i++) {
        if (p.edit & 1 << i) continue;
        let cx = i % 2 ? 1 : -1, cz = i > 1 ? 1 : -1;
        out.push({ min: [x + Math.min(0, cx * 2), y - 0.22, z + Math.min(0, cz * 2)], max: [x + Math.max(0, cx * 2), y + 0.02, z + Math.max(0, cz * 2)], ref: p });
      }
      return out;
    }
    /** which tile of a wall/floor a world point (on the piece) falls in, or -1 */
    tileAt(p, pt) {
      let lx = pt[0] - p.pos[0], ly = pt[1] - p.pos[1], lz = pt[2] - p.pos[2];
      if (p.type === "wall") {
        let a = p.dir % 2 === 0 ? lx : lz, c = clamp(Math.floor((a + 2) / (4 / 3)), 0, 2);
        return clamp(Math.floor(ly / (4 / 3)), 0, 2) * 3 + c;
      }
      return p.type === "floor" ? (lx > 0 ? 1 : 0) + (lz > 0 ? 2 : 0) : -1;
    }
    slopeH(p, x, z) {
      let lx = x - p.pos[0], lz = z - p.pos[2];
      if (Math.abs(lx) > 2 || Math.abs(lz) > 2) return -1 / 0;
      if (p.type === "pyramid") return p.pos[1] + 2 - Math.max(Math.abs(lx), Math.abs(lz));
      if (p.type !== "ramp") return -1 / 0;
      let a = p.dir * Math.PI / 2, fz = -Math.sin(a) * lx + Math.cos(a) * lz;
      return p.pos[1] + (fz + 2);
    }
    solids(x, z, rad = 10) {
      let out = [];
      for (let p of this.pieces.values()) (p.type === "wall" || p.type === "floor") && Math.abs(p.pos[0] - x) < rad && Math.abs(p.pos[2] - z) < rad && out.push(...this.pieceBoxes(p));
      for (let c of this.near(x, z, rad)) {
        for (let q of c.props) !q.dead && q.type !== "bush" && Math.abs(q.pos[0] - x) < rad && Math.abs(q.pos[2] - z) < rad && out.push({ min: [q.pos[0] - q.r, q.pos[1] - 1, q.pos[2] - q.r], max: [q.pos[0] + q.r, q.pos[1] + q.h, q.pos[2] + q.r], ref: q });
        for (let s of c.statics) !s.dead && s.aabb && s.aabb.min[0] < x + rad && s.aabb.max[0] > x - rad && s.aabb.min[2] < z + rad && s.aabb.max[2] > z - rad && out.push(...s.boxes);
      }
      return out;
    }
    groundH(x, z, feetY) {
      let g = terrainH(x, z);
      for (let p of this.pieces.values()) {
        if (p.type !== "ramp" && p.type !== "pyramid") continue;
        let h = this.slopeH(p, x, z);
        h > g && feetY > h - 1.6 && feetY < h + 0.6 && (g = h);
      }
      return g;
    }
    // ---------------- raycast ----------------
    static rayBox(o, d, b, maxT) {
      let t0 = 0, t1 = maxT, ax = -1;
      for (let i = 0; i < 3; i++) {
        let inv = 1 / d[i], a = (b.min[i] - o[i]) * inv, c = (b.max[i] - o[i]) * inv;
        if (a > c && ([a, c] = [c, a]), a > t0 && (t0 = a, ax = i), t1 = Math.min(t1, c), t0 > t1) return null;
      }
      let n = [0, 0, 0];
      return ax >= 0 && (n[ax] = d[ax] > 0 ? -1 : 1), { t: t0, n };
    }
    raycast(o, d, maxT, extra = []) {
      let best = null, consider = (h) => {
        h && (!best || h.t < best.t) && (best = h);
      }, prev = o[1] - terrainH(o[0], o[2]);
      for (let t2 = 0; t2 < maxT; t2 += 1) {
        let p = add(o, scale(d, t2)), dh = p[1] - terrainH(p[0], p[2]);
        if (dh < 0) {
          let tt = t2 - 1 * (-dh / (prev - dh || 1));
          consider({ t: tt, p: add(o, scale(d, tt)), n: [0, 1, 0], kind: "terrain" });
          break;
        }
        if (prev = dh, p[1] > 80 && d[1] > 0) break;
      }
      let seen = /* @__PURE__ */ new Set(), tEnd = best ? best.t : maxT;
      for (let t2 = 0; t2 <= tEnd + _World.GC; t2 += _World.GC * 0.5) {
        let px = o[0] + d[0] * Math.min(t2, tEnd), pz = o[2] + d[2] * Math.min(t2, tEnd);
        for (let c of this.near(px, pz, _World.GC * 0.5))
          if (!seen.has(c)) {
            seen.add(c);
            for (let q of c.props) {
              if (q.dead || q.type === "bush") continue;
              let h = _World.rayBox(o, d, { min: [q.pos[0] - q.r, q.pos[1], q.pos[2] - q.r], max: [q.pos[0] + q.r, q.pos[1] + q.h, q.pos[2] + q.r] }, maxT);
              h && consider({ t: h.t, p: add(o, scale(d, h.t)), n: h.n, kind: "prop", ref: q });
            }
            for (let s of c.statics)
              if (!(s.dead || !s.aabb || !_World.rayBox(o, d, s.aabb, maxT)))
                for (let bx of s.boxes) {
                  let h = _World.rayBox(o, d, bx, maxT);
                  h && consider({ t: h.t, p: add(o, scale(d, h.t)), n: h.n, kind: "static", ref: s });
                }
          }
      }
      for (let p of this.pieces.values()) {
        let h = _World.rayBox(o, d, this.pieceBox(p), maxT);
        if (h) {
          if (p.type === "wall" || p.type === "floor") {
            for (let bx of this.pieceBoxes(p)) {
              let hh = _World.rayBox(o, d, bx, maxT);
              hh && consider({ t: hh.t, p: add(o, scale(d, hh.t)), n: hh.n, kind: "piece", ref: p });
            }
            continue;
          }
          for (let t2 = h.t; t2 < h.t + 8 && t2 < maxT; t2 += 0.15) {
            let pt = add(o, scale(d, t2)), sh = this.slopeH(p, pt[0], pt[2]);
            if (sh === -1 / 0) break;
            if (pt[1] <= sh && pt[1] >= p.pos[1] - 0.3) {
              consider({ t: t2, p: pt, n: [0, 1, 0], kind: "piece", ref: p });
              break;
            }
          }
        }
      }
      for (let b of extra) {
        let h = _World.rayBox(o, d, b, maxT);
        h && consider({ t: h.t, p: add(o, scale(d, h.t)), n: h.n, kind: "box", ref: b.ref });
      }
      return best;
    }
  };
  __publicField(_World, "GC", 32);
  var World = _World;

  // src/main.ts
  var canvas = document.getElementById("c"), R = new Renderer(canvas), M = buildModels(R), W = new World(R), MAT_STYLE = { wood: 2, stone: 3, metal: 4 }, editCache = /* @__PURE__ */ new Map(), editedMesh = (type, mat, mask) => {
    let k = `${type}_${mat}_${mask}`, m = editCache.get(k);
    return m || (m = editedPiece(R, type, mat, mask), editCache.set(k, m)), m;
  }, CHARS = SKINS.map((s) => buildCharacter(R, s)), LOBBY_CHAR = buildCharacter(R, SKINS[0], 1.35), $ = (id) => document.getElementById(id), H = { lobby: $("lobby"), hud: $("hud"), hp: $("hp"), sh: $("sh"), mats: $("mats"), bld: $("bld"), ammo: $("ammo"), wname: $("wname"), hotbar: $("hotbar"), info: $("info"), fx: $("fx"), cross: $("cross"), weak: $("weak"), hitm: $("hitm"), prog: $("prog"), flash: $("flash"), scope: $("scope"), pause: $("pause"), comp: $("comp"), fps: $("fps"), mm: $("mm"), stats: $("stats"), feed: $("feed"), banner: $("banner"), elim: $("elim"), bigmap: $("bigmap"), pl: $("pl"), end: $("end"), dbg: $("dbg"), tgt: $("tgt") }, mapCv = document.createElement("canvas");
  mapCv.width = mapCv.height = 600;
  W.drawMap(mapCv);
  H.bigmap.querySelector("canvas").getContext("2d").drawImage(mapCv, 0, 0);
  W.drawLabels(H.bigmap.querySelector("canvas"));
  {
    let svg = $("lobbybg"), s = "", pts = [];
    for (let i = 0; i < 60; i++) pts.push([rand(-10, 110), rand(-10, 70)]);
    for (let i = 0; i < 60; i++) {
      let a = pts[i], b = pts[(i * 7 + 3) % 60], c = pts[(i * 13 + 5) % 60], l = 35 + rand(0, 35);
      s += `<polygon points="${a[0]},${a[1]} ${b[0]},${b[1]} ${c[0]},${c[1]}" fill="hsl(${198 + rand(-6, 6)},${60 + rand(0, 20)}%,${l}%)" opacity="0.7"/>`;
    }
    svg.innerHTML = '<rect width="100" height="60" fill="#3b8fc4"/>' + s + '<ellipse cx="50" cy="52" rx="40" ry="10" fill="#e8f6ff" opacity="0.55"/>';
  }
  var AC = null;
  function beep(f, dur, type = "square", vol = 0.08, slide = 0) {
    if (!AC || (vol *= S.master * S.sfx, vol <= 5e-4)) return;
    let o = AC.createOscillator(), g = AC.createGain();
    o.type = type, o.frequency.value = f, slide && o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), AC.currentTime + dur), g.gain.value = vol, g.gain.exponentialRampToValueAtTime(1e-3, AC.currentTime + dur), o.connect(g).connect(AC.destination), o.start(), o.stop(AC.currentTime + dur);
  }
  var BOT_VOICES = ["smak-mouth.mp3", "ninjalaughing.mp3", "ninja-your-trash-kid.mp3", "ninja_zkaek6l.mp3", "ninja-why-you-getting-so-mad.mp3"];
  function botVoice(b) {
    if (b.voiceCd > 0 || len(sub(b.pos, P.pos)) > 55) return;
    b.voiceCd = rand(12, 25);
    let a = new Audio("Audio/" + BOT_VOICES[Math.floor(rand(0, BOT_VOICES.length))]);
    a.volume = clamp(1 - len(sub(b.pos, P.pos)) / 65, 0.08, 0.55) * S.master * S.voice, a.volume > 0.01 && a.play().catch(() => {
    });
  }
  var RARITIES = ["common", "uncommon", "rare", "epic", "legendary"], RAR_MULT = [0.85, 0.93, 1, 1.08, 1.16], WEAPONS = {
    ar: { name: "Assault Rifle", dmg: 33, rpm: 330, mag: 30, reload: 2.3, spread: 8e-3, pellets: 1, ammo: "medium", auto: !0, hs: 1.5, range: 300, rarity: "rare", bloom: 0.012, kick: 0.012 },
    burst: { name: "Burst Assault Rifle", dmg: 33, rpm: 900, mag: 30, reload: 2.6, spread: 6e-3, pellets: 1, ammo: "medium", auto: !0, hs: 1.5, range: 300, rarity: "uncommon", burst: 3, bloom: 6e-3, kick: 0.01 },
    smg: { name: "Submachine Gun", dmg: 18, rpm: 720, mag: 30, reload: 2, spread: 0.02, pellets: 1, ammo: "light", auto: !0, hs: 1.5, range: 150, rarity: "uncommon", bloom: 0.02, kick: 6e-3 },
    shotgun: { name: "Pump Shotgun", dmg: 11, rpm: 62, mag: 5, reload: 3.5, spread: 0.055, pellets: 10, ammo: "shells", auto: !1, hs: 1.5, range: 40, rarity: "rare", bloom: 0, kick: 0.035 },
    pistol: { name: "Pistol", dmg: 24, rpm: 400, mag: 16, reload: 1.5, spread: 0.012, pellets: 1, ammo: "light", auto: !1, hs: 2, range: 120, rarity: "common", bloom: 0.01, kick: 0.01 },
    tac: { name: "Tactical Shotgun", dmg: 7, rpm: 90, mag: 8, reload: 4.5, spread: 0.07, pellets: 10, ammo: "shells", auto: !1, hs: 1.5, range: 35, rarity: "uncommon", bloom: 0, kick: 0.03 },
    hunting: { name: "Hunting Rifle", dmg: 86, rpm: 40, mag: 1, reload: 1.9, spread: 2e-3, pellets: 1, ammo: "heavy", auto: !1, hs: 2.5, range: 500, rarity: "uncommon", bloom: 0, kick: 0.045 },
    scar: { name: "SCAR", dmg: 36, rpm: 330, mag: 30, reload: 2.1, spread: 6e-3, pellets: 1, ammo: "medium", auto: !0, hs: 1.5, range: 320, rarity: "legendary", bloom: 0.01, kick: 0.011 },
    rpg: { name: "Rocket Launcher", dmg: 110, rpm: 45, mag: 1, reload: 3.2, spread: 0, pellets: 1, ammo: "heavy", auto: !1, hs: 1, range: 200, rarity: "epic", bloom: 0, kick: 0.06 },
    sniper: { name: "Bolt-Action Sniper Rifle", dmg: 105, rpm: 34, mag: 1, reload: 2.8, spread: 0, pellets: 1, ammo: "heavy", auto: !1, hs: 2.5, range: 600, rarity: "epic", bloom: 0, kick: 0.05 }
  }, CONS = {
    shieldPot: { name: "Shield Potion", dur: 5, rarity: "rare", use: () => P.shield < 100 && (P.shield = Math.min(100, P.shield + 50), !0) },
    miniShield: { name: "Small Shield Potion", dur: 2, rarity: "uncommon", use: () => P.shield < 50 && (P.shield = Math.min(50, P.shield + 25), !0) },
    chug: { name: "Chug Jug", dur: 15, rarity: "legendary", use: () => (P.hp < 100 || P.shield < 100) && (P.hp = 100, P.shield = 100, !0) },
    grenade: { name: "Grenade", dur: 0, rarity: "uncommon", use: () => !1 },
    boogie: { name: "Boogie Bomb", dur: 0, rarity: "rare", use: () => !1 },
    impulse: { name: "Impulse Grenade", dur: 0, rarity: "rare", use: () => !1 },
    medkit: { name: "Med Kit", dur: 10, rarity: "uncommon", use: () => P.hp < 100 && (P.hp = 100, !0) },
    bandage: { name: "Bandages", dur: 4, rarity: "common", use: () => P.hp < 75 && (P.hp = Math.min(75, P.hp + 15), !0) },
    fish: { name: "Flopper", dur: 1, rarity: "epic", use: () => P.hp < 100 && (P.hp = Math.min(100, P.hp + 40), !0) },
    rod: { name: "Fishing Rod", dur: 2.5, rarity: "uncommon", use: () => !1 },
    ammo: { name: "Ammo Box", dur: 0, rarity: "common", use: () => !1 }
  }, isWeapon = (k) => k in WEAPONS, mkItem = (kind, count = 1, rar = -1) => ({ kind, mag: isWeapon(kind) ? WEAPONS[kind].mag : 0, count, rar: rar >= 0 ? rar : isWeapon(kind) ? Math.min(4, Math.floor(Math.pow(Math.random(), 1.6) * 5)) : RARITIES.indexOf(CONS[kind].rarity) }), ICON = {
    pickaxe: '<svg viewBox="0 0 64 64"><path d="M14 52 L44 22" stroke="#7a5a3a" stroke-width="6" stroke-linecap="round"/><path d="M30 12 Q46 8 56 26" stroke="#dfe6ee" stroke-width="8" fill="none" stroke-linecap="round"/></svg>',
    ar: '<svg viewBox="0 0 64 64"><path d="M6 34h40l8-6h6v6h-8l-4 6h-8v10h-6v-10h-8l-4 8h-6l3-8h-13z" fill="#e8ecef"/><rect x="26" y="26" width="10" height="4" fill="#e8ecef"/></svg>',
    burst: '<svg viewBox="0 0 64 64"><path d="M6 34h40l8-6h6v6h-8l-4 6h-8v10h-6v-10h-8l-4 8h-6l3-8h-13z" fill="#e8ecef"/><rect x="22" y="24" width="18" height="4" fill="#e8ecef"/></svg>',
    smg: '<svg viewBox="0 0 64 64"><path d="M10 32h34l6-4h6v6h-6l-4 4h-10v12h-6v-12h-6l-2 6h-6l2-6h-8z" fill="#e8ecef"/></svg>',
    shotgun: '<svg viewBox="0 0 64 64"><path d="M4 36l14-6h38v4h-30v4h-8l-6 8h-8z" fill="#e8ecef"/><rect x="22" y="30" width="26" height="3" fill="#c9a56b"/></svg>',
    sniper: '<svg viewBox="0 0 64 64"><path d="M4 36l12-6h46v4h-34v4h-8l-6 8h-8z" fill="#e8ecef"/><rect x="26" y="22" width="16" height="5" fill="#e8ecef"/><rect x="24" y="24" width="3" height="4" fill="#e8ecef"/></svg>',
    pistol: '<svg viewBox="0 0 64 64"><path d="M12 28h40v8h-22l-4 14h-8l3-14h-9z" fill="#e8ecef"/></svg>',
    tac: '<svg viewBox="0 0 64 64"><path d="M4 36l14-6h38v5h-28v4h-10l-6 8h-8z" fill="#e8ecef"/><rect x="24" y="31" width="22" height="3" fill="#ff8a1e"/></svg>',
    hunting: '<svg viewBox="0 0 64 64"><path d="M4 36l12-6h46v4h-36v4h-6l-6 8h-8z" fill="#e8ecef"/><rect x="40" y="26" width="3" height="5" fill="#e8ecef"/></svg>',
    rpg: '<svg viewBox="0 0 64 64"><rect x="4" y="28" width="52" height="10" rx="3" fill="#8a9a6a"/><path d="M56 26l6 7-6 7z" fill="#d83030"/><rect x="22" y="38" width="8" height="10" fill="#444"/></svg>',
    scar: '<svg viewBox="0 0 64 64"><path d="M6 34h40l8-6h6v6h-8l-4 6h-8v10h-6v-10h-8l-4 8h-6l3-8h-13z" fill="#ffd23a"/><rect x="24" y="24" width="14" height="5" fill="#ffd23a"/></svg>',
    miniShield: '<svg viewBox="0 0 64 64"><rect x="27" y="18" width="10" height="6" fill="#fff"/><path d="M24 26h16v20a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z" fill="#3aa2ff"/></svg>',
    grenade: '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="38" rx="14" ry="16" fill="#4a6a3a"/><rect x="26" y="14" width="12" height="10" fill="#888"/><rect x="36" y="12" width="12" height="5" fill="#ccc"/></svg>',
    boogie: '<svg viewBox="0 0 64 64"><circle cx="32" cy="36" r="16" fill="#c9c9d8"/><circle cx="26" cy="30" r="3" fill="#ff3ec9"/><circle cx="38" cy="40" r="3" fill="#3ddcf5"/><circle cx="36" cy="28" r="2" fill="#ffe22e"/><rect x="28" y="14" width="8" height="8" fill="#888"/></svg>',
    impulse: '<svg viewBox="0 0 64 64"><circle cx="32" cy="36" r="15" fill="#2c88f5"/><circle cx="32" cy="36" r="8" fill="#8cd5ff"/><rect x="28" y="14" width="8" height="8" fill="#888"/></svg>',
    chug: '<svg viewBox="0 0 64 64"><path d="M18 20h28v30a6 6 0 0 1-6 6h-16a6 6 0 0 1-6-6z" fill="#3aa2ff"/><rect x="26" y="10" width="12" height="10" fill="#2c6fb0"/><rect x="24" y="30" width="16" height="10" fill="#fff"/></svg>',
    bandage: '<svg viewBox="0 0 64 64"><rect x="8" y="26" width="48" height="12" rx="4" fill="#f4f4f4"/><rect x="26" y="26" width="12" height="12" fill="#e33"/><rect x="8" y="34" width="48" height="4" fill="#ddd"/></svg>',
    medkit: '<svg viewBox="0 0 64 64"><rect x="10" y="18" width="44" height="32" rx="4" fill="#f4f4f4"/><rect x="28" y="24" width="8" height="20" fill="#e33"/><rect x="22" y="30" width="20" height="8" fill="#e33"/></svg>',
    rod: '<svg viewBox="0 0 64 64"><path d="M10 56 L50 10" stroke="#c9a56b" stroke-width="4" stroke-linecap="round"/><path d="M50 10 q4 20 -8 30" stroke="#fff" stroke-width="1.5" fill="none"/><circle cx="22" cy="42" r="5" fill="#555"/></svg>',
    ammo: '<svg viewBox="0 0 64 64"><rect x="12" y="22" width="40" height="26" fill="#4a8f3a"/><rect x="12" y="18" width="40" height="6" fill="#2f5f25"/></svg>',
    shieldPot: '<svg viewBox="0 0 64 64"><rect x="26" y="10" width="12" height="8" fill="#fff"/><path d="M22 20h20v28a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8z" fill="#3aa2ff"/></svg>',
    fish: '<svg viewBox="0 0 64 64"><path d="M10 32q16-16 34-6l10-10v32l-10-10q-18 10-34-6z" fill="#3f8fe8"/><circle cx="22" cy="30" r="2.5" fill="#fff"/><path d="M26 40q8 4 16-2" stroke="#1f5fb0" stroke-width="2" fill="none"/></svg>'
  }, P = {
    state: "lobby",
    pos: [0, 6.5, 0],
    vel: [0, 0, 0],
    yaw: Math.PI,
    pitch: -0.1,
    skin: 0,
    hp: 100,
    shield: 0,
    grounded: !1,
    crouch: !1,
    sprint: !1,
    mats: { wood: 0, stone: 0, metal: 30 },
    mat: "wood",
    ammo: { light: 0, medium: 0, heavy: 0, shells: 0 },
    inv: [null, null, null, null, null],
    slot: -1,
    build: !1,
    piece: "wall",
    fireCd: 0,
    reload: 0,
    swing: 0,
    useT: 0,
    useDur: 0,
    scoped: !1,
    ads: !1,
    thirdPerson: !0,
    anim: 0,
    hurtCd: 0,
    kills: 0,
    alive: 100,
    matchT: 0,
    thanked: !1,
    dmg: 0,
    dead: !1,
    over: !1,
    bloom: 0,
    burstLeft: 0,
    equipT: 0,
    swim: !1,
    emote: 0,
    emoteT: 0,
    stunT: 0,
    editing: null,
    editMask: 0,
    rampRot: 0,
    fishing: 0,
    nextDrop: 90,
    weakPos: null,
    weakRef: null,
    weakT: 0
  }, SDEF = { sensX: 1, sensY: 1, adsSens: 0.7, scopeSens: 0.5, invertY: !1, toggleSprint: !1, turbo: !0, padSens: 1, rumble: !0, master: 0.8, sfx: 0.8, voice: 0.7, music: 0.5, fov: 80, scale: 1, shadows: 2, grass: 1, viewDist: 1, showFps: !0, streamer: !1 }, lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4, S = { ...SDEF, ...lowEnd ? { shadows: 1, grass: 1, scale: 0.8, viewDist: 0 } : {}, ...JSON.parse(localStorage.getItem("fn-settings") || "{}") }, GALLERY = new URLSearchParams(location.search).get("gallery");
  GALLERY && (document.getElementById("lobby").style.display = "none", document.getElementById("lobbybg").style.display = "none");
  var D = { aimbot: !1, esp: !1, invuln: !1, infMats: !1, infAmmo: !1, fly: !1, lowGrav: !1, pauseBots: !1 }, vbucks = +(localStorage.getItem("fn-vbucks") || 2765), gameMode = 0, GAME_MODES = ["SOLO", "DUOS", "SQUADS"];
  function updateWallet() {
    let e = document.getElementById("wallet");
    e && (e.textContent = "\u24CB " + vbucks.toLocaleString()), localStorage.setItem("fn-vbucks", String(vbucks));
  }
  updateWallet();
  var height = () => P.crouch ? 1.2 : 1.75, eyeH = () => height() - 0.15, fwd = () => [Math.sin(P.yaw), 0, Math.cos(P.yaw)], right = () => [-Math.cos(P.yaw), 0, Math.sin(P.yaw)], look = () => [Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), Math.cos(P.yaw) * Math.cos(P.pitch)], curItem = () => P.slot < 0 ? null : P.inv[P.slot], items = [], bots = [], fx = [], feed = [], chests = [], nades = [], drops = [], meteors = [], event = null, eventT = 0, bus = { a: [0, 0, 0], b: [0, 0, 0], t: 0, dur: 55, pos: [0, 0, 0], yaw: 0 }, storm = { c: [0, 0], r: 520, phaseT: 120, phase: 0, shrinking: !1, from: { c: [0, 0], r: 380 }, to: { c: [0, 0], r: 380 }, shrinkT: 0 }, PHASES = [[100, 50, 230], [70, 45, 140], [60, 40, 80], [50, 35, 40], [40, 30, 15], [30, 30, 3]];
  function nextStormPhase() {
    for (let b of bots) b.dead || (b.skill = Math.min(1, b.skill + 0.06), b.accuracy = Math.min(0.75, b.accuracy + 0.03), b.reaction = Math.max(0.12, b.reaction - 0.05));
    let ph = PHASES[Math.min(storm.phase, PHASES.length - 1)];
    storm.from = { c: [storm.c[0], storm.c[1]], r: storm.r };
    let a = rand(0, 6.28), d = rand(0, Math.max(0, storm.r - ph[2]) * 0.6);
    storm.to = { c: [storm.c[0] + Math.cos(a) * d, storm.c[1] + Math.sin(a) * d], r: ph[2] }, storm.shrinking = !0, storm.shrinkT = ph[1], storm.phaseT = ph[1], storm.phase++, banner("STORM EYE SHRINKING", "", 4);
  }
  var bannerT = 0;
  function banner(h, p, t2) {
    H.banner.querySelector("h1").textContent = h, H.banner.querySelector("p").textContent = p, H.banner.querySelector("p").style.display = p ? "block" : "none", H.banner.style.display = "block", bannerT = t2;
  }
  var NAMES1 = ["Misty", "Coastal", "Storm", "Quiet", "Frenzy", "Slurp", "Salty", "Lazy", "Sweaty", "Dusty"], NAMES2 = ["Runner", "Scout", "Ranger", "Nomad", "Camper", "Hunter", "Rider", "Drifter"], botName = () => NAMES1[Math.floor(rand(0, 10))] + NAMES2[Math.floor(rand(0, 8))] + Math.floor(rand(10, 99));
  function addFeed(html) {
    feed.push({ html, t: 12 }), feed.length > 5 && feed.shift();
  }
  var dropItem = (item, pos, spread = 0) => items.push({ item, pos: [pos[0] + rand(-spread, spread), pos[1], pos[2] + rand(-spread, spread)] });
  function startMatch() {
    P.state = "bus", P.hp = 100, P.shield = 0, P.kills = 0, P.alive = 100, P.matchT = 0, P.thanked = !1, P.slot = -1, P.inv.fill(null), P.build = !1, P.mats = { wood: 0, stone: 0, metal: 30 }, P.ammo = { light: 0, medium: 0, heavy: 0, shells: 0 }, items.length = 0, bots.length = 0, chests.length = 0, feed.length = 0, W.pieces.clear();
    let a = rand(0, 6.28);
    bus.a = [Math.cos(a) * 420, 130, Math.sin(a) * 420], bus.b = [-Math.cos(a) * 420 + rand(-80, 80), 130, -Math.sin(a) * 420 + rand(-80, 80)], bus.t = 0, bus.yaw = Math.atan2(bus.b[0] - bus.a[0], bus.b[2] - bus.a[2]), P.yaw = bus.yaw, P.pitch = -0.22, storm.c = [rand(-80, 80), rand(-80, 80)], storm.r = 520, storm.phaseT = 120;
    let pool = ["ar", "burst", "smg", "shotgun", "sniper", "pistol", "pistol", "tac", "hunting", "scar", "rpg", "bandage", "shieldPot", "miniShield", "miniShield", "chug", "medkit", "grenade", "boogie", "impulse", "ammo", "ammo"];
    for (let l of W.lootSpots) Math.random() < 0.75 && dropItem(mkItem(pool[Math.floor(rand(0, pool.length))], 1), l);
    for (let c of W.chestSpots) Math.random() < 0.7 && chests.push({ pos: [...c], yaw: rand(0, 6.28), open: !1 });
    for (let p of POIS) for (let i = 0; i < 3; i++) {
      let x = p.x + rand(-p.r, p.r) * 0.7, z = p.z + rand(-p.r, p.r) * 0.7, y = terrainH(x, z);
      y > 1 && dropItem(mkItem(pool[Math.floor(rand(0, 14))], 1), [x, y, z]);
    }
    for (let i = 0; i < 32; i++) {
      let b = spawnBot(), ab = sub(bus.b, bus.a), k = clamp(((b.land[0] - bus.a[0]) * ab[0] + (b.land[2] - bus.a[2]) * ab[2]) / (ab[0] * ab[0] + ab[2] * ab[2]), 0.08, 0.95);
      b.dropT = k * bus.dur + rand(-3, 3) - (1 - b.skill) * 4;
    }
    P.nextDrop = 90, drops.length = 0;
    for (let p of POIS) for (let i = 0; i < 3; i++) {
      let x = p.x + rand(-p.r, p.r) * 0.6, z = p.z + rand(-p.r, p.r) * 0.6, y = terrainH(x, z);
      y > 1 && items.push({ item: mkItem("ammo"), pos: [x, y, z] });
    }
    P.dead = !1, P.over = !1, P.dmg = 0, storm.phase = 0, storm.shrinking = !1, H.end.style.display = "none", H.lobby.style.display = "none", H.hud.style.display = "block";
    try {
      canvas.requestPointerLock();
    } catch {
    }
    addFeed('<span class="me">Player</span> has entered the Battle Bus');
  }
  var PROFILES = [
    { name: "cautious beginner", skill: [0.15, 0.35], aggro: [0.1, 0.35], loot: 0.6 },
    { name: "aggressive beginner", skill: [0.2, 0.4], aggro: [0.7, 0.95], loot: 0.3 },
    { name: "average", skill: [0.4, 0.6], aggro: [0.4, 0.65], loot: 0.5 },
    { name: "loot goblin", skill: [0.35, 0.6], aggro: [0.2, 0.45], loot: 0.95 },
    { name: "aggressive skilled", skill: [0.7, 0.95], aggro: [0.8, 1], loot: 0.4 },
    { name: "tactical skilled", skill: [0.7, 0.95], aggro: [0.45, 0.7], loot: 0.6 }
  ];
  function spawnBot(at, profileIdx = -1) {
    let p = POIS[Math.floor(rand(0, POIS.length))], land = [p.x + rand(-p.r, p.r) * 0.8, 0, p.z + rand(-p.r, p.r) * 0.8], pr = PROFILES[profileIdx >= 0 ? profileIdx : Math.floor(rand(0, PROFILES.length))], skill = rand(pr.skill[0], pr.skill[1]), aggression = rand(pr.aggro[0], pr.aggro[1]), pos = at ? [...at] : [0, 0, 0], b = { name: botName(), pos, vel: [0, 0, 0], yaw: rand(0, 6.28), pitch: 0, hp: 100, shield: at ? 50 : 0, skin: Math.floor(rand(0, SKINS.length)), state: at ? "ground" : "bus", dead: !1, anim: 0, weapon: at ? "ar" : null, weapons: at ? ["ar"] : [], heals: at ? 2 : 0, mats: at ? 500 : 60, target: null, retarget: 0, fireCd: 1, buildCd: 0, lastHit: -9, grounded: !1, dropT: rand(6, 50), land, enemy: null, strafe: 1, mode: "loot", profile: pr.name, skill, aggression, accuracy: 0.22 + skill * 0.45, reaction: lerp(0.85, 0.15, skill), seenAt: 0, lastSeen: -9, memory: null, memoryT: 0, crank: null, healT: 0, stuckT: 0, lastPos: [...pos], voiceCd: rand(0, 5), interactT: 0, interactRef: null, aimDrift: [rand(-1, 1), rand(-0.5, 0.5), rand(-1, 1)], peekT: 0, peekWall: null, wanderT: 0, boxAt: null, lootT: 0, emoteT: 0, emote: 0, probeT: 0, probeDir: null, nades: at ? 3 : 0, stunT: 0 };
    return bots.push(b), b;
  }
  function toLobby() {
    P.state = "lobby", H.end.style.display = "none", P.over = !1, H.lobby.style.display = "block", H.hud.style.display = "none", document.exitPointerLock();
  }
  var keys = /* @__PURE__ */ new Set(), mouse = { l: !1, r: !1, dx: 0, dy: 0 }, pressed = /* @__PURE__ */ new Set(), gpIndex = null, gpPrev = /* @__PURE__ */ new Set();
  function rumble(duration, weak = 0.5, strong = 0.5) {
    if (!(!navigator.getGamepads || !S.rumble))
      try {
        let gamepads = navigator.getGamepads();
        for (let gp of gamepads)
          !gp || !gp.connected || (gp.vibrationActuator && typeof gp.vibrationActuator.playEffect == "function" ? gp.vibrationActuator.playEffect("dual-rumble", {
            startDelay: 0,
            duration,
            weakMagnitude: weak,
            strongMagnitude: strong
          }).catch(() => {
          }) : gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse(strong, duration).catch(() => {
          }));
      } catch {
      }
  }
  addEventListener("gamepadconnected", (e) => {
    gpIndex = e.gamepad.index, info("\u{1F3AE} CONTROLLER CONNECTED"), rumble(160, 0.4, 0.6);
  });
  addEventListener("gamepaddisconnected", (e) => {
    gpIndex === e.gamepad.index && (gpIndex = null, info("\u{1F3AE} CONTROLLER DISCONNECTED"));
  });
  addEventListener("keydown", (e) => {
    keys.has(e.code) || pressed.add(e.code), keys.add(e.code), (e.code === "Tab" || e.code.startsWith("F") || e.code.startsWith("Alt")) && e.preventDefault();
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());
  canvas.addEventListener("mousedown", (e) => {
    if (P.state !== "lobby") {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
        return;
      }
      e.button === 0 && (mouse.l = !0, pressed.add("ML")), e.button === 2 && (mouse.r = !0, pressed.add("MR"));
    }
  });
  addEventListener("mouseup", (e) => {
    e.button === 0 && (mouse.l = !1), e.button === 2 && (mouse.r = !1);
  });
  addEventListener("contextmenu", (e) => e.preventDefault());
  addEventListener("mousemove", (e) => {
    document.pointerLockElement === canvas && (mouse.dx += e.movementX, mouse.dy += e.movementY);
  });
  addEventListener("wheel", (e) => {
    if (P.build || P.state !== "play") return;
    let n = P.inv.length, s = P.slot;
    for (let i = 0; i < n + 1 && (s = (s + 1 + (e.deltaY > 0 ? 1 : -1) + (n + 1) * 2) % (n + 1) - 1, !(s < 0 || P.inv[s])); i++)
      ;
    P.slot = s;
  });
  $("btnPlay").onclick = () => {
    AC ?? (AC = new AudioContext()), startMatch();
  };
  $("btnSkin").onclick = () => {
    gameMode = (gameMode + 1) % GAME_MODES.length;
    let e = document.querySelector("#rpanel .solo");
    e && (e.textContent = GAME_MODES[gameMode]);
  };
  var menuPage = $("menuPage"), menuTitle = menuPage.querySelector("h1"), menuCards = menuPage.querySelector(".cards"), PAGE_DATA = {
    "BATTLE PASS": ["LEVEL 29|Complete matches to earn season rewards.", "MEDAL PUNCHCARD|Two medals ready to upgrade.", "BONUS REWARD|Reach level 35 to unlock Arctic Ace."],
    CHALLENGES: ["NEW WORLD|Discover every named location.", "SHARPSHOOTER|Deal 1,000 rifle damage.", "MASTER BUILDER|Place 250 structures."],
    COMPETE: ["SOLO OPEN|Practice against the advanced bot roster.", "FORTRESS CUP|Use F8 to launch Fortress Siege.", "STORM TRIAL|Survive five storm phases."],
    LOCKER: SKINS.map((s, i) => `${s.name}|${i === P.skin ? "EQUIPPED" : "Click CHANGE on the Play screen to equip."}`),
    "ITEM SHOP": ["FEATURED|Wildcat and Neon Striker are now available.", "DAILY|Arctic Ace rotates into the locker today.", "OWNED|All items are available in this local build."],
    CAREER: ["PROFILE|Level 29 \xB7 Solo player", "COLLECTION|10 locations discovered", "REPLAYS|Local matches are not uploaded."],
    STORE: ["V-BUCKS|2,765 available locally.", "BATTLE PASS|Season 1 pass active."]
  };
  document.querySelectorAll("#lnav .tab").forEach((el) => el.onclick = () => {
    if (document.querySelectorAll("#lnav .tab").forEach((x) => x.classList.remove("on")), el.classList.add("on"), el.textContent === "PLAY") {
      menuPage.style.display = "none";
      return;
    }
    let rows = PAGE_DATA[el.textContent || ""] || [];
    menuTitle.textContent = el.textContent || "", menuCards.innerHTML = rows.map((x, i) => {
      let [a, b] = x.split("|");
      return `<div class="tile" ${el.textContent === "LOCKER" ? `data-skin="${i}" style="cursor:pointer"` : ""}><b>${a}</b>${b}</div>`;
    }).join(""), el.textContent === "LOCKER" && menuCards.querySelectorAll("[data-skin]").forEach((card) => card.onclick = () => {
      P.skin = +card.dataset.skin, menuCards.querySelectorAll(".tile").forEach((x, i) => {
        let n = x.querySelector("b");
        x.innerHTML = `<b>${n?.textContent || SKINS[i].name}</b>${i === P.skin ? "EQUIPPED" : "Click to equip."}`;
      });
    }), menuPage.style.display = "block";
  });
  $("menuClose").onclick = () => {
    menuPage.style.display = "none", document.querySelectorAll("#lnav .tab").forEach((x) => x.classList.toggle("on", x.textContent === "PLAY"));
  };
  H.pause.onclick = () => canvas.requestPointerLock();
  document.addEventListener("pointerlockchange", () => {
    H.pause.style.display = document.pointerLockElement === canvas || P.state === "lobby" || SET.style.display === "block" || EW.style.display === "flex" || dbgOpen() || P.over ? "none" : "flex";
  });
  function botBoxes() {
    let b = [];
    for (let d of bots) if (!d.dead) {
      let [x, y, z] = d.pos;
      b.push({ min: [x - 0.35, y, z - 0.25], max: [x + 0.35, y + 1.55, z + 0.25], ref: { d, head: !1 } }, { min: [x - 0.25, y + 1.55, z - 0.25], max: [x + 0.25, y + 2.05, z + 0.25], ref: { d, head: !0 } });
    }
    return b;
  }
  function damage(n, by = "the storm") {
    if (D.invuln || P.dead || P.over) return;
    rumble(Math.min(400, n * 8 + 120), 0.7, 0.95);
    let s = Math.min(P.shield, n);
    P.shield -= s, P.hp -= n - s, H.flash.style.opacity = "0.3", setTimeout(() => H.flash.style.opacity = "0", 80), beep(120, 0.2, "sawtooth", 0.1, -60), P.hp <= 0 && (P.hp = 0, P.dead = !0, addFeed(`${by} eliminated <span class="me">Player</span>`), banner("YOU WERE ELIMINATED", "BY " + by.toUpperCase(), 4), setTimeout(() => endScreen(!1, by), 4e3));
  }
  function endScreen(win, by = "") {
    P.over = !0, document.exitPointerLock(), win ? (vbucks += 250, updateWallet(), rumble(500, 1, 1)) : rumble(300, 0.6, 0.8);
    let xp = P.kills * 300 + Math.round(P.dmg * 2) + Math.round(P.matchT * 5);
    if (H.end.className = win ? "win" : "lose", H.end.querySelector(".title").innerHTML = win ? '<span class="n1">#1</span><span>VICTORY<br>ROYALE</span>' : `<span class="n1">#${P.alive}</span><span>ELIMINATED<br><small>by ${by}</small></span>`, H.end.querySelector(".st").innerHTML = `<div><b>${P.kills}</b>ELIMINATIONS</div><div><b>${Math.round(P.dmg)}</b>DAMAGE</div><div><b>${xp}</b>MATCH XP</div>`, H.end.style.display = "flex", win) {
      let c = H.end.querySelector(".confetti");
      c.innerHTML = "";
      for (let i = 0; i < 80; i++) c.innerHTML += `<i style="left:${rand(0, 100)}%;animation-delay:${rand(0, 4)}s;background:${["#ff5ab3", "#5ee0ff", "#ffe22e", "#9dff5a"][i % 4]};transform:rotate(${rand(0, 90)}deg)"></i>`;
    }
  }
  var infoT = 0;
  function info(t2) {
    H.info.textContent = t2, H.info.style.display = "block", infoT = 2;
  }
  function giveMat(m, n) {
    P.mats[m] = Math.min(999, P.mats[m] + n);
  }
  var camPos = [0, 0, 0], camFwd = [0, 0, 1], fov = 1.15, VP = perspective(1, 1, 0.1, 10);
  function project(p) {
    let c = transformPoint(VP, p);
    return VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15] < 0.1 || Math.abs(c[0]) > 1.2 || Math.abs(c[1]) > 1.2 ? null : [(c[0] * 0.5 + 0.5) * innerWidth, (0.5 - c[1] * 0.5) * innerHeight];
  }
  function buildTarget() {
    let dir = (Math.round(P.yaw / (Math.PI / 2)) % 4 + 4) % 4, a = dir * Math.PI / 2, f = [Math.sin(a), 0, Math.cos(a)], level = Math.floor((P.pos[1] + 1) / 4) * 4;
    P.pitch > 0.45 && (level += 4);
    let t2 = add(P.pos, scale(f, P.piece === "wall" ? 2.6 : 3.2));
    P.pitch < -0.7 && P.piece !== "wall" && (t2 = P.pos);
    let cx = Math.floor(t2[0] / 4) * 4 + 2, cz = Math.floor(t2[2] / 4) * 4 + 2;
    return P.piece === "wall" ? { type: "wall", pos: [cx + f[0] * 2, level, cz + f[2] * 2], dir } : { type: P.piece, pos: [cx, level, cz], dir: P.piece === "ramp" ? (dir + P.rampRot) % 4 : dir };
  }
  function botDamage(dm, n, by, how = "with a weapon") {
    if (dm.dead) return;
    let sh = Math.min(dm.shield, n);
    dm.shield -= sh, dm.hp -= n - sh, dm.lastHit = t;
    let att = by === "Player" ? P.pos : bots.find((x) => x.name === by)?.pos;
    if (att && (dm.memory = [...att], dm.memoryT = t, Math.random() < 0.4 + dm.skill * 0.6 && (dm.yaw = Math.atan2(att[0] - dm.pos[0], att[2] - dm.pos[2]), dm.retarget = 0), !dm.enemy && dm.weapon && dm.mode !== "heal" && (dm.mode = "hunt")), dm.hp > 0) {
      Math.random() < 0.22 && botVoice(dm);
      return;
    }
    if (dm.dead = !0, P.alive--, Math.random() < 0.35) {
      let killer = bots.find((x) => x.name === by);
      killer && !killer.dead && (killer.emoteT = 3, killer.emote = Math.floor(rand(0, 4)));
    }
    by === "Player" ? (P.kills++, H.elim.querySelector("b").textContent = dm.name, H.elim.style.display = "block", setTimeout(() => H.elim.style.display = "none", 2500), addFeed(`Player eliminated <span class="v">${dm.name}</span> ${how}`), beep(600, 0.3, "square", 0.08, 300)) : addFeed(`${by} eliminated <span class="v">${dm.name}</span>`);
    for (let w of dm.weapons) dropItem(mkItem(w), add(dm.pos, [0, 0.2, 0]), 1.2);
    dropItem(mkItem("bandage", 3), add(dm.pos, [0, 0.2, 0]), 1), dm.heals > 1 && dropItem(mkItem("shieldPot", 1), add(dm.pos, [0, 0.2, 0]), 1.3), P.alive <= 1 && !P.dead && !P.over && P.state === "play" && setTimeout(() => endScreen(!0), 800);
  }
  function shoot(item) {
    let w = WEAPONS[item.kind];
    if (item.kind === "rpg") {
      item.mag--, P.fireCd = 60 / w.rpm, P.pitch += w.kick, beep(80, 0.3, "sawtooth", 0.15, -40), rumble(250, 0.9, 1), nades.push({ pos: add(camPos, scale(camFwd, 1.2)), vel: scale(camFwd, 34), t: 6, by: "Player", rocket: !0 }), botHear(P.pos, 90, "player");
      return;
    }
    botHear(P.pos, 70, "player"), D.infAmmo || item.mag--, P.fireCd = 60 / w.rpm, beep(item.kind === "sniper" ? 90 : item.kind === "shotgun" ? 110 : 220, 0.12, "sawtooth", 0.12, -80);
    let rDur = item.kind === "shotgun" ? 180 : item.kind === "sniper" ? 220 : item.kind === "smg" ? 75 : 100, rWeak = item.kind === "shotgun" ? 0.7 : item.kind === "sniper" ? 0.5 : item.kind === "smg" ? 0.3 : 0.5, rStrong = item.kind === "shotgun" ? 0.9 : item.kind === "sniper" ? 1 : item.kind === "smg" ? 0.3 : 0.5;
    rumble(rDur, rWeak, rStrong), P.pitch += w.kick * (P.ads ? 0.6 : 1), P.yaw += rand(-w.kick, w.kick) * 0.4, w.burst && (P.burstLeft <= 0 && (P.burstLeft = w.burst), P.burstLeft--, P.burstLeft <= 0 && (P.fireCd = 0.5));
    let boxes = botBoxes(), hitAny = !1, headAny = !1;
    for (let i = 0; i < w.pellets; i++) {
      let sp = (w.spread + P.bloom) * (P.scoped ? 0 : P.ads ? 0.5 : 1) * (P.grounded ? 1 : 1.8) * (P.crouch ? 0.7 : 1) * (Math.hypot(P.vel[0], P.vel[2]) > 3 ? 1.5 : 1), aim = camFwd;
      if (D.aimbot) {
        let best = 1e9, bp = null;
        for (let b of bots) if (!b.dead && b.state === "ground") {
          let hp = add(b.pos, [0, 1.75, 0]), dd = len(sub(hp, camPos));
          dd < best && dd < w.range && (best = dd, bp = hp);
        }
        bp && (aim = norm(sub(bp, camPos)));
      }
      let d = norm(add(aim, [rand(-sp, sp), rand(-sp, sp), rand(-sp, sp)])), h = W.raycast(camPos, d, w.range, boxes), end = h ? h.p : add(camPos, scale(d, w.range));
      if (fx.push({ kind: "tracer", t: 0.08, pos: add(add(P.pos, [0, eyeH() - 0.3, 0]), scale(right(), 0.35)), to: end }), !!h) {
        if (h.kind === "box") {
          let { d: dm, head } = h.ref, fall = h.t > w.range * 0.5 ? lerp(1, 0.6, (h.t - w.range * 0.5) / (w.range * 0.5)) : 1, dmg = Math.round(w.dmg * RAR_MULT[item.rar] * fall * (head ? w.hs : 1));
          botDamage(dm, dmg, "Player"), P.dmg += dmg, dm.lastHit = t, dm.enemy = "player", hitAny = !0, headAny || (headAny = head), fx.push({ kind: "dmg", t: 0.9, pos: add(h.p, [rand(-0.3, 0.3), 0.3, 0]), text: String(dmg), head });
        } else if (h.kind === "piece")
          W.damagePiece(h.ref, w.dmg), fx.push({ kind: "dmg", t: 0.6, pos: h.p, text: String(w.dmg) });
        else if (h.kind === "prop") {
          let q = h.ref;
          q.hp -= w.dmg, q.hp <= 0 && (q.dead = 30);
        }
      }
    }
    P.bloom = Math.min(P.bloom + w.bloom, w.bloom * 4), hitAny && (H.hitm.style.opacity = "1", H.hitm.className = headAny ? "head" : "", setTimeout(() => H.hitm.style.opacity = "0", 60), beep(headAny ? 1400 : 1e3, 0.06, "sine", 0.1));
  }
  function swingPickaxe() {
    P.swing = 0.5, beep(300, 0.08, "triangle", 0.05);
    let h = W.raycast(add(P.pos, [0, eyeH(), 0]), camFwd, 4, botBoxes());
    if (!h) return;
    let weak = !!(P.weakRef === h.ref && P.weakPos && len(sub(h.p, P.weakPos)) < 0.9), mark = () => {
      P.weakRef = h.ref, P.weakPos = add(h.p, [rand(-0.45, 0.45), rand(-0.45, 0.45), rand(-0.08, 0.08)]), P.weakT = 4;
    };
    if (weak ? rumble(120, 0.8, 0.85) : rumble(75, 0.45, 0.45), h.kind === "prop") {
      let q = h.ref, dmg = weak ? 100 : 50;
      q.hp -= dmg;
      let m = q.type === "rock" ? "stone" : "wood", n = q.type === "bush" ? 3 : weak ? 24 : 10;
      giveMat(m, n), fx.push({ kind: "dmg", t: 0.7, pos: h.p, text: weak ? "CRITICAL +" + n : "+" + n, head: weak }), beep(weak ? 950 : 500, 0.1, "square", 0.06), q.hp <= 0 ? (q.dead = 30, P.weakT = 0) : mark();
    } else if (h.kind === "static") {
      let s = h.ref, dmg = weak ? 100 : 45, mat = s.mesh === "car" || s.mesh === "truck" || s.mesh === "lamp" ? "metal" : s.mesh.startsWith("house") ? "wood" : "stone", n = weak ? 18 : 7;
      s.hp = (s.hp ?? 300) - dmg, s.shake = 0.28, giveMat(mat, n), fx.push({ kind: "dmg", t: 0.7, pos: h.p, text: weak ? "CRITICAL +" + n : "+" + n, head: weak }), beep(weak ? 900 : 430, 0.1, "square", 0.06), s.hp <= 0 ? (s.dead = !0, s.boxes.length = 0, P.weakT = 0) : mark();
    } else if (h.kind === "piece") {
      let p = h.ref;
      W.damagePiece(p, 50), giveMat(p.mat, 5), fx.push({ kind: "dmg", t: 0.7, pos: h.p, text: "50" }), beep(400, 0.1, "square", 0.06);
    } else if (h.kind === "box") {
      let dm = h.ref.d;
      botDamage(dm, 20, "Player", "with a pickaxe"), P.dmg += 20, fx.push({ kind: "dmg", t: 0.7, pos: h.p, text: "20" });
    }
  }
  function moveEntity(e, h, dt) {
    let travel = Math.max(Math.abs(e.vel[0]), Math.abs(e.vel[1]), Math.abs(e.vel[2])) * dt, steps = Math.max(1, Math.ceil(travel / 0.16)), sdt = dt / steps, landedNow = !1;
    for (let step = 0; step < steps; step++) {
      let boxes = W.solids(e.pos[0], e.pos[2]), overlaps = (p) => boxes.filter((b) => p[0] + 0.35 > b.min[0] && p[0] - 0.35 < b.max[0] && p[1] < b.max[1] && p[1] + h > b.min[1] && p[2] + 0.35 > b.min[2] && p[2] - 0.35 < b.max[2]);
      for (let ax of [0, 2, 1]) {
        let d = e.vel[ax] * sdt;
        if (!d) continue;
        e.pos[ax] += d;
        let ov = overlaps(e.pos);
        if (ov.length && ax !== 1) {
          let up = [e.pos[0], e.pos[1] + 0.7, e.pos[2]];
          overlaps(up).length || (e.pos[1] += 0.7, ov = []);
        }
        for (let b of ov)
          d > 0 ? e.pos[ax] = b.min[ax] - (ax === 1 ? h : 0.35) - 1e-3 : e.pos[ax] = b.max[ax] + (ax === 1 ? 0 : 0.35) + 1e-3, ax === 1 ? (d < 0 && (landedNow = !0, e.grounded = !0), e.vel[1] = 0) : e.vel[ax] = 0;
      }
    }
    let g = W.groundH(e.pos[0], e.pos[2], e.pos[1]);
    return e.pos[1] <= g + 0.01 && e.vel[1] <= 0 && (e.pos[1] = g, e.grounded || (landedNow = !0), e.grounded = !0, e.vel[1] = 0), e.pos[1] < -1.6 && (e.pos[1] = -1.6, e.vel[1] = 0, e.grounded = !0), landedNow;
  }
  function moveAndCollide(dt) {
    moveEntity(P, height(), dt) && landed();
  }
  function landed() {
    if (P.state === "glide" || P.state === "sky") {
      P.state = "play";
      return;
    }
    if (P.vel[1] < -22) {
      let d = Math.round((-P.vel[1] - 22) * 4);
      damage(d), info(`Fall damage -${d}`);
    }
  }
  var plIcon = H.pl.querySelector("canvas");
  function drawIcon(skin) {
    let c = plIcon.getContext("2d"), col = (v) => `rgb(${v.map((x) => x * 255 | 0).join(",")})`;
    c.clearRect(0, 0, 16, 16), c.fillStyle = col(skin.top), c.fillRect(3, 11, 10, 5), c.fillStyle = col(skin.skin), c.fillRect(4, 3, 8, 8), c.fillStyle = col(skin.hair), c.fillRect(3, 1, 10, 3), c.fillStyle = "#000", c.fillRect(6, 6, 1, 1), c.fillRect(10, 6, 1, 1);
  }
  var mmCtx = H.mm.querySelectorAll("canvas")[1].getContext("2d"), mmBg = H.mm.querySelectorAll("canvas")[0].getContext("2d"), HEAD = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"], fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`, fpsN = 0, fpsT = 0, fpsV = 0, lowT = 0, hudN = 0;
  function drawHud() {
    let heavy = ++hudN % 3 === 0;
    H.hp.querySelector("i").style.width = P.hp + "%", H.hp.nextElementSibling.textContent = String(Math.ceil(P.hp)), H.sh.querySelector("i").style.width = P.shield + "%", H.sh.nextElementSibling.textContent = String(Math.ceil(P.shield)), H.pl.querySelector(".b i").style.width = P.hp + "%", heavy && (H.mats.innerHTML = ["wood", "stone", "metal"].map((m) => `<div class="${P.mat === m && P.build ? "sel" : ""}">${m === "wood" ? '<svg viewBox="0 0 40 40"><path d="M6 30 L26 8 L34 14 L14 36 Z" fill="#e6c48a" stroke="#8a6a3a" stroke-width="1.5"/></svg>' : m === "stone" ? '<svg viewBox="0 0 40 40"><path d="M4 22 L20 12 L36 20 L20 30 Z" fill="#c9c9c9" stroke="#666" stroke-width="1.5"/><path d="M4 22 L20 30 L20 36 L4 28 Z" fill="#a0a0a0" stroke="#666" stroke-width="1.5"/><path d="M36 20 L20 30 L20 36 L36 26 Z" fill="#8a8a8a" stroke="#666" stroke-width="1.5"/></svg>' : '<svg viewBox="0 0 40 40"><path d="M8 8 L30 8 L30 14 L18 14 L32 32 L10 32 L10 26 L22 26 Z" fill="#dfe6ee" stroke="#556" stroke-width="1.5"/></svg>'}${P.mats[m]}</div>`).join("")), heavy && (H.bld.innerHTML = [["wall", "Q", '<rect x="10" y="10" width="24" height="24" transform="skewY(-10)"/>'], ["floor", "G", '<path d="M22 12 L38 22 L22 32 L6 22 Z"/>'], ["ramp", "F", '<path d="M8 36 L8 30 L14 30 L14 24 L20 24 L20 18 L26 18 L26 12 L32 12 L32 8 L38 8 L38 36 Z"/>'], ["pyramid", "Alt", '<path d="M22 8 L40 26 L22 36 L4 26 Z"/><path d="M22 8 L22 36"/>']].map(([t2, k, s]) => `<div class="${P.build && P.piece === t2 ? "on" : ""}"><kbd>${k}</kbd><svg viewBox="0 0 44 44">${s}</svg></div>`).join(""));
    let it = curItem(), slots = [`<div class="slot ${P.slot < 0 ? "sel" : ""}">${ICON.pickaxe}<span class="k">BACKQUOTE</span></div>`].concat(P.inv.map((s, i) => `<div class="slot ${s ? RARITIES[s.rar] : ""} ${P.slot === i ? "sel " + (s && isWeapon(s.kind) ? "w" : "") : ""}">${s ? ICON[s.kind] + `<span class="cnt">${isWeapon(s.kind) ? s.mag : s.count}</span>` : ""}<span class="k">${["1", "2", "3", "MOUSE4", "MOUSE3"][i]}</span></div>`));
    heavy && (H.hotbar.innerHTML = slots.join("")), H.wname.textContent = P.swim ? "Swimming" : P.editing ? "Editing" : it ? isWeapon(it.kind) ? WEAPONS[it.kind].name : CONS[it.kind].name : P.slot < 0 ? "Pickaxe" : "", H.ammo.innerHTML = it && isWeapon(it.kind) ? `${P.reload > 0 ? "<small>RELOADING</small>" : it.mag} <small>/ ${P.ammo[WEAPONS[it.kind].ammo]}</small><span class="mg"></span>` : "", H.cross.className = P.build ? "build" : "", H.cross.style.display = P.state === "play" && !P.scoped ? "block" : "none", H.scope.style.display = P.scoped && !P.over ? "block" : "none", H.hud.style.opacity = P.over ? "0" : "1", H.prog.style.display = P.useT > 0 ? "block" : "none", P.useT > 0 && (H.prog.querySelector("i").style.width = 100 - P.useT / P.useDur * 100 + "%");
    let deg = ((-(P.yaw * 180 / Math.PI) + 180) % 360 + 360) % 360, ch = `<div class="hd">${Math.round(deg)}</div>`;
    for (let d = -90; d <= 90; d += 15) {
      let a = ((Math.round(deg / 15) * 15 + d) % 360 + 360) % 360, x = 410 + (a - deg + 540) % 360 - 180, px = 410 + ((a - deg + 540) % 360 - 180) * 4.2;
      if (Math.abs(px - 410) > 420) continue;
      let big = a % 45 === 0;
      ch += `<div class="tk ${big ? "big" : ""}" style="left:${px}px">${big ? HEAD[a / 45] : a}</div>`;
    }
    heavy && (H.comp.innerHTML = ch);
    let zoom = P.state === "play" ? 1.7 : 0.5, sx = (P.pos[0] + SIZE / 2) / SIZE * 600, sz = (P.pos[2] + SIZE / 2) / SIZE * 600, vw = 300 / zoom;
    if (heavy || hudN % 3 === 1) {
      mmBg.clearRect(0, 0, 300, 300), mmBg.fillStyle = "#7bbde9", mmBg.fillRect(0, 0, 300, 300), mmBg.drawImage(mapCv, sx - vw / 2, sz - vw / 2, vw, vw, 0, 0, 300, 300);
      let g = mmCtx;
      g.clearRect(0, 0, 300, 300);
      let toMM = (x, z) => [150 + ((x + SIZE / 2) / SIZE * 600 - sx) * zoom, 150 + ((z + SIZE / 2) / SIZE * 600 - sz) * zoom];
      g.setLineDash([6, 6]), g.strokeStyle = "#fff", g.lineWidth = 2, g.beginPath(), g.moveTo(...toMM(bus.a[0], bus.a[2])), g.lineTo(...toMM(bus.b[0], bus.b[2])), g.stroke(), g.setLineDash([]);
      let sc = toMM(storm.c[0], storm.c[1]), sr = storm.r / SIZE * 600 * zoom;
      if (g.fillStyle = "rgba(150,80,200,0.45)", g.fillRect(0, 0, 300, 300), g.globalCompositeOperation = "destination-out", g.beginPath(), g.arc(sc[0], sc[1], sr, 0, 6.28), g.fill(), g.globalCompositeOperation = "source-over", g.strokeStyle = "#fff", g.lineWidth = 3, g.beginPath(), g.arc(sc[0], sc[1], sr, 0, 6.28), g.stroke(), P.state === "bus") {
        let [bx, bz] = toMM(bus.pos[0], bus.pos[2]);
        g.fillStyle = "#4fa8ff", g.strokeStyle = "#fff", g.beginPath(), g.rect(bx - 9, bz - 6, 18, 12), g.fill(), g.stroke();
      }
      g.save(), g.translate(150, 150), g.rotate(-P.yaw + Math.PI), g.fillStyle = "#fff", g.strokeStyle = "#000", g.lineWidth = 1.5, g.beginPath(), g.moveTo(0, -9), g.lineTo(7, 7), g.lineTo(0, 3), g.lineTo(-7, 7), g.closePath(), g.fill(), g.stroke(), g.restore();
    }
    let poi = "";
    for (let p of POIS) Math.hypot(P.pos[0] - p.x, P.pos[2] - p.z) < p.r + 20 && (poi = p.name);
    H.mm.querySelector(".poi").textContent = poi, H.stats.innerHTML = `<span>\u{1F552} ${fmt(storm.phaseT)}</span><span>\u{1F464} ${P.alive}</span><span>\u2694 ${P.kills}</span>`, heavy && (H.feed.innerHTML = feed.map((f) => `<div style="opacity:${Math.min(1, f.t)}">${f.html}</div>`).join("")), P.state === "bus" && bus.t > 4 && banner("SPACE TO JUMP", `EVERYBODY OFF. LAST STOP IN ${Math.ceil(bus.dur - bus.t)}s`, 0.2), H.fps.textContent = S.showFps ? fpsV + " FPS" : "";
    let html = "";
    if (D.esp && !S.streamer) {
      for (let d of bots) if (!d.dead && d.state !== "bus") {
        let s = project(add(d.pos, [0, 2.4, 0]));
        s && (html += `<div class="nm" style="left:${s[0]}px;top:${s[1]}px;color:#ff8">${d.name} \xB7 ${Math.ceil(d.hp + d.shield)} \xB7 ${Math.round(len(sub(d.pos, P.pos)))}m</div>`);
      }
    }
    let th = P.state === "play" ? W.raycast(camPos, camFwd, 200, botBoxes()) : null;
    if (th && th.kind === "box") {
      let dm = th.ref.d;
      H.tgt.textContent = `${dm.name} \xB7 ${Math.ceil(dm.hp + dm.shield)} HP \xB7 ${Math.round(th.t)}m`, H.tgt.style.display = "block";
    } else if (th && th.kind === "piece" && th.t < 12) {
      let pc = th.ref;
      H.tgt.innerHTML = P.editing ? "LMB select tiles \xB7 X / RMB confirm \xB7 R reset" : `<i style="display:inline-block;width:80px;height:6px;background:#0008;vertical-align:middle;margin-right:8px"><i style="display:block;height:100%;width:${pc.hp / pc.maxHp * 100}%;background:#7cf23a"></i></i>${Math.ceil(pc.hp)} / ${pc.maxHp} \xB7 X to edit`, H.tgt.style.display = "block";
    } else H.tgt.style.display = "none";
    let cs = 52 + P.bloom * 2600 * (P.ads ? 0.5 : 1);
    H.cross.style.width = H.cross.style.height = cs + "px", H.cross.style.margin = -cs / 2 + "px";
    for (let f of fx) if (f.kind === "dmg") {
      let s = project(add(f.pos, [0, (0.9 - f.t) * 1.5, 0]));
      s && (html += `<div class="dmg ${f.head ? "head" : ""}" style="left:${s[0]}px;top:${s[1]}px;opacity:${Math.min(1, f.t * 3)}">${f.text}</div>`);
    }
    H.fx.innerHTML = html;
    let ws = P.weakT > 0 && P.weakPos ? project(P.weakPos) : null;
    H.weak.style.display = ws ? "block" : "none", ws && (H.weak.style.left = ws[0] + "px", H.weak.style.top = ws[1] + "px");
  }
  function drawChar(ch, root, a) {
    let st = ch.style, ph = a.anim, sp = clamp(a.speed / 6, 0, 1.3), s1 = Math.sin(ph), c1 = Math.cos(ph), lean = a.sprint ? 0.28 : 0.05, bob = a.grounded ? Math.abs(Math.sin(ph)) * 0.05 * sp : 0, drop = 0, thL = -s1 * 0.75 * sp, thR = s1 * 0.75 * sp, shL = Math.max(0, c1) * 1.1 * sp, shR = Math.max(0, -c1) * 1.1 * sp;
    !a.grounded && a.pose !== "sky" && a.pose !== "glide" && (thL = -0.5, thR = 0.2, shL = 1.2, shR = 0.9);
    let uL = s1 * 0.6 * sp, uR = -s1 * 0.6 * sp, fL = -0.5 - Math.max(0, s1) * 0.4 * sp, fR = -0.5 - Math.max(0, -s1) * 0.4 * sp, zL = 0.12, zR = -0.12, hR = -0.1;
    if (a.pose === "aim" || a.pose === "build") {
      let p = -a.pitch * 0.6;
      uR = -0.9 + p, fR = -1.2, zR = -0.1, uL = -1.2 + p, fL = -0.9, zL = 0.7;
    }
    if (a.pose === "pick") {
      let sw = a.swing && a.swing > 0 ? Math.sin(a.swing * 6.3) : 0;
      uR = -1.2 - sw * 1.6, fR = -0.9 + sw * 0.5, zR = 0.1;
    }
    a.pose === "sky" && (uL = uR = -2.4, zL = 1.1, zR = -1.1, fL = fR = -0.3, thL = 0.3, thR = 0.3, shL = shR = 0.2, lean = 1.25), a.pose === "glide" && (uL = uR = -2.9, zL = 0.35, zR = -0.35, fL = fR = -0.4, thL = thR = 0.2, shL = shR = 0.3, lean = 0.15), a.pose === "lobby" && (uL = 0.1, uR = -0.1, fL = fR = -0.35, zL = 0.18, zR = -0.18, thL = thR = shL = shR = 0, lean = 0);
    let yawWig = 0;
    if (a.pose === "emote") {
      let e = a.emote ?? 0, w = t * 6;
      if (e === 0)
        uL = -1.6 + Math.sin(w) * 0.8, uR = -1.6 - Math.sin(w) * 0.8, zL = 0.9, zR = -0.9, fL = -1.2, fR = -1.2, thL = -0.2 + Math.sin(w) * 0.3, thR = -0.2 - Math.sin(w) * 0.3, shL = shR = 0.5, bob = Math.abs(Math.sin(w)) * 0.12, yawWig = Math.sin(w * 0.5) * 0.25;
      else if (e === 1)
        uR = -2.6, fR = -0.6 + Math.sin(w * 1.3) * 0.5, zR = -0.4, uL = 0.1, fL = -0.3, thL = thR = shL = shR = 0;
      else if (e === 2) {
        let f = Math.sin(w * 1.4);
        uL = -0.9, uR = -0.9, fL = -0.9, fR = -0.9, zL = 0.3 + f * 0.5, zR = -0.3 + f * 0.5, yawWig = f * 0.35, thL = thR = 0, shL = shR = 0, bob = Math.abs(f) * 0.05;
      } else
        uL = -2.9, fL = -1.3, zL = 0.2, uR = -0.4, fR = -1.5, zR = -0.5, thL = -0.9, thR = 0.3, shL = 1.6, shR = 0.5, drop = 0.35, yawWig = Math.sin(w) * 0.1;
    }
    a.pose === "crouch" && (drop = 0.55, thL = thR = -1.1, shL = shR = 1.5, lean = 0.35, uR = -1.35 - a.pitch, fR = -0.35, uL = -1.1 - a.pitch, fL = -1, zL = 0.55);
    let m = mul(mul(root, translate(0, bob - drop, 0)), rotY(yawWig)), hip = mul(m, translate(0, 0.78, 0)), upper = mul(hip, rotX(lean));
    R.draw(ch.torso, mul(upper, translate(0, -0.78, 0)), [1, 1, 1], 1, st), R.draw(ch.head, mul(mul(upper, translate(0, 0.78, 0)), rotX(-a.pitch * 0.5 - lean * 0.6)), [1, 1, 1], 1, st);
    let armM = (side, u, z, f) => {
      let sh = mul(mul(mul(upper, translate(side * 0.4, 0.67, 0)), rotZ(-side * z)), rotX(u));
      R.draw(ch.upperArm, sh, [1, 1, 1], 1, st);
      let el = mul(mul(sh, translate(0, -0.32, 0)), rotX(f));
      return R.draw(ch.foreArm, el, [1, 1, 1], 1, st), mul(el, translate(0, -0.33, 0));
    }, handR = armM(-1, uR, zR, fR);
    armM(1, uL, zL, fL);
    let legM = (side, th, sh) => {
      let h = mul(mul(hip, translate(side * 0.16, 0, 0)), rotX(th));
      R.draw(ch.thigh, h, [1, 1, 1], 1, st), R.draw(ch.shin, mul(mul(h, translate(0, -0.4, 0)), rotX(sh)), [1, 1, 1], 1, st);
    };
    if (legM(1, thL, shL), legM(-1, thR, shR), a.held === "pickaxe") R.draw(M.pickaxe, mul(handR, mul(translate(0, 0, 0.05), rotX(1.4))));
    else if (a.held) {
      let gm = a.pose === "aim" || a.pose === "crouch" ? mul(mul(upper, translate(-0.38, 0.55, 0.3)), mul(rotY(-0.2), rotX(-a.pitch * 0.6))) : mul(mul(upper, translate(-0.3, 0.1, 0.25)), mul(rotY(0.5), rotX(-0.9)));
      R.draw(M[a.held], mul(gm, trs([0, 0, 0], 0, 0, 1.6)));
    }
    a.pose === "glide" && R.draw(M.glider, mul(m, translate(0, 2.55, 0.15)));
  }
  var SET = $("settings");
  function settingsOpen(on) {
    SET.style.display = on ? "block" : "none", on ? (document.exitPointerLock(), syncSettingsUI()) : P.state !== "lobby" && !P.over && canvas.requestPointerLock(), H.pause.style.display = "none";
  }
  function syncSettingsUI() {
    SET.querySelectorAll("[data-s]").forEach((el) => {
      let k = el.dataset.s, v = S[k];
      el instanceof HTMLInputElement && el.type === "checkbox" ? el.checked = !!v : el.value = String(v);
      let val = el.parentElement?.querySelector(".val");
      val && (val.textContent = typeof v == "number" ? v % 1 ? v.toFixed(2) : String(v) : "");
    });
  }
  SET.querySelectorAll("[data-s]").forEach((el) => el.oninput = () => {
    let k = el.dataset.s;
    S[k] = el instanceof HTMLInputElement && el.type === "checkbox" ? el.checked : +el.value;
    let val = el.parentElement?.querySelector(".val");
    val && (val.textContent = String(S[k]));
  });
  SET.querySelectorAll(".tabs div").forEach((tb) => tb.onclick = () => {
    SET.querySelectorAll(".tabs div").forEach((x) => x.classList.toggle("on", x === tb)), SET.querySelectorAll(".page").forEach((pg) => pg.classList.toggle("on", pg.dataset.p === tb.dataset.p));
  });
  $("setApply").onclick = () => {
    localStorage.setItem("fn-settings", JSON.stringify(S)), settingsOpen(!1), info("Settings saved");
  };
  $("setReset").onclick = () => {
    Object.assign(S, SDEF), syncSettingsUI();
  };
  $("setX").onclick = () => settingsOpen(!1);
  $("lobbySettings").onclick = () => settingsOpen(!0);
  $("pSettings").onclick = (e) => {
    e.stopPropagation(), settingsOpen(!0);
  };
  $("pResume").onclick = (e) => {
    e.stopPropagation(), canvas.requestPointerLock();
  };
  $("pLobby").onclick = (e) => {
    e.stopPropagation(), toLobby();
  };
  function fitLobby() {
    let ui = document.querySelector("#lobby .ui");
    if (!ui) return;
    let sc = Math.min(innerWidth / 1600, innerHeight / 900);
    ui.style.transform = `scale(${sc})`, ui.style.left = (innerWidth - 1600 * sc) / 2 + "px", ui.style.top = (innerHeight - 900 * sc) / 2 + "px";
  }
  addEventListener("resize", fitLobby);
  fitLobby();
  var lastEmote = 0, EW = $("emoteWheel");
  EW.querySelectorAll("[data-e]").forEach((el) => el.onclick = () => {
    startEmote(+el.dataset.e), EW.style.display = "none", canvas.requestPointerLock();
  });
  function startEmote(i) {
    P.state !== "play" || P.dead || (lastEmote = i, P.emote = i, P.emoteT = 4.5, P.build = !1, P.editing = null, emoteJingle(i));
  }
  function emoteJingle(i) {
    [[440, 554, 659, 880], [523, 659], [392, 494, 587, 494], [330, 262]][i].forEach((f, n) => setTimeout(() => beep(f, 0.18, "triangle", 0.06), n * 160));
  }
  var dbgOpen = () => H.dbg.style.display === "block";
  function toggleDbg(on = !dbgOpen()) {
    H.dbg.style.display = on ? "block" : "none", on ? document.exitPointerLock() : P.state !== "lobby" && canvas.requestPointerLock(), H.pause.style.display = "none";
  }
  $("dbgX").onclick = () => toggleDbg(!1);
  $("btnRet").onclick = () => toLobby();
  $("dPoi").innerHTML = POIS.map((p, i) => `<option value="${i}">${p.name}</option>`).join("");
  H.dbg.querySelectorAll("input[data-f]").forEach((el) => {
    el.onchange = () => D[el.dataset.f] = el.checked;
  });
  H.dbg.querySelectorAll("button[data-a]").forEach((el) => el.onclick = () => dbgAction(el.dataset.a));
  function fortAt(c, mat, size = 3) {
    let base = Math.floor((c[1] + 1) / 4) * 4, cx = Math.floor(c[0] / 4) * 4 + 2, cz = Math.floor(c[2] / 4) * 4 + 2, h = size === 3 ? 2 : 3;
    for (let lvl = 0; lvl < h; lvl++) for (let i = -1; i <= 1; i++) {
      let y = base + lvl * 4;
      W.place("wall", mat, [cx + i * 4, y, cz - 6], 0), W.place("wall", mat, [cx + i * 4, y, cz + 6], 0), W.place("wall", mat, [cx - 6, y, cz + i * 4], 1), W.place("wall", mat, [cx + 6, y, cz + i * 4], 1), lvl === 1 && (W.place("floor", mat, [cx + i * 4, y, cz], 0), W.place("floor", mat, [cx + i * 4, y, cz - 4], 0), W.place("floor", mat, [cx + i * 4, y, cz + 4], 0));
    }
    return W.pieces.delete(World.key("wall", [cx, base, cz + 6], 0)), W.pieces.delete(World.key("floor", [cx, base + 4, cz], 0)), W.place("ramp", mat, [cx, base, cz], 0), [cx, base, cz];
  }
  function dbgAction(a) {
    let ahead = add(P.pos, scale(fwd(), 24));
    switch (ahead[1] = terrainH(ahead[0], ahead[2]), a) {
      case "sethp":
        P.hp = clamp(+$("dHp").value, 1, 100), P.shield = clamp(+$("dSh").value, 0, 100);
        break;
      case "refill":
        P.mats = { wood: 999, stone: 999, metal: 999 }, P.ammo = { light: 999, medium: 999, heavy: 999, shells: 999 };
        break;
      case "loadout":
        P.inv = [mkItem("tac", 1, 4), mkItem("scar", 1, 4), mkItem("hunting", 1, 4), mkItem("chug", 2), mkItem("miniShield", 6)], P.slot = 0, P.ammo = { light: 999, medium: 999, heavy: 999, shells: 999 }, P.mats = { wood: 999, stone: 999, metal: 999 };
        break;
      case "give": {
        let k = $("dItem").value, r = $("dRar").selectedIndex, sl = P.inv.indexOf(null);
        sl < 0 && (sl = Math.max(0, P.slot)), P.inv[sl] = mkItem(k, isWeapon(k) ? 1 : 3, r), P.slot = sl, isWeapon(k) && (P.ammo[WEAPONS[k].ammo] += 90);
        break;
      }
      case "tp": {
        let p = POIS[+$("dPoi").value];
        P.pos = [p.x, terrainH(p.x, p.z) + 2, p.z], P.vel = [0, 0, 0], P.state !== "play" && (P.state = "play");
        break;
      }
      case "bus":
        startMatch(), toggleDbg(!1);
        return;
      case "storm":
        storm.shrinking = !1, nextStormPhase();
        break;
      case "bot": {
        let b = spawnBot(ahead);
        b.enemy = "player";
        break;
      }
      case "peter": {
        let b = spawnBot(ahead, 4);
        b.name = "Peter", b.hp = 400, b.shield = 100, b.weapon = "shotgun", b.weapons = ["shotgun", "ar", "sniper"], b.heals = 5, b.mats = 999, b.enemy = "player", b.skill = 1, b.aggression = 1, b.accuracy = 0.7, b.reaction = 0.12, b.seenAt = t - 1, b.mode = "fight";
        break;
      }
      case "alive":
        P.alive = clamp(+$("dAlive").value, 1, 100);
        break;
      case "nobots":
        for (let b of bots) b.dead = !0;
        bots.length = 0;
        break;
      case "cosm":
        info("All cosmetics unlocked");
        break;
      case "xp":
        info("+80,000 XP"), document.querySelector("#xp .bar").style.background = "linear-gradient(90deg,#c46bff,#c46bff)";
        break;
      case "win":
        endScreen(!0), toggleDbg(!1);
        return;
      case "die":
        damage(9999, "Test"), toggleDbg(!1);
        return;
      case "clear":
        W.pieces.clear();
        break;
      case "siege": {
        let c = fortAt(ahead, "stone", 3);
        for (let i = 0; i < 4; i++) {
          let b = spawnBot([c[0] + rand(-3, 3), c[1] + 4.5, c[2] + rand(-3, 3)]);
          b.name = "Defender" + (i + 1), b.weapon = i % 2 ? "ar" : "shotgun", b.weapons = [b.weapon];
        }
        for (let i = 0; i < 4; i++) {
          let a2 = i / 4 * 6.28, b = spawnBot([c[0] + Math.cos(a2) * 30, c[1] + 1, c[2] + Math.sin(a2) * 30]);
          b.name = "Raider" + (i + 1), b.weapon = "ar", b.weapons = ["ar"], b.target = c;
        }
        banner("FORTRESS SIEGE", "DEFENDERS VS RAIDERS", 4);
        break;
      }
      case "meteor":
        event = "meteor", eventT = 40, banner("METEOR SHOWER", "TAKE COVER", 4);
        break;
      case "edit": {
        let base = Math.floor((ahead[1] + 1) / 4) * 4, cx = Math.floor(ahead[0] / 4) * 4 + 2, cz = Math.floor(ahead[2] / 4) * 4 + 2;
        for (let i = 0; i < 6; i++)
          W.place("floor", "wood", [cx, base + 4 + i * 4, cz + i * 4], 0), W.place("ramp", "wood", [cx, base + i * 4, cz + i * 4], 0), W.place("wall", "wood", [cx - 2, base + i * 4, cz + i * 4], 1), W.place("wall", "wood", [cx + 2, base + i * 4, cz + i * 4], 1), W.place("wall", "wood", [cx, base + i * 4 + 4, cz + i * 4 + 2], 0);
        banner("EDIT PRACTICE", "BUILD YOUR WAY UP", 4);
        break;
      }
      case "stop":
        event = null, meteors.length = 0, banner("EVENT STOPPED", "", 2);
        break;
      case "supply":
        for (let i = 0; i < 6; i++) drops.push({ pos: [P.pos[0] + rand(-50, 50), 130 + rand(0, 30), P.pos[2] + rand(-50, 50)], landed: !1 });
        banner("SUPPLY DROP PARTY", "6 DROPS INCOMING", 4);
        break;
      case "skydive":
        P.pos = [P.pos[0], terrainH(P.pos[0], P.pos[2]) + 300, P.pos[2]], P.vel = [0, 0, 0], P.state = "sky", toggleDbg(!1);
        return;
    }
    info(a.toUpperCase() + " \u2713");
  }
  function explode(pos, by, kind = "grenade") {
    if (kind === "boogie") {
      beep(600, 0.4, "triangle", 0.1, 400), fx.push({ kind: "dmg", t: 0.8, pos: add(pos, [0, 1.5, 0]), text: "BOOGIE", head: !0 }), len(sub(P.pos, pos)) < 6 && !P.dead && (P.emote = 0, P.emoteT = 5, P.stunT = 5);
      for (let b of bots) !b.dead && len(sub(b.pos, pos)) < 6 && (b.emote = 0, b.emoteT = 5, b.stunT = 5);
      return;
    }
    if (kind === "impulse") {
      beep(300, 0.3, "sine", 0.1, -200), fx.push({ kind: "dmg", t: 0.6, pos: add(pos, [0, 1.5, 0]), text: "WHOOSH", head: !1 });
      let push = (e) => {
        let d = sub(add(e.pos, [0, 1, 0]), pos), L = len(d);
        if (L < 7) {
          let k = 26 * (1 - L / 7) + 8;
          e.vel = add(e.vel, add(scale(norm(d), k), [0, k * 0.6, 0])), e.grounded = !1;
        }
      };
      push(P);
      for (let b of bots) b.dead || push(b);
      return;
    }
    beep(50, 0.5, "sawtooth", 0.25, -30), fx.push({ kind: "dmg", t: 0.8, pos: add(pos, [0, 1.5, 0]), text: "BOOM", head: !0 }), rumble(300, 0.8, 1);
    let dmg = (d) => Math.round(100 * clamp(1 - d / 5, 0, 1)), dp = len(sub(P.pos, pos));
    dp < 5 && dmg(dp) > 0 && damage(dmg(dp), by);
    for (let b of bots) if (!b.dead) {
      let d = len(sub(b.pos, pos));
      d < 5 && dmg(d) > 0 && (botDamage(b, dmg(d), by), by === "Player" && (P.dmg += dmg(d)));
    }
    for (let p of [...W.pieces.values()]) len(sub(p.pos, pos)) < 5 && W.damagePiece(p, 200);
  }
  function updateNades(dt) {
    for (let i = nades.length - 1; i >= 0; i--) {
      let n = nades[i];
      if (n.t -= dt, n.rocket) {
        let L = len(n.vel) * dt, h = W.raycast(n.pos, norm(n.vel), L, botBoxes().filter((b) => n.by !== b.ref.d.name)), hitP = h ? h.p : null, self = n.by === "Player" && len(sub(n.pos, P.pos)) < 1.5;
        if (hitP || n.by !== "Player" && len(sub(n.pos, P.pos)) < 1.2 || n.t <= 0) {
          explode(hitP ?? n.pos, n.by), nades.splice(i, 1);
          continue;
        }
        n.pos = add(n.pos, scale(n.vel, dt));
        continue;
      }
      n.vel[1] -= 20 * dt;
      let next = add(n.pos, scale(n.vel, dt)), g = W.groundH(next[0], next[2], next[1]);
      next[1] <= g ? (next[1] = g, n.vel = [n.vel[0] * 0.5, -n.vel[1] * 0.35, n.vel[2] * 0.5]) : W.solids(next[0], next[2], 3).some((b) => next[0] > b.min[0] && next[0] < b.max[0] && next[1] > b.min[1] && next[1] < b.max[1] && next[2] > b.min[2] && next[2] < b.max[2]) ? n.vel = scale(n.vel, -0.3) : n.pos = next, next[1] <= g && (n.pos = next), n.t <= 0 && (explode(n.pos, n.by, n.kind), nades.splice(i, 1));
    }
  }
  function updateEvents(dt) {
    if (P.state === "play" && !P.over && (P.nextDrop -= dt, P.nextDrop <= 0)) {
      P.nextDrop = 110;
      let a = rand(0, 6.28), rr = rand(0, storm.r * 0.6);
      drops.push({ pos: [storm.c[0] + Math.cos(a) * rr, 160, storm.c[1] + Math.sin(a) * rr], landed: !1 }), banner("SUPPLY DROP", "INCOMING", 4);
    }
    for (let d of drops) if (!d.landed) {
      d.pos[1] -= 6 * dt;
      let g = terrainH(d.pos[0], d.pos[2]);
      d.pos[1] <= g && (d.pos[1] = g, d.landed = !0, chests.push({ pos: [...d.pos], yaw: 0, open: !1, drop: !0 }));
    }
    event === "meteor" && (eventT -= dt, eventT <= 0 && (event = null), Math.random() < dt * 1.5 && meteors.push({ pos: [P.pos[0] + rand(-60, 60), 140, P.pos[2] + rand(-60, 60)], vel: [rand(-8, 8), -45, rand(-8, 8)] }));
    for (let i = meteors.length - 1; i >= 0; i--) {
      let m = meteors[i];
      if (m.pos = add(m.pos, scale(m.vel, dt)), m.pos[1] <= W.groundH(m.pos[0], m.pos[2], m.pos[1]) + 0.5) {
        meteors.splice(i, 1), beep(60, 0.5, "sawtooth", 0.2, -30), fx.push({ kind: "dmg", t: 1, pos: add(m.pos, [0, 2, 0]), text: "BOOM", head: !0 }), len(sub(P.pos, m.pos)) < 8 && damage(40, "A meteor");
        for (let b of bots) !b.dead && len(sub(b.pos, m.pos)) < 8 && botDamage(b, 60, "A meteor");
        for (let p of [...W.pieces.values()]) len(sub(p.pos, m.pos)) < 8 && W.pieces.delete(p.key);
      }
    }
  }
  var BOT_W = { ar: [0.26, 21, 70, 22], scar: [0.26, 24, 75, 22], burst: [0.3, 21, 70, 22], smg: [0.11, 11, 40, 14], pistol: [0.22, 16, 45, 16], shotgun: [0.9, 58, 14, 6], tac: [0.5, 42, 14, 7], sniper: [1.8, 85, 220, 45], hunting: [1.4, 72, 180, 40], rpg: [3, 95, 120, 30] };
  function los(a, b) {
    let d = sub(b, a), L = len(d), h = W.raycast(a, norm(d), L);
    return !h || h.t >= L - 0.5;
  }
  var cellOf = (x, z) => [Math.floor(x / 4) * 4 + 2, 0, Math.floor(z / 4) * 4 + 2], dirVec = (d) => [Math.sin(d * Math.PI / 2), 0, Math.cos(d * Math.PI / 2)], yawToDir = (yaw) => (Math.round(yaw / (Math.PI / 2)) % 4 + 4) % 4;
  function botMat(b) {
    return b.mats > 260 ? "metal" : b.mats > 120 ? "stone" : "wood";
  }
  function botPlace(b, type, pos, dir) {
    if (b.mats < 10 && !D.infMats) return null;
    let p = W.place(type, botMat(b), pos, dir);
    return p && (b.mats -= 10, b.buildCd = lerp(0.42, 0.09, b.skill)), p;
  }
  function bestWeaponFor(b, dist) {
    if (!b.weapons.length) return null;
    let best = b.weapons[0], bs = 1e9;
    for (let w of b.weapons) {
      let pref = BOT_W[w]?.[3] ?? 20, score = Math.abs(dist - pref) / pref;
      score < bs && (bs = score, best = w);
    }
    return best;
  }
  function botHear(pos, radius, who) {
    for (let b of bots) !b.dead && b.state === "ground" && b !== who && !b.enemy && len(sub(b.pos, pos)) < radius && Math.random() < 0.5 + b.aggression * 0.5 && (b.memory = [pos[0] + rand(-6, 6), pos[1], pos[2] + rand(-6, 6)], b.memoryT = t, b.aggression > 0.45 && b.weapon && (b.mode = "hunt"));
  }
  function updateBot(b, dt) {
    if (b.dead) return;
    if (b.anim += dt * Math.hypot(b.vel[0], b.vel[2]) * 1.6, b.fireCd -= dt, b.buildCd -= dt, b.retarget -= dt, b.voiceCd -= dt, b.peekT -= dt, b.lootT -= dt, b.stunT > 0) {
      b.stunT -= dt, b.emoteT = Math.max(b.emoteT, 0.1), b.vel[0] *= 0.8, b.vel[2] *= 0.8, b.vel[1] -= 26 * dt, b.grounded = !1, moveEntity(b, 1.75, dt);
      return;
    }
    if (b.emoteT > 0 && (b.emoteT -= dt, b.vel[0] *= 0.8, b.vel[2] *= 0.8, (b.enemy || t - b.lastHit < 2) && (b.emoteT = 0)), b.state === "bus") {
      b.pos = [...bus.pos], (bus.t > b.dropT || bus.t >= bus.dur) && (b.state = "sky", b.vel = [Math.sin(bus.yaw) * 8, -10, Math.cos(bus.yaw) * 8]);
      return;
    }
    let gAbove = b.pos[1] - W.groundH(b.pos[0], b.pos[2], b.pos[1]), fw = [Math.sin(b.yaw), 0, Math.cos(b.yaw)], side = [-Math.cos(b.yaw), 0, Math.sin(b.yaw)], toward = (tgt, spd, face = !0) => {
      let dx = tgt[0] - b.pos[0], dz = tgt[2] - b.pos[2], L = Math.hypot(dx, dz);
      if (L < 0.5)
        return b.vel[0] *= 0.8, b.vel[2] *= 0.8, L;
      let dir = [dx / L, 0, dz / L];
      if (b.state === "ground") {
        if (b.probeT -= dt, b.probeT <= 0) {
          b.probeT = 0.15, b.probeDir = null;
          let eye = add(b.pos, [0, 1, 0]), blocked = (dv) => {
            let h = W.raycast(eye, dv, 2.2);
            return h && h.kind !== "terrain";
          };
          if (blocked(dir)) {
            let l = norm([dir[0] * 0.7 - dir[2] * 0.7, 0, dir[2] * 0.7 + dir[0] * 0.7]), r = norm([dir[0] * 0.7 + dir[2] * 0.7, 0, dir[2] * 0.7 - dir[0] * 0.7]);
            blocked(l) ? blocked(r) ? b.grounded && (b.vel[1] = 9) : b.probeDir = r : b.probeDir = l;
          }
        }
        b.probeDir && (dir = b.probeDir);
      }
      return face && (b.yaw = Math.atan2(dir[0], dir[2])), b.vel[0] = lerp(b.vel[0], dir[0] * spd, 0.12), b.vel[2] = lerp(b.vel[2], dir[2] * spd, 0.12), L;
    };
    if (b.state === "sky")
      b.vel[1] = Math.max(b.vel[1] - 30 * dt, -40), toward(b.land, 18), gAbove < 40 + b.skill * 30 && (b.state = "glide");
    else if (b.state === "glide")
      b.vel[1] = lerp(b.vel[1], -5.5, 0.05), toward(b.land, 11);
    else {
      if (b.vel[1] -= 26 * dt, b.retarget <= 0) {
        b.retarget = lerp(0.5, 0.15, b.skill);
        let found = null, best = 95, eye = add(b.pos, [0, 1.6, 0]), visible = (p, d) => {
          let v = norm(sub(p, eye));
          return v[0] * fw[0] + v[2] * fw[2] < 0.25 && d > 9 || Math.random() > clamp(1.4 - d / 95, 0.15, 1) ? !1 : los(eye, add(p, [0, 1.2, 0]));
        };
        if (!P.dead && P.state === "play") {
          let d = len(sub(P.pos, b.pos));
          d < best && visible(P.pos, d) && (best = d, found = "player");
        }
        for (let o of bots) if (o !== b && !o.dead && o.state === "ground") {
          let d = len(sub(o.pos, b.pos));
          d < best && visible(o.pos, d) && (best = d, found = o);
        }
        if (found) {
          b.enemy !== found && (b.seenAt = t, Math.random() < 0.16 && botVoice(b)), b.enemy = found, b.lastSeen = t;
          let q = found === "player" ? P.pos : found.pos;
          b.memory = [...q], b.memoryT = t, b.mode !== "crank" && b.mode !== "box" && b.mode !== "heal" && b.mode !== "rush" && (b.mode = "fight");
        } else b.enemy && t - b.lastSeen > lerp(2.5, 5, b.skill) && (b.enemy = null, b.mode = b.memory && b.aggression > 0.35 ? "hunt" : "loot", b.crank = null);
        b.enemy && (b.enemy === "player" ? P.dead : b.enemy.dead) && (b.enemy = null, b.mode = "loot", b.crank = null), Math.random() < 0.3 && (b.strafe = -b.strafe), b.memory && t - b.memoryT > 14 && (b.memory = null);
      }
      let ep = b.enemy === "player" ? P.pos : b.enemy ? b.enemy.pos : null, hpTotal = b.hp + b.shield, underFire = t - b.lastHit < 2.5;
      if (b.mode !== "heal" && hpTotal < 45 && b.heals > 0 && (!ep || len(sub(ep, b.pos)) > 14 || b.skill > 0.6) && (b.mode = "heal", b.healT = 0, b.boxAt = null), ep && b.weapon && b.mode !== "heal") {
        let L = len(sub(ep, b.pos)), higher = ep[1] > b.pos[1] + 2.5, wantsCrank = b.skill > 0.55 && L < 46 && (b.aggression > 0.6 || higher) && (b.mats >= 60 || D.infMats);
        b.mode === "fight" && wantsCrank && Math.random() < dt * (0.6 + b.aggression) ? (b.mode = "crank", b.crank = { c: cellOf(b.pos[0], b.pos[2]), L: Math.floor((b.pos[1] + 1) / 4) * 4, d: yawToDir(Math.atan2(ep[0] - b.pos[0], ep[2] - b.pos[2])), t: 0, steps: 0 }) : b.mode === "fight" && underFire && b.skill > 0.3 && b.mats >= 30 && Math.random() < dt * 2.5 ? b.mode = "box" : b.mode === "fight" && b.aggression > 0.7 && b.skill > 0.45 && L < 30 && !higher && Math.random() < dt * 0.4 && b.mats >= 40 && (b.mode = "rush");
      }
      if (!ep && (b.mode === "fight" || b.mode === "crank" || b.mode === "rush") && (b.mode = b.memory ? "hunt" : "loot", b.crank = null), ep && !b.weapon) {
        let away = norm(sub(b.pos, ep));
        toward(add(b.pos, scale(away, 20)), 7.5), b.mode = "loot";
      } else if (ep && hpTotal < 30 && b.heals <= 0 && b.mode !== "box" && b.aggression < 0.85) {
        if (b.buildCd <= 0 && b.mats >= 10) {
          let d = yawToDir(Math.atan2(ep[0] - b.pos[0], ep[2] - b.pos[2])), f = dirVec(d), c = cellOf(b.pos[0], b.pos[2]);
          botPlace(b, "wall", [c[0] + f[0] * 2, Math.floor((b.pos[1] + 1) / 4) * 4, c[2] + f[2] * 2], d);
        }
        let away = norm(sub(b.pos, ep));
        toward(add(b.pos, scale(away, 25)), 7.5), b.mode = "loot", b.crank = null;
      }
      let [cd, dmg, rng] = BOT_W[b.weapon ?? "ar"] ?? BOT_W.ar, aimAndShoot = (L) => {
        let d = sub(ep, b.pos), desiredYaw = Math.atan2(d[0], d[2]), desiredPitch = Math.atan2(d[1], Math.hypot(d[0], d[2])), yawErr = Math.atan2(Math.sin(desiredYaw - b.yaw), Math.cos(desiredYaw - b.yaw)), turnRate = lerp(2.4, 7, b.skill);
        b.yaw += clamp(yawErr, -turnRate * dt, turnRate * dt), b.pitch = lerp(b.pitch, desiredPitch, 1 - Math.exp(-lerp(4, 12, b.skill) * dt));
        let want = bestWeaponFor(b, L);
        if (want && want !== b.weapon && b.fireCd <= 0.1 && (b.weapon = want, b.fireCd = 0.5), t - b.seenAt < b.reaction || b.fireCd > 0 || L > rng * 1.6 || Math.abs(yawErr) > lerp(0.22, 0.05, b.skill)) return;
        b.fireCd = cd * rand(0.9, 1.5) * (b.enemy === "player" ? 1 : 1.4);
        let acc = clamp(b.accuracy - L / (rng * 3.4) - (Math.hypot(b.vel[0], b.vel[2]) > 4 ? 0.08 : 0), 0.06, 0.7) * (b.weapon === "sniper" ? 0.8 : 1) * (b.enemy === "player" ? 1 : 0.55);
        Math.random() < 0.2 && (b.aimDrift = [rand(-1.5, 1.5), rand(-0.75, 0.75), rand(-1.5, 1.5)]);
        let from = add(b.pos, [0, 1.5, 0]), to = add(add(ep, [0, 1.2 + rand(-0.45, 0.45), 0]), scale(b.aimDrift, clamp(L / 45, 0.15, 1)));
        if (b.weapon === "rpg") {
          nades.push({ pos: add(from, scale(norm(sub(to, from)), 1.2)), vel: scale(norm(add(to, [rand(-2, 2) * (1 - b.accuracy), 0, rand(-2, 2) * (1 - b.accuracy)]).map((v, i) => v - from[i])), 34), t: 6, by: b.name, rocket: !0 }), botHear(b.pos, 80, b);
          return;
        }
        let hit = Math.random() < acc && los(from, to);
        if (fx.push({ kind: "tracer", t: 0.06, pos: from, to: hit ? to : add(to, [rand(-3, 3), rand(-2, 2), rand(-3, 3)]) }), hit) {
          let head = Math.random() < b.skill * 0.18, n = Math.round(dmg * rand(0.8, 1.1) * (head ? 1.5 : 1));
          b.enemy === "player" ? (damage(n, b.name), head && info("Headshot!")) : botDamage(b.enemy, n, b.name);
        } else if (!hit && !los(from, to)) {
          let h = W.raycast(from, norm(sub(to, from)), L);
          h && h.kind === "piece" && W.damagePiece(h.ref, dmg);
        }
        botHear(b.pos, 60, b), len(sub(b.pos, P.pos)) < 90 && beep(200, 0.08, "sawtooth", 0.03, -60);
      };
      if (!(ep && (!b.weapon || hpTotal < 30 && b.heals <= 0 && b.mode !== "box" && b.aggression < 0.85)))
        if (b.mode === "fight" && ep) {
          let L = len(sub(ep, b.pos)), pref = BOT_W[b.weapon ?? "ar"]?.[3] ?? 20;
          aimAndShoot(L);
          let want = add(scale(side, b.strafe * lerp(2, 4, b.skill)), scale(fw, L > pref * 1.3 ? 4.5 : L < pref * 0.6 ? -3 : 0));
          if (b.vel[0] = lerp(b.vel[0], want[0], 0.1), b.vel[2] = lerp(b.vel[2], want[2], 0.1), b.grounded && Math.random() < dt * b.skill * 0.6 && (b.vel[1] = 9), b.nades > 0 && L > 8 && L < 30 && Math.random() < dt * 0.12 * (1 + b.aggression)) {
            b.nades--;
            let to = sub(ep, b.pos), tl = len(to);
            nades.push({ pos: add(b.pos, [0, 1.6, 0]), vel: add(scale(norm(to), Math.min(20, tl * 0.9)), [0, 6 + tl * 0.15, 0]), t: 2.5, by: b.name });
          }
          if (underFire && b.buildCd <= 0 && b.skill > 0.25 && Math.random() < dt * 4) {
            let d = yawToDir(Math.atan2(ep[0] - b.pos[0], ep[2] - b.pos[2])), f = dirVec(d), c = cellOf(b.pos[0], b.pos[2]), L0 = Math.floor((b.pos[1] + 1) / 4) * 4;
            botPlace(b, "wall", [c[0] + f[0] * 2, L0, c[2] + f[2] * 2], d), b.skill > 0.5 && botPlace(b, "ramp", [c[0], L0, c[2]], d);
          }
        } else if (b.mode === "crank" && ep && b.crank) {
          let k = b.crank, f = dirVec(k.d), r = dirVec((k.d + 1) % 4), rc = [k.c[0] + f[0] * 4, k.L, k.c[2] + f[2] * 4];
          k.t === 0 && b.buildCd <= 0 && (botPlace(b, "floor", [k.c[0], k.L, k.c[2]], 0), botPlace(b, "ramp", rc, k.d), botPlace(b, "wall", [rc[0] + f[0] * 2, k.L, rc[2] + f[2] * 2], k.d), botPlace(b, "wall", [rc[0] + r[0] * 2, k.L, rc[2] + r[2] * 2], (k.d + 1) % 4), botPlace(b, "wall", [rc[0] - r[0] * 2, k.L, rc[2] - r[2] * 2], (k.d + 1) % 4), b.skill > 0.75 && botPlace(b, "wall", [k.c[0] - f[0] * 2, k.L, k.c[2] - f[2] * 2], k.d), k.t = 0.01, b.vel[1] = Math.max(b.vel[1], 8.5)), k.t += dt;
          let top = [rc[0] + f[0] * 1.6, k.L + 4, rc[2] + f[2] * 1.6], L2 = toward(top, lerp(6, 9.5, b.skill), !1), L = len(sub(ep, b.pos));
          aimAndShoot(L), b.pos[1] > k.L + 3.4 && L2 < 1.2 ? (k.c = rc, k.L += 4, k.d = (k.d + 1) % 4, k.t = 0, k.steps++) : k.t > 2.6 && (k.t = 0, k.c = cellOf(b.pos[0], b.pos[2]), k.L = Math.floor((b.pos[1] + 1) / 4) * 4), (b.pos[1] > ep[1] + 7 || k.steps > 6 || b.mats < 20 && !D.infMats) && (botPlace(b, "floor", [k.c[0], k.L, k.c[2]], 0), b.mode = "fight", b.crank = null);
        } else if (b.mode === "rush" && ep) {
          let L = len(sub(ep, b.pos));
          aimAndShoot(L);
          let d = yawToDir(Math.atan2(ep[0] - b.pos[0], ep[2] - b.pos[2])), f = dirVec(d), c = cellOf(b.pos[0] + f[0] * 2.5, b.pos[2] + f[2] * 2.5), L0 = Math.floor((b.pos[1] + 1) / 4) * 4;
          b.buildCd <= 0 && (botPlace(b, "ramp", [c[0], L0, c[2]], d), botPlace(b, "floor", [c[0], L0, c[2]], 0)), toward([c[0] + f[0] * 1.8, L0 + 4, c[2] + f[2] * 1.8], 7, !1), (L < 9 || b.mats < 20 || Math.random() < dt * 0.25) && (b.mode = "fight");
        } else if (b.mode === "box" || b.mode === "heal") {
          let c = cellOf(b.pos[0], b.pos[2]), L0 = Math.floor((b.pos[1] + 1) / 4) * 4;
          if ((!b.boxAt || len(sub(b.boxAt, c)) > 1) && (b.boxAt = c, b.peekWall = null), b.buildCd <= 0) {
            for (let d = 0; d < 4; d++) {
              let f = dirVec(d);
              botPlace(b, "wall", [c[0] + f[0] * 2, L0, c[2] + f[2] * 2], d);
            }
            botPlace(b, "floor", [c[0], L0 + 4, c[2]], 0), botPlace(b, "floor", [c[0], L0, c[2]], 0);
          }
          if (toward([c[0], L0, c[2]], 4, !1), b.vel[0] *= 0.7, b.vel[2] *= 0.7, b.mode === "heal")
            b.healT += dt, b.yaw += dt * 0.6, b.healT > 4 && (b.healT = 0, b.heals--, b.shield < 100 && Math.random() < 0.5 ? b.shield = Math.min(100, b.shield + 50) : b.hp = Math.min(100, b.hp + 50), (hpTotal + 50 >= 90 || b.heals <= 0) && (b.mode = ep ? "fight" : "loot"));
          else if (ep) {
            let L = len(sub(ep, b.pos)), d = yawToDir(Math.atan2(ep[0] - b.pos[0], ep[2] - b.pos[2])), f = dirVec(d), wall = W.pieces.get(World.key("wall", [c[0] + f[0] * 2, L0, c[2] + f[2] * 2], d)) ?? null;
            if (wall && b.peekT <= 0) {
              let open = wall.edit === 0;
              wall.edit = open ? 16 : 0, b.peekWall = wall, b.peekT = open ? lerp(1.2, 0.7, b.skill) : lerp(1.4, 0.5, b.skill), open && b.skill > 0.7 && Math.random() < 0.3 && (wall.edit = 2);
            }
            wall && wall.edit && aimAndShoot(L), !underFire && t - b.lastHit > 4 && Math.random() < dt * (0.3 + b.aggression * 0.6) && (b.peekWall && (b.peekWall.edit = 0), b.mode = b.aggression > 0.6 ? "crank" : "fight", b.mode === "crank" && (b.crank = { c, L: L0, d, t: 0, steps: 0 }));
          } else t - b.lastHit > 3 && (b.peekWall && (b.peekWall.edit = 0), b.mode = "loot");
        } else {
          b.pitch = lerp(b.pitch, 0, 0.1);
          let sc = storm.shrinking ? storm.to.c : storm.c, srad = storm.shrinking ? storm.to.r : storm.r, out = Math.hypot(b.pos[0] - sc[0], b.pos[2] - sc[1]) > srad * (storm.shrinking ? 0.85 : 0.9), chest = null, cdist = b.weapon ? 30 : 120;
          for (let c of chests) if (!c.open) {
            let d = len(sub(c.pos, b.pos));
            d < cdist && (cdist = d, chest = c);
          }
          let item = null, idist = b.weapon ? 40 : 140;
          for (let g of items) {
            let k = g.item.kind;
            if (!(isWeapon(k) ? !b.weapon || b.weapons.length < 3 && !b.weapons.includes(k) || b.weapon === "smg" && k !== "smg" : k === "ammo" || k === "boogie" || k === "impulse" ? !1 : k === "grenade" ? b.nades < 3 : b.heals < 3)) continue;
            let d = len(sub(g.pos, b.pos));
            d < idist && (idist = d, item = g);
          }
          if (out) {
            if (b.mode = "rotate", !b.target || Math.hypot(b.target[0] - sc[0], b.target[2] - sc[1]) > srad * 0.5) {
              let a = rand(0, 6.28), rr = rand(0, srad * 0.5);
              b.target = [sc[0] + Math.cos(a) * rr, 0, sc[1] + Math.sin(a) * rr];
            }
            toward(b.target, 6.5);
          } else if (b.mode === "hunt" && b.memory && b.weapon)
            toward(b.memory, 6.5) < 3 && (b.memory = null, b.mode = "loot");
          else if (chest && (b.lootT <= 0 || !b.weapon))
            if (toward(chest.pos, 5.8) < 2.6) {
              if (b.vel[0] *= 0.6, b.vel[2] *= 0.6, b.interactRef !== chest ? (b.interactRef = chest, b.interactT = 1.2) : b.interactT -= dt, b.interactT <= 0) {
                chest.open = !0;
                let pool = ["ar", "burst", "smg", "shotgun", "sniper", "tac", "hunting", "scar", "pistol"], k = pool[Math.floor(rand(0, pool.length))];
                !b.weapons.includes(k) && b.weapons.length < 3 && b.weapons.push(k), b.weapon = b.weapon ?? k, b.heals = Math.min(4, b.heals + 1), b.shield = Math.min(100, b.shield + 25), b.mats = Math.min(700, b.mats + 90), b.interactRef = null;
              }
            } else
              b.interactRef = null;
          else if (item) {
            if (toward(item.pos, 5.8) < 1.6) {
              let k = item.item.kind;
              isWeapon(k) ? (b.weapons.includes(k) || (b.weapons.length >= 3 && b.weapons.shift(), b.weapons.push(k)), b.weapon = k) : k !== "grenade" && b.heals++, k === "grenade" && (b.nades += 3), items.splice(items.indexOf(item), 1), b.mats += 40;
            }
          } else {
            if (b.mode = "rotate", b.wanderT -= dt, !b.target || b.wanderT <= 0 || len(sub(b.target, b.pos)) < 3)
              if (b.wanderT = rand(6, 14), storm.phase >= 2 || P.matchT > 240 || Math.random() < 0.3) {
                let a = rand(0, 6.28), rr = rand(0, storm.r * 0.55);
                b.target = [storm.c[0] + Math.cos(a) * rr, 0, storm.c[1] + Math.sin(a) * rr];
              } else {
                let spot = W.lootSpots[Math.floor(rand(0, W.lootSpots.length))];
                b.target = len(sub(spot, b.pos)) < 90 ? [...spot] : [b.pos[0] + rand(-40, 40), 0, b.pos[2] + rand(-40, 40)];
              }
            b.emoteT <= 0 && Math.random() < dt * 0.012 && (b.emoteT = rand(3, 5), b.emote = Math.floor(rand(0, 4)), len(sub(b.pos, P.pos)) < 40 && emoteJingle(b.emote)), b.emoteT <= 0 && toward(b.target, 5.2);
          }
          b.mats = Math.min(700, b.mats + dt * (b.weapon ? 6 : 10)), b.heals <= 0 && Math.random() < dt * 0.02 && (b.heals = 1);
        }
      for (let n of nades) if (!n.rocket && n.t < 2 && len(sub(n.pos, b.pos)) < 6 && b.skill > 0.3) {
        let away = norm(sub(b.pos, n.pos));
        b.vel[0] = away[0] * 8, b.vel[2] = away[2] * 8, b.grounded && (b.vel[1] = 8);
        break;
      }
      if (Math.hypot(b.vel[0], b.vel[2]) > 1.5 && len(sub(b.pos, b.lastPos)) < 0.05 * 1 ? b.stuckT += dt : b.stuckT = 0, b.stuckT > 0.6 && b.grounded && (b.vel[1] = 9, b.stuckT > 2 && (b.target = null, b.stuckT = 0, b.skill > 0.4 && b.buildCd <= 0))) {
        let d = yawToDir(b.yaw), f = dirVec(d), c = cellOf(b.pos[0] + f[0] * 2.5, b.pos[2] + f[2] * 2.5);
        botPlace(b, "ramp", [c[0], Math.floor((b.pos[1] + 1) / 4) * 4, c[2]], d);
      }
      b.lastPos = [...b.pos], Math.hypot(b.pos[0] - storm.c[0], b.pos[2] - storm.c[1]) > storm.r && Math.random() < dt && botDamage(b, storm.phase > 3 ? 5 : storm.phase > 1 ? 2 : 1, "The storm");
    }
    b.grounded = !1, moveEntity(b, 1.75, dt) && b.state !== "ground" && (b.state = "ground", b.mode = "loot");
  }
  var last = performance.now(), t = 0, PROF = { bots: 0, submit: 0, flush: 0, hud: 0, frames: 0 };
  function frame(now) {
    let dt = Math.min(0.05, (now - last) / 1e3);
    last = now, t += dt, fpsN++, fpsT += dt, fpsT > 0.5 && (fpsV = Math.round(fpsN / fpsT), fpsN = 0, fpsT = 0, P.state === "play" && (lowT = fpsV < 30 ? lowT + 0.5 : 0, lowT >= 3 && (lowT = 0, (S.shadows > 1 ? S.shadows = 1 : S.grass > 0 ? S.grass = 0 : S.scale > 0.75 ? S.scale = 0.75 : S.shadows > 0 ? S.shadows = 0 : S.scale > 0.6 ? S.scale = 0.6 : S.viewDist > 0 ? S.viewDist = 0 : -1) !== -1 && info("Low FPS: quality lowered (Settings > Video)"))));
    let key = (c) => pressed.has(c), sun = norm([0.45, 0.8, 0.3]), aspect = innerWidth / innerHeight, gamepads = navigator.getGamepads ? navigator.getGamepads() : [], gp = null;
    for (let g of gamepads)
      if (g && g.connected) {
        gp = g;
        break;
      }
    let curGpButtons = /* @__PURE__ */ new Set(), gpWish = [0, 0, 0];
    if (gp) {
      let deadzone = (v, dz = 0.16) => Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz), lx = deadzone(gp.axes[0] || 0), ly = deadzone(gp.axes[1] || 0), rx = deadzone(gp.axes[2] || 0), ry = deadzone(gp.axes[3] || 0), isB = (i) => {
        let b = gp.buttons[i];
        return b ? typeof b == "object" ? b.pressed : b === 1 : !1;
      };
      for (let i = 0; i < gp.buttons.length; i++) isB(i) && curGpButtons.add(i);
      let justB = (i) => curGpButtons.has(i) && !gpPrev.has(i), lt2 = (gp.buttons[6]?.value ?? 0) > 0.25 || gp.axes[4] !== void 0 && gp.axes[4] > 0.2, rt = (gp.buttons[7]?.value ?? 0) > 0.25 || gp.axes[5] !== void 0 && gp.axes[5] > 0.2, ltJust = (gp.buttons[6]?.value ?? 0) > 0.4 && !gpPrev.has(6) || justB(6), rtJust = (gp.buttons[7]?.value ?? 0) > 0.4 && !gpPrev.has(7) || justB(7);
      if (Math.abs(rx) > 0 || Math.abs(ry) > 0) {
        let padSens = 650 * dt * S.padSens * (P.scoped ? 0.4 : P.ads ? 0.6 : 1);
        mouse.dx += rx * padSens, mouse.dy += ry * padSens;
      }
      if (rt && (mouse.l = !0), rtJust && pressed.add("ML"), lt2 && (mouse.r = !0), ltJust && pressed.add("MR"), (Math.abs(lx) > 0 || Math.abs(ly) > 0) && (gpWish = add(scale(fwd(), -ly), scale(right(), lx))), isB(10) && keys.add("ShiftLeft"), isB(11) && keys.add("ControlLeft"), isB(0) && (keys.add("Space"), justB(0) && pressed.add("Space")), justB(1) && (pressed.add("KeyZ"), P.editing && (P.editing = null)), justB(2) && (pressed.add("KeyE"), pressed.add("KeyR")), justB(3) && (P.build ? pressed.add("KeyX") : (P.slot = P.slot === -1 ? 0 : -1, P.build = !1, rumble(40, 0.2, 0.2))), justB(4))
        if (P.build) {
          let pcs = ["wall", "floor", "ramp", "pyramid"], i = pcs.indexOf(P.piece);
          P.piece = pcs[(i + 3) % 4], rumble(40, 0.2, 0.2);
        } else {
          let n = P.inv.length;
          P.slot = P.slot < 0 ? 0 : (P.slot + n - 1) % n, P.build = !1, rumble(40, 0.2, 0.2);
        }
      if (justB(5))
        if (P.build) {
          let pcs = ["wall", "floor", "ramp", "pyramid"], i = pcs.indexOf(P.piece);
          P.piece = pcs[(i + 1) % 4], rumble(40, 0.2, 0.2);
        } else {
          let n = P.inv.length;
          P.slot = P.slot < 0 ? 0 : (P.slot + 1) % n, P.build = !1, rumble(40, 0.2, 0.2);
        }
      justB(12) && pressed.add("KeyM"), justB(13) && pressed.add("KeyB"), justB(14) && P.build && pressed.add("MR"), justB(15) && P.build && (P.rampRot = (P.rampRot + 1) % 4, rumble(40, 0.2, 0.2)), justB(8) && pressed.add("KeyM"), justB(9) && (P.state === "lobby" ? $("btnPlay").click() : toggleDbg()), P.state === "lobby" && (justB(0) || justB(9)) && (AC ?? (AC = new AudioContext()), startMatch(), rumble(180, 0.5, 0.5)), P.state === "lobby" && (justB(1) || justB(3)) && ($("btnSkin").click(), rumble(80, 0.3, 0.3));
    }
    if (P.state === "lobby" && GALLERY) {
      let names = GALLERY.split(","), n = names.length, sp = 6, ang = +(new URLSearchParams(location.search).get("ang") || 0.6), dist = (5 + n * 2.2) / Math.min(1, aspect), cam = [Math.sin(ang) * dist, 3 + n * 0.4, Math.cos(ang) * dist];
      VP = mul(perspective(0.7, aspect, 0.1, 300), lookAt(cam, [0, 1.6, 0])), R.draw(M.pad, trs([0, -0.4, 0], 0, 0, [n * 1.6, 1, 2])), names.forEach((nm, i) => {
        let x = (i - (n - 1) / 2) * sp;
        if (nm.startsWith("skin")) drawChar(CHARS[+nm.slice(4) % CHARS.length], trs([x, 0, 0], ang), { anim: 0, speed: 0, grounded: !0, pitch: 0, pose: "lobby" });
        else if (nm.startsWith("house")) {
          let idx = +nm.slice(5);
          R.draw(W.houseMeshes[idx % W.houseMeshes.length], trs([x, 0, 0], ang, 0, 0.35));
        } else M[nm] && R.draw(M[nm], trs([x, 0, 0], ang * 2, 0, nm === "bus" || nm === "balloon" ? 0.4 : 1));
      }), R.flush({ pos: cam, fwd: norm(sub([0, 1.6, 0], cam)), fov: 0.7, aspect }, VP, norm([0.3, 0.8, 0.6]), [0, 0, 0], t, !0, 20 + n * 3), pressed.clear(), requestAnimationFrame(frame);
      return;
    }
    if (P.state === "lobby") {
      let a = t * 0.25, cam = [Math.sin(a) * 0.4, 1.5, 7.2];
      VP = mul(perspective(0.55, aspect, 0.1, 100), lookAt(cam, [0, 1.25, 0]));
      let ch = P.skin === 0 ? LOBBY_CHAR : CHARS[P.skin];
      R.draw(M.pad, trs([0, -0.4, 0]), [1, 1, 1]), R.draw(M.pad, trs([-4.2, -0.6, -1.5])), R.draw(M.pad, trs([4, -0.6, -1.5])), R.draw(M.pad, trs([6.5, -0.7, -2.5])), drawChar(ch, trs([0, 0, 0], Math.sin(t * 0.5) * 0.08), { anim: 0, speed: 0, grounded: !0, pitch: 0, pose: "lobby" }), R.flush({ pos: cam, fwd: norm(sub([0, 1.35, 0], cam)), fov: 0.55, aspect }, VP, norm([0.3, 0.8, 0.6]), [0, 0, 0], t, !1, 12), pressed.clear(), requestAnimationFrame(frame);
      return;
    }
    let sens = 32e-4 * (P.scoped ? S.scopeSens : P.ads ? S.adsSens : 1);
    if (P.yaw -= mouse.dx * sens * S.sensX, P.pitch = clamp(P.pitch - mouse.dy * sens * S.sensY * (S.invertY ? -1 : 1), -1.5, 1.5), mouse.dx = mouse.dy = 0, key("KeyL")) {
      toLobby(), pressed.clear(), requestAnimationFrame(frame);
      return;
    }
    if (key("F8") && toggleDbg(), P.over && (mouse.l = !1), updateEvents(dt), updateNades(dt), key("KeyM") && (H.bigmap.style.display = H.bigmap.style.display === "flex" ? "none" : "flex"), key("KeyB") && P.state === "play" && !P.dead && (EW.style.display === "flex" ? (EW.style.display = "none", startEmote(lastEmote)) : (EW.style.display = "flex", document.exitPointerLock())), P.stunT > 0 && (P.stunT -= dt, P.emoteT = Math.max(P.emoteT, 0.1), keys.delete("KeyW"), keys.delete("KeyA"), keys.delete("KeyS"), keys.delete("KeyD"), mouse.l = !1), P.emoteT > 0 && (P.emoteT -= dt, P.stunT <= 0 && (Math.hypot(P.vel[0], P.vel[2]) > 1 || mouse.l) && (P.emoteT = 0)), key("KeyT") && (P.thirdPerson = !P.thirdPerson), P.matchT += dt, storm.phaseT = Math.max(0, storm.phaseT - dt), storm.shrinking) {
      let k = 1 - storm.phaseT / storm.shrinkT;
      storm.r = lerp(storm.from.r, storm.to.r, k), storm.c = [lerp(storm.from.c[0], storm.to.c[0], k), lerp(storm.from.c[1], storm.to.c[1], k)], storm.phaseT <= 0 && (storm.shrinking = !1, storm.phaseT = PHASES[Math.min(storm.phase, PHASES.length - 1)][0]);
    } else storm.phaseT <= 0 && nextStormPhase();
    if (bannerT > 0 && (bannerT -= dt, bannerT <= 0 && (H.banner.style.display = "none")), P.matchT > 20 && Math.random() < dt * 0.12 && P.alive > bots.filter((b) => !b.dead).length + 1 && (P.alive--, addFeed(`${botName()} eliminated <span class="v">${botName()}</span>`)), bus.t < bus.dur) {
      bus.t = Math.min(bus.dur, bus.t + dt);
      let k = bus.t / bus.dur;
      bus.pos = add(bus.a, scale(sub(bus.b, bus.a), k));
    }
    if (P.state === "bus") {
      if (P.pos = [bus.pos[0], bus.pos[1] + 3, bus.pos[2]], P.vel = [0, 0, 0], key("KeyB") && !P.thanked) {
        P.thanked = !0, addFeed('<span class="me">Player</span> has thanked the bus driver');
        for (let i = 0; i < 3; i++) setTimeout(() => addFeed(`${botName()} has thanked the bus driver`), 400 + i * 700);
      }
      (key("Space") && bus.t > 4 || bus.t >= bus.dur) && (P.state = "sky", P.vel = [Math.sin(bus.yaw) * 8, -5, Math.cos(bus.yaw) * 8], P.pos = [bus.pos[0], bus.pos[1] - 1, bus.pos[2]], beep(300, 0.3, "sine", 0.05, -200));
    } else {
      let wish = [0, 0, 0];
      keys.has("KeyW") && (wish = add(wish, fwd())), keys.has("KeyS") && (wish = sub(wish, fwd())), keys.has("KeyD") && (wish = add(wish, right())), keys.has("KeyA") && (wish = sub(wish, right())), len(gpWish) > 0 && (wish = add(wish, gpWish)), len(wish) > 0 && (wish = norm(wish)), P.crouch = P.state === "play" && keys.has("ControlLeft"), P.sprint = keys.has("ShiftLeft") && !P.crouch;
      let gAbove = P.pos[1] - W.groundH(P.pos[0], P.pos[2], P.pos[1]);
      if (P.state === "sky")
        P.vel[1] = Math.max(P.vel[1] - 30 * dt, keys.has("KeyW") ? -55 : -35), P.vel[0] = lerp(P.vel[0], wish[0] * 18, 0.03), P.vel[2] = lerp(P.vel[2], wish[2] * 18, 0.03), (gAbove < 55 || key("Space")) && (P.state = "glide", beep(800, 0.2, "sine", 0.06, -300));
      else if (P.state === "glide") {
        P.vel[1] = lerp(P.vel[1], -5.5, 0.05);
        let f = fwd();
        P.vel[0] = lerp(P.vel[0], f[0] * 11 + wish[0] * 4, 0.05), P.vel[2] = lerp(P.vel[2], f[2] * 11 + wish[2] * 4, 0.05);
      } else if (P.swim && !D.fly) {
        let spd = P.sprint ? 5 : 3.8;
        P.vel[0] = lerp(P.vel[0], wish[0] * spd, 0.08), P.vel[2] = lerp(P.vel[2], wish[2] * spd, 0.08), P.vel[1] = lerp(P.vel[1], (-1.25 - P.pos[1]) * 4, 0.15), key("Space") && (P.vel[1] = 5), P.build = !1, P.editing = null;
      } else {
        let spd = D.fly ? 22 : P.crouch ? 3 : P.sprint ? 8.5 : 5.5, accel = P.grounded || D.fly ? 14 : 4;
        P.vel[0] = lerp(P.vel[0], wish[0] * spd, 1 - Math.exp(-accel * dt)), P.vel[2] = lerp(P.vel[2], wish[2] * spd, 1 - Math.exp(-accel * dt)), D.fly ? P.vel[1] = lerp(P.vel[1], (keys.has("Space") ? 14 : 0) - (keys.has("ControlLeft") ? 14 : 0), 0.2) : (P.vel[1] -= (D.lowGrav ? 8 : 26) * dt, key("Space") && P.grounded && (P.vel[1] = D.lowGrav ? 7 : 9.5, P.grounded = !1));
      }
      P.grounded = !1, moveAndCollide(dt), P.swim = P.state === "play" && terrainH(P.pos[0], P.pos[2]) < -1.5 && P.pos[1] < -0.9, P.anim += dt * (len([P.vel[0], 0, P.vel[2]]) > 0.5 && P.grounded ? Math.hypot(P.vel[0], P.vel[2]) * 1.6 : 0), P.hurtCd -= dt, Math.hypot(P.pos[0] - storm.c[0], P.pos[2] - storm.c[1]) > storm.r && P.hurtCd <= 0 && (damage(storm.phase > 3 ? 5 : storm.phase > 1 ? 2 : 1, "The storm"), P.hurtCd = 1);
    }
    if (P.dead) {
      let best = null, bd = 1e9;
      for (let b of bots) if (!b.dead && b.state === "ground") {
        let d = len(sub(b.pos, P.pos));
        d < bd && (bd = d, best = b);
      }
      best && (P.pos = [...best.pos], P.yaw = best.yaw);
    }
    let head = add(P.pos, [0, eyeH(), 0]);
    camFwd = look();
    let baseFov = 2 * Math.atan(Math.tan(S.fov * Math.PI / 360) / Math.max(1, aspect));
    fov = P.scoped ? 0.28 : P.ads ? baseFov * 0.74 : P.sprint ? baseFov * 1.07 : baseFov;
    let want;
    if (P.state === "bus" ? want = add(add(bus.pos, [0, 6, 0]), scale(camFwd, -34)) : P.state === "sky" || P.state === "glide" ? want = add(add(head, scale(camFwd, -7)), [0, 1.5, 0]) : want = P.ads ? add(add(head, scale(camFwd, -2.2)), add(scale(right(), 0.85), [0, 0.35, 0])) : add(add(head, scale(camFwd, -3.6)), add(scale(right(), 0.72), [0, 0.6, 0])), (P.thirdPerson || P.state !== "play") && !P.scoped) {
      let d = sub(want, head), dist = len(d), hit = P.state === "play" ? W.raycast(head, norm(d), dist) : null, c = hit ? add(head, scale(norm(d), Math.max(0.3, hit.t - 0.3))) : want;
      camPos[0] = c[0], camPos[1] = c[1], camPos[2] = c[2];
    } else
      camPos[0] = head[0], camPos[1] = head[1], camPos[2] = head[2];
    VP = mul(perspective(fov, aspect, 0.1, 1500), lookAt(camPos, add(camPos, camFwd)));
    let it = curItem();
    if (P.state === "play" && !P.over && !P.dead && !dbgOpen()) {
      key("KeyZ") && (P.build = !P.build);
      for (let [k, p] of [["KeyQ", "wall"], ["KeyG", "floor"], ["KeyF", "ramp"], ["AltLeft", "pyramid"]]) key(k) && (P.piece = p, P.build = !0);
      key("Backquote") && (P.slot = -1, P.build = !1);
      for (let i = 0; i < 5; i++) key("Digit" + (i + 1)) && P.slot !== i && (P.slot = i, P.build = !1, P.reload = 0, P.fireCd = 0.35, P.burstLeft = 0);
      if (key("MR") && P.build && !P.editing && (P.mat = P.mat === "wood" ? "stone" : P.mat === "stone" ? "metal" : "wood"), key("KeyR") && P.build && (P.rampRot = (P.rampRot + 1) % 4), P.scoped = !!(it && it.kind === "sniper" && mouse.r && !P.build && !P.swim), P.ads = !!(it && isWeapon(it.kind) && it.kind !== "sniper" && mouse.r && !P.build && !P.swim), P.fireCd -= dt, P.swing -= dt, P.bloom = Math.max(0, P.bloom - dt * 0.05), key("KeyX"))
        if (P.editing)
          P.editing.edit = P.editMask, P.editing = null, beep(900, 0.06, "square", 0.05);
        else {
          let h = W.raycast(camPos, camFwd, 10);
          h && h.kind === "piece" && TILES(h.ref.type) && (P.editing = h.ref, P.editMask = P.editing.edit, P.build = !1);
        }
      if (P.editing) {
        if (key("MR"))
          P.editing.edit = P.editMask, P.editing = null;
        else if (key("KeyR")) P.editMask = 0;
        else if (len(sub(P.editing.pos, P.pos)) > 9 || !W.pieces.has(P.editing.key)) P.editing = null;
        else if (key("ML") || mouse.l && P.fireCd <= 0) {
          let pc = P.editing, h = pc.type === "wall" ? World.rayBox(camPos, camFwd, { min: [pc.pos[0] - 2, pc.pos[1], pc.pos[2] - 2], max: [pc.pos[0] + 2, pc.pos[1] + 4, pc.pos[2] + 2] }, 12) : World.rayBox(camPos, camFwd, { min: [pc.pos[0] - 2, pc.pos[1] - 0.3, pc.pos[2] - 2], max: [pc.pos[0] + 2, pc.pos[1] + 0.3, pc.pos[2] + 2] }, 12);
          if (h) {
            let tile = W.tileAt(pc, add(camPos, scale(camFwd, h.t + 0.05)));
            tile >= 0 && (key("ML") || !(P.editMask & 1 << tile)) && (P.editMask ^= 1 << tile, P.fireCd = 0.12, beep(1200, 0.03, "square", 0.03));
          }
        }
      }
      if (P.reload > 0 && (P.reload -= dt, P.reload <= 0 && it && isWeapon(it.kind))) {
        let w = WEAPONS[it.kind], n = Math.min(w.mag - it.mag, P.ammo[w.ammo]);
        it.mag += n, P.ammo[w.ammo] -= n;
      }
      if (!P.editing) {
        if (!P.swim)
          if (P.build) {
            let bt = buildTarget();
            mouse.l && P.fireCd <= 0 && (P.mats[P.mat] >= 10 || D.infMats) && !W.pieces.has(World.key(bt.type, bt.pos, bt.dir)) && (W.place(bt.type, P.mat, bt.pos, bt.dir), D.infMats || (P.mats[P.mat] -= 10), P.fireCd = 0.12, beep(700, 0.05, "square", 0.04));
          } else if (P.slot < 0 || !it)
            mouse.l && P.swing <= 0.05 && P.fireCd <= 0 && (swingPickaxe(), P.fireCd = 0.45);
          else if (isWeapon(it.kind)) {
            let w = WEAPONS[it.kind];
            (w.auto ? mouse.l : key("ML")) && P.fireCd <= 0 && P.reload <= 0 && (it.mag > 0 ? shoot(it) : P.ammo[w.ammo] > 0 ? P.reload = w.reload : beep(900, 0.05, "square", 0.03)), key("KeyR") && it.mag < w.mag && P.ammo[w.ammo] > 0 && P.reload <= 0 && (P.reload = w.reload);
          } else if (it.kind === "grenade" || it.kind === "boogie" || it.kind === "impulse")
            key("ML") && (nades.push({ pos: add(camPos, scale(camFwd, 1)), vel: add(scale(camFwd, 18), [0, 5, 0]), t: it.kind === "grenade" ? 2.5 : 1.6, by: "Player", kind: it.kind }), --it.count <= 0 && (P.inv[P.slot] = null), P.fireCd = 0.6, beep(500, 0.08, "triangle", 0.05));
          else if (it.kind === "rod") {
            let hw = W.raycast(camPos, camFwd, 25), water = hw && hw.kind === "terrain" && hw.p[1] < -0.2;
            if (key("ML") && water && P.fishing <= 0 && (P.fishing = 2.5, P.useT = 2.5, P.useDur = 2.5, beep(500, 0.1, "sine", 0.05), info("Fishing\u2026")), P.fishing > 0 && (P.fishing -= dt, P.useT = P.fishing, P.fishing <= 0)) {
              let r = Math.random(), k = r < 0.55 ? "fish" : r < 0.75 ? "shotgun" : r < 0.9 ? "ar" : "sniper";
              dropItem(mkItem(k, k === "fish" ? 2 : 1, k === "fish" ? 3 : Math.max(2, Math.floor(rand(2, 5)))), add(P.pos, scale(fwd(), 1.5))), info("Caught a " + (isWeapon(k) ? WEAPONS[k].name : "Flopper") + "!"), beep(800, 0.3, "sine", 0.08, 300);
            }
          } else {
            let c = CONS[it.kind];
            mouse.l ? (P.useT <= 0 && (P.useT = c.dur, P.useDur = c.dur), P.useT -= dt, P.useT <= 0 && (c.use() ? (--it.count <= 0 && (P.inv[P.slot] = null), beep(500, 0.3, "sine", 0.08, 400)) : P.useT = 0)) : P.useT = 0;
          }
      }
      for (let i = items.length - 1; i >= 0; i--) items[i].item.kind === "ammo" && len(sub(items[i].pos, P.pos)) < 1.6 && (P.ammo.light += 18, P.ammo.medium += 12, P.ammo.shells += 4, P.ammo.heavy += 2, items.splice(i, 1), beep(700, 0.06, "sine", 0.05, 200), info("+ ammo"));
      let near = null, nd = 2.4;
      for (let g of items) {
        if (g.item.kind === "ammo") continue;
        let d = len(sub(g.pos, P.pos));
        d < nd && (nd = d, near = g);
      }
      let nearChest = null;
      for (let c of chests) !c.open && len(sub(c.pos, P.pos)) < 2.8 && (nearChest = c);
      if (near ? (H.info.textContent = `[E] ${isWeapon(near.item.kind) ? WEAPONS[near.item.kind].name : CONS[near.item.kind].name}`, H.info.style.display = "block", infoT = Math.max(infoT, 0.05)) : nearChest && (H.info.textContent = "[E] Open chest", H.info.style.display = "block", infoT = Math.max(infoT, 0.05)), key("KeyE")) {
        if (nearChest) {
          nearChest.open = !0, beep(400, 0.4, "triangle", 0.08, 500);
          let pool = ["ar", "burst", "smg", "shotgun", "sniper", "tac", "hunting", "scar", "pistol"];
          dropItem(mkItem(pool[Math.floor(rand(0, pool.length))], 1, nearChest.drop ? 4 : -1), add(nearChest.pos, [0, 0.3, 0]), 1), nearChest.drop && (dropItem(mkItem("rpg", 1, 4), add(nearChest.pos, [0, 0.3, 0]), 1.8), dropItem(mkItem("rod"), add(nearChest.pos, [0, 0.3, 0]), 1.4), dropItem(mkItem("sniper", 1, 4), add(nearChest.pos, [0, 0.3, 0]), 1.6)), dropItem(mkItem(["shieldPot", "bandage", "miniShield", "chug", "grenade", "boogie", "impulse"][Math.floor(rand(0, 7))], 3), add(nearChest.pos, [0, 0.3, 0]), 1.2), P.ammo.medium += 30, P.ammo.light += 30, P.ammo.shells += 5, P.ammo.heavy += 3, P.mats.wood += 30, info("+ ammo, +30 wood");
        } else if (near) {
          let k = near.item.kind;
          if (isWeapon(k)) {
            let a = WEAPONS[k].ammo;
            P.ammo[a] += a === "heavy" ? 5 : a === "shells" ? 10 : 30;
          }
          let same = P.inv.findIndex((s) => s && !isWeapon(s.kind) && s.kind === k);
          if (same >= 0) P.inv[same].count += near.item.count;
          else {
            let s = P.inv.indexOf(null);
            s < 0 && (s = Math.max(0, P.slot), dropItem(P.inv[s], near.pos)), P.inv[s] = near.item, (P.slot < 0 || !P.inv[P.slot]) && (P.slot = s);
          }
          items.splice(items.indexOf(near), 1), P.build = !1, beep(660, 0.08, "sine", 0.06, 200);
        }
      }
    }
    let pf0 = performance.now();
    if (!D.pauseBots) for (let b of bots) updateBot(b, dt);
    PROF.bots += performance.now() - pf0;
    for (let q of W.props) q.dead > 0 && (q.dead -= dt, q.dead <= 0 && (q.dead = 0, q.hp = 250));
    for (let i = fx.length - 1; i >= 0; i--)
      fx[i].t -= dt, fx[i].t <= 0 && fx.splice(i, 1);
    for (let i = feed.length - 1; i >= 0; i--)
      feed[i].t -= dt, feed[i].t <= 0 && feed.splice(i, 1);
    infoT > 0 && (infoT -= dt, infoT <= 0 && (H.info.style.display = "none")), P.weakT = Math.max(0, P.weakT - dt), P.weakT <= 0 && (P.weakPos = null, P.weakRef = null);
    for (let s of W.statics) s.shake && s.shake > 0 && (s.shake = Math.max(0, s.shake - dt));
    pressed.clear();
    let pf1 = performance.now();
    for (let tc of W.terrainChunks) {
      let dx = tc.c[0] - camPos[0], dz = tc.c[2] - camPos[2], dist = Math.hypot(dx, dz);
      P.state === "play" && dist > tc.r && (dist - tc.r > [420, 600, 900][S.viewDist] || dx * camFwd[0] + dz * camFwd[2] < -tc.r) || R.draw(tc.mesh, trs([0, 0, 0]), [1, 1, 1], 1, 5);
    }
    if (P.state === "play" && S.grass > 0) {
      let cx = Math.floor(P.pos[0] / 24), cz = Math.floor(P.pos[2] / 24), gr = S.grass > 1 ? 2 : 1;
      for (let i = -gr; i <= gr; i++) for (let j = -gr; j <= gr; j++) R.draw(W.grassChunk(R, cx + i, cz + j), trs([0, 0, 0]), [1, 1, 1], 1, 5, !1, !0);
    }
    R.draw(M.mountains, trs([0, 0, 0]), [1, 1, 1], 1, 0, !1), R.draw(M.water, trs([0, -0.25, 0]), [1, 1, 1], 0.82, 6, !1);
    let cull = P.state === "play" ? [130, 190, 320][S.viewDist] : 900, vis = (p) => Math.abs(p[0] - camPos[0]) < cull && Math.abs(p[2] - camPos[2]) < cull && (p[0] - camPos[0]) * camFwd[0] + (p[2] - camPos[2]) * camFwd[2] > -18;
    for (let q of W.props) !q.dead && vis(q.pos) && R.draw(M[q.type], trs(q.pos, q.yaw, 0, q.s));
    for (let s of W.statics) if (!s.dead && vis(s.pos)) {
      let sh = s.shake || 0, sp = sh ? [s.pos[0] + Math.sin(t * 95) * sh * 0.12, s.pos[1], s.pos[2] + Math.cos(t * 81) * sh * 0.12] : s.pos;
      R.draw(s.mesh.startsWith("house") ? W.houseMeshes[+s.mesh.slice(5)] : M[s.mesh], trs(sp, s.yaw), [1, 1, 1], 1, 0, s.mesh !== "dash");
    }
    for (let p of W.pieces.values()) {
      if (!vis(p.pos)) continue;
      let age = performance.now() / 1e3 - p.born, k = clamp(age / 0.18, 0, 1), sc = 0.6 + 0.4 * k, mesh = p.edit ? editedMesh(p.type, p.mat, p.edit) : M[`${p.type}_${p.mat}`], tint = k < 1 ? [0.6 + 0.4 * k, 0.8 + 0.2 * k, 1.3 - 0.3 * k] : p.hp < p.maxHp ? [1, 0.7 + 0.3 * p.hp / p.maxHp, 0.7 + 0.3 * p.hp / p.maxHp] : [1, 1, 1];
      R.draw(mesh, mul(trs(p.pos, p.dir * Math.PI / 2), trs([0, 0, 0], 0, 0, [sc, p.type === "wall" ? sc : 1, sc])), tint, 1, MAT_STYLE[p.mat]);
    }
    if (P.editing) {
      let pc = P.editing, n = TILES(pc.type), T = 4 / 3;
      for (let i = 0; i < n; i++) {
        let sel = !!(P.editMask & 1 << i), local, size;
        if (pc.type === "wall") {
          let row = Math.floor(i / 3);
          local = [-2 + (i % 3 + 0.5) * T, (row + 0.5) * T, 0], size = [T * 0.9, T * 0.9, 0.4];
        } else
          local = [i % 2 ? 1 : -1, 0.05, i > 1 ? 1 : -1], size = [1.8, 0.3, 1.8];
        R.draw(M.hitbox, mul(mul(trs(pc.pos, pc.dir * Math.PI / 2), translate(local[0], local[1], local[2])), trs([0, 0, 0], 0, 0, size)), sel ? [0.3, 0.8, 1.4] : [1.2, 1.2, 1.2], sel ? 0.55 : 0.15, 7, !1);
      }
    }
    for (let c of chests)
      R.draw(c.open ? M.chestOpen : M.chest, trs(c.pos, c.yaw), c.open ? [1, 1, 1] : [1.15, 1.1, 0.9]), !c.open && len(sub(c.pos, camPos)) < 60 && R.draw(M.glow, trs(c.pos, 0, 0, 1 + Math.sin(t * 3) * 0.08), [1, 0.85, 0.3], 0.16, 7, !1);
    for (let g of items)
      g.item.kind === "ammo" ? R.draw(M.ammo, trs(g.pos, 0.6, 0, 1.6)) : R.draw(M[g.item.kind], trs(add(g.pos, [0, 0.6 + Math.sin(t * 3) * 0.1, 0]), t * 1.5, 0, 1.3));
    for (let f of fx) if (f.kind === "tracer" && f.to) {
      let d = sub(f.to, f.pos), L = len(d);
      R.draw(M.tracer, trs(f.pos, Math.atan2(d[0], d[2]), -Math.asin(clamp(d[1] / L, -1, 1)), [1, 1, L]), [1, 1, 1], 1, 0, !1);
    }
    for (let d of bots) !d.dead && d.state !== "bus" && Math.abs(d.pos[0] - camPos[0]) < cull && Math.abs(d.pos[2] - camPos[2]) < cull && drawChar(CHARS[d.skin], trs(d.pos, d.yaw), { anim: d.anim, speed: Math.hypot(d.vel[0], d.vel[2]), grounded: d.grounded || d.state !== "ground", pitch: d.pitch, pose: d.emoteT > 0 ? "emote" : d.state === "sky" ? "sky" : d.state === "glide" ? "glide" : d.mode === "crank" || d.mode === "box" || d.mode === "rush" ? "build" : d.weapon && d.enemy ? "aim" : "idle", held: d.state !== "ground" || d.emoteT > 0 || d.mode === "crank" || d.mode === "box" || d.mode === "rush" ? void 0 : d.weapon ?? "pickaxe", emote: d.emote });
    if (P.build) {
      let bt = buildTarget(), ok = P.mats[P.mat] >= 10 && !W.pieces.has(World.key(bt.type, bt.pos, bt.dir));
      R.draw(M[`${bt.type}_${P.mat}`], trs(bt.pos, bt.dir * Math.PI / 2), ok ? [0.5, 1.2, 0.6] : [1.4, 0.5, 0.5], 0.45, MAT_STYLE[P.mat], !1);
    }
    if (P.state === "bus" || bus.t < bus.dur + 30) {
      let bp = P.state === "bus" ? bus.pos : add(bus.a, scale(sub(bus.b, bus.a), Math.min(1, (bus.t + (P.matchT - bus.t)) / bus.dur)));
      R.draw(M.bus, trs(bp, bus.yaw)), R.draw(M.balloon, trs(add(bp, [0, 16, 0]), bus.yaw));
    }
    for (let d of drops) d.landed || (R.draw(M.chest, trs(d.pos, 0, 0, 1.3)), R.draw(M.balloon, trs(add(d.pos, [0, 5.5, 0]), 0, 0, 0.32), [0.4, 0.5, 1]));
    for (let n of nades)
      n.rocket ? R.draw(M.rocket, trs(n.pos, Math.atan2(n.vel[0], n.vel[2]), -Math.asin(clamp(n.vel[1] / len(n.vel), -1, 1)))) : R.draw(M[n.kind ?? "grenade"], trs(n.pos, n.t * 4, n.t * 3));
    for (let m of meteors) R.draw(M.rock, trs(m.pos, t * 3, t * 2, 1.2), [1, 0.5, 0.3]);
    R.draw(M.storm, trs([storm.c[0], 0, storm.c[1]], 0, 0, [storm.r, 1, storm.r]), [0.7, 0.72, 1], 0.22, 7, !1);
    let pose = P.emoteT > 0 ? "emote" : P.state === "sky" ? "sky" : P.state === "glide" ? "glide" : P.swim ? "sky" : P.crouch ? "crouch" : P.build || P.editing ? "build" : P.slot >= 0 && it && it.kind !== "ammo" ? "aim" : "pick", held = P.state !== "play" || P.build || P.editing || P.swim || P.emoteT > 0 ? void 0 : it ? it.kind : "pickaxe";
    if (P.state !== "bus" && !P.dead) {
      let gY = W.groundH(P.pos[0], P.pos[2], P.pos[1]);
      if (R.draw(M.shadow, trs([P.pos[0], gY + 0.03, P.pos[2]]), [1, 1, 1], 0.3, 0, !1), (P.thirdPerson || P.state !== "play") && !P.scoped)
        drawChar(CHARS[P.skin], trs(P.pos, P.yaw), { anim: P.anim, speed: Math.hypot(P.vel[0], P.vel[2]), grounded: P.grounded, pitch: P.pitch, pose, swing: P.swing, held, sprint: P.sprint && Math.hypot(P.vel[0], P.vel[2]) > 6, emote: P.emote });
      else if (!P.build) {
        let hp = add(add(camPos, scale(camFwd, 0.6)), add(scale(right(), -0.3), [0, -0.3 + (P.swing > 0 ? Math.sin(P.swing * 12) * 0.1 : 0), 0]));
        it ? R.draw(M[it.kind], trs(hp, P.yaw, -P.pitch), [1, 1, 1], 1, 0, !1) : R.draw(M.pickaxe, mul(trs(hp, P.yaw, -P.pitch), rotX(1 + (P.swing > 0 ? Math.sin(P.swing * 6.3) * 1.2 : 0))), [1, 1, 1], 1, 0, !1);
      }
    }
    R.shadows = S.shadows, R.scale = S.scale;
    let pf2 = performance.now();
    PROF.submit += pf2 - pf1, R.flush({ pos: camPos, fwd: camFwd, fov, aspect }, VP, sun, P.pos, t, !0, P.state === "play" ? S.shadows > 1 ? 62 : 40 : 180);
    let pf3 = performance.now();
    PROF.flush += pf3 - pf2, drawIcon(SKINS[P.skin]), drawHud(), PROF.hud += performance.now() - pf3, PROF.frames++, gpPrev.clear();
    for (let b of curGpButtons) gpPrev.add(b);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.G = { PROF, nades, P, W, items, bots, mouse, fx, bus, storm, startMatch, D, spawnBot, nextStormPhase, endScreen, damage, dropItem, mkItem, toLobby, addFeed, banner };
})();
