import { OrbitCamera } from "./core/camera/orbit-camera";
import { type CameraFlyToOptions } from "./core/camera/orbit-camera";
import { PointerController } from "./core/events/pointer-controller";
import { Ellipsoid } from "./core/geodesy/ellipsoid";
import { invert, multiply, transformPoint } from "./core/math/mat4";
import { directionBetween, type Ray, intersectUnitSphere } from "./core/math/ray";
import { dot, type MutableVec3, type Vec3 } from "./core/math/vec3";
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

  setDebugModelVisible(enabled: boolean): void {
    this.renderer.setDebugModelVisible(enabled);
  }

  setDebugModelMesh(mesh: {
    positions: Float32Array;
    texcoords?: Float32Array;
    indices?: Uint16Array | Uint32Array;
    lon: number;
    lat: number;
    height?: number;
    scale?: number;
    baseColorFactor?: [number, number, number, number];
    baseColorTexture?: TexImageSource;
  }): void {
    this.renderer.setDebugModelMesh(mesh);
  }

  flyTo(options: CameraFlyToOptions): void {
    this.camera.flyTo(options);
  }

  pickGlobe(clientX: number, clientY: number): { lon: number; lat: number; height: number } | undefined {
    const ray = this.pickRay(clientX, clientY);

    if (!ray) {
      return undefined;
    }

    return this.pickGlobeWithRay(ray);
  }

  pickSphere(clientX: number, clientY: number, sphere: { center: Vec3; radius: number }): boolean {
    const ray = this.pickRay(clientX, clientY);

    if (!ray) {
      return false;
    }

    return intersectSphere(ray, sphere) !== undefined;
  }

  cartographicToUnitSphere({ lon, lat, height = 0 }: { lon: number; lat: number; height?: number }): MutableVec3 {
    const position = Ellipsoid.WGS84.cartographicToCartesian({
      lon: lon * (Math.PI / 180),
      lat: lat * (Math.PI / 180),
      height,
    });

    return [
      position[0] / Ellipsoid.WGS84.maximumRadius,
      position[1] / Ellipsoid.WGS84.maximumRadius,
      position[2] / Ellipsoid.WGS84.maximumRadius,
    ];
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

    const tileIds = this.lastActiveTileIds;

    for (const tileId of tileIds) {
      const tile = this.imagery.findTile(tileId);

      if (tile) {
        this.renderer.ensureDebugImageryTile(tile);
      }
    }

    this.renderer.setActiveImageryTiles(tileIds);
  }

  private centerViewCartographic(): [number, number, number] | undefined {
    const cartographic = this.pickNormalizedDeviceCoordinate(0, -0.16);
    return cartographic ? [cartographic.lon, cartographic.lat, cartographic.height] : undefined;
  }

  private pickNormalizedDeviceCoordinate(x: number, y: number): { lon: number; lat: number; height: number } | undefined {
    return this.pickGlobeWithRay(this.pickRayFromNdc(x, y));
  }

  private pickRay(clientX: number, clientY: number): Ray | undefined {
    const rect = this.canvas.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return undefined;
    }

    return this.pickRayFromNdc(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
  }

  private pickRayFromNdc(x: number, y: number): Ray {
    const width = this.canvas.width || this.canvas.clientWidth;
    const height = this.canvas.height || this.canvas.clientHeight;

    if (width <= 0 || height <= 0) {
      return { origin: [0, 0, 0], direction: [0, 0, -1] };
    }

    const aspect = width / height;
    const inverseViewProjection = invert(multiply(this.camera.projectionMatrix(aspect), this.camera.viewMatrix()));
    const near = transformPoint(inverseViewProjection, [x, y, -1]);
    const far = transformPoint(inverseViewProjection, [x, y, 1]);
    return { origin: near, direction: directionBetween(near, far) };
  }

  private pickGlobeWithRay(ray: Ray): { lon: number; lat: number; height: number } | undefined {
    const hit = intersectUnitSphere(ray);

    if (!hit) {
      return undefined;
    }

    const cartographic = Ellipsoid.WGS84.surfaceNormalToCartographic(hit);
    return { lon: cartographic.lon, lat: cartographic.lat, height: 0 };
  }
}

export { Ellipsoid } from "./core/geodesy/ellipsoid";

function intersectSphere(ray: Ray, sphere: { center: Vec3; radius: number }): number | undefined {
  const offset = [
    ray.origin[0] - sphere.center[0],
    ray.origin[1] - sphere.center[1],
    ray.origin[2] - sphere.center[2],
  ] as const;
  const b = 2 * dot(offset, ray.direction);
  const c = dot(offset, offset) - sphere.radius * sphere.radius;
  const discriminant = b * b - 4 * c;

  if (discriminant < 0) {
    return undefined;
  }

  const sqrt = Math.sqrt(discriminant);
  const near = (-b - sqrt) / 2;
  const far = (-b + sqrt) / 2;
  const t = near >= 0 ? near : far;

  return t >= 0 ? t : undefined;
}
