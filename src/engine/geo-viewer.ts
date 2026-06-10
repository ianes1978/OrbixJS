import { OrbitCamera } from "./core/camera/orbit-camera";
import { type CameraFlyToOptions, type CameraLimits, type CameraSnapshot } from "./core/camera/orbit-camera";
import { type CameraKeyframe } from "./core/camera/camera-path";
import { sunDirectionFromDate } from "./core/astro/sun-position";
import { PointerController } from "./core/events/pointer-controller";
import { Ellipsoid, type Cartographic } from "./core/geodesy/ellipsoid";
import {
  createAdaptiveLodState,
  createLodContext,
  normalizeLodOptions,
  stabilizeLodLevel,
  updateAdaptiveLodState,
  type AdaptiveLodState,
  type LodContext,
  type LodOptions,
  type NormalizedLodOptions,
  type TileSelectionStrategyName,
} from "./core/lod/lod";
import { selectGlobeLodTargets } from "./core/lod/globe-lod-policy";
import { invert, multiply, transformPoint, type Mat4 } from "./core/math/mat4";
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
import { ClassicSelectionStrategy } from "./globe/selection/classic-selection-strategy";
import { QuadtreeSelectionStrategy } from "./globe/quadtree/quadtree-selection-strategy";
import { type TileSelectionHost, type TileSelectionStrategy } from "./globe/selection/selection-strategy";
import {
  conservativeViewportBounds,
  nonOverlappingQuadtreeTiles,
  screenBoundsIntersectsViewport,
  type ScreenBounds,
} from "./globe/selection/coverage-utils";
import { WebMercatorTilingScheme } from "./globe/tiling/web-mercator-tiling";
import { type TerrainProvider, type TerrainTileKey } from "./globe/terrain/terrain-provider";
import {
  TerrainSurfaceRuntime,
  type TerrainSurfaceMeshEntry,
  type TerrainSurfaceStats,
} from "./globe/terrain/terrain-surface-runtime";
import { terrainGridSizeForLevel } from "./globe/terrain/terrain-mesh";
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
    layerMinLevel?: number;
    layerMaxLevel?: number;
    activeTiles: number;
    loadedTiles: number;
    pendingTiles: number;
    errorTiles: number;
    renderTiles: number;
    exactRenderTiles: number;
    fallbackRenderTiles: number;
    requestLevels: TileLevelStats;
    renderLevels: TileLevelStats;
    exactRenderLevels: TileLevelStats;
    fallbackRenderLevels: TileLevelStats;
    errorLevels: TileLevelStats;
    compositeRenderTiles: number;
    compositeDescendants: number;
    compositeMaxLevel?: number;
    compositeCacheSize: number;
    vtFeedbackPages: number;
    vtResidentPages: number;
    vtMissingPages: number;
    vtUnavailablePages: number;
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
  rawFrameMs: number;
  rawCpuMs: number;
  rawUpdateMs: number;
  rawRenderMs: number;
  timestampMs: number;
  updateBreakdown: {
    cameraAndLodMs: number;
    sampleMs: number;
    coverageMs: number;
    imageryMs: number;
    terrainMs: number;
    debugTilesetMs: number;
  };
  coverageTiles: number;
  coverageBudget: number;
  coverageSamples: number;
  coverageStrategy: string;
  coverageLevels: TileLevelStats;
  /** Tile entrati+usciti dalla selezione rispetto al frame precedente (stabilità temporale). */
  tileChurn: number;
  effectiveRequestBudget: number;
  imageryTargetLevel?: number;
  terrainTargetLevel?: number;
  metricLevel?: number;
  lodDebug: {
    projectedImageryLevel?: number;
    projectedTerrainLevel?: number;
    metricImageryLevel?: number;
    imageryLevel?: number;
    terrainLevel?: number;
    cameraSlope: number;
    equalizedTerrainZoom: boolean;
    requestedImageryTargetLevel?: number;
    requestedTerrainTargetLevel?: number;
    stableImageryTargetLevel?: number;
    stableTerrainTargetLevel?: number;
    cameraAltitudeMeters: number;
    cameraDistanceForLod: number;
  };
  terrain?: TerrainSurfaceStats;
  lod: LodContext;
};

