import { lookAt, perspective, type Mat4 } from "../math/mat4";
import { type MutableVec3 } from "../math/vec3";

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
    this.minDistance = options.minDistance ?? 1.35;
    this.maxDistance = options.maxDistance ?? 10;
    this.yaw = options.yaw ?? -0.65;
    this.pitch = options.pitch ?? 0.35;
  }

  orbit(deltaX: number, deltaY: number): void {
    this.yaw += deltaX;
    this.pitch = clamp(this.pitch + deltaY, -1.42, 1.42);
  }

  zoom(delta: number): void {
    this.distance = clamp(this.distance * Math.exp(delta), this.minDistance, this.maxDistance);
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
