import { OrbitCamera } from "./core/camera/orbit-camera";
import { PointerController } from "./core/events/pointer-controller";
import { Ellipsoid } from "./core/geodesy/ellipsoid";
import { invert, multiply, transformPoint } from "./core/math/mat4";
import { directionBetween, intersectUnitSphere } from "./core/math/ray";
import { Scene } from "./core/scene/scene";
import { ImageryLayerCollection } from "./globe/imagery/imagery-layer-collection";
import { decodeTopoJsonLand } from "./globe/vector/topojson-land";
import { WebGL2Renderer } from "./renderer/webgl2/webgl2-renderer";

export type GeoViewerOptions = {
  container: HTMLElement | string;
  renderer?: "webgl2";
  onImageryStats?: (stats: {
    level: number;
    activeTiles: number;
    loadedTiles: number;
    pendingTiles: number;
    cacheSize: number;
  }) => void;
  onImageryError?: (error: unknown) => void;
};

export class GeoViewer {
  readonly canvas: HTMLCanvasElement;
  readonly scene = new Scene();
  readonly camera = new OrbitCamera();
  readonly renderer: WebGL2Renderer;
  readonly imagery: ImageryLayerCollection;
  private readonly controller: PointerController;
  private readonly onImageryStatsCallback?: GeoViewerOptions["onImageryStats"];
  private debugTileOverlay = false;
  private lastActiveTileIds: string[] = [];
  private frame = 0;
  private disposed = false;

  constructor(options: GeoViewerOptions) {
    this.onImageryStatsCallback = options.onImageryStats;
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
        } catch (error) {
          console.warn("Imagery texture upload failed", error);
          options.onImageryError?.(error);
        }
      },
      onTileReady: (tile, image) => {
        try {
          this.renderer.setImageryTile(tile, image);
        } catch (error) {
          console.warn("Imagery tile upload failed", error);
          options.onImageryError?.(error);
        }
      },
      onActiveTilesChanged: (ids) => {
        this.lastActiveTileIds = [...ids];
        this.syncDebugTileOverlay();
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

  setDebugTileOverlay(enabled: boolean): void {
    this.debugTileOverlay = enabled;
    this.syncDebugTileOverlay();
  }

  setCoastlineOverlay(enabled: boolean): void {
    this.renderer.setVectorLinesVisible(enabled);
  }

  async loadCoastlineOverlay(url: string): Promise<void> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Unable to load coastline overlay: ${response.status}`);
    }

    const topology = await response.json();
    this.renderer.setVectorLines(decodeTopoJsonLand(topology));
  }

  private start(): void {
    const render = () => {
      if (this.disposed) {
        return;
      }

      const stats = this.imagery.update(
        this.centerViewCartographic() ?? this.camera.position,
        this.camera.distance,
      );

      if (stats) {
        this.onImageryStats(stats);
      }

      this.renderer.render({ scene: this.scene, camera: this.camera });
      this.frame = requestAnimationFrame(render);
    };

    this.frame = requestAnimationFrame(render);
  }

  private onImageryStats(stats: Parameters<NonNullable<GeoViewerOptions["onImageryStats"]>>[0]): void {
    this.onImageryStatsCallback?.(stats);
    const event = new CustomEvent("orbix:imagery-stats", { detail: stats });
    this.canvas.dispatchEvent(event);
  }

  private syncDebugTileOverlay(): void {
    if (!this.debugTileOverlay || this.lastActiveTileIds.length === 0) {
      this.renderer.setActiveImageryTiles([]);
      return;
    }

    const tileIds = this.centeredActiveTileWindow();

    for (const tileId of tileIds) {
      const tile = this.imagery.findTile(tileId);

      if (tile) {
        this.renderer.ensureDebugImageryTile(tile);
      }
    }

    this.renderer.setActiveImageryTiles(tileIds);
  }

  private centeredActiveTileWindow(): string[] {
    const gridSize = Math.round(Math.sqrt(this.lastActiveTileIds.length));

    if (gridSize < 3 || gridSize * gridSize !== this.lastActiveTileIds.length) {
      return this.lastActiveTileIds.slice(0, 9);
    }

    const center = Math.floor(gridSize / 2);
    const start = Math.max(0, center - 1);
    const end = Math.min(gridSize - 1, center + 1);
    const tileIds: string[] = [];

    for (let row = start; row <= end; row += 1) {
      for (let col = start; col <= end; col += 1) {
        tileIds.push(this.lastActiveTileIds[row * gridSize + col]);
      }
    }

    return tileIds;
  }

  private centerViewCartographic(): [number, number, number] | undefined {
    const width = this.canvas.width || this.canvas.clientWidth;
    const height = this.canvas.height || this.canvas.clientHeight;

    if (width <= 0 || height <= 0) {
      return undefined;
    }

    const aspect = width / height;
    const inverseViewProjection = invert(multiply(this.camera.projectionMatrix(aspect), this.camera.viewMatrix()));
    const pickY = -0.16;
    const near = transformPoint(inverseViewProjection, [0, pickY, -1]);
    const far = transformPoint(inverseViewProjection, [0, pickY, 1]);
    const origin = near;
    const direction = directionBetween(near, far);
    const hit = intersectUnitSphere({ origin, direction });

    if (!hit) {
      return undefined;
    }

    const cartographic = Ellipsoid.WGS84.surfaceNormalToCartographic(hit);
    return [cartographic.lon, cartographic.lat, 0];
  }
}

export { Ellipsoid } from "./core/geodesy/ellipsoid";
