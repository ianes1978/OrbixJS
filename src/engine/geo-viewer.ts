import { OrbitCamera } from "./core/camera/orbit-camera";
import { type CameraFlyToOptions, type CameraLimits, type CameraSnapshot } from "./core/camera/orbit-camera";
import { type CameraKeyframe } from "./core/camera/camera-path";
import { sunDirectionFromDate } from "./core/astro/sun-position";
import { PointerController } from "./core/events/pointer-controller";
import { Ellipsoid } from "./core/geodesy/ellipsoid";
import {
  applyLodBiasToLevel,
  createAdaptiveLodState,
  createLodContext,
  normalizeLodOptions,
  stabilizeLodLevel,
  updateAdaptiveLodState,
  type AdaptiveLodState,
  type LodContext,
  type LodOptions,
  type NormalizedLodOptions,
} from "./core/lod/lod";
import { invert, multiply, transformPoint } from "./core/math/mat4";
import { directionBetween, type Ray, intersectUnitSphere } from "./core/math/ray";
import { dot, length, normalize, subtract, type MutableVec3, type Vec3 } from "./core/math/vec3";
import { loadGlb } from "./loaders/gltf/glb-loader";
import { extractFirstMeshPrimitive } from "./loaders/gltf/gltf-mesh";
import { selectTilesetTile } from "./loaders/tiles3d/tile-selector";
import { loadTilesetJson, tileBoundingVolumeCenter, type TilesetJson } from "./loaders/tiles3d/tileset";
import { Scene } from "./core/scene/scene";
import { ImageryLayerCollection } from "./globe/imagery/imagery-layer-collection";
import { type TileLevelStats } from "./globe/imagery/imagery-layer";
import { createQuadtreeTile, type QuadtreeTile } from "./globe/imagery/quadtree-tile";
import { selectLevel } from "./globe/imagery/tile-selector";
import { createSurfaceTileSet, type SurfaceTile } from "./globe/surface/surface-tile";
import { WebMercatorTilingScheme } from "./globe/tiling/web-mercator-tiling";
import { type TerrainProvider } from "./globe/terrain/terrain-provider";
import {
  TerrainSurfaceRuntime,
  type TerrainSurfaceMeshEntry,
  type TerrainSurfaceStats,
} from "./globe/terrain/terrain-surface-runtime";
import { decodeTopoJsonLand } from "./globe/vector/topojson-land";
import { WebGL2Renderer } from "./renderer/webgl2/webgl2-renderer";
import { WebGPURenderer } from "./renderer/webgpu/webgpu-renderer";
import { type RendererBackend } from "./renderer/interface/renderer";

export type GeoViewerOptions = {
  container: HTMLElement | string;
  renderer?: RendererBackend;
  cameraLimits?: CameraLimits;
  cameraHeightLimits?: CameraHeightLimits;
  cameraCollision?: CameraCollisionOptions;
  terrainExaggeration?: number;
  lod?: LodOptions;
  date?: Date;
  onImageryStats?: (stats: {
    level: number;
    activeTiles: number;
    loadedTiles: number;
    pendingTiles: number;
    renderTiles: number;
    exactRenderTiles: number;
    fallbackRenderTiles: number;
    requestLevels: TileLevelStats;
    renderLevels: TileLevelStats;
    exactRenderLevels: TileLevelStats;
    fallbackRenderLevels: TileLevelStats;
    compositeRenderTiles: number;
    compositeDescendants: number;
    compositeMaxLevel?: number;
    compositeCacheSize: number;
    vtFeedbackPages: number;
    vtResidentPages: number;
    vtMissingPages: number;
    vtFallbackPages: number;
    vtCompositePages: number;
    vtCompositeChildren: number;
    vtCompositeMaxLevel?: number;
    cacheSize: number;
  }) => void;
  onFrameStats?: (stats: GeoViewerFrameStats) => void;
  onTilesetStats?: (stats: { status: string }) => void;
  onImageryError?: (error: unknown) => void;
};

export type GeoViewerFrameStats = {
  fps: number;
  frameMs: number;
  cpuMs: number;
  updateMs: number;
  renderMs: number;
  coverageTiles: number;
  coverageBudget: number;
  coverageSamples: number;
  coverageStrategy: string;
  coverageLevels: TileLevelStats;
  effectiveRequestBudget: number;
  imageryTargetLevel?: number;
  terrainTargetLevel?: number;
  metricLevel?: number;
  terrain?: TerrainSurfaceStats;
  lod: LodContext;
};

export type CameraHeightLimits = {
  minHeight?: number;
  maxHeight?: number;
};

export type CameraCollisionOptions = {
  enabled?: boolean;
  clearance?: number;
};