export type GeoViewerTileTelemetry = {
  timestampMs: number;
  imagery: {
    requested: string[];
    rendered: string[];
    visible: string[];
    offscreen: string[];
  };
  terrain: {
    requested: string[];
    rendered: string[];
    visible: string[];
    loading: string[];
    errors: string[];
    targetLevel?: number;
    gridSize?: number;
    providerMinLevel?: number;
    providerMaxNativeLevel?: number;
  };
  coverage: {
    strategy: string;
    budget: number;
    samples: number;
  };
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
const reducedViewportSampleSteps = [-0.99, -0.7, -0.42, -0.14, 0.14, 0.42, 0.7, 0.99] as const;
const nearSurfaceViewportSampleSteps = [-0.98, -0.5, 0, 0.5, 0.98] as const;
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
  private terrainProviderOptions: TerrainProviderOptions = {};
  private lastTerrainMeshes: TerrainSurfaceMeshEntry[] = [];
  private lastSurfaceTiles: SurfaceTile[] = [];
  private lastImageryRequestTileIds: string[] = [];
  private lastTerrainRequestTileIds: string[] = [];
  private lastCoverageBudget = 0;
  private lastCoverageSamples = 0;
  private lastTileChurn = 0;
  private tileLabelOverlay: HTMLDivElement | undefined;
  private lastDebugSurfaceKey = "";
  private lastRendererTerrainKey = "";
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
  private pendingImageryDropLevel: number | undefined;
  private pendingImageryDropFrames = 0;
  private pendingTerrainDropLevel: number | undefined;
  private pendingTerrainDropFrames = 0;
  private pendingTerrainRiseLevel: number | undefined;
  private pendingTerrainRiseFrames = 0;
  private lastTerrainTargetLevel: number | undefined;
  private lastValidCameraSnapshot: CameraSnapshot | undefined;
  private currentViewportSampleCount = viewportSampleCount;
  private terrainHeightSampleToken = 0;
  private lastFrameErrorLogAt = 0;
  private terrainHeightBelowCameraCache:
    | {
        token: number;
        terrain: TerrainProvider;
        position: Vec3;
        height: number | undefined;
      }
    | undefined;
  private cameraHeightLimits: CameraHeightLimits;
  private cameraCollision: Required<CameraCollisionOptions>;
  private lastCoverageStrategy = "none";
  private selectionStrategy: TileSelectionStrategy;

  private createSelectionStrategy(strategy: TileSelectionStrategyName): TileSelectionStrategy {
    const host = this.createSelectionHost();

    return strategy === "quadtree" ? new QuadtreeSelectionStrategy(host) : new ClassicSelectionStrategy(host);
  }

  private createSelectionHost(): TileSelectionHost {
    const viewer = this;

    return {
      get imageryTiling() {
        return viewer.imageryTiling;
      },
      canvasSize: () => [this.canvas.width || this.canvas.clientWidth, this.canvas.height || this.canvas.clientHeight],
      cameraFov: () => this.camera.fov,
      cameraTiltOffset: () => this.camera.tiltOffset,
      cameraAltitudeAboveSurfaceMeters: () => this.cameraAltitudeAboveSurfaceMeters(),
      cameraDistanceForLod: () => this.cameraDistanceForLod(),
      cameraSurfaceStatus: () => this.cameraSurfaceStatus(),
      lodViewportHeight: () => this.lodViewportHeight(),
      smoothedCpuMs: () => this.smoothedCpuMs,
      adaptiveQualityReduction: () => this.adaptiveLodState.qualityReduction,
      currentViewportSampleCount: () => this.currentViewportSampleCount,
      projectedImageryLevel: () => this.projectedImageryLevel(),
      pickNormalizedDeviceCoordinate: (x, y) => this.pickNormalizedDeviceCoordinate(x, y),
      pickRayFromNdc: (x, y) => this.pickRayFromNdc(x, y),
      nearestVisibleCartographicSample: () => this.nearestVisibleCartographicSample(),
      projectTileScreenBounds: (tile) => this.projectTileScreenBounds(tile),
      cameraPositionUnit: () => this.camera.position,
      viewProjectionMatrix: () => {
        const width = this.canvas.width || this.canvas.clientWidth || 1;
        const height = this.canvas.height || this.canvas.clientHeight || 1;

        return multiply(this.camera.projectionMatrix(width / height), this.camera.viewMatrix());
      },
    };
  }

  constructor(options: GeoViewerOptions) {
    this.onImageryStatsCallback = options.onImageryStats;
    this.onFrameStatsCallback = options.onFrameStats;
    this.onTilesetStatsCallback = options.onTilesetStats;
    this.lodOptions = normalizeLodOptions(options.lod);
    this.selectionStrategy = this.createSelectionStrategy(this.lodOptions.strategy);
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
    this.ensureTileLabelOverlay();

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
    this.lastValidCameraSnapshot = this.camera.snapshot();
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
    this.terrainSurface?.dispose();
    this.controller.destroy();
    this.renderer.destroy();
    this.canvas.remove();
  }

  setDebugTileOverlay(enabled: boolean): void {
    this.debugTileOverlay = enabled;
    this.renderer.setTileDebugOverlayVisible(enabled);
    this.syncDebugTileOverlay();
    this.updateTileLabelOverlay();
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
    this.terrainSurface?.dispose();
    this.terrain = provider;
    this.terrainProviderOptions = provider ? options : {};
    this.terrainSurface = provider ? this.createTerrainSurfaceRuntime(provider, options) : undefined;
    this.lastTerrainMeshes = [];
    this.lastTerrainTargetLevel = undefined;
    this.lastDebugSurfaceKey = "";
    this.lastRendererTerrainKey = "";
    this.renderer.setTerrainMeshes([]);
    this.renderer.setSurfaceFallbackVisible(Boolean(provider));
    this.syncDebugTileOverlay();
    this.applyCameraHeightConstraints();
  }

  flyTo(options: CameraFlyToOptions): void {
    this.camera.flyTo(options);
    this.applyCameraHeightConstraints();
    this.captureValidCameraSnapshot();
  }

  setCameraLimits(limits: CameraLimits): void {
    this.camera.setLimits(limits);
    this.captureValidCameraSnapshot();
  }

  setCameraHeightLimits(limits: CameraHeightLimits): void {
    this.cameraHeightLimits = limits;
    this.applyCameraHeightConstraints();
    this.captureValidCameraSnapshot();
  }

  setLod(options: LodOptions): void {
    this.lodOptions = normalizeLodOptions(options);
    this.adaptiveLodState = createAdaptiveLodState();
    this.stableImageryTargetLevel = undefined;
    this.stableTerrainTargetLevel = undefined;
    this.resetLodDropHysteresis();

    if (this.terrain) {
      this.recreateTerrainSurface();
    }
  }

  resetAdaptiveLod(): void {
    this.adaptiveLodState = createAdaptiveLodState();
    this.stableImageryTargetLevel = undefined;
    this.stableTerrainTargetLevel = undefined;
    this.resetLodDropHysteresis();
  }

  getLodContext(): LodContext | undefined {
    return this.currentLodContext ? { ...this.currentLodContext } : undefined;
  }

  tileTelemetry(): GeoViewerTileTelemetry {
    const imageryVisible: string[] = [];
    const imageryOffscreen: string[] = [];
    const terrainVisible: string[] = [];
    const terrainRendered = this.lastTerrainMeshes.map((entry) => entry.id);
    const terrainStats = this.terrainSurface?.stats();
    const terrainTargetLevel = this.terrainSurface ? this.lastTerrainTargetLevel : undefined;

    for (const id of this.lastActiveTileIds) {
      const tile = this.imagery.findTile(id) ?? quadtreeTileFromId(id);

      if (tile && this.tileIntersectsCurrentViewport(tile)) {
        imageryVisible.push(id);
      } else {
        imageryOffscreen.push(id);
      }
    }

    for (const entry of this.lastTerrainMeshes) {
      const tile = terrainTileAsQuadtree(entry.tile);

      if (this.tileIntersectsCurrentViewport(tile)) {
        terrainVisible.push(entry.id);
      }
    }

    return {
      timestampMs: performance.now(),
      imagery: {
        requested: [...this.lastImageryRequestTileIds],
        rendered: [...this.lastActiveTileIds],
        visible: imageryVisible,
        offscreen: imageryOffscreen,
      },
      terrain: {
        requested: [...this.lastTerrainRequestTileIds],
        rendered: terrainRendered,
        visible: terrainVisible,
        loading: this.terrainSurface?.loadingTileIds() ?? [],
        errors: this.terrainSurface?.errorTileIds() ?? [],
        targetLevel: terrainTargetLevel,
        gridSize:
          terrainTargetLevel === undefined
            ? undefined
            : terrainGridSizeForLevel(terrainTargetLevel, { gridSizeByLevel: this.lodOptions.terrain.gridSizeByLevel }),
        providerMinLevel: this.terrainSurface ? (terrainStats?.providerMinLevel ?? this.terrain?.minLevel) : undefined,
        providerMaxNativeLevel: this.terrainSurface ? (terrainStats?.providerMaxNativeLevel ?? this.terrain?.maxNativeLevel) : undefined,
      },
      coverage: {
        strategy: this.lastCoverageStrategy,
        budget: this.lastCoverageBudget,
        samples: this.lastCoverageSamples,
      },
    };
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

  private recreateTerrainSurface(): void {
    if (!this.terrain) {
      return;
    }

    this.terrainSurface?.dispose();
    this.terrainSurface = this.createTerrainSurfaceRuntime(this.terrain, this.terrainProviderOptions);
    this.lastTerrainMeshes = [];
    this.lastTerrainTargetLevel = undefined;
    this.lastDebugSurfaceKey = "";
    this.lastRendererTerrainKey = "";
    this.renderer.setTerrainMeshes([]);
    this.renderer.setSurfaceFallbackVisible(true);
    this.syncDebugTileOverlay();
  }

  private createTerrainSurfaceRuntime(provider: TerrainProvider, options: TerrainProviderOptions): TerrainSurfaceRuntime {
    const exaggeration = options.exaggeration ?? this.defaultTerrainExaggeration;
    const minLevel = Math.max(this.lodOptions.terrain.minLevel, provider.minLevel ?? this.lodOptions.terrain.minLevel);
    const maxLevel = Math.min(this.lodOptions.terrain.maxLevel, provider.maxNativeLevel ?? this.lodOptions.terrain.maxLevel);

    return new TerrainSurfaceRuntime({
      provider,
      selectorOptions: {
        minLevel,
        maxLevel: Math.max(minLevel, maxLevel),
        maxTiles: this.lodOptions.terrain.maxTiles,
      },
      createCpuMeshes: !this.renderer.capabilities.supportsTerrainHeightmapDisplacement,
      meshOptions: { exaggeration, skirtDepth: options.skirtDepth, gridSizeByLevel: this.lodOptions.terrain.gridSizeByLevel },
      maxMeshes: 512,
      maxPending: 24,
      onError: (error) => console.warn("Terrain surface tile failed", error),
    });
  }

  private recoverInvalidCameraState(): void {
    if (this.camera.isValid()) {
      this.captureValidCameraSnapshot();
      return;
    }

    if (this.lastValidCameraSnapshot) {
      this.camera.restoreSnapshot(this.lastValidCameraSnapshot);
      return;
    }

    this.camera.flyTo({ lon: 12.5, lat: 42.5, height: 1_000_000 });
    this.captureValidCameraSnapshot();
  }

  private captureValidCameraSnapshot(): void {
    if (this.camera.isValid()) {
      this.lastValidCameraSnapshot = this.camera.snapshot();
    }
  }

  private cameraCartographicCache?: { position: [number, number, number]; value: Cartographic };

  private cameraCartographic(): Cartographic {
    const position = this.camera.position;
    const cached = this.cameraCartographicCache;

    if (
      cached &&
      cached.position[0] === position[0] &&
      cached.position[1] === position[1] &&
      cached.position[2] === position[2]
    ) {
      return cached.value;
    }

    const value = Ellipsoid.WGS84.unitCartesianToCartographic(position);
    this.cameraCartographicCache = { position: [position[0], position[1], position[2]], value };
    return value;
  }

  cameraSurfaceStatus(): CameraSurfaceStatus {
    const cartographic = this.cameraCartographic();
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
    const fallback = this.cameraCartographic();
    const lon = center ? center[0] : fallback.lon;
    const lat = center ? center[1] : fallback.lat;
    const height = Math.max(0, this.cameraEllipsoidHeightMeters());

    return {
      lon: lon * (180 / Math.PI),
      lat: lat * (180 / Math.PI),
      height,
      heading: this.camera.lookYawOffset * (180 / Math.PI),
      pitch: this.camera.tiltOffset * (180 / Math.PI),
      fov: this.camera.fov * (180 / Math.PI),
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

  renderFrameForDebug(): void {
    if (this.disposed) {
      return;
    }

    this.renderFrameSafely(performance.now());
  }

  private start(): void {
    const render = () => {
      if (this.disposed) {
        return;
      }

      this.renderFrameSafely(performance.now());
      this.frame = requestAnimationFrame(render);
    };

    this.frame = requestAnimationFrame(render);
  }

  private renderFrameSafely(frameStart: number): void {
    try {
      this.renderFrame(frameStart);
    } catch (error) {
      const now = performance.now();

      if (now - this.lastFrameErrorLogAt > 1_000) {
        this.lastFrameErrorLogAt = now;
        console.error("GeoViewer render frame failed", error);
      }
    }
  }

  private renderFrame(frameStart: number): void {
      this.terrainHeightSampleToken += 1;
      const frameDelta = this.lastFrameTimestamp > 0 ? frameStart - this.lastFrameTimestamp : this.smoothedFrameMs;
      this.lastFrameTimestamp = frameStart;
      this.recoverInvalidCameraState();
      this.applyCameraHeightConstraints();
      const lodContext = this.createCurrentLodContext();
      this.currentLodContext = lodContext;
      const projectedImageryLevel = this.projectedImageryLevel(
        this.lodOptions.imagery.targetTilePixels,
        lodContext.pixelErrorBudget,
      );
      const projectedTerrainLevel = this.projectedImageryLevel(
        this.lodOptions.terrain.targetTilePixels,
        lodContext.pixelErrorBudget,
      );
      const metricImageryLevel = this.metricImageryLevel(lodContext);
      const cameraSlope = this.cameraSlopeForLod();
      const lodPolicy = selectGlobeLodTargets({
        projectedImageryLevel,
        projectedTerrainLevel,
        metricImageryLevel,
        cameraSlope,
        altitudeMeters: lodContext.altitudeMeters,
        options: this.lodOptions,
        context: lodContext,
      });
      lodContext.terrainEqualizedZoom = lodPolicy.equalizedTerrainZoom;
      const requestedImageryTargetLevel = this.performanceAdjustedTargetLevel(
        lodPolicy.requestedImageryTargetLevel,
        lodContext,
        "imagery",
      );
      const requestedTerrainTargetLevel = this.performanceAdjustedTargetLevel(
        lodPolicy.requestedTerrainTargetLevel,
        lodContext,
        "terrain",
      );
      const imageryTargetLevel = this.stabilizeImageryTargetLevel(requestedImageryTargetLevel);
      const terrainTargetLevel = this.stabilizeTerrainTargetLevel(requestedTerrainTargetLevel);
      this.lastTerrainTargetLevel = terrainTargetLevel;
      const afterLod = performance.now();
      const visibleSamples = this.visibleCartographicSamples();
      const coveragePositions = this.nearSurfaceAnchoredCoveragePositions(visibleSamples);
      const afterSamples = performance.now();
      const requestBudget = this.effectiveRequestBudget(lodContext);
      const coverageBudget = this.effectiveCoverageTileBudget(lodContext);
      const coverageSelection = this.selectionStrategy.selectCoverage({
        maxTiles: coverageBudget,
        targetLevel: imageryTargetLevel,
        coveragePositions,
        targetTilePixels: this.stableCoverageTargetPixels("imagery"),
      });
      this.lastCoverageStrategy = coverageSelection?.strategy ?? "none";
      const coverageTiles = coverageSelection?.tiles;
      // Il quadtree SSE produce foglie già non sovrapposte E ordinate per
      // priorità di caricamento: il pruning le riordinerebbe per (z,y,x)
      // distruggendo la priorità.
      const quadtreeSelection = this.lodOptions.strategy === "quadtree";
      const surfaceCoverageTiles = coverageTiles
        ? quadtreeSelection
          ? coverageTiles
          : nonOverlappingQuadtreeTiles(coverageTiles)
        : undefined;
      const imageryCenter = this.centerViewCartographic() ?? this.nearestVisibleCartographicSample() ?? coveragePositions[0];
      const terrainCoverageTiles = this.terrainSurface && imageryCenter
        ? terrainTargetLevel === imageryTargetLevel
          ? surfaceCoverageTiles
          : quadtreeSelection &&
              surfaceCoverageTiles &&
              imageryTargetLevel !== undefined &&
              terrainTargetLevel !== undefined &&
              imageryTargetLevel > terrainTargetLevel
            ? // Plan3 Fase 5: il terrain deriva dallo stesso albero dell'imagery,
              // mappato al livello terrain — un solo attraversamento per frame.
              deriveCoarserCoverage(
                surfaceCoverageTiles,
                imageryTargetLevel - terrainTargetLevel,
                this.effectiveTerrainTileBudget(lodContext),
              )
            : this.selectionStrategy.selectCoverage({
                maxTiles: this.effectiveTerrainTileBudget(lodContext),
                targetLevel: terrainTargetLevel,
                coveragePositions,
                targetTilePixels: this.stableCoverageTargetPixels("terrain"),
                recordStrategy: false,
              })?.tiles
        : undefined;
      const terrainSurfaceCoverageTiles = terrainCoverageTiles
        ? quadtreeSelection
          ? terrainCoverageTiles
          : nonOverlappingQuadtreeTiles(terrainCoverageTiles)
        : undefined;
      const coverageLevels = summarizeTileLevels(surfaceCoverageTiles ?? []);
      const afterCoverage = performance.now();
      const nextImageryRequestTileIds = surfaceCoverageTiles?.map((tile) => tile.id) ?? [];
      this.lastTileChurn = countTileChurn(this.lastImageryRequestTileIds, nextImageryRequestTileIds);
      this.lastImageryRequestTileIds = nextImageryRequestTileIds;
      this.lastCoverageBudget = coverageBudget;
      this.lastCoverageSamples = coveragePositions.length;
      const stats = this.imagery.update(
        imageryCenter ? [imageryCenter[0], imageryCenter[1], imageryCenter[2] ?? 0] : [0, 0, 0],
        this.cameraDistanceForLod(),
        {
          viewportHeight: this.canvas.height || this.canvas.clientHeight,
          fov: this.camera.fov,
          coveragePositions: coveragePositions.map((position) => [position[0], position[1]] as const),
          coverageTiles: surfaceCoverageTiles,
          requestBudget,
          targetLevel: imageryTargetLevel,
        },
      );

      if (stats) {
        this.onImageryStats(stats);
      }
      const afterImagery = performance.now();

      const terrainStats = this.syncTerrainSurface(
        imageryCenter,
        coveragePositions,
        terrainSurfaceCoverageTiles,
        terrainTargetLevel,
        lodContext,
        requestBudget,
      );
      this.lastTerrainRequestTileIds = terrainStats
        ? this.terrainSurface?.activeTiles().map((tile) => `${tile.level}/${tile.x}/${tile.y}`) ?? []
        : [];
      const afterTerrain = performance.now();
      void this.syncDebugTilesetContent();
      const afterDebugTileset = performance.now();
      const beforeRender = performance.now();
      this.renderer.render({ scene: this.scene, camera: this.camera });
      this.captureValidCameraSnapshot();
      const frameEnd = performance.now();
      const rawFrameMs = frameDelta;
      const rawCpuMs = frameEnd - frameStart;
      const rawUpdateMs = beforeRender - frameStart;
      const rawRenderMs = frameEnd - beforeRender;
      const frameMs = this.smoothFrameMetric("frame", frameDelta);
      const cpuMs = this.smoothFrameMetric("cpu", rawCpuMs);
      const updateMs = this.smoothFrameMetric("update", rawUpdateMs);
      const renderMs = this.smoothFrameMetric("render", rawRenderMs);
      this.onFrameStats({
        fps: 1000 / frameMs,
        frameMs,
        cpuMs,
        updateMs,
        renderMs,
        rawFrameMs,
        rawCpuMs,
        rawUpdateMs,
        rawRenderMs,
        timestampMs: frameEnd,
        updateBreakdown: {
          cameraAndLodMs: afterLod - frameStart,
          sampleMs: afterSamples - afterLod,
          coverageMs: afterCoverage - afterSamples,
          imageryMs: afterImagery - afterCoverage,
          terrainMs: afterTerrain - afterImagery,
          debugTilesetMs: afterDebugTileset - afterTerrain,
        },
        coverageTiles: surfaceCoverageTiles?.length ?? 0,
        coverageBudget,
        coverageSamples: coveragePositions.length,
        coverageStrategy: this.lastCoverageStrategy,
        tileChurn: this.lastTileChurn,
        coverageLevels,
        effectiveRequestBudget: requestBudget,
        imageryTargetLevel,
        terrainTargetLevel,
        metricLevel: metricImageryLevel,
        lodDebug: {
          projectedImageryLevel,
          projectedTerrainLevel,
          metricImageryLevel,
          imageryLevel: lodPolicy.imageryLevel,
          terrainLevel: lodPolicy.terrainLevel,
          cameraSlope,
          equalizedTerrainZoom: lodPolicy.equalizedTerrainZoom,
          requestedImageryTargetLevel,
          requestedTerrainTargetLevel,
          stableImageryTargetLevel: imageryTargetLevel,
          stableTerrainTargetLevel: terrainTargetLevel,
          cameraAltitudeMeters: lodContext.altitudeMeters,
          cameraDistanceForLod: lodContext.cameraDistance,
        },
        terrain: terrainStats,
        lod: lodContext,
      });
      this.adaptiveLodState = updateAdaptiveLodState(this.adaptiveLodState, Math.max(cpuMs, updateMs), this.lodOptions);
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

    // Il quadtree SSE copre onestamente tutto il frustum: i tetti per quota,
    // tarati sulle strategie ad anelli, lo strozzerebbero. Il raffinamento è
    // già limitato dalla soglia SSE; serve solo il tetto elastico globale.
    if (this.lodOptions.strategy === "quadtree") {
      return Math.min(elasticBudget, 256);
    }

    const altitudeMeters = this.cameraAltitudeAboveSurfaceMeters();

    if (altitudeMeters <= 2_500) {
      return Math.min(elasticBudget, 64);
    }

    if (altitudeMeters <= 20_000) {
      return Math.min(elasticBudget, Math.abs(this.camera.tiltOffset) > 0.35 ? 144 : 64);
    }

    if (altitudeMeters < 80_000) {
      return Math.min(elasticBudget, Math.abs(this.camera.tiltOffset) > 0.35 ? 176 : 96);
    }

    if (altitudeMeters <= 250_000) {
      return Math.min(elasticBudget, 96);
    }

    if (altitudeMeters <= 1_000_000) {
      return Math.min(elasticBudget, 128);
    }

    return elasticBudget;
  }

  private effectiveRequestBudget(lodContext: LodContext): number {
    if (this.cameraAltitudeAboveSurfaceMeters() < 80_000) {
      const strainedFrame = lodContext.adaptiveQualityReduction > 1.25 || this.smoothedCpuMs > 80;

      if (strainedFrame) {
        return Math.max(4, Math.min(lodContext.requestBudget, 8));
      }

      return Math.max(lodContext.requestBudget, Math.min(this.lodOptions.maxNetworkRequests, 12));
    }

    return lodContext.requestBudget;
  }

  private stableCoverageTargetPixels(layer: "imagery" | "terrain"): number {
    const layerOptions = layer === "imagery" ? this.lodOptions.imagery : this.lodOptions.terrain;

    return layerOptions.targetTilePixels * Math.max(0.5, this.lodOptions.pixelErrorBudget);
  }

  private performanceAdjustedTargetLevel(
    targetLevel: number | undefined,
    lodContext: LodContext,
    layer: "imagery" | "terrain",
  ): number | undefined {
    if (targetLevel === undefined || !Number.isFinite(targetLevel)) {
      return targetLevel;
    }

    const altitudeMeters = lodContext.altitudeMeters;
    const strainedFrame = lodContext.adaptiveQualityReduction > 1.25 || this.smoothedCpuMs > 80;
    const nearSurfaceFloor = this.nearSurfaceStableTargetFloor(lodContext, layer);

    if (nearSurfaceFloor !== undefined) {
      targetLevel = Math.max(targetLevel, nearSurfaceFloor);
    }

    if (!strainedFrame || altitudeMeters >= 80_000) {
      return targetLevel;
    }

    const severeFrame = this.smoothedCpuMs > 140;

    if (layer === "imagery") {
      const imageryDrop = severeFrame && altitudeMeters < 20_000 ? 1 : 0;

      return Math.max(nearSurfaceFloor ?? 2, targetLevel - imageryDrop);
    }

    const terrainStrainedFrame = lodContext.adaptiveQualityReduction > 0.75 || this.smoothedCpuMs > 32;
    const severeTerrainFrame = severeFrame || lodContext.adaptiveQualityReduction > 1.75;
    const terrainDrop = altitudeMeters < 20_000
      ? severeTerrainFrame
        ? 3
        : terrainStrainedFrame
          ? 2
          : 1
      : 1;

    return Math.max(nearSurfaceFloor ?? 2, targetLevel - terrainDrop);
  }

  private nearSurfaceStableTargetFloor(lodContext: LodContext, layer: "imagery" | "terrain"): number | undefined {
    if (lodContext.altitudeMeters >= 20_000 || !Number.isFinite(lodContext.metersPerPixel) || lodContext.metersPerPixel <= 0) {
      return undefined;
    }

    const layerOptions = layer === "imagery" ? this.lodOptions.imagery : this.lodOptions.terrain;
    const toleratedMetersPerPixel = lodContext.metersPerPixel * Math.max(0.5, this.lodOptions.pixelErrorBudget);
    const stableMetricLevel = Math.ceil(Math.log2(webMercatorLevelZeroMetersPerPixel / toleratedMetersPerPixel));
    const layerOffset = layer === "terrain" ? 1 : 0;

    return Math.min(layerOptions.maxLevel, Math.max(layerOptions.minLevel, stableMetricLevel - layerOffset));
  }

  private metricImageryLevel(lodContext: LodContext): number | undefined {
    if (!Number.isFinite(lodContext.metersPerPixel) || lodContext.metersPerPixel <= 0) {
      return undefined;
    }

    const toleratedMetersPerPixel = lodContext.metersPerPixel * Math.max(0.5, lodContext.pixelErrorBudget);

    return Math.ceil(Math.log2(webMercatorLevelZeroMetersPerPixel / toleratedMetersPerPixel));
  }

  private cameraSlopeForLod(): number {
    const forward = normalize(subtract(this.camera.target, this.camera.position));
    const inwardNormal = normalize([-this.camera.position[0], -this.camera.position[1], -this.camera.position[2]]);
    const tiltFactor = Math.cos(Math.min(Math.PI / 2, Math.abs(this.camera.tiltOffset)));

    return Math.min(1, Math.max(0, dot(forward, inwardNormal) * tiltFactor));
  }

  private stabilizeImageryTargetLevel(targetLevel: number | undefined): number | undefined {
    this.stableImageryTargetLevel = this.stabilizeTargetLevelWithDropHold("imagery", this.stableImageryTargetLevel, targetLevel);

    return this.stableImageryTargetLevel;
  }

  private stabilizeTerrainTargetLevel(targetLevel: number | undefined): number | undefined {
    this.stableTerrainTargetLevel = this.stabilizeTargetLevelWithDropHold("terrain", this.stableTerrainTargetLevel, targetLevel);

    return this.stableTerrainTargetLevel;
  }

  private stabilizeTargetLevelWithDropHold(
    layer: "imagery" | "terrain",
    previousLevel: number | undefined,
    targetLevel: number | undefined,
  ): number | undefined {
    if (targetLevel === undefined || !Number.isFinite(targetLevel)) {
      return previousLevel;
    }

    const roundedTarget = Math.round(targetLevel);

    if (previousLevel === undefined || !Number.isFinite(previousLevel)) {
      this.clearPendingDrop(layer);
      return roundedTarget;
    }

    if (roundedTarget >= previousLevel) {
      if (layer === "terrain" && roundedTarget > previousLevel) {
        this.clearPendingDrop(layer);

        const pendingFrames = this.pendingTerrainRiseLevel === roundedTarget ? this.pendingTerrainRiseFrames + 1 : 1;
        this.pendingTerrainRiseLevel = roundedTarget;
        this.pendingTerrainRiseFrames = pendingFrames;

        if (pendingFrames < 12) {
          return previousLevel;
        }

        this.clearPendingRise(layer);
      }

      this.clearPendingDrop(layer);
      return stabilizeLodLevel(previousLevel, roundedTarget, { maxRise: 1, maxDrop: 1 });
    }

    this.clearPendingRise(layer);

    const requiredFrames = layer === "imagery" ? 30 : 16;
    const pendingLevel = layer === "imagery" ? this.pendingImageryDropLevel : this.pendingTerrainDropLevel;
    const pendingFrames = pendingLevel === roundedTarget
      ? (layer === "imagery" ? this.pendingImageryDropFrames : this.pendingTerrainDropFrames) + 1
      : 1;

    if (layer === "imagery") {
      this.pendingImageryDropLevel = roundedTarget;
      this.pendingImageryDropFrames = pendingFrames;
    } else {
      this.pendingTerrainDropLevel = roundedTarget;
      this.pendingTerrainDropFrames = pendingFrames;
    }

    if (pendingFrames < requiredFrames) {
      return previousLevel;
    }

    this.clearPendingDrop(layer);
    return stabilizeLodLevel(previousLevel, roundedTarget, { maxRise: 1, maxDrop: 1 });
  }

  private clearPendingDrop(layer: "imagery" | "terrain"): void {
    if (layer === "imagery") {
      this.pendingImageryDropLevel = undefined;
      this.pendingImageryDropFrames = 0;
      return;
    }

    this.pendingTerrainDropLevel = undefined;
    this.pendingTerrainDropFrames = 0;
  }

  private clearPendingRise(layer: "imagery" | "terrain"): void {
    if (layer !== "terrain") {
      return;
    }

    this.pendingTerrainRiseLevel = undefined;
    this.pendingTerrainRiseFrames = 0;
  }

  private resetLodDropHysteresis(): void {
    this.clearPendingDrop("imagery");
    this.clearPendingDrop("terrain");
    this.clearPendingRise("terrain");
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
      viewportHeight: this.lodViewportHeight(),
      fov: this.camera.fov,
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
      if (this.lastDebugSurfaceKey === "empty") {
        return;
      }

      this.lastDebugSurfaceKey = "empty";
      this.lastSurfaceTiles = [];
      this.renderer.setActiveImageryTiles([]);
      this.updateTileLabelOverlay();
      return;
    }

    const loadingTerrainIds = this.terrainSurface?.loadingTileIds() ?? [];
    const errorTerrainIds = this.terrainSurface?.errorTileIds() ?? [];
    const key = [
      this.lastActiveTileIds.join(","),
      this.lastTerrainMeshes.map((entry) => entry.id).join(","),
      loadingTerrainIds.join(","),
      errorTerrainIds.join(","),
    ].join("|");

    if (key === this.lastDebugSurfaceKey) {
      return;
    }

    this.lastDebugSurfaceKey = key;
    const tiles = this.lastActiveTileIds
      .map((tileId) => this.imagery.findTile(tileId))
      .filter((tile): tile is QuadtreeTile => tile !== undefined);
    this.lastSurfaceTiles = createSurfaceTileSet({
      imageryTiles: tiles,
      terrainMeshes: this.lastTerrainMeshes,
      loadingTerrainIds,
      errorTerrainIds,
      tiling: this.imageryTiling,
    });
    for (const tileId of this.lastActiveTileIds) {
      const tile = this.imagery.findTile(tileId);

      if (tile) {
        this.renderer.ensureDebugImageryTile(tile);
      }
    }

    this.renderer.setActiveImageryTiles(this.lastActiveTileIds);
    this.updateTileLabelOverlay();
  }

  private ensureTileLabelOverlay(): void {
    if (this.tileLabelOverlay) {
      return;
    }

    if (getComputedStyle(this.container).position === "static") {
      this.container.style.position = "relative";
    }

    const overlay = document.createElement("div");
    overlay.className = "orbix-tile-label-overlay";
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "4";
    overlay.style.overflow = "hidden";
    overlay.hidden = true;
    this.container.append(overlay);
    this.tileLabelOverlay = overlay;
  }

  private updateTileLabelOverlay(): void {
    const overlay = this.tileLabelOverlay;

    if (!overlay) {
      return;
    }

    overlay.replaceChildren();
    overlay.hidden = !this.debugTileOverlay;

    if (!this.debugTileOverlay) {
      return;
    }

    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    const labels = this.visibleTileLabels(120);

    for (const label of labels) {
      const element = document.createElement("span");
      element.textContent = label.id;
      element.dataset.tileId = label.id;
      element.dataset.tileKind = label.kind;
      element.style.position = "absolute";
      element.style.left = `${Math.min(Math.max(label.x, 0), width)}px`;
      element.style.top = `${Math.min(Math.max(label.y, 0), height)}px`;
      element.style.transform = "translate(-50%, -50%)";
      element.style.padding = "2px 4px";
      element.style.border = label.kind === "terrain" ? "1px solid rgba(255, 214, 102, 0.9)" : "1px solid rgba(120, 212, 168, 0.9)";
      element.style.background = label.kind === "terrain" ? "rgba(48, 38, 12, 0.78)" : "rgba(6, 30, 24, 0.78)";
      element.style.color = "#ffffff";
      element.style.font = "10px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace";
      element.style.whiteSpace = "nowrap";
      element.style.textShadow = "0 1px 2px rgba(0,0,0,0.8)";
      overlay.append(element);
    }
  }

  private visibleTileLabels(maxLabels: number): { id: string; kind: "imagery" | "terrain"; x: number; y: number }[] {
    const labels: { id: string; kind: "imagery" | "terrain"; x: number; y: number }[] = [];
    const addLabel = (id: string, tile: QuadtreeTile, kind: "imagery" | "terrain") => {
      if (labels.length >= maxLabels) {
        return;
      }

      const bounds = this.projectTileScreenBounds(tile);

      if (!bounds || !this.screenBoundsIntersectsCurrentViewport(bounds)) {
        return;
      }

      labels.push({
        id,
        kind,
        x: (bounds.minX + bounds.maxX) * 0.5,
        y: (bounds.minY + bounds.maxY) * 0.5,
      });
    };

    for (const id of this.lastActiveTileIds) {
      const tile = this.imagery.findTile(id) ?? quadtreeTileFromId(id);

      if (tile) {
        addLabel(id, tile, "imagery");
      }
    }

    for (const entry of this.lastTerrainMeshes) {
      addLabel(entry.id, terrainTileAsQuadtree(entry.tile), "terrain");
    }

    return labels;
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
    this.lastRendererTerrainKey = this.lastTerrainMeshes.map((entry) => entry.id).join(",");
    this.renderer.setSurfaceFallbackVisible(Boolean(this.terrainSurface) && this.lastTerrainMeshes.length === 0);
    this.lastDebugSurfaceKey = "";
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
        this.lastRendererTerrainKey = "";
        this.lastDebugSurfaceKey = "";
        this.renderer.setTerrainMeshes([]);
        this.syncDebugTileOverlay();
      }
      return undefined;
    }

    const stats = this.terrainSurface.update(center[0], center[1], this.cameraDistanceForLod(), {
      viewportHeight: this.lodViewportHeight(),
      fov: this.camera.fov,
      coveragePositions: coveragePositions.map((position) => [position[0], position[1]] as const),
      coverageTiles: coverageTiles ? nonOverlappingQuadtreeTiles(coverageTiles) : undefined,
      maxTiles: this.effectiveTerrainTileBudget(lodContext),
      requestBudget,
      targetLevel,
    });
    this.lastTerrainMeshes = this.terrainSurface.readyMeshes();
    const terrainKey = this.lastTerrainMeshes.map((entry) => entry.id).join(",");

    if (terrainKey !== this.lastRendererTerrainKey) {
      this.lastRendererTerrainKey = terrainKey;
      this.renderer.setTerrainMeshes(this.lastTerrainMeshes);
    }

    this.renderer.setSurfaceFallbackVisible(this.lastTerrainMeshes.length === 0);
    this.syncDebugTileOverlay();
    return stats;
  }

  private effectiveTerrainTileBudget(lodContext: LodContext): number {
    const altitudeMeters = this.cameraAltitudeAboveSurfaceMeters();
    const baseBudget = Math.min(this.lodOptions.terrain.maxTiles, lodContext.tileBudget);
    const strainedFrame = lodContext.adaptiveQualityReduction > 0.75 || this.smoothedCpuMs > 32;

    if (altitudeMeters <= 5_000) {
      return Math.min(baseBudget, strainedFrame ? 32 : 40);
    }

    if (altitudeMeters <= 20_000) {
      return Math.min(baseBudget, strainedFrame ? 40 : 56);
    }

    if (altitudeMeters <= 80_000) {
      return Math.min(baseBudget, strainedFrame ? 64 : 96);
    }

    return Math.min(baseBudget, 192);
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
      pickRay: (clientX, clientY) => this.pickRay(clientX, clientY),
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
    const steps = this.viewportSampleStepsForFrame();
    this.currentViewportSampleCount = steps.length * steps.length;

    for (const y of steps) {
      for (const x of steps) {
        const cartographic = this.pickNormalizedDeviceCoordinate(x, y);

        if (cartographic) {
          samples.push({ lon: cartographic.lon, lat: cartographic.lat, distance: x * x + y * y });
        }
      }
    }

    return samples.sort((a, b) => a.distance - b.distance).map((sample) => [sample.lon, sample.lat]);
  }

  private nearSurfaceAnchoredCoveragePositions(
    samples: readonly (readonly [number, number, number?])[],
  ): readonly (readonly [number, number, number?])[] {
    const altitudeMeters = this.cameraAltitudeAboveSurfaceMeters();
    const shouldAnchor = altitudeMeters <= 2_500 || (Math.abs(this.camera.tiltOffset) > 0.35 && altitudeMeters <= 80_000);

    if (!shouldAnchor) {
      return samples;
    }

    const cartographic = this.cameraCartographic();
    const anchor: readonly [number, number, number?] = [cartographic.lon, cartographic.lat, 0];

    return [anchor, ...samples];
  }

  private viewportSampleStepsForFrame(): readonly number[] {
    if (this.cameraAltitudeAboveSurfaceMeters() <= 2_500) {
      return nearSurfaceViewportSampleSteps;
    }

    if (!this.terrainSurface) {
      return this.smoothedCpuMs > 18 ? reducedViewportSampleSteps : viewportSampleSteps;
    }

    if (this.smoothedCpuMs > 18) {
      return nearSurfaceViewportSampleSteps;
    }

    return reducedViewportSampleSteps;
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
      return this.cameraAltitudeAboveSurfaceMeters() <= 2_500 && this.tileFacesCamera(tile)
        ? conservativeViewportBounds(width, height)
        : undefined;
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

  private tileIntersectsCurrentViewport(tile: { x: number; y: number; z: number }): boolean {
    const bounds = this.projectTileScreenBounds(tile);

    return bounds !== undefined && this.screenBoundsIntersectsCurrentViewport(bounds);
  }

  private screenBoundsIntersectsCurrentViewport(bounds: ScreenBounds): boolean {
    const width = this.canvas.width || this.canvas.clientWidth;
    const height = this.canvas.height || this.canvas.clientHeight;

    return width > 0 && height > 0 && screenBoundsIntersectsViewport(bounds, width, height);
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

    const cameraNormal = normalize(this.camera.position);
    const horizonDot = 1 / cameraDistance;
    const centerDot = dot(cameraNormal, normalize(center));
    // Margine per il terreno oltre l'orizzonte geometrico e per l'appiattimento
    // dell'ellissoide (raggio locale < 1): più largo vicino al suolo.
    const horizonSlack = this.cameraAltitudeAboveSurfaceMeters() < 250_000 ? 0.004 : 0.002;

    return centerDot + radius >= horizonDot - horizonSlack && this.tileFacesCamera(tile);
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
    const ray = this.pickRayFromNdc(x, y);

    return ray ? this.pickGlobeWithRay(ray) : undefined;
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

  private pickRayFromNdc(x: number, y: number): Ray | undefined {
    const width = this.canvas.width || this.canvas.clientWidth;
    const height = this.canvas.height || this.canvas.clientHeight;

    if (width <= 0 || height <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
      return undefined;
    }

    const aspect = width / height;
    let inverseViewProjection: ReturnType<typeof invert>;

    try {
      inverseViewProjection = invert(multiply(this.camera.projectionMatrix(aspect), this.camera.viewMatrix()));
    } catch {
      return undefined;
    }

    const near = transformPoint(inverseViewProjection, [x, y, -1]);
    const far = transformPoint(inverseViewProjection, [x, y, 1]);
    const direction = directionBetween(near, far);

    return near.every(Number.isFinite) && direction.every(Number.isFinite)
      ? { origin: near, direction }
      : undefined;
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

    const hit = intersectNormalizedWgs84Surface(ray, 0) ?? intersectUnitSphere(ray);

    if (!hit) {
      return undefined;
    }

    if (!hit.every(Number.isFinite)) {
      return undefined;
    }

    const cartographic = Ellipsoid.WGS84.unitCartesianToCartographic(hit);
    return { lon: cartographic.lon, lat: cartographic.lat, height: 0 };
  }

  private pickTerrainSurfaceWithRay(ray: Ray): { point: Vec3; lon: number; lat: number; height: number } | undefined {
    const ellipsoidHit = intersectUnitSphere(ray) ?? intersectNormalizedWgs84Surface(ray, this.terrainEnvelopeHeightMeters());

    if (!ellipsoidHit?.every(Number.isFinite)) {
      return undefined;
    }

    let cartographic = Ellipsoid.WGS84.unitCartesianToCartographic(ellipsoidHit);
    let height = this.sampleTerrainHeightAt(cartographic.lon, cartographic.lat);

    if (height === undefined) {
      return undefined;
    }

    let point = intersectNormalizedWgs84Surface(ray, height);

    if (!point?.every(Number.isFinite)) {
      return undefined;
    }

    cartographic = Ellipsoid.WGS84.unitCartesianToCartographic(point);
    height = this.sampleTerrainHeightAt(cartographic.lon, cartographic.lat) ?? height;
    point = intersectNormalizedWgs84Surface(ray, height);

    if (!point?.every(Number.isFinite)) {
      return undefined;
    }

    cartographic = Ellipsoid.WGS84.unitCartesianToCartographic(point);
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
      ...this.lastTerrainMeshes.map((entry) => Math.max(0, entry.heightmap.maxHeight * entry.exaggeration)),
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
    if (!this.terrain) {
      return undefined;
    }

    const position = this.camera.position;
    const cached = this.terrainHeightBelowCameraCache;

    if (
      cached &&
      cached.token === this.terrainHeightSampleToken &&
      cached.terrain === this.terrain &&
      cached.position[0] === position[0] &&
      cached.position[1] === position[1] &&
      cached.position[2] === position[2]
    ) {
      return cached.height;
    }

    const cartographic = this.cameraCartographic();
    const height = this.sampleTerrainHeightAt(cartographic.lon, cartographic.lat);
    this.terrainHeightBelowCameraCache = {
      token: this.terrainHeightSampleToken,
      terrain: this.terrain,
      position: [position[0], position[1], position[2]],
      height,
    };
    return height;
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
    return this.cameraCartographic().height ?? 0;
  }

  private cameraSurfaceDistanceForHeight(heightMeters: number): number {
    const cartographic = this.cameraCartographic();
    const surface = Ellipsoid.WGS84.cartographicToCartesian({
      lon: cartographic.lon,
      lat: cartographic.lat,
      height: Math.max(0, heightMeters),
    });
    const normalizedSurface = [
      surface[0] / Ellipsoid.WGS84.maximumRadius,
      surface[1] / Ellipsoid.WGS84.maximumRadius,
      surface[2] / Ellipsoid.WGS84.maximumRadius,
    ] as const;

    return length(subtract(normalizedSurface, this.camera.target));
  }
}

export { Ellipsoid } from "./core/geodesy/ellipsoid";

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

function deriveCoarserCoverage(tiles: readonly QuadtreeTile[], levelDrop: number, maxTiles: number): QuadtreeTile[] {
  const drop = Math.max(0, Math.round(levelDrop));
  const minLevel = 2;
  const derived = new Map<string, QuadtreeTile>();

  for (const tile of tiles) {
    const targetLevel = Math.max(minLevel, tile.z - drop);
    const factor = 2 ** (tile.z - targetLevel);
    const coarse = createQuadtreeTile(Math.floor(tile.x / factor), Math.floor(tile.y / factor), targetLevel);

    if (!derived.has(coarse.id)) {
      derived.set(coarse.id, coarse);

      if (derived.size >= maxTiles) {
        break;
      }
    }
  }

  // Il drop uniforme su foglie di livelli diversi può produrre coppie
  // antenato/discendente: le mesh terrain sovrapposte vanno potate.
  return nonOverlappingQuadtreeTiles([...derived.values()]);
}

function countTileChurn(previousIds: readonly string[], nextIds: readonly string[]): number {
  const previous = new Set(previousIds);
  const next = new Set(nextIds);
  let churn = 0;

  for (const id of next) {
    if (!previous.has(id)) {
      churn += 1;
    }
  }

  for (const id of previous) {
    if (!next.has(id)) {
      churn += 1;
    }
  }

  return churn;
}

function quadtreeTileFromId(id: string): QuadtreeTile | undefined {
  const [z, x, y] = id.split("/").map(Number);

  return [z, x, y].every((value) => Number.isFinite(value)) ? createQuadtreeTile(x, y, z) : undefined;
}

function terrainTileAsQuadtree(tile: TerrainTileKey): QuadtreeTile {
  return createQuadtreeTile(tile.x, tile.y, tile.level);
}

function transformPointWithW(
  m: Mat4,
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
