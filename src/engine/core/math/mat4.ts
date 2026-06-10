import { cross, dot, normalize, subtract, type Vec3 } from "./vec3";

export type Mat4 = Float64Array;

export function identity(): Mat4 {
  return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function perspective(fovyRadians: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovyRadians / 2);
  const rangeInv = 1 / (near - far);

  return new Float64Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (near + far) * rangeInv,
    -1,
    0,
    0,
    near * far * rangeInv * 2,
    0,
  ]);
}

export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const z = normalize(subtract(eye, target));
  const x = normalize(cross(up, z));
  const y = cross(z, x);

  return new Float64Array([
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -dot(x, eye),
    -dot(y, eye),
    -dot(z, eye),
    1,
  ]);
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16);

  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[0 * 4 + row] * b[column * 4 + 0] +
        a[1 * 4 + row] * b[column * 4 + 1] +
        a[2 * 4 + row] * b[column * 4 + 2] +
        a[3 * 4 + row] * b[column * 4 + 3];
    }
  }

  return out;
}

export function invert(m: Mat4): Mat4 {
  const out = new Float64Array(16);
  const b00 = m[0] * m[5] - m[1] * m[4];
  const b01 = m[0] * m[6] - m[2] * m[4];
  const b02 = m[0] * m[7] - m[3] * m[4];
  const b03 = m[1] * m[6] - m[2] * m[5];
  const b04 = m[1] * m[7] - m[3] * m[5];
  const b05 = m[2] * m[7] - m[3] * m[6];
  const b06 = m[8] * m[13] - m[9] * m[12];
  const b07 = m[8] * m[14] - m[10] * m[12];
  const b08 = m[8] * m[15] - m[11] * m[12];
  const b09 = m[9] * m[14] - m[10] * m[13];
  const b10 = m[9] * m[15] - m[11] * m[13];
  const b11 = m[10] * m[15] - m[11] * m[14];
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  if (det === 0) {
    throw new Error("Matrix is not invertible");
  }

  const invDet = 1 / det;
  out[0] = (m[5] * b11 - m[6] * b10 + m[7] * b09) * invDet;
  out[1] = (-m[1] * b11 + m[2] * b10 - m[3] * b09) * invDet;
  out[2] = (m[13] * b05 - m[14] * b04 + m[15] * b03) * invDet;
  out[3] = (-m[9] * b05 + m[10] * b04 - m[11] * b03) * invDet;
  out[4] = (-m[4] * b11 + m[6] * b08 - m[7] * b07) * invDet;
  out[5] = (m[0] * b11 - m[2] * b08 + m[3] * b07) * invDet;
  out[6] = (-m[12] * b05 + m[14] * b02 - m[15] * b01) * invDet;
  out[7] = (m[8] * b05 - m[10] * b02 + m[11] * b01) * invDet;
  out[8] = (m[4] * b10 - m[5] * b08 + m[7] * b06) * invDet;
  out[9] = (-m[0] * b10 + m[1] * b08 - m[3] * b06) * invDet;
  out[10] = (m[12] * b04 - m[13] * b02 + m[15] * b00) * invDet;
  out[11] = (-m[8] * b04 + m[9] * b02 - m[11] * b00) * invDet;
  out[12] = (-m[4] * b09 + m[5] * b07 - m[6] * b06) * invDet;
  out[13] = (m[0] * b09 - m[1] * b07 + m[2] * b06) * invDet;
  out[14] = (-m[12] * b03 + m[13] * b01 - m[14] * b00) * invDet;
  out[15] = (m[8] * b03 - m[9] * b01 + m[10] * b00) * invDet;
  return out;
}

export function transformPoint(m: Mat4, point: Vec3): [number, number, number] {
  const x = point[0];
  const y = point[1];
  const z = point[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}
