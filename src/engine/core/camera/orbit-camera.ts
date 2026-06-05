import { lookAt, perspective, type Mat4 } from "../math/mat4";
import { type MutableVec3 } from "../math/vec3";

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
  fov = (45 * Math.PI) / 180;
  near = 0.01;
  far = 100;

  constructor(options: OrbitCameraOptions = {}) {
    this.target = options.target ?? [0, 0, 0];
    this.distance = options.distance ?? 3.2;
    this.minDistance = options.minDistance ?? 1.08;
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
    this.distance = clamp(this.distance * Math.exp(delta), this.minDistance, this.maxDistance);
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
    return lookAt(this.position, this.target, [0, 1, 0]);
  }

  projectionMatrix(aspect: number): Mat4 {
    return perspective(this.fov, aspect, this.near, this.far);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
