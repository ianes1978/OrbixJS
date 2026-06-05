import { OrbitCamera } from "../../core/camera/orbit-camera";
import { Scene } from "../../core/scene/scene";

export type RendererFrame = {
  scene: Scene;
  camera: OrbitCamera;
};

export interface Renderer {
  readonly supported: boolean;
  resize(): void;
  render(frame: RendererFrame): void;
  destroy(): void;
}
