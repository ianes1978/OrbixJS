import { lookAt, perspective, type Mat4 } from "../math/mat4";
import { add, cross, length, normalize, scale, subtract, type MutableVec3, type Vec3 } from "../math/vec3";

export type CameraFlyToOptions = {
  lon: number;
  lat: number;
  height?: number;
};

export type OrbitCameraOptions = {
  target?: MutableVec3;
  distance?: number;
  minDistance?: number;
  maxDistance?: number;
  yaw?: number;
  pitch?: number;
};

export class OrbitCamera {
  readonly target: MutableVec3;
  distance: number;
  minDistance: number;
  maxDistance: number;
  yaw: number;
  pitch: number;
  tiltOffset = 0;
  fov = (45 * Math.PI) / 180;
  near = 0.001;
  far = 100;

  constructor(options: OrbitCameraOptions = {}) {
    this.target = options.target ?? [0, 0, 0];
    this.distance = options.distance ?? 3.2;
    this.minDistance = options.minDistance ?? 1.002;
    this.maxDistance = options.maxDistance ?? 10;
    this.yaw = options.yaw ?? -0.65;
    this.pitch = options.pitch ?? 0.35;
  }

  orbit(deltaX: number, deltaY: number): void {
    this.yaw += deltaX;
    this.pitch = clamp(this.pitch + deltaY, -1.42, 1.42);
  }

  dragSensitivityScale(): number {
    const normalizedAltitude = (this.distance - this.minDistance) / (3.2 - this.minDistance);
    return clamp(normalizedAltitude, 0.04, 1);
  }

  zoom(delta: number): void {
    const surfaceDistance = 1;
    const altitude = Math.max(this.distance - surfaceDistance, this.minDistance - surfaceDistance);
    this.distance = clamp(surfaceDistance + altitude * Math.exp(delta), this.minDistance, this.maxDistance);
  }

  tilt(delta: number): void {
    this.tiltOffset = clamp(this.tiltOffset + delta, -1.4, 1.4);
  }

  pan(deltaX: number, deltaY: number): void {
    const forward = normalize(subtract(this.target, this.position));
    const right = safeNormalize(cross(forward, [0, 1, 0]), [1, 0, 0]);
    const up = safeNormalize(cross(right, forward), [0, 1, 0]);
    const altitude = Math.max(this.distance - 1, this.minDistance - 1);
    const normalizedAltitude = clamp(altitude / 2.2, 0, 1);
    const distanceScale = 0.000004 + Math.pow(normalizedAltitude, 1.7) * 0.008;
    const movement = add(scale(right, deltaX * distanceScale), scale(up, deltaY * distanceScale));
    const nextTarget = add(this.target, movement);
    const targetLimit = 0.85;
    const targetLength = length(nextTarget);
    const clampedTarget = targetLength > targetLimit ? scale(normalize(nextTarget), targetLimit) : nextTarget;

    this.target[0] = clampedTarget[0];
    this.target[1] = clampedTarget[1];
    this.target[2] = clampedTarget[2];
  }

  flyTo({ lon, lat, height = 1_000_000 }: CameraFlyToOptions): void {
    const lonRadians = lon * (Math.PI / 180);
    const latRadians = lat * (Math.PI / 180);
    const cosLat = Math.cos(latRadians);
    const direction = [
      cosLat * Math.cos(lonRadians),
      Math.sin(latRadians),
      -cosLat * Math.sin(lonRadians),
    ] as const;

    this.yaw = Math.atan2(direction[0], direction[2]);
    this.pitch = clamp(Math.asin(direction[1]), -1.42, 1.42);
    this.tiltOffset = 0;
    this.distance = clamp(1 + height / 6_378_137, this.minDistance, this.maxDistance);
  }

  get position(): MutableVec3 {
    const cosPitch = Math.cos(this.pitch);
    return [
      this.target[0] + Math.sin(this.yaw) * cosPitch * this.distance,
      this.target[1] + Math.sin(this.pitch) * this.distance,
      this.target[2] + Math.cos(this.yaw) * cosPitch * this.distance,
    ];
  }

  viewMatrix(): Mat4 {
    return lookAt(this.position, this.lookTarget(), [0, 1, 0]);
  }

  projectionMatrix(aspect: number): Mat4 {
    return perspective(this.fov, aspect, this.near, this.far);
  }

  private lookTarget(): MutableVec3 {
    if (this.tiltOffset === 0) {
      return this.target;
    }

    const position = this.position;
    const forward = normalize(subtract(this.target, position));
    const right = safeNormalize(cross(forward, [0, 1, 0]), [1, 0, 0]);
    const up = safeNormalize(cross(right, forward), [0, 1, 0]);
    return add(this.target, scale(up, this.tiltOffset * this.distance * 0.45));
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeNormalize(value: Vec3, fallback: MutableVec3): MutableVec3 {
  return length(value) === 0 ? fallback : normalize(value);
}