export type CameraSurfaceStatus = {
  lon: number;
  lat: number;
  ellipsoidHeight: number;
  terrainHeight?: number;
  heightAboveTerrain: number;
  heightReference: "terrain" | "ellipsoid";
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

export type TerrainProviderOptions = {
  exaggeration?: number;
  skirtDepth?: number;
};

type DebugModelMesh = {
  positions: Float32Array;
  texcoords?: Float32Array;
  indices?: Uint16Array | Uint32Array;
  lon: number;
  lat: number;
  height?: number;
  scale?: number;
  baseColorFactor?: [number, number, number, number];
  baseColorTexture?: TexImageSource;
};

const viewportSampleSteps = [-0.99, -0.84, -0.68, -0.52, -0.36, -0.2, -0.04, 0.12, 0.28, 0.44, 0.6, 0.76, 0.92, 0.99] as const;
const viewportSampleCount = viewportSampleSteps.length * viewportSampleSteps.length;
const lodReferenceViewportHeight = 900;
const lodReferenceViewportArea = 1280 * 900;
const maxElasticTileBudget = 4096;
const webMercatorLevelZeroMetersPerPixel = 156543.03392804097;

export class GeoViewer {
  canvas: HTMLCanvasElement;
  readonly scene = new Scene();
  readonly camera: OrbitCamera;
  renderer: WebGL2Renderer | WebGPURenderer;
  readonly imagery: ImageryLayerCollection;
  terrain: TerrainProvider | undefined;
  private terrainSurface: TerrainSurfaceRuntime | undefined;
  private lastTerrainMeshes: TerrainSurfaceMeshEntry[] = [];
  private lastSurfaceTiles: SurfaceTile[] = [];
  private readonly defaultTerrainExaggeration: number;
  private readonly container: HTMLElement;
  private readonly imageryTiling = new WebMercatorTilingScheme();
  private controller: PointerController;
  private readonly onImageryStatsCallback?: GeoViewerOptions["onImageryStats"];
  private readonly onFrameStatsCallback?: GeoViewerOptions["onFrameStats"];
  private readonly onTilesetStatsCallback?: GeoViewerOptions["onTilesetStats"];
  private debugTileOverlay = false;
  private coastlineOverlayVisible = false;
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
  private currentImageryTexture: TexImageSource | undefined;
  private readonly currentTileImages = new Map<string, { tile: QuadtreeTile; image: TexImageSource }>();
  private vectorLines: readonly (readonly [number, number])[][] | undefined;
  private debugModelMesh: DebugModelMesh | undefined;
  private frame = 0;
  private lastFrameTimestamp = 0;
  private smoothedFrameMs = 16.67;
  private smoothedCpuMs = 0;
  private smoothedUpdateMs = 0;
  private smoothedRenderMs = 0;
  private disposed = false;
  private date: Date;
  private lodOptions: NormalizedLodOptions;
  private adaptiveLodState: AdaptiveLodState = createAdaptiveLodState();
  private currentLodContext: LodContext | undefined;
  private stableImageryTargetLevel: number | undefined;
  private stableTerrainTargetLevel: number | undefined;
  private cameraHeightLimits: CameraHeightLimits;
  private cameraCollision: Required<CameraCollisionOptions>;
  private lastCoverageStrategy = "none";

  constructor(options: GeoViewerOptions) {
    this.onImageryStatsCallback = options.onImageryStats;
    this.onFrameStatsCallback = options.onFrameStats;
    this.onTilesetStatsCallback = options.onTilesetStats;
    this.lodOptions = normalizeLodOptions(options.lod);
    this.cameraHeightLimits = options.cameraHeightLimits ?? {};
    this.cameraCollision = normalizeCameraCollisionOptions(options.cameraCollision);
    this.defaultTerrainExaggeration = options.terrainExaggeration ?? 1;
    const container =
      typeof options.container === "string"
        ? document.getElementById(options.container)
        : options.container;

    if (!container) {
      throw new Error("GeoViewer container not found");
    }

    this.container = container;

    if (options.renderer && options.renderer !== "webgl2" && options.renderer !== "webgpu") {
      throw new Error(`Unsupported renderer: ${options.renderer}`);
    }

    this.canvas = this.createCanvas();
    this.container.append(this.canvas);
    this.camera = new OrbitCamera({
      ...options.cameraLimits,
      ...cameraHeightLimitsToCameraLimits(this.cameraHeightLimits),
    });
    this.applyCameraHeightConstraints();
    this.renderer = options.renderer === "webgpu" ? new WebGPURenderer(this.canvas) : new WebGL2Renderer(this.canvas);
    if (this.renderer instanceof WebGPURenderer) {
      void this.renderer
        .initialize()
        .then((initialized) => {
          if (!initialized) {
            this.fallbackToWebGL2("WebGPU initialization returned false");
            return;
          }

          this.dispatchRendererChanged();
        })
        .catch((error: unknown) => {
          console.warn("WebGPU initialization failed", error);
          this.fallbackToWebGL2(error);
        });
    } else {
      queueMicrotask(() => {
        this.dispatchRendererChanged();
      });
    }
    this.date = new Date(options.date ?? Date.now());
    this.renderer.setSunDirection(sunDirectionFromDate(this.date));
    this.imagery = new ImageryLayerCollection({
      onTextureReady: (texture) => {
        this.currentImageryTexture = texture.image;
        try {
          this.renderer.setImagery(texture.image);
        } catch (error) {
          console.warn("Imagery texture upload failed", error);
          options.onImageryError?.(error);
        }
      },
      onTileReady: (tile, image) => {
        this.currentTileImages.set(tile.id, { tile, image });
        this.trimTileImageCache();
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
    this.controller = this.createPointerController();
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
    this.renderer.setTileDebugOverlayVisible(enabled);
    this.syncDebugTileOverlay();
  }

  setCoastlineOverlay(enabled: boolean): void {
    this.coastlineOverlayVisible = enabled;
    this.renderer.setVectorLinesVisible(enabled);
  }

  setDebugModelVisible(enabled: boolean): void {
    this.debugModelVisible = enabled;
    this.renderer.setDebugModelVisible(enabled);
  }

  async setRendererBackend(backend: RendererBackend): Promise<void> {
    if (this.renderer.backend === backend && !(this.renderer instanceof WebGPURenderer && !this.renderer.ready)) {
      return;
    }

    this.controller.destroy();
    this.renderer.destroy();
    this.replaceCanvas();
    this.renderer = backend === "webgpu" ? new WebGPURenderer(this.canvas) : new WebGL2Renderer(this.canvas);
    this.controller = this.createPointerController();
    this.rehydrateRenderer();

    if (this.renderer instanceof WebGPURenderer) {
      const renderer = this.renderer;

      try {
        const initialized = await renderer.initialize();

        if (this.renderer !== renderer || this.disposed) {
          renderer.destroy();
          return;
        }

        if (!initialized) {
          this.fallbackToWebGL2("WebGPU initialization returned false");
          return;
        }

        this.rehydrateRenderer();
      } catch (error: unknown) {
        if (this.renderer === renderer) {
          console.warn("WebGPU initialization failed", error);
          this.fallbackToWebGL2(error);
        }
        return;
      }
    }

    this.dispatchRendererChanged();
  }

  setDate(date: Date): void {
    this.date = new Date(date);
    this.renderer.setSunDirection(sunDirectionFromDate(this.date));
  }

  getDate(): Date {
    return new Date(this.date);
  }

  setDebugModelMesh(mesh: DebugModelMesh): void {
    this.debugModelMesh = mesh;
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

  setTerrainProvider(provider: TerrainProvider | undefined, options: TerrainProviderOptions = {}): void {
    const exaggeration = options.exaggeration ?? this.defaultTerrainExaggeration;

    this.terrain = provider;
    this.terrainSurface = provider
      ? new TerrainSurfaceRuntime({
          provider,
          meshOptions: { exaggeration, skirtDepth: options.skirtDepth },
          maxMeshes: 1024,
          maxPending: 24,
          onError: (error) => console.warn("Terrain surface tile failed", error),
        })
      : undefined;
    this.lastTerrainMeshes = [];
    this.renderer.setTerrainMeshes([]);
    this.renderer.setSurfaceFallbackVisible(Boolean(provider));
    this.syncDebugTileOverlay();
    this.applyCameraHeightConstraints();
  }

  flyTo(options: CameraFlyToOptions): void {
    this.camera.flyTo(options);
  }

  setCameraLimits(limits: CameraLimits): void {
    this.camera.setLimits(limits);
  }

  setCameraHeightLimits(limits: CameraHeightLimits): void {
    this.cameraHeightLimits = limits;
    this.applyCameraHeightConstraints();
  }

  setLod(options: LodOptions): void {
    this.lodOptions = normalizeLodOptions(options);
    this.adaptiveLodState = createAdaptiveLodState();
    this.stableImageryTargetLevel = undefined;
    this.stableTerrainTargetLevel = undefined;
  }

  getLodContext(): LodContext | undefined {
    return this.currentLodContext ? { ...this.currentLodContext } : undefined;
  }

  setCameraCollision(options: CameraCollisionOptions): void {
    this.cameraCollision = normalizeCameraCollisionOptions({
      ...this.cameraCollision,
      ...options,
    });
    this.applyCameraHeightConstraints();
  }

  cameraSnapshot(): CameraSnapshot {
    return this.camera.snapshot();
  }

  cameraSurfaceStatus(): CameraSurfaceStatus {
    const cartographic = Ellipsoid.WGS84.surfaceNormalToCartographic(this.camera.position);
    const ellipsoidHeight = Math.max(0, this.cameraEllipsoidHeightMeters());
    const terrainHeight = this.sampleTerrainHeightAt(cartographic.lon, cartographic.lat);
    const heightAboveTerrain = terrainHeight === undefined ? ellipsoidHeight : Math.max(0, ellipsoidHeight - terrainHeight);

    return {
      lon: cartographic.lon,
      lat: cartographic.lat,
      ellipsoidHeight,
      terrainHeight,
      heightAboveTerrain,
      heightReference: terrainHeight === undefined ? "ellipsoid" : "terrain",
    };
  }

  cameraKeyframe(duration = 3): CameraKeyframe {
    const center = this.centerViewCartographic() ?? this.nearestVisibleCartographicSample();
    const fallback = Ellipsoid.WGS84.surfaceNormalToCartographic(this.camera.position);
    const lon = center ? center[0] : fallback.lon;
    const lat = center ? center[1] : fallback.lat;
    const height = Math.max(0, this.cameraEllipsoidHeightMeters());

    return {
      lon: lon * (180 / Math.PI),
      lat: lat * (180 / Math.PI),
      height,
      fov: this.camera.fov,
      duration,
      easing: "smoothstep",
    };
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
    this.vectorLines = decodeTopoJsonLand(topology);
    this.renderer.setVectorLines(this.vectorLines);
  }

  private start(): void {
    const render = () => {
      if (this.disposed) {
        return;
      }

      const frameStart = performance.now();
      const frameDelta = this.lastFrameTimestamp > 0 ? frameStart - this.lastFrameTimestamp : this.smoothedFrameMs;
      this.lastFrameTimestamp = frameStart;
      this.applyCameraHeightConstraints();
      const lodContext = this.createCurrentLodContext();
      this.currentLodContext = lodContext;
      const projectedImageryLevel = this.projectedImageryLevel(256, lodContext.pixelErrorBudget);
      const metricImageryLevel = this.metricImageryLevel(lodContext);
      const imageryLevel = maxFiniteLevel(projectedImageryLevel, metricImageryLevel);
      const requestedImageryTargetLevel = maxFiniteLevel(
        applyLodBiasToLevel(imageryLevel, this.lodOptions.imagery, lodContext),
        clampLodLayerLevel(metricImageryLevel, this.lodOptions.imagery),
      );
      const requestedTerrainTargetLevel = maxFiniteLevel(
        applyLodBiasToLevel(imageryLevel, this.lodOptions.terrain, lodContext),
        clampLodLayerLevel(metricImageryLevel, this.lodOptions.terrain),
      );
      const imageryTargetLevel = this.stabilizeImageryTargetLevel(requestedImageryTargetLevel);
      const terrainTargetLevel = this.stabilizeTerrainTargetLevel(requestedTerrainTargetLevel);
      const coveragePositions = this.visibleCartographicSamples();
      const requestBudget = this.effectiveRequestBudget(lodContext);
      const coverageBudget = this.effectiveCoverageTileBudget(lodContext);
      const coverageTiles = this.screenSpaceCoverageTiles(
        coverageBudget,
        imageryTargetLevel,
        coveragePositions,
      );
      const coverageLevels = summarizeTileLevels(coverageTiles ?? []);
      const imageryCenter = this.centerViewCartographic() ?? this.nearestVisibleCartographicSample() ?? coveragePositions[0];
      const stats = this.imagery.update(
        imageryCenter ? [imageryCenter[0], imageryCenter[1], imageryCenter[2] ?? 0] : [0, 0, 0],
        this.cameraDistanceForLod(),
        {
          viewportHeight: this.canvas.height || this.canvas.clientHeight,
          fov: this.camera.fov,
          coveragePositions,
          coverageTiles,
          requestBudget,
          targetLevel: imageryTargetLevel,
        },
      );

      if (stats) {
        this.onImageryStats(stats);
      }

      const terrainStats = this.syncTerrainSurface(
        imageryCenter,
        coveragePositions,
        coverageTiles,
        terrainTargetLevel,
        lodContext,
        requestBudget,
      );
      void this.syncDebugTilesetContent();
      const beforeRender = performance.now();
      this.renderer.render({ scene: this.scene, camera: this.camera });
      const frameEnd = performance.now();
      const frameMs = this.smoothFrameMetric("frame", frameDelta);
      const cpuMs = this.smoothFrameMetric("cpu", frameEnd - frameStart);
      const updateMs = this.smoothFrameMetric("update", beforeRender - frameStart);
      const renderMs = this.smoothFrameMetric("render", frameEnd - beforeRender);
      this.onFrameStats({
        fps: 1000 / frameMs,
        frameMs,
        cpuMs,
        updateMs,
        renderMs,
        coverageTiles: coverageTiles?.length ?? 0,
        coverageBudget,
        coverageSamples: coveragePositions.length,
        coverageStrategy: this.lastCoverageStrategy,
        coverageLevels,
        effectiveRequestBudget: requestBudget,
        imageryTargetLevel,
        terrainTargetLevel,
        metricLevel: metricImageryLevel,
        terrain: terrainStats,
        lod: lodContext,
      });
      this.adaptiveLodState = updateAdaptiveLodState(this.adaptiveLodState, frameMs, this.lodOptions);
      this.frame = requestAnimationFrame(render);
    };

    this.frame = requestAnimationFrame(render);
  }

  private fallbackToWebGL2(reason: unknown): void {
    if (this.disposed) {
      return;
    }

    console.warn("Falling back to WebGL2 renderer", reason);
    this.controller.destroy();
    this.renderer.destroy();
    this.replaceCanvas();
    this.renderer = new WebGL2Renderer(this.canvas);
    this.controller = this.createPointerController();
    this.rehydrateRenderer();
    this.dispatchRendererChanged();
  }

  private dispatchRendererChanged(): void {
    const event = new CustomEvent("orbix:renderer-changed", {
      bubbles: true,
      detail: {
        backend: this.renderer.backend,
        supported: this.renderer.supported,
        ready: this.renderer instanceof WebGPURenderer ? this.renderer.ready : true,
        canvas: this.canvas,
      },
    });

    this.canvas.dispatchEvent(event);
  }

  private onImageryStats(stats: Parameters<NonNullable<GeoViewerOptions["onImageryStats"]>>[0]): void {
    this.onImageryStatsCallback?.(stats);
    const event = new CustomEvent("orbix:imagery-stats", { detail: stats });
    this.canvas.dispatchEvent(event);
  }

  private onFrameStats(stats: GeoViewerFrameStats): void {
    this.onFrameStatsCallback?.(stats);
    this.canvas.dispatchEvent(new CustomEvent("orbix:frame-stats", { detail: stats }));
  }

  private smoothFrameMetric(metric: "frame" | "cpu" | "update" | "render", value: number): number {
    const alpha = 0.12;
    const next = (previous: number) => previous + (value - previous) * alpha;

    if (metric === "frame") {
      this.smoothedFrameMs = next(this.smoothedFrameMs);
      return this.smoothedFrameMs;
    }

    if (metric === "cpu") {
      this.smoothedCpuMs = next(this.smoothedCpuMs);
      return this.smoothedCpuMs;
    }

    if (metric === "update") {
      this.smoothedUpdateMs = next(this.smoothedUpdateMs);
      return this.smoothedUpdateMs;
    }

    this.smoothedRenderMs = next(this.smoothedRenderMs);
    return this.smoothedRenderMs;
  }

  private createCurrentLodContext(): LodContext {
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.lodViewportHeight();
    const cameraDistance = this.cameraDistanceForLod();

    return createLodContext(this.lodOptions, {
      cameraDistance,
      altitudeMeters: this.cameraAltitudeAboveSurfaceMeters(),
      viewportWidth: width,
      viewportHeight: height,
      devicePixelRatio: window.devicePixelRatio,
      fov: this.camera.fov,
      adaptiveState: this.adaptiveLodState,
    });
  }

  private lodViewportHeight(): number {
    const cssHeight = this.canvas.clientHeight || this.canvas.height || lodReferenceViewportHeight;

    return Math.max(1, Math.min(cssHeight, lodReferenceViewportHeight));
  }

  private effectiveTileBudget(lodContext: LodContext): number {
    const cssWidth = Math.max(1, this.canvas.clientWidth || this.canvas.width || 1);
    const cssHeight = Math.max(1, this.canvas.clientHeight || this.canvas.height || 1);
    const areaScale = Math.max(1, (cssWidth * cssHeight) / lodReferenceViewportArea);

    return Math.min(maxElasticTileBudget, Math.max(lodContext.tileBudget, Math.round(lodContext.tileBudget * areaScale)));
  }

  private effectiveCoverageTileBudget(lodContext: LodContext): number {
    const elasticBudget = this.effectiveTileBudget(lodContext);

    if (this.cameraAltitudeAboveSurfaceMeters() < 80_000) {
      return Math.min(elasticBudget, Math.max(256, lodContext.tileBudget));
    }

    return elasticBudget;
  }

  private effectiveRequestBudget(lodContext: LodContext): number {
    if (this.cameraAltitudeAboveSurfaceMeters() < 80_000) {
      return Math.max(lodContext.requestBudget, this.lodOptions.maxNetworkRequests);
    }

    return lodContext.requestBudget;
  }

  private metricImageryLevel(lodContext: LodContext): number | undefined {
    if (!Number.isFinite(lodContext.metersPerPixel) || lodContext.metersPerPixel <= 0) {
      return undefined;
    }

    const toleratedMetersPerPixel = lodContext.metersPerPixel * Math.max(0.5, lodContext.pixelErrorBudget);

    return Math.ceil(Math.log2(webMercatorLevelZeroMetersPerPixel / toleratedMetersPerPixel));
  }

  private stabilizeImageryTargetLevel(targetLevel: number | undefined): number | undefined {
    this.stableImageryTargetLevel = stabilizeLodLevel(this.stableImageryTargetLevel, targetLevel, {
      maxRise: 1,
      maxDrop: 1,
    });

    return this.stableImageryTargetLevel;
  }

  private stabilizeTerrainTargetLevel(targetLevel: number | undefined): number | undefined {
    this.stableTerrainTargetLevel = stabilizeLodLevel(this.stableTerrainTargetLevel, targetLevel, {
      maxRise: 1,
      maxDrop: 1,
    });

    return this.stableTerrainTargetLevel;
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
      maxScreenSpaceError: this.currentLodContext?.tiles3dMaxScreenSpaceError,
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
    if (this.lastActiveTileIds.length === 0) {
      this.lastSurfaceTiles = [];
      this.renderer.setActiveImageryTiles([]);
      return;
    }

    const tiles = this.lastActiveTileIds
      .map((tileId) => this.imagery.findTile(tileId))
      .filter((tile): tile is QuadtreeTile => tile !== undefined);
    this.lastSurfaceTiles = createSurfaceTileSet({
      imageryTiles: tiles,
      terrainMeshes: this.lastTerrainMeshes,
      loadingTerrainIds: this.terrainSurface?.loadingTileIds() ?? [],
      errorTerrainIds: this.terrainSurface?.errorTileIds() ?? [],
      tiling: this.imageryTiling,
    });
    for (const tileId of this.lastActiveTileIds) {
      const tile = this.imagery.findTile(tileId);

      if (tile) {
        this.renderer.ensureDebugImageryTile(tile);
      }
    }

    this.renderer.setActiveImageryTiles(this.lastActiveTileIds);
  }

  private rehydrateRenderer(): void {
    this.renderer.setSunDirection(sunDirectionFromDate(this.date));
    this.renderer.setTileDebugOverlayVisible(this.debugTileOverlay);

    if (this.currentImageryTexture) {
      this.renderer.setImagery(this.currentImageryTexture);
    }

    for (const { tile, image } of this.currentTileImages.values()) {
      this.renderer.setImageryTile(tile, image);
    }

    if (this.vectorLines) {
      this.renderer.setVectorLines(this.vectorLines);
      this.renderer.setVectorLinesVisible(this.coastlineOverlayVisible);
    }

    if (this.debugModelMesh) {
      this.renderer.setDebugModelMesh(this.debugModelMesh);
      this.renderer.setDebugModelVisible(this.debugModelVisible);
    }

    this.renderer.setTerrainMeshes(this.lastTerrainMeshes);
    this.renderer.setSurfaceFallbackVisible(Boolean(this.terrainSurface) && this.lastTerrainMeshes.length === 0);
    this.syncDebugTileOverlay();
  }

  private syncTerrainSurface(
    center: readonly [number, number, number?] | undefined,
    coveragePositions: readonly (readonly [number, number, number?])[],
    coverageTiles: readonly QuadtreeTile[] | undefined,
    targetLevel: number | undefined,
    lodContext: LodContext,
    requestBudget: number,
  ): TerrainSurfaceStats | undefined {
    if (!this.terrainSurface || !center) {
      this.renderer.setSurfaceFallbackVisible(false);
      if (this.lastTerrainMeshes.length > 0) {
        this.lastTerrainMeshes = [];
        this.renderer.setTerrainMeshes([]);
        this.syncDebugTileOverlay();
      }
      return undefined;
    }

    const stats = this.terrainSurface.update(center[0], center[1], this.cameraDistanceForLod(), {
      viewportHeight: this.lodViewportHeight(),
      fov: this.camera.fov,
      coveragePositions: coveragePositions.map((position) => [position[0], position[1]] as const),
      coverageTiles,
      maxTiles: Math.min(this.lodOptions.terrain.maxTiles, lodContext.tileBudget),
      requestBudget,
      targetLevel,
    });
    this.lastTerrainMeshes = this.terrainSurface.readyMeshes();
    this.renderer.setTerrainMeshes(this.lastTerrainMeshes);
    this.renderer.setSurfaceFallbackVisible(this.lastTerrainMeshes.length === 0);
    this.syncDebugTileOverlay();
    return stats;
  }

  private createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");

    canvas.className = "geo-canvas";
    canvas.setAttribute("aria-label", "OrbixJS WGS84 globe");
    return canvas;
  }

  private replaceCanvas(): void {
    const canvas = this.createCanvas();

    this.canvas.replaceWith(canvas);
    this.canvas = canvas;
  }

  private createPointerController(): PointerController {
    return new PointerController(this.canvas, this.camera, {
      pickSurfacePoint: (clientX, clientY) => this.pickSurfacePatchPoint(clientX, clientY),
      surfaceHeightMeters: () => this.sampleTerrainHeightBelowCamera() ?? 0,
      surfaceDistance: () => this.cameraSurfaceDistanceForHeight(this.sampleTerrainHeightBelowCamera() ?? 0),
    });
  }

  private trimTileImageCache(maxEntries = 4096): void {
    while (this.currentTileImages.size > maxEntries) {
      const first = this.currentTileImages.keys().next().value;

      if (!first) {
        return;
      }

      this.currentTileImages.delete(first);
    }
  }

  private centerViewCartographic(): [number, number, number] | undefined {
    const cartographic = this.pickNormalizedDeviceCoordinate(0, 0);
    return cartographic ? [cartographic.lon, cartographic.lat, cartographic.height] : undefined;
  }

  private visibleCartographicSamples(): [number, number][] {
    const samples: { lon: number; lat: number; distance: number }[] = [];

    for (const y of viewportSampleSteps) {
      for (const x of viewportSampleSteps) {
        const cartographic = this.pickNormalizedDeviceCoordinate(x, y);

        if (cartographic) {
          samples.push({ lon: cartographic.lon, lat: cartographic.lat, distance: x * x + y * y });
        }
      }
    }

    return samples.sort((a, b) => a.distance - b.distance).map((sample) => [sample.lon, sample.lat]);
  }

  private nearestVisibleCartographicSample(): [number, number, number] | undefined {
    let nearest: [number, number, number] | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const y of viewportSampleSteps) {
      for (const x of viewportSampleSteps) {
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

  private screenSpaceCoverageTiles(
    maxTiles = 2048,
    targetLevelOverride?: number,
    coveragePositions: readonly (readonly [number, number, number?])[] = [],
  ): QuadtreeTile[] | undefined {
    const width = this.canvas.width || this.canvas.clientWidth;
    const height = this.canvas.height || this.canvas.clientHeight;

    if (width <= 0 || height <= 0) {
      this.lastCoverageStrategy = "none";
      return undefined;
    }

    const targetLevel =
      targetLevelOverride ??
      this.projectedImageryLevel() ??
      selectLevel(this.cameraDistanceForLod(), 22, {
        viewportHeight: this.lodViewportHeight(),
        fov: this.camera.fov,
      });
    const useScreenSpaceCoverage = this.cameraAltitudeAboveSurfaceMeters() < 80_000;
    const distanceCoverage = useScreenSpaceCoverage
      ? this.distanceDependentCoverageTiles(maxTiles, targetLevel, width, height)
      : undefined;

    if (distanceCoverage) {
      this.lastCoverageStrategy = "cdlod-near";
      return distanceCoverage;
    }

    const rayCoverage = useScreenSpaceCoverage
      ? undefined
      : this.coverageTilesFromVisibleSamples(coveragePositions, targetLevel, maxTiles);

    if (rayCoverage) {
      this.lastCoverageStrategy = "sample-bbox";
      return rayCoverage;
    }

    const threshold = 256 * 1.08;
    const rootLevel = 2;
    const rootCount = this.imageryTiling.tileCount(rootLevel);
    const stack: QuadtreeTile[] = [];
    const selected: { tile: QuadtreeTile; bounds: ScreenBounds }[] = [];

    for (let y = 0; y < rootCount; y += 1) {
      for (let x = 0; x < rootCount; x += 1) {
        stack.push(createQuadtreeTile(x, y, rootLevel));
      }
    }

    while (stack.length > 0) {
      const tile = stack.pop();

      if (!tile) {
        continue;
      }

      const bounds = this.projectTileScreenBounds(tile);

      if (!bounds || !screenBoundsIntersectsViewport(bounds, width, height)) {
        continue;
      }

      const projectedSize = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
      const shouldSubdivide = tile.z < targetLevel && projectedSize > threshold;
      const canSubdivide = shouldSubdivide && selected.length + stack.length + 4 <= maxTiles;

      if (!canSubdivide) {
        selected.push({ tile, bounds });
        continue;
      }

      const childX = tile.x * 2;
      const childY = tile.y * 2;
      const childLevel = tile.z + 1;
      stack.push(
        createQuadtreeTile(childX, childY, childLevel),
        createQuadtreeTile(childX + 1, childY, childLevel),
        createQuadtreeTile(childX, childY + 1, childLevel),
        createQuadtreeTile(childX + 1, childY + 1, childLevel),
      );
    }

    const prioritized = selected
      .sort((a, b) => screenBoundsDistanceToViewportCenter(a.bounds, width, height) - screenBoundsDistanceToViewportCenter(b.bounds, width, height))
      .map((entry) => entry.tile);
    const expanded = this.expandCoverageTiles(prioritized, maxTiles);

    this.lastCoverageStrategy = expanded.length > 0 ? (useScreenSpaceCoverage ? "screen-quadtree-near" : "screen-quadtree") : "none";
    return expanded.length > 0 ? expanded : undefined;
  }

  private distanceDependentCoverageTiles(
    maxTiles: number,
    targetLevel: number,
    width: number,
    height: number,
  ): QuadtreeTile[] | undefined {
    const rootLevel = 2;
    const rootCount = this.imageryTiling.tileCount(rootLevel);
    const queue: ScreenTileCandidate[] = [];
    const selected: QuadtreeTile[] = [];

    for (let y = 0; y < rootCount; y += 1) {
      for (let x = 0; x < rootCount; x += 1) {
        const candidate = this.screenTileCandidate(createQuadtreeTile(x, y, rootLevel), targetLevel, width, height);

        if (candidate) {
          queue.push(candidate);
        }
      }
    }

    while (queue.length > 0) {
      const index = bestCandidateIndex(queue);
      const candidate = queue.splice(index, 1)[0];
      const childrenFitBudget = selected.length + queue.length + 4 <= maxTiles;

      if (candidate.tile.z < candidate.desiredLevel && childrenFitBudget) {
        const childX = candidate.tile.x * 2;
        const childY = candidate.tile.y * 2;
        const childLevel = candidate.tile.z + 1;
        const children = [
          createQuadtreeTile(childX, childY, childLevel),
          createQuadtreeTile(childX + 1, childY, childLevel),
          createQuadtreeTile(childX, childY + 1, childLevel),
          createQuadtreeTile(childX + 1, childY + 1, childLevel),
        ]
          .map((tile) => this.screenTileCandidate(tile, targetLevel, width, height))
          .filter((child): child is ScreenTileCandidate => child !== undefined);

        if (children.length > 0) {
          queue.push(...children);
          continue;
        }
      }

      selected.push(candidate.tile);
    }

    return selected.length > 0 ? selected.slice(0, maxTiles) : undefined;
  }

  private screenTileCandidate(
    tile: QuadtreeTile,
    targetLevel: number,
    width: number,
    height: number,
  ): ScreenTileCandidate | undefined {
    const bounds = this.projectTileScreenBounds(tile);

    if (!bounds || !screenBoundsIntersectsViewport(bounds, width, height)) {
      return undefined;
    }

    const desiredLevel = this.distanceDesiredTileLevel(tile, targetLevel);
    const distanceToCenter = screenBoundsDistanceToViewportCenter(bounds, width, height);
    const viewportScale = Math.max(1, Math.hypot(width, height));
    const normalizedCenterDistance = Math.sqrt(distanceToCenter) / viewportScale;

    return {
      tile,
      bounds,
      desiredLevel,
      priority: desiredLevel * 1_000_000 + tile.z * 10_000 - normalizedCenterDistance * 1_000,
    };
  }

  private distanceDesiredTileLevel(tile: QuadtreeTile, targetLevel: number): number {
    const rectangle = this.imageryTiling.tileXYToRectangle(tile);
    const camera = this.cameraSurfaceStatus();
    const cameraToTileMeters = distanceFromCartographicToRectangleMeters(camera.lon, camera.lat, rectangle);
    const referenceMeters = Math.max(250, this.cameraAltitudeAboveSurfaceMeters());
    const distanceRatio = Math.max(1, cameraToTileMeters / referenceMeters);
    const levelDrop = Math.floor(Math.log2(distanceRatio));

    return Math.max(2, Math.min(targetLevel, Math.round(targetLevel - levelDrop)));
  }

  private coverageTilesFromVisibleSamples(
    coveragePositions: readonly (readonly [number, number, number?])[],
    targetLevel: number,
    maxTiles: number,
  ): QuadtreeTile[] | undefined {
    const samples = coveragePositions.filter(
      (position): position is readonly [number, number, number?] =>
        Number.isFinite(position[0]) && Number.isFinite(position[1]),
    );

    if (samples.length === 0 || !Number.isFinite(targetLevel)) {
      return undefined;
    }

    const minLevel = 2;
    const startLevel = Math.max(minLevel, Math.round(targetLevel));
    const minimumScreenSpaceLevel = Math.max(minLevel, startLevel - 3);
    const sampleCompleteness = samples.length / viewportSampleCount;

    if (sampleCompleteness < 0.35) {
      return undefined;
    }

    for (let level = startLevel; level >= minimumScreenSpaceLevel; level -= 1) {
      const count = this.imageryTiling.tileCount(level);
      const anchor = this.imageryTiling.positionToTileXY(samples[0][0], samples[0][1], level);
      const padding = this.coveragePaddingForLevel(level, sampleCompleteness);
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (const [lon, lat] of samples) {
        const tile = this.imageryTiling.positionToTileXY(lon, lat, level);
        const unwrappedX = unwrapTileX(tile.x, anchor.x, count);

        minX = Math.min(minX, unwrappedX);
        maxX = Math.max(maxX, unwrappedX);
        minY = Math.min(minY, tile.y);
        maxY = Math.max(maxY, tile.y);
      }

      if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
        continue;
      }

      const tiles = new Map<string, QuadtreeTile>();

      for (let y = minY - padding; y <= maxY + padding; y += 1) {
        if (y < 0 || y >= count) {
          continue;
        }

        for (let x = minX - padding; x <= maxX + padding; x += 1) {
          const tile = createQuadtreeTile(moduloTileX(x, count), y, level);
          tiles.set(tile.id, tile);
        }
      }

      if (tiles.size > 0 && tiles.size <= maxTiles) {
        return [...tiles.values()].slice(0, maxTiles);
      }
    }

    return undefined;
  }

  private coveragePaddingForLevel(level: number, sampleCompleteness = 1): number {
    const incompleteViewPadding = sampleCompleteness < 0.6 ? 2 : sampleCompleteness < 0.85 ? 1 : 0;

    if (level >= 13) {
      return 3 + incompleteViewPadding;
    }

    if (level >= 10) {
      return 2 + incompleteViewPadding;
    }

    return 1 + incompleteViewPadding;
  }

  private expandCoverageTiles(tiles: readonly QuadtreeTile[], maxTiles: number): QuadtreeTile[] {
    const expanded = new Map<string, QuadtreeTile>();

    for (const tile of tiles) {
      const count = this.imageryTiling.tileCount(tile.z);
      const padding = tile.z >= 13 ? 3 : tile.z >= 10 ? 2 : 1;

      for (let y = tile.y - padding; y <= tile.y + padding; y += 1) {
        if (y < 0 || y >= count) {
          continue;
        }

        for (let x = tile.x - padding; x <= tile.x + padding; x += 1) {
          const wrappedX = ((x % count) + count) % count;
          const expandedTile = createQuadtreeTile(wrappedX, y, tile.z);

          if (!expanded.has(expandedTile.id)) {
            expanded.set(expandedTile.id, expandedTile);
          }

          if (expanded.size >= maxTiles) {
            return [...expanded.values()];
          }
        }
      }
    }

    return [...expanded.values()];
  }

  private projectedImageryLevel(tileSize = 256, qualityFactor = 1.15): number | undefined {
    const center = this.centerViewCartographic() ?? this.nearestVisibleCartographicSample();
    const viewportWidth = this.canvas.clientWidth || this.canvas.width;
    const viewportHeight = this.lodViewportHeight();

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

    return undefined;
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
      .map(([lon, lat]) => this.projectCartographicToPixel(lon, lat, { logicalLodViewport: true }))
      .filter((point): point is [number, number] => point !== undefined);

    if (projected.length < 2) {
      return undefined;
    }

    const xs = projected.map((point) => point[0]);
    const ys = projected.map((point) => point[1]);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  }

  private projectTileScreenBounds(tile: { x: number; y: number; z: number }): ScreenBounds | undefined {
    const rectangle = this.imageryTiling.tileXYToRectangle(tile);
    const points: [number, number][] = [];
    const grid = tile.z < 8 ? 5 : 3;
    const width = this.canvas.width || this.canvas.clientWidth;
    const height = this.canvas.height || this.canvas.clientHeight;

    if (width <= 0 || height <= 0 || !this.tileCanContributeToView(tile)) {
      return undefined;
    }

    for (let row = 0; row <= grid; row += 1) {
      const v = row / grid;
      const lat = rectangle.south + (rectangle.north - rectangle.south) * v;

      for (let column = 0; column <= grid; column += 1) {
        const u = column / grid;
        const lon = rectangle.west + (rectangle.east - rectangle.west) * u;
        const projected = this.projectCartographicToViewport(lon, lat, { allowDepthOutside: true });

        if (projected) {
          points.push(projected);
        }
      }
    }

    if (points.length === 0) {
      return this.tileFacesCamera(tile) ? conservativeViewportBounds(width, height) : undefined;
    }

    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);

    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }

  private projectCartographicToPixel(
    lon: number,
    lat: number,
    options: { logicalLodViewport?: boolean } = {},
  ): [number, number] | undefined {
    const [width, height] = options.logicalLodViewport
      ? this.logicalLodViewportSize()
      : [this.canvas.width || this.canvas.clientWidth, this.canvas.height || this.canvas.clientHeight];

    if (width <= 0 || height <= 0) {
      return undefined;
    }

    const world = this.cartographicToUnitSphere({
      lon: lon * (180 / Math.PI),
      lat: lat * (180 / Math.PI),
      height: this.sampleTerrainHeightAt(lon, lat) ?? 0,
    });
    const aspect = width / height;
    const viewProjection = multiply(this.camera.projectionMatrix(aspect), this.camera.viewMatrix());
    const ndc = transformPoint(viewProjection, world);

    if (!Number.isFinite(ndc[0]) || !Number.isFinite(ndc[1]) || ndc[2] < -1 || ndc[2] > 1) {
      return undefined;
    }

    return [((ndc[0] + 1) / 2) * width, ((1 - ndc[1]) / 2) * height];
  }

  private logicalLodViewportSize(): [number, number] {
    const actualWidth = Math.max(1, this.canvas.clientWidth || this.canvas.width || 1);
    const actualHeight = Math.max(1, this.canvas.clientHeight || this.canvas.height || 1);
    const height = this.lodViewportHeight();

    return [Math.max(1, height * (actualWidth / actualHeight)), height];
  }

  private tileCanContributeToView(tile: { x: number; y: number; z: number }): boolean {
    const rectangle = this.imageryTiling.tileXYToRectangle(tile);
    const centerLon = (rectangle.west + rectangle.east) * 0.5;
    const centerLat = (rectangle.south + rectangle.north) * 0.5;
    const center = this.cartographicToUnitSphere({
      lon: centerLon * (180 / Math.PI),
      lat: centerLat * (180 / Math.PI),
      height: 0,
    });
    const samples = [
      [rectangle.west, rectangle.south],
      [rectangle.east, rectangle.south],
      [rectangle.west, rectangle.north],
      [rectangle.east, rectangle.north],
      [centerLon, rectangle.south],
      [centerLon, rectangle.north],
      [rectangle.west, centerLat],
      [rectangle.east, centerLat],
    ] as const;
    let radius = 0;

    for (const [lon, lat] of samples) {
      const sample = this.cartographicToUnitSphere({
        lon: lon * (180 / Math.PI),
        lat: lat * (180 / Math.PI),
        height: 0,
      });
      radius = Math.max(radius, length(subtract(sample, center)));
    }

    const cameraDistance = length(this.camera.position);

    if (cameraDistance <= 1.0001) {
      return this.tileFacesCamera(tile);
    }

    if (this.cameraAltitudeAboveSurfaceMeters() < 250_000) {
      return this.tileFacesCamera(tile);
    }

    const cameraNormal = normalize(this.camera.position);
    const horizonDot = 1 / cameraDistance;
    const centerDot = dot(cameraNormal, center);

    return centerDot + radius >= horizonDot - 0.002 && this.tileFacesCamera(tile);
  }

  private tileFacesCamera(tile: { x: number; y: number; z: number }): boolean {
    const rectangle = this.imageryTiling.tileXYToRectangle(tile);
    const lon = (rectangle.west + rectangle.east) * 0.5;
    const lat = (rectangle.south + rectangle.north) * 0.5;
    const center = this.cartographicToUnitSphere({
      lon: lon * (180 / Math.PI),
      lat: lat * (180 / Math.PI),
      height: 0,
    });
    const toTile = subtract(center, this.camera.position);

    return dot(normalize(toTile), normalize(subtract(this.camera.target, this.camera.position))) > -0.15;
  }

  private projectCartographicToViewport(
    lon: number,
    lat: number,
    options: { allowDepthOutside?: boolean } = {},
  ): [number, number] | undefined {
    const width = this.canvas.width || this.canvas.clientWidth;
    const height = this.canvas.height || this.canvas.clientHeight;

    if (width <= 0 || height <= 0) {
      return undefined;
    }

    const world = this.cartographicToUnitSphere({
      lon: lon * (180 / Math.PI),
      lat: lat * (180 / Math.PI),
      height: this.sampleTerrainHeightAt(lon, lat) ?? 0,
    });
    const aspect = width / height;
    const viewProjection = multiply(this.camera.projectionMatrix(aspect), this.camera.viewMatrix());
    const clip = transformPointWithW(viewProjection, world);

    if (!clip || clip.w <= 0 || (!options.allowDepthOutside && (clip.z < -1.1 || clip.z > 1.1))) {
      return undefined;
    }

    return [((clip.x + 1) / 2) * width, ((1 - clip.y) / 2) * height];
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

  private pickUnitSphere(clientX: number, clientY: number): Vec3 | undefined {
    const ray = this.pickRay(clientX, clientY);

    if (!ray) {
      return undefined;
    }

    return intersectUnitSphere(ray);
  }

  private pickSurfacePatchPoint(clientX: number, clientY: number): Vec3 | undefined {
    const ray = this.pickRay(clientX, clientY);

    if (!ray) {
      return undefined;
    }

    const surfaceHit = this.pickTerrainSurfaceWithRay(ray);

    if (!surfaceHit?.point.every(Number.isFinite)) {
      return this.pickUnitSphere(clientX, clientY);
    }

    return surfaceHit.point;
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
    const terrainHit = this.pickTerrainSurfaceWithRay(ray);

    if (terrainHit) {
      return {
        lon: terrainHit.lon,
        lat: terrainHit.lat,
        height: terrainHit.height,
      };
    }

    const hit = intersectUnitSphere(ray);

    if (!hit) {
      return undefined;
    }

    if (!hit.every(Number.isFinite)) {
      return undefined;
    }

    const cartographic = Ellipsoid.WGS84.surfaceNormalToCartographic(hit);
    return { lon: cartographic.lon, lat: cartographic.lat, height: 0 };
  }

  private pickTerrainSurfaceWithRay(ray: Ray): { point: Vec3; lon: number; lat: number; height: number } | undefined {
    const ellipsoidHit = intersectUnitSphere(ray) ?? intersectNormalizedWgs84Surface(ray, this.terrainEnvelopeHeightMeters());

    if (!ellipsoidHit?.every(Number.isFinite)) {
      return undefined;
    }

    let cartographic = Ellipsoid.WGS84.surfaceNormalToCartographic(ellipsoidHit);
    let height = this.sampleTerrainHeightAt(cartographic.lon, cartographic.lat);

    if (height === undefined) {
      return undefined;
    }

    let point = intersectNormalizedWgs84Surface(ray, height);

    if (!point?.every(Number.isFinite)) {
      return undefined;
    }

    cartographic = Ellipsoid.WGS84.surfaceNormalToCartographic(point);
    height = this.sampleTerrainHeightAt(cartographic.lon, cartographic.lat) ?? height;
    point = intersectNormalizedWgs84Surface(ray, height);

    if (!point?.every(Number.isFinite)) {
      return undefined;
    }

    cartographic = Ellipsoid.WGS84.surfaceNormalToCartographic(point);
    return {
      point,
      lon: cartographic.lon,
      lat: cartographic.lat,
      height,
    };
  }

  private terrainEnvelopeHeightMeters(): number {
    if (this.lastTerrainMeshes.length === 0) {
      return this.terrain ? 12_000 : 0;
    }

    return Math.max(
      0,
      ...this.lastTerrainMeshes.map((entry) => Math.max(0, entry.mesh.maxHeight * this.defaultTerrainExaggeration)),
    );
  }

  private applyCameraHeightConstraints(): void {
    const baseMinHeight = this.cameraHeightLimits.minHeight ?? 0;
    const terrainHeight = this.cameraCollision.enabled ? this.sampleTerrainHeightBelowCamera() : undefined;
    const collisionMinHeight =
      terrainHeight === undefined ? baseMinHeight : Math.max(baseMinHeight, terrainHeight + this.cameraCollision.clearance);
    const minDistance = this.cameraSurfaceDistanceForHeight(collisionMinHeight);
    const maxDistance =
      this.cameraHeightLimits.maxHeight === undefined ? undefined : this.cameraSurfaceDistanceForHeight(this.cameraHeightLimits.maxHeight);

    this.camera.setLimits({
      minDistance,
      maxDistance,
    });
  }

  private sampleTerrainHeightBelowCamera(): number | undefined {
    const cartographic = Ellipsoid.WGS84.surfaceNormalToCartographic(this.camera.position);
    return this.sampleTerrainHeightAt(cartographic.lon, cartographic.lat) ?? 0;
  }

  private sampleTerrainHeightAt(lon: number, lat: number): number | undefined {
    const sampled = this.terrain?.sampleHeight?.(lon, lat);

    return Number.isFinite(sampled) ? sampled : undefined;
  }

  private cameraAltitudeAboveSurfaceMeters(): number {
    const geocentricHeight = Math.max(0, this.cameraEllipsoidHeightMeters());
    const terrainHeight = this.sampleTerrainHeightBelowCamera() ?? 0;

    return Math.max(this.cameraCollision.clearance, geocentricHeight - terrainHeight);
  }

  private cameraDistanceForLod(): number {
    return 1 + this.cameraAltitudeAboveSurfaceMeters() / Ellipsoid.WGS84.maximumRadius;
  }

  private cameraEllipsoidHeightMeters(): number {
    const cartographic = Ellipsoid.WGS84.surfaceNormalToCartographic(this.camera.position);
    const normal = Ellipsoid.WGS84.geodeticSurfaceNormal(cartographic.lon, cartographic.lat);
    const surface = Ellipsoid.WGS84.cartographicToCartesian({ lon: cartographic.lon, lat: cartographic.lat, height: 0 });
    const camera = [
      this.camera.position[0] * Ellipsoid.WGS84.maximumRadius,
      this.camera.position[1] * Ellipsoid.WGS84.maximumRadius,
      this.camera.position[2] * Ellipsoid.WGS84.maximumRadius,
    ] as const;

    return dot(subtract(camera, surface), normal);
  }

  private cameraSurfaceDistanceForHeight(heightMeters: number): number {
    const origin = this.camera.target;
    const direction = directionBetween(this.camera.target, this.camera.position);
    const hit = intersectNormalizedWgs84Surface({ origin, direction }, heightMeters);

    return hit ? length(subtract(hit, origin)) : 1 + Math.max(0, heightMeters) / Ellipsoid.WGS84.maximumRadius;
  }
}

export { Ellipsoid } from "./core/geodesy/ellipsoid";

type ScreenBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type ScreenTileCandidate = {
  tile: QuadtreeTile;
  bounds: ScreenBounds;
  desiredLevel: number;
  priority: number;
};

type RadianRectangle = {
  west: number;
  south: number;
  east: number;
  north: number;
};

function screenBoundsIntersectsViewport(bounds: ScreenBounds, width: number, height: number): boolean {
  const padding = Math.max(96, Math.min(width, height) * 0.18);

  return bounds.maxX >= -padding && bounds.minX <= width + padding && bounds.maxY >= -padding && bounds.minY <= height + padding;
}

function conservativeViewportBounds(width: number, height: number): ScreenBounds {
  return {
    minX: -width,
    maxX: width * 2,
    minY: -height,
    maxY: height * 2,
  };
}

function screenBoundsDistanceToViewportCenter(bounds: ScreenBounds, width: number, height: number): number {
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerY = (bounds.minY + bounds.maxY) * 0.5;
  const dx = centerX - width * 0.5;
  const dy = centerY - height * 0.5;

  return dx * dx + dy * dy;
}

function bestCandidateIndex(candidates: readonly ScreenTileCandidate[]): number {
  let bestIndex = 0;
  let bestPriority = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < candidates.length; index += 1) {
    if (candidates[index].priority > bestPriority) {
      bestPriority = candidates[index].priority;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function distanceFromCartographicToRectangleMeters(lon: number, lat: number, rectangle: RadianRectangle): number {
  const closestLon = clampRadians(lon, rectangle.west, rectangle.east);
  const closestLat = clampRadians(lat, rectangle.south, rectangle.north);

  return haversineMeters(lon, lat, closestLon, closestLat);
}

function haversineMeters(lonA: number, latA: number, lonB: number, latB: number): number {
  const dLat = latB - latA;
  const dLon = lonB - lonA;
  const sinLat = Math.sin(dLat * 0.5);
  const sinLon = Math.sin(dLon * 0.5);
  const a = sinLat * sinLat + Math.cos(latA) * Math.cos(latB) * sinLon * sinLon;

  return 2 * Ellipsoid.WGS84.maximumRadius * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function clampRadians(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function summarizeTileLevels(tiles: readonly QuadtreeTile[]): TileLevelStats {
  const histogram: Record<number, number> = {};
  let min: number | undefined;
  let max: number | undefined;
  let total = 0;

  for (const tile of tiles) {
    histogram[tile.z] = (histogram[tile.z] ?? 0) + 1;
    min = min === undefined ? tile.z : Math.min(min, tile.z);
    max = max === undefined ? tile.z : Math.max(max, tile.z);
    total += tile.z;
  }

  return {
    min,
    max,
    average: tiles.length > 0 ? total / tiles.length : undefined,
    histogram,
  };
}

function transformPointWithW(
  m: Float32Array,
  point: Vec3,
): { x: number; y: number; z: number; w: number } | undefined {
  const x = point[0];
  const y = point[1];
  const z = point[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];

  if (!Number.isFinite(w) || Math.abs(w) < 1e-9) {
    return undefined;
  }

  const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  const ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  const nz = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;

  if (![nx, ny, nz].every(Number.isFinite)) {
    return undefined;
  }

  return { x: nx, y: ny, z: nz, w };
}

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

function cameraHeightLimitsToCameraLimits(limits: CameraHeightLimits | undefined): CameraLimits {
  if (!limits) {
    return {};
  }

  return {
    minDistance:
      limits.minHeight === undefined ? undefined : 1 + Math.max(0, limits.minHeight) / Ellipsoid.WGS84.maximumRadius,
    maxDistance:
      limits.maxHeight === undefined ? undefined : 1 + Math.max(0, limits.maxHeight) / Ellipsoid.WGS84.maximumRadius,
  };
}

function normalizeCameraCollisionOptions(options: CameraCollisionOptions | undefined): Required<CameraCollisionOptions> {
  return {
    enabled: options?.enabled ?? true,
    clearance: Math.max(0, finiteOr(options?.clearance, 1)),
  };
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function unwrapTileX(x: number, anchor: number, count: number): number {
  let unwrapped = x;

  while (unwrapped - anchor > count / 2) {
    unwrapped -= count;
  }

  while (anchor - unwrapped > count / 2) {
    unwrapped += count;
  }

  return unwrapped;
}

function moduloTileX(x: number, count: number): number {
  return ((x % count) + count) % count;
}

function maxFiniteLevel(...levels: (number | undefined)[]): number | undefined {
  const finite = levels.filter((level): level is number => level !== undefined && Number.isFinite(level));

  return finite.length > 0 ? Math.max(...finite) : undefined;
}

function clampLodLayerLevel(
  level: number | undefined,
  layer: { minLevel: number; maxLevel: number },
): number | undefined {
  if (level === undefined || !Number.isFinite(level)) {
    return undefined;
  }

  return Math.min(layer.maxLevel, Math.max(layer.minLevel, Math.round(level)));
}

function intersectNormalizedWgs84Surface(ray: Ray, heightMeters: number): Vec3 | undefined {
  const ellipsoid = Ellipsoid.WGS84;
  const maxRadius = ellipsoid.maximumRadius;
  const axes = [
    (ellipsoid.radii[0] + heightMeters) / maxRadius,
    (ellipsoid.radii[1] + heightMeters) / maxRadius,
    (ellipsoid.radii[2] + heightMeters) / maxRadius,
  ] as const;
  const inverseAxesSquared = axes.map((axis) => 1 / (axis * axis)) as [number, number, number];
  const a =
    ray.direction[0] * ray.direction[0] * inverseAxesSquared[0] +
    ray.direction[1] * ray.direction[1] * inverseAxesSquared[1] +
    ray.direction[2] * ray.direction[2] * inverseAxesSquared[2];
  const b =
    2 *
    (ray.origin[0] * ray.direction[0] * inverseAxesSquared[0] +
      ray.origin[1] * ray.direction[1] * inverseAxesSquared[1] +
      ray.origin[2] * ray.direction[2] * inverseAxesSquared[2]);
  const c =
    ray.origin[0] * ray.origin[0] * inverseAxesSquared[0] +
    ray.origin[1] * ray.origin[1] * inverseAxesSquared[1] +
    ray.origin[2] * ray.origin[2] * inverseAxesSquared[2] -
    1;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) {
    return undefined;
  }

  const sqrt = Math.sqrt(discriminant);
  const near = (-b - sqrt) / (2 * a);
  const far = (-b + sqrt) / (2 * a);
  const t = near >= 0 ? near : far;

  if (t < 0) {
    return undefined;
  }

  return [
    ray.origin[0] + ray.direction[0] * t,
    ray.origin[1] + ray.direction[1] * t,
    ray.origin[2] + ray.direction[2] * t,
  ];
}
