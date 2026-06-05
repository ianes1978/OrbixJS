import { OrbitCamera } from "./core/camera/orbit-camera";
import { type CameraFlyToOptions } from "./core/camera/orbit-camera";
import { sunDirectionFromDate } from "./core/astro/sun-position";
import { PointerController } from "./core/events/pointer-controller";
import { Ellipsoid } from "./core/geodesy/ellipsoid";
import { invert, multiply, transformPoint } from "./core/math/mat4";
import { directionBetween, type Ray, intersectUnitSphere } from "./core/math/ray";
import { dot, type MutableVec3, type Vec3 } from "./core/math/vec3";
import { loadGlb } from "./loaders/gltf/glb-loader";
import { extractFirstMeshPrimitive } from "./loaders/gltf/gltf-mesh";
import { selectTilesetTile } from "./loaders/tiles3d/tile-selector";
import { loadTilesetJson, tileBoundingVolumeCenter, type TilesetJson } from "./loaders/tiles3d/tileset";
import { Scene } from "./core/scene/scene";
import { ImageryLayerCollection } from "./globe/imagery/imagery-layer-collection";
import { WebMercatorTilingScheme } from "./globe/tiling/web-mercator-tiling";
import { type TerrainProvider } from "./globe/terrain/terrain-provider";
import { decodeTopoJsonLand } from "./globe/vector/topojson-land";
import { WebGL2Renderer } from "./renderer/webgl2/webgl2-renderer";
import { WebGPURenderer } from "./renderer/webgpu/webgpu-renderer";

export type GeoViewerOptions = {
  container: HTMLElement | string;
  renderer?: "webgl2" | "webgpu";
  date?: Date;
  onImageryStats?: (stats: {
    level: number;
    activeTiles: number;
    loadedTiles: number;
    pendingTiles: number;
    cacheSize: number;
  }) => void;
  onTilesetStats?: (stats: { status: string }) => void;
  onImageryError?: (error: unknown) => void;
};

export type GeoPickResult =
  | {
      type: "mesh";
      id: string;
    }
  | {
      type: "globe";
      lon: number;
      lat: number;
      height: number;
    };

export type GeoViewerGltfOptions = {
  url: string;
  lon: number;
  lat: number;
  height?: number;
  scale?: number;
  id?: string;
};

export type GeoViewerTilesetOptions = {
  url: string;
  scale?: number;
  id?: string;
};

export class GeoViewer {
  readonly canvas: HTMLCanvasElement;
  readonly scene = new Scene();
  readonly camera = new OrbitCamera();
  readonly renderer: WebGL2Renderer | WebGPURenderer;
  readonly imagery: ImageryLayerCollection;
  terrain: TerrainProvider | undefined;
  private readonly imageryTiling = new WebMercatorTilingScheme();
  private readonly controller: PointerController;
  private readonly onImageryStatsCallback?: GeoViewerOptions["onImageryStats"];
  private readonly onTilesetStatsCallback?: GeoViewerOptions["onTilesetStats"];
  private debugTileOverlay = false;
  private debugModelVisible = false;
  private debugModelPickSphere:
    | {
        center: Vec3;
        radius: number;
        id: string;
      }
    | undefined;
  private debugTileset:
    | {
        tileset: TilesetJson;
        scale: number;
        id: string;
        activeContentKey?: string;
        pendingContentKey?: string;
      }
    | undefined;
  private lastActiveTileIds: string[] = [];
  private frame = 0;
  private disposed = false;
  private date: Date;

  constructor(options: GeoViewerOptions) {
    this.onImageryStatsCallback = options.onImageryStats;
    this.onTilesetStatsCallback = options.onTilesetStats;
    const container =
      typeof options.container === "string"
        ? document.getElementById(options.container)
        : options.container;

    if (!container) {
      throw new Error("GeoViewer container not found");
    }

    if (options.renderer && options.renderer !== "webgl2" && options.renderer !== "webgpu") {
      throw new Error(`Unsupported renderer: ${options.renderer}`);
    }

    this.canvas = document.createElement("canvas");
    this.canvas.className = "geo-canvas";
    this.canvas.setAttribute("aria-label", "OrbixJS WGS84 globe");
    container.append(this.canvas);

    this.renderer = options.renderer === "webgpu" ? new WebGPURenderer(this.canvas) : new WebGL2Renderer(this.canvas);
    if (this.renderer instanceof WebGPURenderer) {
      void this.renderer.initialize().catch((error: unknown) => {
        console.warn("WebGPU initialization failed", error);
      });
    }
    this.date = new Date(options.date ?? Date.now());
    this.renderer.setSunDirection(sunDirectionFromDate(this.date));
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
    this.debugModelVisible = enabled;
    this.renderer.setDebugModelVisible(enabled);
  }

