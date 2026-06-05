export type Vec3 = readonly [number, number, number];
export type MutableVec3 = [number, number, number];

export function vec3(x = 0, y = 0, z = 0): MutableVec3 {
  return [x, y, z];
}

export function add(a: Vec3, b: Vec3): MutableVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subtract(a: Vec3, b: Vec3): MutableVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(v: Vec3, scalar: number): MutableVec3 {
  return [v[0] * scalar, v[1] * scalar, v[2] * scalar];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): MutableVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function normalize(v: Vec3): MutableVec3 {
  const len = length(v);

  if (len === 0) {
    return [0, 0, 0];
  }

  return [v[0] / len, v[1] / len, v[2] / len];
}

export function distance(a: Vec3, b: Vec3): number {
  return length(subtract(a, b));
}
