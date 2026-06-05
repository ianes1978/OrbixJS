import { OrbitCamera } from "../camera/orbit-camera";

export class PointerController {
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

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
    this.dragging = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.element.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
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
    this.dragging = false;

    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
  };

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.camera.zoom(event.deltaY * 0.001);
  };
}
