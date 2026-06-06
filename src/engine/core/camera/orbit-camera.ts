import { lookAt, perspective, type Mat4 } from "../math/mat4";
import { type Ray } from "../math/ray";
import { add, cross, dot, length, normalize, scale, subtract, type MutableVec3, type Vec3 } from "../math/vec3";

export type CameraFlyToOptions = {
  lon: number;
  lat: number;
  height?: number;
};

export type CameraSnapshot = {
  target: MutableVec3;
  distance: number;
  minDistance: number;
  maxDistance: number;
  yaw: number;
  pitch: number;
  tiltOffset: number;
  fov: number;
  near: number;
  far: number;
  position: MutableVec3;
};

export type OrbitCameraOptions = {
  target?: MutableVec3;
  distance?: number;
  minDistance?: number;
  maxDistance?: number;
  yaw?: number;
  pitch?: number;
};

export type GrabbedPointMoveOptions = {
  strength?: number;
  maxStep?: number;
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
  near = 0.000005;
  far = 20;

  constructor(options: OrbitCameraOptions = {}) {
    this.target = options.target ?? [0, 0, 0];
    this.distance = options.distance ?? 3.2;
    this.minDistance = options.minDistance ?? 1.00002;
    this.maxDistance = options.maxDistance ?? 10;
    this.yaw = options.yaw ?? -0.65;
    this.pitch = options.pitch ?? 0.35;
  }

  orbit(deltaX: number, deltaY: number): void {
    this.yaw += deltaX;
    this.pitch = clamp(this.pitch + deltaY, -1.42, 1.42);
    this.keepAboveSurface();
  }

  rotateSurfacePointTo(from: Vec3, to: Vec3, maxAngle = Number.POSITIVE_INFINITY): void {
    const source = normalize(from);
    const target = normalize(to);
    const axis = cross(source, target);
    const axisLength = length(axis);

    if (axisLength < 1e-8) {
      return;
    }

    const angle = Math.min(maxAngle, Math.atan2(axisLength, clamp(dot(source, target), -1, 1)));
    const rotationAxis = scale(axis, 1 / axisLength);
    const currentPosition = this.position;
    const nextTarget = rotateAroundAxis(this.target, rotationAxis, angle);
    const nextPosition = rotateAroundAxis(currentPosition, rotationAxis, angle);
    const nextDirection = normalize(subtract(nextPosition, nextTarget));

    this.target[0] = nextTarget[0];
    this.target[1] = nextTarget[1];
    this.target[2] = nextTarget[2];
    this.distance = clamp(
      length(subtract(nextPosition, nextTarget)),
      surfaceExitDistance(nextTarget, nextDirection, this.minDistance),
      this.maxDistance,
    );
    this.yaw = Math.atan2(nextDirection[0], nextDirection[2]);
    this.pitch = clamp(Math.asin(nextDirection[1]), -1.42, 1.42);
  }

  moveGrabbedPointToRay(point: Vec3, ray: Ray, options: GrabbedPointMoveOptions = {}): boolean {
    const rayDistance = dot(subtract(point, ray.origin), ray.direction);

    if (!Number.isFinite(rayDistance) || rayDistance <= 0) {
      return false;
    }

    const closestPoint = add(ray.origin, scale(ray.direction, rayDistance));
    const correction = this.limitTargetOffset(subtract(point, closestPoint));
    const correctionLength = length(correction);

    if (!Number.isFinite(correctionLength)) {
      return false;
    }

    if (correctionLength < 1e-10) {
      return true;
    }

    const strength = clamp(options.strength ?? 1, 0, 1);
    const maxStep = Math.max(0, options.maxStep ?? Number.POSITIVE_INFINITY);
    const stepLength = Math.min(correctionLength * strength, maxStep);
    const offset = scale(correction, stepLength / correctionLength);
    const nextTarget = add(this.target, offset);
    const nextPosition = add(this.position, offset);
    const nextPositionLength = length(nextPosition);

    this.target[0] = nextTarget[0];
    this.target[1] = nextTarget[1];
    this.target[2] = nextTarget[2];

    if (nextPositionLength < this.minDistance) {
      this.distance += this.minDistance - nextPositionLength;
    }

    return true;
  }

  dragSensitivityScale(): number {
    const normalizedAltitude = (this.distance - this.minDistance) / (3.2 - this.minDistance);
    return interactionAltitudeScale(normalizedAltitude, 0.002, 1);
  }

  zoom(delta: number): void {
    const direction = this.orbitDirection();
    const surfaceDistance = surfaceExitDistance(this.target, direction);
    const minAllowedDistance = surfaceExitDistance(this.target, direction, this.minDistance);
    const altitude = Math.max(this.distance - surfaceDistance, minAllowedDistance - surfaceDistance);
    this.distance = clamp(surfaceDistance + altitude * Math.exp(delta), minAllowedDistance, this.maxDistance);
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
    const distanceScale = interactionAltitudeScale(normalizedAltitude, 0.00000015, 0.008);
    const movement = add(scale(right, deltaX * distanceScale), scale(up, deltaY * distanceScale));
    const nextTarget = add(this.target, movement);
    const targetLimit = 0.85;
    const targetLength = length(nextTarget);
    const clampedTarget = targetLength > targetLimit ? scale(normalize(nextTarget), targetLimit) : nextTarget;
    const direction = this.orbitDirection();

    this.target[0] = clampedTarget[0];
    this.target[1] = clampedTarget[1];
    this.target[2] = clampedTarget[2];
    this.distance = clamp(this.distance, surfaceExitDistance(this.target, direction, this.minDistance), this.maxDistance);
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
    this.target[0] = 0;
    this.target[1] = 0;
    this.target[2] = 0;
    this.distance = clamp(1 + height / 6_378_137, this.minDistance, this.maxDistance);
  }

  snapshot(): CameraSnapshot {
    return {
      target: [...this.target],
      distance: this.distance,
      minDistance: this.minDistance,
      maxDistance: this.maxDistance,
      yaw: this.yaw,
      pitch: this.pitch,
      tiltOffset: this.tiltOffset,
      fov: this.fov,
      near: this.near,
      far: this.far,
      position: this.position,
    };
  }

  restoreSnapshot(snapshot: CameraSnapshot): void {
    this.target[0] = snapshot.target[0];
    this.target[1] = snapshot.target[1];
    this.target[2] = snapshot.target[2];
    this.minDistance = snapshot.minDistance;
    this.maxDistance = snapshot.maxDistance;
    this.distance = clamp(snapshot.distance, this.minDistance, this.maxDistance);
    this.yaw = snapshot.yaw;
    this.pitch = clamp(snapshot.pitch, -1.42, 1.42);
    this.tiltOffset = clamp(snapshot.tiltOffset, -1.4, 1.4);
    this.fov = snapshot.fov;
    this.near = snapshot.near;
    this.far = snapshot.far;
    this.keepAboveSurface();
  }

  get position(): MutableVec3 {
    const cosPitch = Math.cos(this.pitch);
    return [
      this.target[0] + Math.sin(this.yaw) * cosPitch * this.distance,
      this.target[1] + Math.sin(this.pitch) * this.distance,
      this.target[2] + Math.cos(this.yaw) * cosPitch * this.distance,
    ];
  }

  get geocentricDistance(): number {
    return length(this.position);
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

  private orbitDirection(): MutableVec3 {
    const cosPitch = Math.cos(this.pitch);
    return [Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), Math.cos(this.yaw) * cosPitch];
  }

  private keepAboveSurface(): void {
    this.distance = clamp(this.distance, surfaceExitDistance(this.target, this.orbitDirection(), this.minDistance), this.maxDistance);
  }

  private limitTargetOffset(offset: Vec3): MutableVec3 {
    const nextTarget = add(this.target, offset);
    const targetLimit = 0.95;
    const nextTargetLength = length(nextTarget);

    if (nextTargetLength <= targetLimit) {
      return [offset[0], offset[1], offset[2]];
    }

    const currentTargetLength = length(this.target);

    if (currentTargetLength >= targetLimit) {
      return [0, 0, 0];
    }

    const limitedTarget = scale(normalize(nextTarget), targetLimit);
    return subtract(limitedTarget, this.target);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function interactionAltitudeScale(normalizedAltitude: number, min: number, max: number): number {
  const t = clamp((normalizedAltitude - 0.06) / 0.94, 0, 1);
  return min + Math.pow(t, 1.35) * (max - min);
}

function rotateAroundAxis(value: Vec3, axis: Vec3, angle: number): MutableVec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const parallel = scale(axis, dot(axis, value) * (1 - cos));
  const perpendicular = scale(cross(axis, value), sin);

  return add(add(scale(value, cos), perpendicular), parallel);
}

function surfaceExitDistance(origin: Vec3, direction: Vec3, radius = 1): number {
  const b = 2 * dot(origin, direction);
  const c = dot(origin, origin) - radius * radius;
  const discriminant = b * b - 4 * c;

  if (discriminant < 0) {
    return radius;
  }

  const sqrt = Math.sqrt(discriminant);
  const near = (-b - sqrt) / 2;
  const far = (-b + sqrt) / 2;
  const exit = Math.max(near, far);

  return exit > 0 ? exit : radius;
}

function safeNormalize(value: Vec3, fallback: MutableVec3): MutableVec3 {
  return length(value) === 0 ? fallback : normalize(value);
}
