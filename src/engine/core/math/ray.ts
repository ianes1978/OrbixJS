import { dot, scale, subtract, type Vec3 } from "./vec3";

export type Ray = {
  origin: Vec3;
  direction: Vec3;
};

export function intersectUnitSphere(ray: Ray): Vec3 | undefined {
  const b = 2 * dot(ray.origin, ray.direction);
  const c = dot(ray.origin, ray.origin) - 1;
  const discriminant = b * b - 4 * c;

  if (discriminant < 0) {
    return undefined;
  }

  const sqrt = Math.sqrt(discriminant);
  const near = (-b - sqrt) / 2;
  const far = (-b + sqrt) / 2;
  const t = near >= 0 ? near : far;

  if (t < 0) {
    return undefined;
  }

  return [
    ray.origin[0] + ray.direction[0] * t,
    ray.origin[1] + ray.direction[1] * t,
    ray.origin[2] + ray.direction[2] * t,
  ];
}

export function directionBetween(a: Vec3, b: Vec3): [number, number, number] {
  const delta = subtract(b, a);
  const length = Math.hypot(delta[0], delta[1], delta[2]) || 1;
  return scale(delta, 1 / length);
}
