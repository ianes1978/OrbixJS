import { OrbitCamera } from "../camera/orbit-camera";

export class PointerController {
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private lastPinchDistance: number | undefined;
  private readonly pointers = new Map<number, { x: number; y: number }>();

  constructor(
    private readonly element: HTMLElement,
    private readonly camera: OrbitCamera,
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
    this.element.setPointerCapture(event.pointerId);

    if (this.pointers.size >= 2) {
      this.lastPinchDistance = this.pinchDistance();
      this.dragging = false;
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

    if (event.altKey) {
      this.camera.tilt(deltaY * 0.005);
      return;
    }

    if (event.shiftKey) {
      this.camera.pan(-deltaX, deltaY);
      return;
    }

    const sensitivity = 0.006 * this.camera.dragSensitivityScale();
    this.camera.orbit(-deltaX * sensitivity, deltaY * sensitivity);
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    this.lastPinchDistance = this.pointers.size >= 2 ? this.pinchDistance() : undefined;
    this.dragging = this.pointers.size === 1;

    if (this.dragging) {
      const remaining = [...this.pointers.values()][0];

      if (remaining) {
        this.lastX = remaining.x;
        this.lastY = remaining.y;
      }
    }

    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
  };

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.camera.zoom(event.deltaY * 0.001);
  };

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
