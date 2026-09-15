const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const ident = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function mul(a, b, out = new Float32Array(16)) {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
    out[i * 4 + j] = s;
  }
  return out;
}
const translate = (x, y, z) => {
  const m = ident();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
};
const scaleM = (x, y, z) => {
  const m = ident();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
};
function rotY(a) {
  const c = Math.cos(a), s = Math.sin(a), m = ident();
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}
function rotX(a) {
  const c = Math.cos(a), s = Math.sin(a), m = ident();
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}
function rotZ(a) {
  const c = Math.cos(a), s = Math.sin(a), m = ident();
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}
function trs(p, yaw = 0, pitch = 0, s = 1) {
  const sc = typeof s === "number" ? [s, s, s] : s;
  let m = mul(translate(p[0], p[1], p[2]), rotY(yaw));
  if (pitch) m = mul(m, rotX(pitch));
  return mul(m, scaleM(sc[0], sc[1], sc[2]));
}
function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = 2 * far * near / (near - far);
  return m;
}
function lookAt(eye, target, up = [0, 1, 0]) {
  const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}
function transformPoint(m, p) {
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] || 1;
  return [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w, (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w];
}
function transformDir(m, p) {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
}
function ortho(l, r, b, t, n, f) {
  const m = new Float32Array(16);
  m[0] = 2 / (r - l);
  m[5] = 2 / (t - b);
  m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l);
  m[13] = -(t + b) / (t - b);
  m[14] = -(f + n) / (f - n);
  m[15] = 1;
  return m;
}
export {
  add,
  clamp,
  cross,
  dot,
  ident,
  len,
  lerp,
  lookAt,
  mul,
  norm,
  ortho,
  perspective,
  rand,
  rotX,
  rotY,
  rotZ,
  scale,
  scaleM,
  sub,
  transformDir,
  transformPoint,
  translate,
  trs,
  v3
};