  setDate(date: Date): void {
    this.date = new Date(date);
    this.renderer.setSunDirection(sunDirectionFromDate(this.date));
  }

  getDate(): Date {
    return new Date(this.date);
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

  async addGltf(options: GeoViewerGltfOptions): Promise<void> {
    const glb = await loadGlb(options.url);
    const primitive = extractFirstMeshPrimitive(glb.json, glb.binaryChunk);
    const baseColorTexture = primitive.baseColorTexture
      ? await createImageBitmap(
          new Blob([primitive.baseColorTexture.bytes.slice().buffer], {
            type: primitive.baseColorTexture.mimeType,
          }),
        )
      : undefined;
    const scale = options.scale ?? 180000;

    this.setDebugModelMesh({
      positions: primitive.positions,
      texcoords: primitive.texcoords,
      indices: primitive.indices,
      lon: options.lon,
      lat: options.lat,
      height: options.height,
      scale,
      baseColorFactor: primitive.baseColorFactor,
      baseColorTexture,
    });
    this.setDebugModelPickSphere({
      center: this.cartographicToUnitSphere({
        lon: options.lon,
        lat: options.lat,
        height: options.height ?? 0,
      }),
      radius: (scale * 1.3) / Ellipsoid.WGS84.maximumRadius,
      id: options.id ?? "gltf",
    });
  }

  async addTileset(options: GeoViewerTilesetOptions): Promise<void> {
    this.debugTileset = {
      tileset: await loadTilesetJson(options.url),
      scale: options.scale ?? 180000,
      id: options.id ?? "tileset",
    };
    await this.syncDebugTilesetContent();
  }

  setTerrainProvider(provider: TerrainProvider | undefined): void {
    this.terrain = provider;
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

  pick({ clientX, clientY }: { clientX: number; clientY: number }): GeoPickResult | undefined {
    if (this.debugModelPickSphere && this.pickSphere(clientX, clientY, this.debugModelPickSphere)) {
      return { type: "mesh", id: this.debugModelPickSphere.id };
    }

    const globe = this.pickGlobe(clientX, clientY);

    if (!globe) {
      return undefined;
    }

    return { type: "globe", ...globe };
  }

  pickSphere(clientX: number, clientY: number, sphere: { center: Vec3; radius: number }): boolean {
    const ray = this.pickRay(clientX, clientY);

    if (!ray) {
      return false;
    }

    return intersectSphere(ray, sphere) !== undefined;
  }

  setDebugModelPickSphere(sphere: { center: Vec3; radius: number; id?: string } | undefined): void {
    this.debugModelPickSphere = sphere
      ? {
          center: sphere.center,
          radius: sphere.radius,
          id: sphere.id ?? "debug-model",
        }
      : undefined;
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

      const coveragePositions = this.visibleCartographicSamples();
      const imageryCenter = this.centerViewCartographic() ?? this.nearestVisibleCartographicSample() ?? coveragePositions[0];
      const stats = this.imagery.update(
        imageryCenter ? [imageryCenter[0], imageryCenter[1], imageryCenter[2] ?? 0] : [0, 0, 0],
        this.camera.distance,
        {
          viewportHeight: this.canvas.height || this.canvas.clientHeight,
          fov: this.camera.fov,
          coveragePositions,
          targetLevel: this.projectedImageryLevel(),
        },
      );

      if (stats) {
        this.onImageryStats(stats);
      }

      void this.syncDebugTilesetContent();
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

  private onTilesetStats(status: string): void {
    const stats = { status };
    this.onTilesetStatsCallback?.(stats);
    this.canvas.dispatchEvent(new CustomEvent("orbix:tileset-stats", { detail: stats }));
  }

  private async syncDebugTilesetContent(): Promise<void> {
    if (!this.debugTileset) {
      return;
    }

    const selected = selectTilesetTile(this.debugTileset.tileset.root, this.camera.distance, {
      cameraPosition: this.camera.position,
      cameraTarget: this.camera.target,
    });

    if (!selected) {
      this.debugTileset.activeContentKey = undefined;
      this.setDebugModelPickSphere(undefined);
      this.renderer.setDebugModelVisible(false);
      this.onTilesetStats("culled");
      return;
    }

    this.renderer.setDebugModelVisible(this.debugModelVisible);
    const contentUri = selected.tile.content?.resolvedUri;

    if (!contentUri) {
      this.onTilesetStats(`LOD ${selected.depth}: vuoto`);
      return;
    }

    const contentKey = `${selected.depth}:${contentUri}`;

    if (contentKey === this.debugTileset.activeContentKey || contentKey === this.debugTileset.pendingContentKey) {
      this.onTilesetStats(`LOD ${selected.depth}: GLB`);
      return;
    }

    const placement = tileBoundingVolumeCenter(this.debugTileset.tileset.root);

    if (!placement) {
      this.onTilesetStats(`LOD ${selected.depth}: root bounds -`);
      return;
    }

    this.debugTileset.pendingContentKey = contentKey;
    this.onTilesetStats(`LOD ${selected.depth}: loading`);
    await this.addGltf({
      url: contentUri,
      lon: placement.lon,
      lat: placement.lat,
      height: placement.height + 90000,
      scale: this.debugTileset.scale,
      id: this.debugTileset.id,
    });
    this.debugTileset.activeContentKey = contentKey;
    this.debugTileset.pendingContentKey = undefined;
    this.onTilesetStats(`LOD ${selected.depth}: GLB`);
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
    const cartographic = this.pickNormalizedDeviceCoordinate(0, 0);
    return cartographic ? [cartographic.lon, cartographic.lat, cartographic.height] : undefined;
  }

  private visibleCartographicSamples(): [number, number][] {
    const samples: [number, number][] = [];
    const steps = [-0.95, -0.7, -0.45, -0.2, 0.05, 0.3, 0.55, 0.8, 0.95];

    for (const y of steps) {
      for (const x of steps) {
        const cartographic = this.pickNormalizedDeviceCoordinate(x, y);

        if (cartographic) {
          samples.push([cartographic.lon, cartographic.lat]);
        }
      }
    }

    return samples;
  }

  private nearestVisibleCartographicSample(): [number, number, number] | undefined {
    let nearest: [number, number, number] | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const steps = [-0.95, -0.7, -0.45, -0.2, 0.05, 0.3, 0.55, 0.8, 0.95];

    for (const y of steps) {
      for (const x of steps) {
        const cartographic = this.pickNormalizedDeviceCoordinate(x, y);

        if (!cartographic) {
          continue;
        }

        const distance = x * x + y * y;

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = [cartographic.lon, cartographic.lat, cartographic.height];
        }
      }
    }

    return nearest;
  }

  private projectedImageryLevel(tileSize = 256, qualityFactor = 1.15): number | undefined {
    const center = this.centerViewCartographic() ?? this.nearestVisibleCartographicSample();
    const viewportWidth = this.canvas.width || this.canvas.clientWidth;
    const viewportHeight = this.canvas.height || this.canvas.clientHeight;

    if (!center || viewportWidth <= 0 || viewportHeight <= 0) {
      return undefined;
    }

    const threshold = tileSize * qualityFactor;

    for (let level = 2; level <= 22; level += 1) {
      const tile = this.imageryTiling.positionToTileXY(center[0], center[1], level);
      const projectedSize = this.projectTilePixelSize(tile);

      if (projectedSize !== undefined && projectedSize <= threshold) {
        return level;
      }
    }

    return 22;
  }

  private projectTilePixelSize(tile: { x: number; y: number; z: number }): number | undefined {
    const rectangle = this.imageryTiling.tileXYToRectangle(tile);
    const lonMid = (rectangle.west + rectangle.east) / 2;
    const latMid = (rectangle.south + rectangle.north) / 2;
    const samples = [
      [rectangle.west, rectangle.south],
      [rectangle.west, latMid],
      [rectangle.west, rectangle.north],
      [lonMid, rectangle.south],
      [lonMid, latMid],
      [lonMid, rectangle.north],
      [rectangle.east, rectangle.south],
      [rectangle.east, latMid],
      [rectangle.east, rectangle.north],
    ] as const;
    const projected = samples
      .map(([lon, lat]) => this.projectCartographicToPixel(lon, lat))
      .filter((point): point is [number, number] => point !== undefined);

    if (projected.length < 2) {
      return undefined;
    }

    const xs = projected.map((point) => point[0]);
    const ys = projected.map((point) => point[1]);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  }

  private projectCartographicToPixel(lon: number, lat: number): [number, number] | undefined {
    const width = this.canvas.width || this.canvas.clientWidth;
    const height = this.canvas.height || this.canvas.clientHeight;

    if (width <= 0 || height <= 0) {
      return undefined;
    }

    const world = this.cartographicToUnitSphere({
      lon: lon * (180 / Math.PI),
      lat: lat * (180 / Math.PI),
      height: 1500,
    });
    const aspect = width / height;
    const viewProjection = multiply(this.camera.projectionMatrix(aspect), this.camera.viewMatrix());
    const ndc = transformPoint(viewProjection, world);

    if (!Number.isFinite(ndc[0]) || !Number.isFinite(ndc[1]) || ndc[2] < -1 || ndc[2] > 1) {
      return undefined;
    }

    return [((ndc[0] + 1) / 2) * width, ((1 - ndc[1]) / 2) * height];
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
