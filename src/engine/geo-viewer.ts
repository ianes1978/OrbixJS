import { OrbitCamera } from "./core/camera/orbit-camera";
import { PointerController } from "./core/events/pointer-controller";
import { Scene } from "./core/scene/scene";
import { ImageryLayerCollection } from "./globe/imagery/imagery-layer-collection";
import { WebGL2Renderer } from "./renderer/webgl2/webgl2-renderer";

export type GeoViewerOptions = {
  container: HTMLElement | string;
  renderer?: "webgl2";
  onImageryReady?: (loadedTiles: number, expectedTiles: number) => void;
  onImageryError?: (error: unknown) => void;
};

export class GeoViewer {
  readonly canvas: HTMLCanvasElement;
  readonly scene = new Scene();
  readonly camera = new OrbitCamera();
  readonly renderer: WebGL2Renderer;
  readonly imagery: ImageryLayerCollection;
  private readonly controller: PointerController;
  private frame = 0;
  private disposed = false;

  constructor(options: GeoViewerOptions) {
    const container =
      typeof options.container === "string"
        ? document.getElementById(options.container)
        : options.container;

    if (!container) {
      throw new Error("GeoViewer container not found");
    }

    if (options.renderer && options.renderer !== "webgl2") {
      throw new Error(`Unsupported renderer: ${options.renderer}`);
    }

    this.canvas = document.createElement("canvas");
    this.canvas.className = "geo-canvas";
    this.canvas.setAttribute("aria-label", "OrbixJS WGS84 globe");
    container.append(this.canvas);

    this.renderer = new WebGL2Renderer(this.canvas);
    this.imagery = new ImageryLayerCollection({
      onTextureReady: (texture) => {
        try {
          this.renderer.setImagery(texture.image);
          options.onImageryReady?.(texture.loadedTiles, texture.expectedTiles);
        } catch (error) {
          console.warn("Imagery texture upload failed", error);
          options.onImageryError?.(error);
        }
      },
      onLayerError: (error) => {
        console.warn("Imagery layer failed", error);
        options.onImageryError?.(error);
      },
    });
    this.controller = new PointerController(this.canvas, this.camera);
    this.scene.addNode({ id: "wgs84-globe" });
    this.start();
  }

  destroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.controller.destroy();
    this.renderer.destroy();
    this.canvas.remove();
  }

  private start(): void {
    const render = () => {
      if (this.disposed) {
        return;
      }

      this.renderer.render({ scene: this.scene, camera: this.camera });
      this.frame = requestAnimationFrame(render);
    };

    this.frame = requestAnimationFrame(render);
  }
}

export { Ellipsoid } from "./core/geodesy/ellipsoid";
