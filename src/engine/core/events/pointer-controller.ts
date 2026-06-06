import { OrbitCamera } from "../camera/orbit-camera";
import { add, dot, normalize, scale, type Vec3 } from "../math/vec3";

export type PointerControllerOptions = {
  pickSurfacePoint?: (clientX: number, clientY: number) => Vec3 | undefined;
};

export class PointerController {
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private lastPinchDistance: number | undefined;
  private surfaceDragPoint: Vec3 | undefined;
  private smoothedSurfacePoint: Vec3 | undefined;
  private readonly pointers = new Map<number, { x: number; y: number }>();

  constructor(
    private readonly element: HTMLElement,
    private readonly camera: OrbitCamera,
    private readonly options: PointerControllerOptions = {},
  ) {
    this.element.addEventListener("pointerdown", this.onPointerDown);
    this.element.addEventListener("pointermove", this.onPointerMove);
    this.element.addEventListener("pointerup", this.onPointerUp);
    this.element.addEventListener("pointercancel", this.onPointerUp);
    this.element.addEventListener("wheel", this.onWheel, { passive: false });
  }

  destroy(): void {
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("pointercancel", this.onPointerUp);
    this.element.removeEventListener("wheel", this.onWheel);
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.dragging = this.pointers.size === 1;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.surfaceDragPoint = this.pickSurfaceDragPoint(event);
    this.smoothedSurfacePoint = undefined;
    this.element.setPointerCapture(event.pointerId);

    if (this.pointers.size >= 2) {
      this.lastPinchDistance = this.pinchDistance();
      this.dragging = false;
      this.surfaceDragPoint = undefined;
      this.smoothedSurfacePoint = undefined;
    }
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (this.pointers.has(event.pointerId)) {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (this.pointers.size >= 2) {
      const distance = this.pinchDistance();

      if (distance !== undefined && this.lastPinchDistance !== undefined && distance > 0) {
        this.camera.zoom(Math.log(this.lastPinchDistance / distance));
      }

      this.lastPinchDistance = distance;
      return;
    }

    if (!this.dragging) {
      return;
    }

    const deltaX = event.clientX - this.lastX;
    const deltaY = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    const dragScale = this.camera.dragSensitivityScale();

    if (event.altKey) {
      this.surfaceDragPoint = undefined;
      this.smoothedSurfacePoint = undefined;
      this.camera.tilt(deltaY * 0.005);
      return;
    }

    if (event.shiftKey) {
      this.surfaceDragPoint = undefined;
      this.smoothedSurfacePoint = undefined;
      this.camera.pan(-deltaX, deltaY);
      return;
    }

    if (this.surfaceDragPoint) {
      const currentSurfacePoint = this.pickSurfaceDragPoint(event);

      if (currentSurfacePoint) {
        const smoothedSurfacePoint = this.smoothSurfacePoint(currentSurfacePoint);

        this.camera.rotateSurfacePointTo(smoothedSurfacePoint, this.surfaceDragPoint, 0.018 + dragScale * 0.055);
        return;
      }

      return;
    }

    const sensitivity = 0.006 * dragScale;
    this.camera.orbit(-deltaX * sensitivity, deltaY * sensitivity);
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    this.lastPinchDistance = this.pointers.size >= 2 ? this.pinchDistance() : undefined;
    this.dragging = this.pointers.size === 1;
    this.surfaceDragPoint = undefined;
    this.smoothedSurfacePoint = undefined;

    if (this.dragging) {
      const remaining = [...this.pointers.values()][0];

      if (remaining) {
        this.lastX = remaining.x;
        this.lastY = remaining.y;
        this.surfaceDragPoint = this.options.pickSurfacePoint?.(remaining.x, remaining.y);
        this.smoothedSurfacePoint = undefined;
      }
    }

    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
  };

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.surfaceDragPoint = undefined;
    this.smoothedSurfacePoint = undefined;
    this.camera.zoom(event.deltaY * 0.001);
  };

  private pickSurfaceDragPoint(event: PointerEvent): Vec3 | undefined {
    return this.options.pickSurfacePoint?.(event.clientX, event.clientY);
  }

  private smoothSurfacePoint(point: Vec3): Vec3 {
    const previous = this.smoothedSurfacePoint;

    if (!previous || dot(previous, point) < 0.985) {
      this.smoothedSurfacePoint = point;
      return point;
    }

    const smoothed = normalize(add(scale(previous, 0.58), scale(point, 0.42)));

    this.smoothedSurfacePoint = smoothed;
    return smoothed;
  }

  private pinchDistance(): number | undefined {
    const pointers = [...this.pointers.values()];
    const first = pointers[0];
    const second = pointers[1];

    if (!first || !second) {
      return undefined;
    }

    return Math.hypot(second.x - first.x, second.y - first.y);
  }
}
