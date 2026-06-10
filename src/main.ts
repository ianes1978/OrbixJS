import "./styles.css";
import { GeoViewer, type GeoViewerFrameStats } from "./engine/geo-viewer";
import { type TileLevelStats } from "./engine/globe/imagery/imagery-layer";
import { type LodOptions } from "./engine/core/lod/lod";
import { cameraPathDuration, sampleCameraPath, type CameraPath, type CameraPathSample } from "./engine/core/camera/camera-path";
import { findDataSource, loadDataCatalog, type DataSourceDescriptor } from "./engine/catalog/data-catalog";
import { loadOrbixProject, resolveOrbixLayerCrs } from "./engine/project/orbix-project";
import { DebugTileProvider } from "./engine/globe/imagery/debug-tile-provider";
import { createHeightmapTerrainProvider, loadHeightmapTerrainManifest } from "./engine/globe/terrain/heightmap-terrain-provider";
import {
  createCivisQuantizedMeshTerrainProvider,
  loadCivisQuantizedMeshLayer,
} from "./engine/globe/terrain/civis-quantized-mesh-terrain-provider";
import { createProceduralTerrainProvider } from "./engine/globe/terrain/procedural-terrain-provider";
import { findPreprocessJob, loadPreprocessManifest } from "./engine/preprocess/preprocess-manifest";
import { roadmap } from "./roadmap";

declare global {
  interface Window {
    __orbixDebug?: {
      viewer: GeoViewer;
      flyTo: (options: { lon: number; lat: number; height: number; heading?: number; pitch?: number; fov?: number }) => void;
      renderFrame: () => void;
      resetAdaptiveLod: () => void;
      setDtmTerrain: (enabled: boolean) => Promise<void>;
      setDebugImagery: (enabled: boolean) => void;
      tileTelemetry: () => ReturnType<GeoViewer["tileTelemetry"]>;
      runCameraPathAudit: (pathId?: string) => Promise<CameraPathTelemetrySample[]>;
      runBenchmark: (pathId?: string) => Promise<CameraPathBenchmarkResult | undefined>;
      cameraPathLog: () => CameraPathTelemetrySample[];
      benchmarkResult: () => CameraPathBenchmarkResult | undefined;
      stats: () => {
        frame: GeoViewerFrameStats | undefined;
        imagery: unknown;
        tiles: ReturnType<GeoViewer["tileTelemetry"]>;
        camera: ReturnType<GeoViewer["cameraSnapshot"]>;
        surface: ReturnType<GeoViewer["cameraSurfaceStatus"]>;
        frameStatus: string;
        lodDebug: string;
      };
    };
  }
}

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root element");
}

app.innerHTML = `
  <main class="shell">
    <section class="workspace" aria-label="OrbixJS development viewer">
      <div class="viewport">
        <div id="globe" class="globe-host"></div>
        <div class="brand-hud">
          <span class="eyebrow">MVP 1</span>
          <h1>OrbixJS</h1>
          <p class="hint">Drag orbit, Shift+drag pan, Alt+drag look, rotellina zoom</p>
        </div>

        <button id="mobile-controls-toggle" class="drawer-tab toc-tab" type="button" aria-expanded="false" aria-controls="demo-toc">
          Menu
        </button>
        <button id="info-toggle" class="drawer-tab info-tab" type="button" aria-expanded="true" aria-controls="info-panel">
          Info ON
        </button>

        <nav id="demo-toc" class="toc-drawer" aria-label="Demo controls">
          <header class="drawer-head">
            <span class="eyebrow">Demo</span>
            <strong>Comandi</strong>
          </header>
          <section class="control-section" aria-label="Visualizzazione">
            <h2>Vista</h2>
            <button id="renderer-toggle" class="debug-toggle" type="button" aria-pressed="false">
              WebGPU
            </button>
            <button id="tile-debug-toggle" class="debug-toggle" type="button" aria-pressed="false">
              LOD overlay
            </button>
            <button id="debug-imagery-toggle" class="debug-toggle" type="button" aria-pressed="false">
              Test textures
            </button>
            <button id="coastline-toggle" class="debug-toggle" type="button" aria-pressed="false">
              Coastline
            </button>
            <button id="model-toggle" class="debug-toggle" type="button" aria-pressed="false">
              Model
            </button>
            <button id="dtm-terrain-toggle" class="debug-toggle" type="button" aria-pressed="false">
              DTM Alto Adige
            </button>
            <button id="terrain-toggle" class="debug-toggle" type="button" aria-pressed="false">
              Synthetic relief
            </button>
          </section>
          <section class="control-section" aria-label="Tempo">
            <h2>Tempo</h2>
            <label class="metric scene-date">
              <span>Data sole</span>
              <input id="scene-date" type="datetime-local" value="2026-06-05T12:00" />
            </label>
          </section>
          <section class="control-section" aria-label="Navigazione">
            <h2>FlyTo</h2>
            <div class="fly-presets" aria-label="FlyTo presets">
              <button data-fly-to="italy" type="button">Italia</button>
              <button data-fly-to="usa" type="button">USA</button>
              <button data-fly-to="tokyo" type="button">Tokyo</button>
            </div>
          </section>
          <section class="control-section" aria-label="Camera configuration">
            <h2>Camera config</h2>
            <label class="slider-control">
              <span>Quota min <output data-camera-limit-value="minHeightMeters">0 m</output></span>
              <input data-camera-limit="minHeightMeters" type="range" min="0" max="5000" step="1" value="0" />
            </label>
            <button id="camera-collision-toggle" class="debug-toggle compact-toggle" type="button" aria-pressed="true">
              Collision ON
            </button>
            <label class="slider-control">
              <span>Clearance <output data-camera-limit-value="collisionClearanceMeters">0 m</output></span>
              <input data-camera-limit="collisionClearanceMeters" type="range" min="0" max="100" step="0.5" value="0" />
            </label>
            <label class="slider-control">
              <span>Quota max <output data-camera-limit-value="maxHeightMeters">57310 km</output></span>
              <input data-camera-limit="maxHeightMeters" type="range" min="1000" max="120000000" step="1000" value="57310000" />
            </label>
            <label class="slider-control">
              <span>Tilt min <output data-camera-limit-value="minTiltDeg">-360°</output></span>
              <input data-camera-limit="minTiltDeg" type="range" min="-360" max="0" step="1" value="-360" />
            </label>
            <label class="slider-control">
              <span>Tilt max <output data-camera-limit-value="maxTiltDeg">360°</output></span>
              <input data-camera-limit="maxTiltDeg" type="range" min="0" max="360" step="1" value="360" />
            </label>
            <label class="slider-control">
              <span>FOV <output data-camera-limit-value="fovDeg">45°</output></span>
              <input data-camera-limit="fovDeg" type="range" min="15" max="90" step="1" value="45" />
            </label>
          </section>
          <section class="control-section" aria-label="LOD configuration">
            <h2>LOD</h2>
            <label class="slider-control">
              <span>Bilancio <output data-lod-value="qualityMultiplier">1.00x neutro</output></span>
              <input data-lod-control="qualityMultiplier" type="range" min="0.5" max="1.75" step="0.05" value="1" />
            </label>
            <label class="slider-control">
              <span>Texture tile <output data-lod-value="imageryTargetTilePixels">256 px</output></span>
              <input data-lod-control="imageryTargetTilePixels" type="range" min="128" max="768" step="16" value="256" />
            </label>
            <label class="slider-control">
              <span>DTM tile <output data-lod-value="terrainTargetTilePixels">256 px</output></span>
              <input data-lod-control="terrainTargetTilePixels" type="range" min="96" max="640" step="16" value="256" />
            </label>
            <label class="slider-control">
              <span>DTM budget <output data-lod-value="terrainMaxTiles">256</output></span>
              <input data-lod-control="terrainMaxTiles" type="range" min="64" max="1536" step="32" value="256" />
            </label>
          </section>
          <section class="control-section" aria-label="Camera path">
            <h2>Camera path</h2>
            <div id="camera-paths" class="fly-presets path-presets" aria-label="Camera path presets"></div>
            <button id="camera-path-stop" class="debug-toggle compact-toggle" type="button" disabled>
              Stop path
            </button>
            <button id="camera-path-audit" class="debug-toggle compact-toggle" type="button">
              Audit path
            </button>
            <button id="camera-path-benchmark" class="debug-toggle compact-toggle" type="button">
              Benchmark
            </button>
            <button id="camera-snapshot-copy" class="debug-toggle compact-toggle" type="button">
              Copy camera
            </button>
            <button id="camera-keyframe-copy" class="debug-toggle compact-toggle" type="button">
              Copy keyframe
            </button>
            <div class="metric compact-metric">
              <span>Stato path</span>
              <strong id="camera-path-status">nessun path</strong>
            </div>
            <div class="metric compact-metric">
              <span>Export camera</span>
              <strong id="camera-snapshot-status">pronto</strong>
            </div>
            <textarea
              id="camera-snapshot-output"
              class="snapshot-output"
              aria-label="Camera snapshot JSON"
              readonly
              hidden
            ></textarea>
            <textarea
              id="camera-path-log-output"
              class="snapshot-output"
              aria-label="Camera path telemetry JSON"
              readonly
              hidden
            ></textarea>
            <textarea
              id="camera-benchmark-output"
              class="snapshot-output"
              aria-label="Camera benchmark JSON"
              readonly
              hidden
            ></textarea>
          </section>
        </nav>

        <aside id="info-panel" class="panel info-panel open" aria-label="Roadmap progress">
          <header>
            <p class="eyebrow">Plan2.md</p>
            <h2>Progressi</h2>
          </header>
          <div class="status-grid" aria-label="Runtime status">
            <div class="metric">
              <span>Renderer</span>
              <strong id="renderer-status">WebGL2</strong>
            </div>
            <div class="metric">
              <span>Imagery</span>
              <strong id="imagery-status">Ortofoto</strong>
            </div>
            <div class="metric wide">
              <span>Tile runtime</span>
              <strong id="tile-status">LOD -</strong>
            </div>
            <div class="metric wide">
              <span>Frame</span>
              <strong id="frame-status">fps -</strong>
            </div>
            <div class="metric">
              <span>3D Tiles</span>
              <strong id="tiles3d-status">tileset -</strong>
            </div>
            <div class="metric wide">
              <span>Picking</span>
              <strong id="picking-status">click globo</strong>
            </div>
            <div class="metric wide">
              <span>Camera</span>
              <strong id="camera-status">coord -</strong>
            </div>
            <label class="metric wide lod-debug-metric">
              <span>LOD debug</span>
              <textarea
                id="lod-debug-output"
                class="lod-debug-output"
                aria-label="LOD debug text"
                readonly
              >LOD debug -</textarea>
              <textarea
                id="tile-telemetry-output"
                class="lod-debug-output"
                aria-label="Tile telemetry JSON"
                readonly
                hidden
              >{}</textarea>
            </label>
          </div>
          <div class="overall">
            <div class="overall-copy">
              <span>Avanzamento Plan2</span>
              <strong id="overall-progress">0%</strong>
            </div>
            <div class="bar" aria-hidden="true">
              <span id="overall-bar"></span>
            </div>
          </div>
          <ol id="roadmap" class="roadmap"></ol>
        </aside>
      </div>
    </section>
  </main>
`;

const list = document.querySelector<HTMLOListElement>("#roadmap");
const overallProgress = document.querySelector<HTMLElement>("#overall-progress");
const overallBar = document.querySelector<HTMLElement>("#overall-bar");
const rendererStatus = document.querySelector<HTMLElement>("#renderer-status");
const rendererToggle = document.querySelector<HTMLButtonElement>("#renderer-toggle");
const imageryStatus = document.querySelector<HTMLElement>("#imagery-status");
const tileStatus = document.querySelector<HTMLElement>("#tile-status");
const frameStatus = document.querySelector<HTMLElement>("#frame-status");
const tiles3dStatus = document.querySelector<HTMLElement>("#tiles3d-status");
const pickingStatus = document.querySelector<HTMLElement>("#picking-status");
const cameraStatus = document.querySelector<HTMLElement>("#camera-status");
const lodDebugOutput = document.querySelector<HTMLTextAreaElement>("#lod-debug-output");
const tileDebugToggle = document.querySelector<HTMLButtonElement>("#tile-debug-toggle");
const debugImageryToggle = document.querySelector<HTMLButtonElement>("#debug-imagery-toggle");
const coastlineToggle = document.querySelector<HTMLButtonElement>("#coastline-toggle");
const modelToggle = document.querySelector<HTMLButtonElement>("#model-toggle");
const dtmTerrainToggle = document.querySelector<HTMLButtonElement>("#dtm-terrain-toggle");
const terrainToggle = document.querySelector<HTMLButtonElement>("#terrain-toggle");
const mobileControlsToggle = document.querySelector<HTMLButtonElement>("#mobile-controls-toggle");
const hudControls = document.querySelector<HTMLElement>("#demo-toc");
const infoToggle = document.querySelector<HTMLButtonElement>("#info-toggle");
const infoPanel = document.querySelector<HTMLElement>("#info-panel");
const sceneDateInput = document.querySelector<HTMLInputElement>("#scene-date");
const flyPresetButtons = document.querySelectorAll<HTMLButtonElement>("[data-fly-to]");
const cameraLimitInputs = document.querySelectorAll<HTMLInputElement>("[data-camera-limit]");
const cameraLimitOutputs = document.querySelectorAll<HTMLOutputElement>("[data-camera-limit-value]");
const lodControlInputs = document.querySelectorAll<HTMLInputElement>("[data-lod-control]");
const lodControlOutputs = document.querySelectorAll<HTMLOutputElement>("[data-lod-value]");
const cameraCollisionToggle = document.querySelector<HTMLButtonElement>("#camera-collision-toggle");
const cameraPathControls = document.querySelector<HTMLElement>("#camera-paths");
const cameraPathStop = document.querySelector<HTMLButtonElement>("#camera-path-stop");
const cameraPathAudit = document.querySelector<HTMLButtonElement>("#camera-path-audit");
const cameraPathBenchmark = document.querySelector<HTMLButtonElement>("#camera-path-benchmark");
const cameraPathStatus = document.querySelector<HTMLElement>("#camera-path-status");
const cameraSnapshotCopy = document.querySelector<HTMLButtonElement>("#camera-snapshot-copy");
const cameraKeyframeCopy = document.querySelector<HTMLButtonElement>("#camera-keyframe-copy");
const cameraSnapshotStatus = document.querySelector<HTMLElement>("#camera-snapshot-status");
const cameraSnapshotOutput = document.querySelector<HTMLTextAreaElement>("#camera-snapshot-output");
const cameraPathLogOutput = document.querySelector<HTMLTextAreaElement>("#camera-path-log-output");
const cameraBenchmarkOutput = document.querySelector<HTMLTextAreaElement>("#camera-benchmark-output");
const tileTelemetryOutput = document.querySelector<HTMLTextAreaElement>("#tile-telemetry-output");

if (
  !list ||
  !overallProgress ||
  !overallBar ||
  !rendererStatus ||
  !rendererToggle ||
  !imageryStatus ||
  !tileStatus ||
  !frameStatus ||
  !tiles3dStatus ||
  !pickingStatus ||
  !cameraStatus ||
  !lodDebugOutput ||
  !tileDebugToggle ||
  !debugImageryToggle ||
  !coastlineToggle ||
  !modelToggle ||
  !dtmTerrainToggle ||
  !terrainToggle ||
  !mobileControlsToggle ||
  !hudControls ||
  !infoToggle ||
  !infoPanel ||
  !sceneDateInput ||
  cameraLimitInputs.length === 0 ||
  cameraLimitOutputs.length === 0 ||
  lodControlInputs.length === 0 ||
  lodControlOutputs.length === 0 ||
  !cameraCollisionToggle ||
  !cameraPathControls ||
  !cameraPathStop ||
  !cameraPathAudit ||
  !cameraPathBenchmark ||
  !cameraPathStatus ||
  !cameraSnapshotCopy ||
  !cameraKeyframeCopy ||
  !cameraSnapshotStatus ||
  !cameraSnapshotOutput ||
  !cameraPathLogOutput ||
  !cameraBenchmarkOutput ||
  !tileTelemetryOutput ||
  flyPresetButtons.length === 0
) {
  throw new Error("Missing progress UI element");
}

type CameraPathTelemetrySample = {
  pathId: string;
  pathName?: string;
  elapsedSeconds: number;
  segmentIndex: number;
  progress: number;
  finished: boolean;
  sample: CameraPathSample;
  camera: ReturnType<GeoViewer["cameraSnapshot"]>;
  surface: ReturnType<GeoViewer["cameraSurfaceStatus"]>;
  frame:
    | {
        fps: number;
        frameMs: number;
        cpuMs: number;
        updateMs: number;
        renderMs: number;
        coverageTiles: number;
        coverageBudget: number;
        coverageSamples: number;
        coverageStrategy: string;
        imageryTargetLevel?: number;
        terrainTargetLevel?: number;
        updateBreakdown: GeoViewerFrameStats["updateBreakdown"];
        lod: {
          profile: string;
          adaptiveQualityReduction: number;
          altitudeMeters: number;
          metersPerPixel: number;
          imageryTargetTilePixels: number;
          terrainTargetTilePixels: number;
        };
        terrain?: GeoViewerFrameStats["terrain"];
      }
    | undefined;
  tiles: ReturnType<GeoViewer["tileTelemetry"]>;
};

type CameraPathBenchmarkResult = {
  pathId: string;
  pathName?: string;
  sampleCount: number;
  elapsedSeconds: number;
  qualityMultiplier: number;
  debugImagery: boolean;
  dtmTerrain: boolean;
  frame: BenchmarkStats;
  cpu: BenchmarkStats;
  update: BenchmarkStats;
  render: BenchmarkStats;
  coverage: {
    maxTiles: number;
    maxCoverageMs: number;
    maxSamples: number;
  };
  imagery: {
    maxRequested: number;
    maxRendered: number;
    maxVisible: number;
    maxOffscreen: number;
  };
  terrain: {
    maxRequested: number;
    maxRendered: number;
    maxVisible: number;
    maxLoading: number;
    maxErrors: number;
    maxActiveTiles: number;
    maxRenderTiles: number;
    maxPendingTiles: number;
    maxMeshCacheSize: number;
    maxTargetLevel?: number;
    providerMaxNativeLevel?: number;
    minGridSize?: number;
    maxGridSize?: number;
  };
  worstFrame?: CameraPathTelemetrySample;
};

type BenchmarkStats = {
  min: number;
  max: number;
  avg: number;
  p95: number;
};

const rendererToggleElement = rendererToggle;
const menuToggleElement = mobileControlsToggle;
const demoTocElement = hudControls;
const infoToggleElement = infoToggle;
const infoPanelElement = infoPanel;
const cameraLimitInputElements = [...cameraLimitInputs];
const cameraLimitOutputElements = [...cameraLimitOutputs];
const lodControlInputElements = [...lodControlInputs];
const lodControlOutputElements = [...lodControlOutputs];
const cameraCollisionToggleElement = cameraCollisionToggle;
const cameraPathControlsElement = cameraPathControls;
const cameraPathStopElement = cameraPathStop;
const cameraPathAuditElement = cameraPathAudit;
const cameraPathBenchmarkElement = cameraPathBenchmark;
const cameraPathStatusElement = cameraPathStatus;
const cameraSnapshotCopyElement = cameraSnapshotCopy;
const cameraKeyframeCopyElement = cameraKeyframeCopy;
const cameraSnapshotStatusElement = cameraSnapshotStatus;
const cameraSnapshotOutputElement = cameraSnapshotOutput;
const cameraPathLogOutputElement = cameraPathLogOutput;
const cameraBenchmarkOutputElement = cameraBenchmarkOutput;
const tileTelemetryOutputElement = tileTelemetryOutput;
const dtmTerrainToggleElement = dtmTerrainToggle;
const terrainToggleElement = terrainToggle;
const compactLayout = window.matchMedia("(max-width: 920px)");

syncResponsivePanels(compactLayout.matches);
compactLayout.addEventListener("change", (event) => {
  syncResponsivePanels(event.matches);
});

const completed = roadmap.reduce(
  (total, phase) => total + phase.items.filter((item) => item.done).length,
  0,
);
const itemCount = roadmap.reduce((total, phase) => total + phase.items.length, 0);
const percent = Math.round((completed / itemCount) * 100);

overallProgress.textContent = `${percent}%`;
overallBar.style.width = `${percent}%`;

list.innerHTML = roadmap
  .map((phase) => {
    const phaseDone = phase.items.every((item) => item.done);
    const active = phase.items.some((item) => item.done) && !phaseDone;

    return `
      <li class="phase ${phaseDone ? "done" : ""} ${active ? "active" : ""}">
        <div class="phase-head">
          <span>${phase.step}</span>
          <strong>${phase.title}</strong>
        </div>
        <ul>
          ${phase.items
            .map(
              (item) => `
                <li class="${item.done ? "done" : ""}">
                  <span class="check" aria-hidden="true"></span>
                  <span>${item.label}</span>
                </li>
              `,
            )
            .join("")}
        </ul>
      </li>
    `;
  })
  .join("");

const globeHost = document.querySelector<HTMLElement>("#globe");

if (!globeHost) {
  throw new Error("Missing globe host");
}

const tiles3dStatusElement = tiles3dStatus;
const pickingStatusElement = pickingStatus;
const imageryStatusElement = imageryStatus;
const tileStatusElement = tileStatus;
const frameStatusElement = frameStatus;
const cameraStatusElement = cameraStatus;
const lodDebugOutputElement = lodDebugOutput;
const tileDebugToggleElement = tileDebugToggle;
const debugImageryToggleElement = debugImageryToggle;
const urlParams = new URLSearchParams(window.location.search);
const rendererBackend = urlParams.get("renderer") === "webgpu" ? "webgpu" : "webgl2";
const terrainDebugEnabled = urlParams.get("debugTerrain") === "1" || urlParams.get("terrain") === "1";
const debugTileHolesEnabled = urlParams.get("debugTileHoles") === "1";
const demoAssetCacheBust = import.meta.env.DEV ? String(Date.now()) : "";
let debugTileOverlay = false;
let debugImageryEnabled = urlParams.get("debugImagery") === "1" || urlParams.get("debugTextures") === "1";
let baseImagerySource: DataSourceDescriptor | undefined;
let lastRuntimeMetricsUpdateAt = 0;
let lastCameraStatusUpdateAt = 0;
const debugHudUpdateIntervalMs = 250;
let lastImageryStats:
  | {
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
    }
  | undefined;
let lastFrameStats: GeoViewerFrameStats | undefined;
const defaultLodOptions = {
  pixelErrorBudget: 1.15,
  maxVisibleTiles: 768,
  maxNetworkRequests: 20,
  qualityBias: 0,
  imagery: {
    maxLevel: 20,
    targetTilePixels: 256,
  },
  terrain: {
    maxLevel: 15,
    maxTiles: 256,
    targetTilePixels: 256,
  },
} satisfies LodOptions;

const viewer = new GeoViewer({
  container: globeHost,
  renderer: rendererBackend,
  cameraLimits: {
    minTilt: -Math.PI * 2,
    maxTilt: Math.PI * 2,
  },
  cameraHeightLimits: {
    minHeight: 0,
    maxHeight: 57_310_000,
  },
  cameraCollision: {
    enabled: true,
    clearance: 0,
  },
  lod: defaultLodOptions,
  date: new Date(sceneDateInput.value),
  onImageryStats: (stats) => {
    lastImageryStats = stats;
    imageryStatus.textContent = debugImageryEnabled ? `Test LOD ${stats.level}` : `LOD ${stats.level}`;
    syncRuntimeMetrics();
  },
  onFrameStats: (stats) => {
    lastFrameStats = stats;
    syncRuntimeMetrics();
  },
  onTilesetStats: (stats) => {
    tiles3dStatusElement.textContent = stats.status;
  },
  onImageryError: () => {
    imageryStatusElement.textContent = "fallback";
  },
});
let cameraCollisionEnabled = true;
rendererStatus.textContent = viewer.renderer.supported
  ? `${viewer.renderer.backend === "webgpu" ? "WebGPU init" : "WebGL2"} attivo`
  : `${viewer.renderer.backend === "webgpu" ? "WebGPU" : "WebGL2"} non disponibile`;
imageryStatus.textContent = "Ortofoto";
syncRendererToggle();
applyCameraLimitControls();
applyLodControls();
startCameraStatusLoop();

cameraLimitInputElements.forEach((input) => {
  input.addEventListener("input", () => {
    applyCameraLimitControls();
  });
});

lodControlInputElements.forEach((input) => {
  input.addEventListener("input", () => {
    applyLodControls();
  });
});

cameraCollisionToggleElement.addEventListener("click", () => {
  cameraCollisionEnabled = !cameraCollisionEnabled;
  cameraCollisionToggleElement.setAttribute("aria-pressed", String(cameraCollisionEnabled));
  cameraCollisionToggleElement.textContent = cameraCollisionEnabled ? "Collision ON" : "Collision";
  applyCameraLimitControls();
});

globeHost.addEventListener("orbix:renderer-changed", (event) => {
  const detail = (event as CustomEvent<{ backend: "webgl2" | "webgpu"; supported: boolean; ready: boolean }>).detail;
  const label = detail.backend === "webgpu" ? "WebGPU" : "WebGL2";
  rendererStatus.textContent = detail.supported && detail.ready ? `${label} attivo` : `${label} non disponibile`;
  bindCanvasPicking();
  syncRendererToggle();
});

sceneDateInput.addEventListener("change", () => {
  const date = new Date(sceneDateInput.value);

  if (!Number.isNaN(date.getTime())) {
    viewer.setDate(date);
  }
});

void loadDemoProject();
viewer.loadCoastlineOverlay("https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json").catch(() => {
  coastlineToggle.textContent = "Coastline -";
  coastlineToggle.disabled = true;
});

viewer.setDebugTileOverlay(debugTileOverlay);
tileDebugToggle.addEventListener("click", () => {
  debugTileOverlay = !debugTileOverlay;
  viewer.setDebugTileOverlay(debugTileOverlay);
  tileDebugToggle.setAttribute("aria-pressed", String(debugTileOverlay));
  tileDebugToggle.textContent = debugTileOverlay ? "LOD ON" : "LOD overlay";
  syncRuntimeMetrics(true);
});

syncDebugImageryToggle();
debugImageryToggleElement.addEventListener("click", () => {
  setDebugImagery(!debugImageryEnabled);
});

let coastlineOverlay = false;
coastlineToggle.addEventListener("click", () => {
  coastlineOverlay = !coastlineOverlay;
  viewer.setCoastlineOverlay(coastlineOverlay);
  coastlineToggle.setAttribute("aria-pressed", String(coastlineOverlay));
  coastlineToggle.textContent = coastlineOverlay ? "Coast ON" : "Coastline";
});

let debugModelVisible = false;
modelToggle.addEventListener("click", () => {
  debugModelVisible = !debugModelVisible;
  viewer.setDebugModelVisible(debugModelVisible);
  modelToggle.setAttribute("aria-pressed", String(debugModelVisible));
  modelToggle.textContent = debugModelVisible ? "Model ON" : "Model";
});

let dtmTerrainVisible = false;
dtmTerrainToggleElement.addEventListener("click", () => {
  void toggleDtmTerrain();
});

let proceduralTerrainVisible = false;
terrainToggleElement.hidden = !terrainDebugEnabled;
terrainToggleElement.disabled = !terrainDebugEnabled;
if (terrainDebugEnabled) {
  terrainToggleElement.addEventListener("click", () => {
    proceduralTerrainVisible = !proceduralTerrainVisible;
    if (proceduralTerrainVisible) {
      dtmTerrainVisible = false;
      syncDtmTerrainToggle();
    }
    viewer.setTerrainProvider(
      proceduralTerrainVisible ? createProceduralTerrainProvider({ size: 33 }) : undefined,
      { exaggeration: proceduralTerrainVisible ? 18 : undefined },
    );
    terrainToggleElement.setAttribute("aria-pressed", String(proceduralTerrainVisible));
    terrainToggleElement.textContent = proceduralTerrainVisible ? "Synthetic relief ON" : "Synthetic relief";
  });
}

rendererToggleElement.addEventListener("click", () => {
  const next = viewer.renderer.backend === "webgpu" ? "webgl2" : "webgpu";
  const label = next === "webgpu" ? "WebGPU" : "WebGL2";

  rendererToggleElement.disabled = true;
  rendererStatus.textContent = `${label} init`;
  void viewer
    .setRendererBackend(next)
    .catch((error: unknown) => {
      console.warn("Renderer switch failed", error);
    })
    .finally(() => {
      updateRendererUrl(viewer.renderer.backend);
      syncRendererToggle();
      rendererToggleElement.disabled = false;
    });
});

menuToggleElement.addEventListener("click", () => {
  const expanded = menuToggleElement.getAttribute("aria-expanded") === "true";

  setMenuOpen(!expanded);
});

infoToggleElement.addEventListener("click", () => {
  const expanded = infoToggleElement.getAttribute("aria-expanded") === "true";

  setInfoOpen(!expanded);
});

const flyToPresets = {
  italy: { lon: 12.5, lat: 42.5, height: 1_500_000 },
  southTyrol: { lon: 11.35, lat: 46.5, height: 120_000 },
  usa: { lon: -100, lat: 40, height: 2_500_000 },
  tokyo: { lon: 139.7, lat: 35.7, height: 1_200_000 },
};
let loadedCameraPaths: CameraPath[] = [];
let activeCameraPathFrame: number | undefined;
let activeCameraPathId: string | undefined;
let cameraPathTelemetryLog: CameraPathTelemetrySample[] = [];
let cameraPathBenchmarkResult: CameraPathBenchmarkResult | undefined;
let lastCameraPathLogAt = 0;

flyPresetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const preset = flyToPresets[button.dataset.flyTo as keyof typeof flyToPresets];

    if (preset) {
      stopCameraPath("interrotto");
      viewer.flyTo(preset);
    }
  });
});

cameraPathStopElement.addEventListener("click", () => {
  stopCameraPath("fermato");
});

cameraPathAuditElement.addEventListener("click", () => {
  void runCameraPathAudit();
});

cameraPathBenchmarkElement.addEventListener("click", () => {
  void runBenchmark();
});

cameraSnapshotCopyElement.addEventListener("click", () => {
  void copyCameraSnapshot();
});

cameraKeyframeCopyElement.addEventListener("click", () => {
  void copyCameraKeyframe();
});

let activePickingCanvas: HTMLCanvasElement | undefined;
let pickStart: { x: number; y: number } | undefined;

const handlePickPointerDown = (event: PointerEvent) => {
  pickStart = { x: event.clientX, y: event.clientY };
};

const handlePickPointerUp = (event: PointerEvent) => {
  if (!pickStart || event.altKey || event.shiftKey) {
    return;
  }

  const moved = Math.hypot(event.clientX - pickStart.x, event.clientY - pickStart.y);
  pickStart = undefined;

  if (moved > 4) {
    return;
  }

  if (debugModelVisible) {
    const hit = viewer.pick({ clientX: event.clientX, clientY: event.clientY });
    viewer.canvas.dispatchEvent(new CustomEvent("orbix:pick", { detail: hit, bubbles: true }));

    if (!hit) {
      pickingStatusElement.textContent = "nessun hit";
      return;
    }

    if (hit.type === "mesh") {
      pickingStatusElement.textContent = `mesh: ${hit.id}`;
      return;
    }

    pickingStatusElement.textContent = formatPickStatus(hit);
    return;
  }

  const globe = viewer.pickGlobe(event.clientX, event.clientY);
  viewer.canvas.dispatchEvent(
    new CustomEvent("orbix:pick", { detail: globe ? { type: "globe" as const, ...globe } : undefined, bubbles: true }),
  );

  if (!globe) {
    pickingStatusElement.textContent = "nessun hit";
    return;
  }

  pickingStatusElement.textContent = formatPickStatus(globe);
};

bindCanvasPicking();

async function loadDemoProject(): Promise<void> {
  try {
    const project = await loadOrbixProject(demoAssetUrl("projects/demo.orbix.json"));
    const catalog = await loadDataCatalog(demoAssetUrl(project.catalogUrl ?? "catalogs/demo-catalog.json"));

    if (project.camera) {
      viewer.flyTo(project.camera);
    }

    loadedCameraPaths = [...(project.cameraPaths ?? [])];
    renderCameraPathControls(loadedCameraPaths);

    for (const layer of project.layers) {
      if (layer.visible === false) {
        continue;
      }

      const source = findDataSource(catalog, layer.source);

      if (!source) {
        console.warn(`Missing data source: ${layer.source}`);
        continue;
      }

      const crs = resolveOrbixLayerCrs(project, layer, source);

      if (crs.layer && crs.source && crs.layer !== crs.source) {
        console.warn(`Layer ${layer.id} CRS override ${crs.layer} differs from source ${source.id} CRS ${crs.source}`);
      }

      if (layer.type === "imagery-xyz" && source.type === "imagery-xyz") {
        baseImagerySource = source;
        applyImagerySource();
      } else if (layer.type === "tileset" && source.type === "tileset") {
        await viewer.addTileset({ url: demoAssetUrl(source.url), id: source.title, scale: 180000 });
      } else if (layer.type === "terrain-heightmap" && source.type === "terrain-heightmap") {
        await loadTerrainHeightmapSource(source.preprocessManifestUrl);
      }
    }
  } catch (error) {
    console.warn("Demo project failed", error);
    imageryStatusElement.textContent = "fallback";
    tiles3dStatusElement.textContent = "tileset -";
  }
}

function syncRuntimeMetrics(force = false): void {
  const now = performance.now();

  if (!force && now - lastRuntimeMetricsUpdateAt < debugHudUpdateIntervalMs) {
    return;
  }

  lastRuntimeMetricsUpdateAt = now;
  const tiles = viewer.tileTelemetry();

  if (lastFrameStats) {
    const adaptive = lastFrameStats.lod.adaptiveQualityReduction > 0.01
      ? `, adapt -${lastFrameStats.lod.adaptiveQualityReduction.toFixed(2)}`
      : "";
    frameStatusElement.textContent = `${lastFrameStats.lod.profile}${adaptive}, ${Math.round(lastFrameStats.fps)} fps, ${lastFrameStats.frameMs.toFixed(
      1,
    )} ms, CPU ${lastFrameStats.cpuMs.toFixed(1)} ms`;
  }

  if (!lastImageryStats) {
    tileStatusElement.textContent = "LOD -";
    return;
  }

  const mode = debugTileOverlay ? "surface grid" : "surface";
  const coverage = lastFrameStats ? `coverage ${lastFrameStats.coverageTiles}` : "coverage -";
  const terrainProviderActive =
    tiles.terrain.providerMinLevel !== undefined ||
    tiles.terrain.providerMaxNativeLevel !== undefined ||
    tiles.terrain.targetLevel !== undefined;
  const terrain = lastFrameStats?.terrain
    ? `terrain render ${tiles.terrain.rendered.length}, active ${lastFrameStats.terrain.activeTiles}, req ${tiles.terrain.requested.length}, visible ${tiles.terrain.visible.length}, z ${tiles.terrain.targetLevel ?? "-"} native ${tiles.terrain.providerMaxNativeLevel ?? "-"}, grid ${tiles.terrain.gridSize ?? "-"}, pending ${lastFrameStats.terrain.pendingTiles}, mesh ${lastFrameStats.terrain.meshCacheSize}`
    : terrainProviderActive
      ? `terrain idle, req ${tiles.terrain.requested.length}, z ${tiles.terrain.targetLevel ?? "-"} native ${tiles.terrain.providerMaxNativeLevel ?? "-"}, grid ${tiles.terrain.gridSize ?? "-"}`
      : "terrain off";
  tileStatusElement.textContent = `img render ${tiles.imagery.rendered.length}, visible ${tiles.imagery.visible.length}, req ${tiles.imagery.requested.length}, offscreen ${tiles.imagery.offscreen.length}, pending ${lastImageryStats.pendingTiles}, cache ${lastImageryStats.cacheSize}, ${coverage}, ${terrain}, ${mode}`;
  lodDebugOutputElement.value = formatLodDebugStatus(tiles);
  tileTelemetryOutputElement.value = JSON.stringify(tiles);
}

async function loadTerrainHeightmapSource(preprocessManifestUrl: string | undefined): Promise<void> {
  if (!preprocessManifestUrl) {
    throw new Error("Terrain heightmap source missing preprocess manifest");
  }

  const preprocessManifest = await loadPreprocessManifest(demoAssetUrl(preprocessManifestUrl));
  const job =
    findPreprocessJob(preprocessManifest, "south-tyrol-dtm-5m-heightmap") ??
    preprocessManifest.jobs.find((entry) => entry.type === "terrain-heightmap");
  const quantizedMeshInput = job?.inputs.find(
    (artifact) => artifact.format === "civis-quantized-mesh-layer-json" || artifact.format === "civis-layer-json",
  );

  if (quantizedMeshInput) {
    const layerUrl = demoAssetUrl(quantizedMeshInput.url);
    const layer = await loadCivisQuantizedMeshLayer(layerUrl);

    viewer.setTerrainProvider(createCivisQuantizedMeshTerrainProvider(layer, { baseUrl: layerUrl, heightmapSize: 33 }), {
      skirtDepth: 80,
    });
    return;
  }

  const output = job?.outputs.find((artifact) => artifact.format === "orbix-heightmap-manifest");

  if (!output) {
    throw new Error("Terrain heightmap preprocess output missing");
  }

  const manifestUrl = demoAssetUrl(output.url);
  const manifest = await loadHeightmapTerrainManifest(manifestUrl);
  viewer.setTerrainProvider(createHeightmapTerrainProvider(manifest, { baseUrl: manifestUrl }), { skirtDepth: 80 });
}

async function toggleDtmTerrain(): Promise<void> {
  if (dtmTerrainVisible) {
    dtmTerrainVisible = false;
    viewer.setTerrainProvider(undefined);
    syncDtmTerrainToggle();
    return;
  }

  dtmTerrainToggleElement.disabled = true;
  dtmTerrainToggleElement.textContent = "DTM loading";

  try {
    await loadTerrainHeightmapSource("preprocess/demo-preprocess.json");
    dtmTerrainVisible = true;
    proceduralTerrainVisible = false;
    terrainToggleElement.setAttribute("aria-pressed", "false");
    terrainToggleElement.textContent = "Synthetic relief";
    viewer.flyTo(flyToPresets.southTyrol);
    syncDtmTerrainToggle();
  } catch (error) {
    console.warn("DTM terrain failed", error);
    dtmTerrainToggleElement.textContent = "DTM -";
  } finally {
    dtmTerrainToggleElement.disabled = false;
  }
}

function syncDtmTerrainToggle(): void {
  dtmTerrainToggleElement.setAttribute("aria-pressed", String(dtmTerrainVisible));
  dtmTerrainToggleElement.textContent = dtmTerrainVisible ? "DTM Alto Adige ON" : "DTM Alto Adige";
}

function setDebugImagery(enabled: boolean): void {
  debugImageryEnabled = enabled;
  applyImagerySource();
  syncDebugImageryToggle();
}

function applyImagerySource(): void {
  const source = baseImagerySource;

  if (!source) {
    syncDebugImageryToggle();
    return;
  }

  viewer.imagery.clear();

  if (debugImageryEnabled) {
    viewer.imagery.addRasterLayer(
      new DebugTileProvider({
        tileSize: source.tileSize ?? 256,
        cacheSize: 768,
        missingModulo: debugTileHolesEnabled ? 7 : undefined,
      }),
      {
        level: source.minLevel ?? 2,
        minLevel: source.minLevel,
        maxLevel: source.maxLevel,
      },
    );
    imageryStatusElement.textContent = debugTileHolesEnabled ? "Test tiles holes" : "Test tiles";
  } else {
    viewer.imagery.addXYZLayer({
      url: source.url,
      level: source.minLevel ?? 2,
      minLevel: source.minLevel,
      maxLevel: source.maxLevel,
      tileSize: source.tileSize,
    });
    imageryStatusElement.textContent = "Ortofoto";
  }
}

function syncDebugImageryToggle(): void {
  debugImageryToggleElement.setAttribute("aria-pressed", String(debugImageryEnabled));
  debugImageryToggleElement.textContent = debugImageryEnabled ? "Test textures ON" : "Test textures";
}

window.__orbixDebug = {
  viewer,
  flyTo: (options) => {
    stopCameraPath("interrotto");
    viewer.flyTo(options);
  },
  renderFrame: () => viewer.renderFrameForDebug(),
  resetAdaptiveLod: () => viewer.resetAdaptiveLod(),
  setDtmTerrain: async (enabled) => {
    if (dtmTerrainVisible === enabled) {
      return;
    }

    await toggleDtmTerrain();
  },
  setDebugImagery,
  tileTelemetry: () => viewer.tileTelemetry(),
  runCameraPathAudit,
  runBenchmark,
  cameraPathLog: () => [...cameraPathTelemetryLog],
  benchmarkResult: () => cameraPathBenchmarkResult,
  stats: () => ({
    frame: lastFrameStats,
    imagery: lastImageryStats,
    tiles: viewer.tileTelemetry(),
    camera: viewer.cameraSnapshot(),
    surface: viewer.cameraSurfaceStatus(),
    frameStatus: frameStatusElement.textContent ?? "",
    lodDebug: lodDebugOutputElement.value,
  }),
};

function renderCameraPathControls(paths: readonly CameraPath[]): void {
  cameraPathControlsElement.replaceChildren();
  cameraPathStatusElement.textContent = paths.length > 0 ? "pronto" : "nessun path";
  cameraPathStopElement.disabled = true;
  cameraPathAuditElement.disabled = paths.length === 0;
  cameraPathBenchmarkElement.disabled = paths.length === 0;

  for (const path of paths) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = `Play: ${path.name ?? path.id}`;
    button.dataset.cameraPathId = path.id;
    button.addEventListener("click", () => {
      playCameraPath(path);
    });
    cameraPathControlsElement.append(button);
  }
}

function playCameraPath(path: CameraPath): void {
  stopCameraPath();

  const duration = cameraPathDuration(path);
  const startedAt = performance.now();
  activeCameraPathId = path.id;
  cameraPathTelemetryLog = [];
  lastCameraPathLogAt = 0;
  updateCameraPathLogOutput(false);
  cameraPathStatusElement.textContent = `play ${path.name ?? path.id}`;
  cameraPathStopElement.disabled = false;
  syncCameraPathButtons();

  const step = (now: number) => {
    const elapsedSeconds = (now - startedAt) / 1000;
    const sample = sampleCameraPath(path, elapsedSeconds);

    viewer.flyTo(cameraPathSampleToFlyTo(sample));

    if (now - lastCameraPathLogAt >= 250 || sample.finished) {
      lastCameraPathLogAt = now;
      appendCameraPathTelemetry(path, sample, elapsedSeconds, false);
    }

    if (!sample.finished && elapsedSeconds <= duration + 0.05) {
      activeCameraPathFrame = requestAnimationFrame(step);
      return;
    }

    activeCameraPathFrame = undefined;
    activeCameraPathId = undefined;
    cameraPathStatusElement.textContent = "finito";
    cameraPathStopElement.disabled = true;
    syncCameraPathButtons();
  };

  activeCameraPathFrame = requestAnimationFrame(step);
}

async function runCameraPathAudit(pathId?: string): Promise<CameraPathTelemetrySample[]> {
  const path = preferredCameraPath(pathId);

  if (!path) {
    cameraPathStatusElement.textContent = "nessun path";
    return [];
  }

  stopCameraPath("audit");
  cameraPathAuditElement.disabled = true;
  cameraPathStopElement.disabled = true;
  cameraPathTelemetryLog = [];
  updateCameraPathLogOutput(false);

  if (!dtmTerrainVisible) {
    await toggleDtmTerrain();
  }

  if (!debugTileOverlay) {
    debugTileOverlay = true;
    viewer.setDebugTileOverlay(true);
    tileDebugToggleElement.setAttribute("aria-pressed", "true");
    tileDebugToggleElement.textContent = "LOD ON";
  }

  const duration = cameraPathDuration(path);
  const stepSeconds = 0.25;
  const totalSamples = Math.ceil(duration / stepSeconds) + 1;

  try {
    for (let index = 0; index < totalSamples; index += 1) {
      const elapsedSeconds = Math.min(index * stepSeconds, duration);
      const sample = sampleCameraPath(path, elapsedSeconds);

      viewer.flyTo(cameraPathSampleToFlyTo(sample));
      viewer.renderFrameForDebug();
      await nextAnimationFrame();
      appendCameraPathTelemetry(path, sample, elapsedSeconds, false);
      cameraPathStatusElement.textContent = `audit ${index + 1}/${totalSamples}`;

      if (elapsedSeconds >= duration) {
        break;
      }
    }

    updateCameraPathLogOutput(true);
    cameraPathStatusElement.textContent = `audit pronto ${cameraPathTelemetryLog.length}`;
    return [...cameraPathTelemetryLog];
  } finally {
    cameraPathAuditElement.disabled = loadedCameraPaths.length === 0;
    syncCameraPathButtons();
  }
}

async function runBenchmark(pathId?: string): Promise<CameraPathBenchmarkResult | undefined> {
  const path = preferredCameraPath(pathId);

  if (!path) {
    cameraPathStatusElement.textContent = "nessun path";
    return undefined;
  }

  stopCameraPath("benchmark");
  cameraPathAuditElement.disabled = true;
  cameraPathBenchmarkElement.disabled = true;
  cameraPathStopElement.disabled = true;
  cameraPathTelemetryLog = [];
  cameraPathBenchmarkResult = undefined;
  updateCameraPathLogOutput(false);
  updateBenchmarkOutput();

  if (!dtmTerrainVisible) {
    cameraPathStatusElement.textContent = "benchmark DTM";
    await toggleDtmTerrain();
  }

  viewer.resetAdaptiveLod();
  const duration = cameraPathDuration(path);
  const stepSeconds = 0.25;
  const totalSamples = Math.ceil(duration / stepSeconds) + 1;
  const startedAt = performance.now();

  try {
    for (let index = 0; index < totalSamples; index += 1) {
      const elapsedSeconds = Math.min(index * stepSeconds, duration);
      const sample = sampleCameraPath(path, elapsedSeconds);

      viewer.flyTo(cameraPathSampleToFlyTo(sample));
      viewer.renderFrameForDebug();
      await nextAnimationFrame();
      cameraPathTelemetryLog.push(captureCameraPathTelemetry(path, sample, elapsedSeconds));
      cameraPathStatusElement.textContent = `benchmark ${index + 1}/${totalSamples}`;

      if (elapsedSeconds >= duration) {
        break;
      }
    }

    cameraPathBenchmarkResult = summarizeBenchmark(
      path,
      cameraPathTelemetryLog,
      (performance.now() - startedAt) / 1000,
    );
    updateCameraPathLogOutput(false);
    updateBenchmarkOutput();
    cameraPathStatusElement.textContent = `benchmark ${formatBenchmarkScore(cameraPathBenchmarkResult)}`;
    return cameraPathBenchmarkResult;
  } finally {
    viewer.resetAdaptiveLod();
    viewer.renderFrameForDebug();
    syncRuntimeMetrics(true);
    cameraPathAuditElement.disabled = loadedCameraPaths.length === 0;
    cameraPathBenchmarkElement.disabled = loadedCameraPaths.length === 0;
    syncCameraPathButtons();
  }
}

function preferredCameraPath(pathId?: string): CameraPath | undefined {
  return (
    (pathId ? loadedCameraPaths.find((path) => path.id === pathId) : undefined) ??
    loadedCameraPaths.find((path) => path.id === "south-tyrol-mountain-run") ??
    loadedCameraPaths[0]
  );
}

function summarizeBenchmark(
  path: CameraPath,
  samples: readonly CameraPathTelemetrySample[],
  elapsedSeconds: number,
): CameraPathBenchmarkResult {
  const frameValues = samples.map((sample) => sample.frame?.frameMs ?? 0).filter((value) => value > 0);
  const cpuValues = samples.map((sample) => sample.frame?.cpuMs ?? 0).filter((value) => value > 0);
  const updateValues = samples.map((sample) => sample.frame?.updateMs ?? 0).filter((value) => value > 0);
  const renderValues = samples.map((sample) => sample.frame?.renderMs ?? 0).filter((value) => value > 0);
  const worstFrame = samples.reduce<CameraPathTelemetrySample | undefined>((worst, sample) => {
    if (!sample.frame) {
      return worst;
    }

    if (!worst?.frame || sample.frame.frameMs > worst.frame.frameMs) {
      return sample;
    }

    return worst;
  }, undefined);

  return {
    pathId: path.id,
    pathName: path.name,
    sampleCount: samples.length,
    elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
    qualityMultiplier: clampNumber(lodControlValue("qualityMultiplier"), 0.5, 1.75),
    debugImagery: debugImageryEnabled,
    dtmTerrain: dtmTerrainVisible,
    frame: benchmarkStats(frameValues),
    cpu: benchmarkStats(cpuValues),
    update: benchmarkStats(updateValues),
    render: benchmarkStats(renderValues),
    coverage: {
      maxTiles: maxSampleValue(samples, (sample) => sample.frame?.coverageTiles ?? 0),
      maxCoverageMs: maxSampleValue(samples, (sample) => sample.frame?.updateBreakdown.coverageMs ?? 0),
      maxSamples: maxSampleValue(samples, (sample) => sample.frame?.coverageSamples ?? 0),
    },
    imagery: {
      maxRequested: maxSampleValue(samples, (sample) => sample.tiles.imagery.requested.length),
      maxRendered: maxSampleValue(samples, (sample) => sample.tiles.imagery.rendered.length),
      maxVisible: maxSampleValue(samples, (sample) => sample.tiles.imagery.visible.length),
      maxOffscreen: maxSampleValue(samples, (sample) => sample.tiles.imagery.offscreen.length),
    },
    terrain: {
      maxRequested: maxSampleValue(samples, (sample) => sample.tiles.terrain.requested.length),
      maxRendered: maxSampleValue(samples, (sample) => sample.tiles.terrain.rendered.length),
      maxVisible: maxSampleValue(samples, (sample) => sample.tiles.terrain.visible.length),
      maxLoading: maxSampleValue(samples, (sample) => sample.tiles.terrain.loading.length),
      maxErrors: maxSampleValue(samples, (sample) => sample.tiles.terrain.errors.length),
      maxActiveTiles: maxSampleValue(samples, (sample) => sample.frame?.terrain?.activeTiles ?? 0),
      maxRenderTiles: maxSampleValue(samples, (sample) => sample.frame?.terrain?.renderTiles ?? 0),
      maxPendingTiles: maxSampleValue(samples, (sample) => sample.frame?.terrain?.pendingTiles ?? 0),
      maxMeshCacheSize: maxSampleValue(samples, (sample) => sample.frame?.terrain?.meshCacheSize ?? 0),
      maxTargetLevel: maxOptionalSampleValue(samples, (sample) => sample.tiles.terrain.targetLevel),
      providerMaxNativeLevel: maxOptionalSampleValue(samples, (sample) => sample.tiles.terrain.providerMaxNativeLevel),
      minGridSize: minOptionalSampleValue(samples, (sample) => sample.tiles.terrain.gridSize),
      maxGridSize: maxOptionalSampleValue(samples, (sample) => sample.tiles.terrain.gridSize),
    },
    worstFrame,
  };
}

function benchmarkStats(values: readonly number[]): BenchmarkStats {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, p95: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);

  return {
    min: Number(sorted[0].toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    avg: Number((sum / sorted.length).toFixed(2)),
    p95: Number(sorted[p95Index].toFixed(2)),
  };
}

function maxSampleValue(
  samples: readonly CameraPathTelemetrySample[],
  valueForSample: (sample: CameraPathTelemetrySample) => number,
): number {
  return samples.reduce((max, sample) => Math.max(max, valueForSample(sample)), 0);
}

function maxOptionalSampleValue(
  samples: readonly CameraPathTelemetrySample[],
  valueForSample: (sample: CameraPathTelemetrySample) => number | undefined,
): number | undefined {
  const values = samples.map(valueForSample).filter((value): value is number => value !== undefined && Number.isFinite(value));

  return values.length > 0 ? Math.max(...values) : undefined;
}

function minOptionalSampleValue(
  samples: readonly CameraPathTelemetrySample[],
  valueForSample: (sample: CameraPathTelemetrySample) => number | undefined,
): number | undefined {
  const values = samples.map(valueForSample).filter((value): value is number => value !== undefined && Number.isFinite(value));

  return values.length > 0 ? Math.min(...values) : undefined;
}

function updateBenchmarkOutput(): void {
  cameraBenchmarkOutputElement.value = cameraPathBenchmarkResult
    ? JSON.stringify(cameraPathBenchmarkResult, null, 2)
    : "";
}

function formatBenchmarkScore(result: CameraPathBenchmarkResult): string {
  return `p95 ${result.frame.p95.toFixed(1)} ms, CPU ${result.cpu.p95.toFixed(1)} ms`;
}

function cameraPathSampleToFlyTo(sample: CameraPathSample): {
  lon: number;
  lat: number;
  height: number;
  heading?: number;
  pitch?: number;
  fov?: number;
} {
  return {
    lon: sample.lon,
    lat: sample.lat,
    height: sample.height,
    heading: sample.heading === undefined ? undefined : toRadians(sample.heading),
    pitch: sample.pitch === undefined ? undefined : toRadians(sample.pitch),
    fov: sample.fov === undefined ? undefined : toRadians(sample.fov),
  };
}

function appendCameraPathTelemetry(
  path: CameraPath,
  sample: CameraPathSample,
  elapsedSeconds: number,
  pretty: boolean,
): void {
  cameraPathTelemetryLog.push(captureCameraPathTelemetry(path, sample, elapsedSeconds));
  updateCameraPathLogOutput(pretty);
}

function captureCameraPathTelemetry(
  path: CameraPath,
  sample: CameraPathSample,
  elapsedSeconds: number,
): CameraPathTelemetrySample {
  return {
    pathId: path.id,
    pathName: path.name,
    elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
    segmentIndex: sample.segmentIndex,
    progress: Number(sample.progress.toFixed(4)),
    finished: sample.finished,
    sample,
    camera: viewer.cameraSnapshot(),
    surface: viewer.cameraSurfaceStatus(),
    frame: summarizeFrameStats(lastFrameStats),
    tiles: viewer.tileTelemetry(),
  };
}

function summarizeFrameStats(stats: GeoViewerFrameStats | undefined): CameraPathTelemetrySample["frame"] {
  if (!stats) {
    return undefined;
  }

  return {
    fps: stats.fps,
    frameMs: stats.frameMs,
    cpuMs: stats.cpuMs,
    updateMs: stats.updateMs,
    renderMs: stats.renderMs,
    coverageTiles: stats.coverageTiles,
    coverageBudget: stats.coverageBudget,
    coverageSamples: stats.coverageSamples,
    coverageStrategy: stats.coverageStrategy,
    imageryTargetLevel: stats.imageryTargetLevel,
    terrainTargetLevel: stats.terrainTargetLevel,
    updateBreakdown: stats.updateBreakdown,
    lod: {
      profile: stats.lod.profile,
      adaptiveQualityReduction: stats.lod.adaptiveQualityReduction,
      altitudeMeters: stats.lod.altitudeMeters,
      metersPerPixel: stats.lod.metersPerPixel,
      imageryTargetTilePixels: stats.lod.imageryTargetTilePixels,
      terrainTargetTilePixels: stats.lod.terrainTargetTilePixels,
    },
    terrain: stats.terrain,
  };
}

function updateCameraPathLogOutput(pretty: boolean): void {
  cameraPathLogOutputElement.value = JSON.stringify(cameraPathTelemetryLog, null, pretty ? 2 : undefined);
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function stopCameraPath(status?: string): void {
  if (activeCameraPathFrame !== undefined) {
    cancelAnimationFrame(activeCameraPathFrame);
  }

  activeCameraPathFrame = undefined;
  activeCameraPathId = undefined;
  cameraPathStopElement.disabled = true;

  if (status) {
    cameraPathStatusElement.textContent = status;
  }

  syncCameraPathButtons();
}

function syncCameraPathButtons(): void {
  cameraPathControlsElement.querySelectorAll<HTMLButtonElement>("button[data-camera-path-id]").forEach((button) => {
    const active = button.dataset.cameraPathId === activeCameraPathId;

    button.disabled = activeCameraPathId !== undefined && !active;
    button.setAttribute("aria-pressed", String(active));
  });
}

async function copyCameraSnapshot(): Promise<void> {
  await copyCameraPayload(JSON.stringify(viewer.cameraSnapshot(), null, 2), cameraSnapshotCopyElement, "camera copiata");
}

async function copyCameraKeyframe(): Promise<void> {
  await copyCameraPayload(JSON.stringify(viewer.cameraKeyframe(), null, 2), cameraKeyframeCopyElement, "keyframe copiato");
}

async function copyCameraPayload(payload: string, button: HTMLButtonElement, successMessage: string): Promise<void> {
  button.disabled = true;
  cameraSnapshotOutputElement.value = payload;

  if (await writeClipboardText(payload)) {
    cameraSnapshotOutputElement.hidden = true;
    cameraSnapshotStatusElement.textContent = successMessage;
  } else {
    cameraSnapshotOutputElement.hidden = false;
    const copied = copySelectedSnapshotText();
    cameraSnapshotStatusElement.textContent = copied ? `${successMessage} fallback` : "JSON pronto";
  }

  window.setTimeout(() => {
    if (cameraSnapshotStatusElement.textContent !== "JSON pronto") {
      cameraSnapshotStatusElement.textContent = "pronto";
    }
    window.setTimeout(() => {
      button.disabled = false;
    }, 0);
  }, 1600);
}

async function writeClipboardText(payload: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(payload);
    return true;
  } catch (error) {
    console.warn("Camera snapshot clipboard failed", error);
    return false;
  }
}

function copySelectedSnapshotText(): boolean {
  cameraSnapshotOutputElement.focus();
  cameraSnapshotOutputElement.select();

  try {
    return document.execCommand("copy");
  } catch (error) {
    console.warn("Camera snapshot fallback copy failed", error);
    return false;
  }
}

function applyCameraLimitControls(): void {
  const minHeightMeters = cameraLimitValue("minHeightMeters");
  const maxHeightMeters = Math.max(cameraLimitValue("maxHeightMeters"), minHeightMeters + 1);
  const collisionClearanceMeters = cameraLimitValue("collisionClearanceMeters");
  const minTiltDeg = cameraLimitValue("minTiltDeg");
  const maxTiltDeg = Math.max(cameraLimitValue("maxTiltDeg"), minTiltDeg);
  const fovDeg = cameraLimitValue("fovDeg");

  setCameraLimitInputValue("maxHeightMeters", maxHeightMeters);
  setCameraLimitInputValue("maxTiltDeg", maxTiltDeg);
  viewer.setCameraHeightLimits({
    minHeight: minHeightMeters,
    maxHeight: maxHeightMeters,
  });
  viewer.setCameraCollision({
    enabled: cameraCollisionEnabled,
    clearance: collisionClearanceMeters,
  });
  viewer.setCameraLimits({
    minTilt: toRadians(minTiltDeg),
    maxTilt: toRadians(maxTiltDeg),
    fov: toRadians(fovDeg),
  });
  syncCameraLimitOutputs({
    minHeightMeters,
    maxHeightMeters,
    collisionClearanceMeters,
    minTiltDeg,
    maxTiltDeg,
    fovDeg,
  });
}

function applyLodControls(): void {
  const qualityMultiplier = lodControlValue("qualityMultiplier");
  const imageryTargetTilePixels = lodControlValue("imageryTargetTilePixels");
  const terrainTargetTilePixels = lodControlValue("terrainTargetTilePixels");
  const terrainMaxTiles = lodControlValue("terrainMaxTiles");
  const safeQualityMultiplier = clampNumber(qualityMultiplier, 0.5, 1.75);
  const budgetMultiplier = safeQualityMultiplier * safeQualityMultiplier;
  const networkMultiplier = clampNumber(safeQualityMultiplier, 0.65, 1.65);
  const effectiveImageryTargetTilePixels = roundToStep(
    clampNumber(imageryTargetTilePixels / safeQualityMultiplier, 96, 1024),
    8,
  );
  const effectiveTerrainTargetTilePixels = roundToStep(
    clampNumber(terrainTargetTilePixels / safeQualityMultiplier, 64, 896),
    8,
  );
  const effectiveTerrainMaxTiles = Math.round(clampNumber(terrainMaxTiles * budgetMultiplier, 32, 1024));

  viewer.setLod({
    ...defaultLodOptions,
    pixelErrorBudget: defaultLodOptions.pixelErrorBudget / Math.sqrt(safeQualityMultiplier),
    maxVisibleTiles: Math.round(defaultLodOptions.maxVisibleTiles * budgetMultiplier),
    maxNetworkRequests: Math.round(defaultLodOptions.maxNetworkRequests * networkMultiplier),
    qualityBias: Math.log2(safeQualityMultiplier),
    imagery: {
      ...defaultLodOptions.imagery,
      targetTilePixels: effectiveImageryTargetTilePixels,
    },
    terrain: {
      ...defaultLodOptions.terrain,
      targetTilePixels: effectiveTerrainTargetTilePixels,
      maxTiles: effectiveTerrainMaxTiles,
    },
  });
  setLodControlOutput("qualityMultiplier", formatQualityMultiplier(safeQualityMultiplier));
  setLodControlOutput("imageryTargetTilePixels", `${Math.round(imageryTargetTilePixels)} -> ${effectiveImageryTargetTilePixels} px`);
  setLodControlOutput("terrainTargetTilePixels", `${Math.round(terrainTargetTilePixels)} -> ${effectiveTerrainTargetTilePixels} px`);
  setLodControlOutput("terrainMaxTiles", `${Math.round(terrainMaxTiles)} -> ${effectiveTerrainMaxTiles}`);
}

function lodControlValue(key: string): number {
  const input = lodControlInputElements.find((item) => item.dataset.lodControl === key);
  const value = input ? Number(input.value) : Number.NaN;

  return Number.isFinite(value) ? value : 0;
}

function setLodControlOutput(key: string, value: string): void {
  const output = lodControlOutputElements.find((item) => item.dataset.lodValue === key);

  if (output) {
    output.textContent = value;
  }
}

function formatQualityMultiplier(value: number): string {
  if (value < 0.95) {
    return `${value.toFixed(2)}x performance`;
  }

  if (value > 1.05) {
    return `${value.toFixed(2)}x dettaglio`;
  }

  return `${value.toFixed(2)}x neutro`;
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function cameraLimitValue(key: string): number {
  const input = cameraLimitInputElements.find((item) => item.dataset.cameraLimit === key);
  const value = input ? Number(input.value) : Number.NaN;

  return Number.isFinite(value) ? value : 0;
}

function setCameraLimitInputValue(key: string, value: number): void {
  const input = cameraLimitInputElements.find((item) => item.dataset.cameraLimit === key);

  if (input) {
    input.value = String(value);
  }
}

function syncCameraLimitOutputs(values: {
  minHeightMeters: number;
  maxHeightMeters: number;
  collisionClearanceMeters: number;
  minTiltDeg: number;
  maxTiltDeg: number;
  fovDeg: number;
}): void {
  setCameraLimitOutput("minHeightMeters", formatHeight(values.minHeightMeters));
  setCameraLimitOutput("maxHeightMeters", formatHeight(values.maxHeightMeters));
  setCameraLimitOutput("collisionClearanceMeters", formatHeight(values.collisionClearanceMeters));
  setCameraLimitOutput("minTiltDeg", `${Math.round(values.minTiltDeg)}°`);
  setCameraLimitOutput("maxTiltDeg", `${Math.round(values.maxTiltDeg)}°`);
  setCameraLimitOutput("fovDeg", `${Math.round(values.fovDeg)}°`);
}

function setCameraLimitOutput(key: string, value: string): void {
  const output = cameraLimitOutputElements.find((item) => item.dataset.cameraLimitValue === key);

  if (output) {
    output.textContent = value;
  }
}

function formatHeight(value: number): string {
  if (Math.abs(value) >= 10_000) {
    return `${Math.round(value / 1000)} km`;
  }

  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)} km`;
  }

  return `${Math.round(value)} m`;
}

function startCameraStatusLoop(): void {
  const update = (now = performance.now()) => {
    if (now - lastCameraStatusUpdateAt < debugHudUpdateIntervalMs) {
      requestAnimationFrame(update);
      return;
    }

    lastCameraStatusUpdateAt = now;
    cameraStatusElement.textContent = formatCameraStatus();
    requestAnimationFrame(update);
  };

  update();
}

function formatLodDebugStatus(tiles: ReturnType<GeoViewer["tileTelemetry"]> = viewer.tileTelemetry()): string {
  const surface = viewer.cameraSurfaceStatus();
  const camera = viewer.cameraSnapshot();
  const lod = lastFrameStats?.lod;
  const terrain = lastFrameStats?.terrain;
  const imagery = lastImageryStats;
  const metricLevelRaw =
    lod && Number.isFinite(lod.metersPerPixel) && lod.metersPerPixel > 0
      ? Math.ceil(Math.log2(156543.03392804097 / (lod.metersPerPixel * Math.max(0.5, lod.pixelErrorBudget))))
      : undefined;

  return [
    `imagery.lod=${imagery?.level ?? "-"}`,
    `imagery.layerMinLevel=${imagery?.layerMinLevel ?? "-"}`,
    `imagery.layerMaxLevel=${imagery?.layerMaxLevel ?? "-"}`,
    `imagery.tiles=${imagery?.renderTiles ?? "-"}`,
    `imagery.requests=${imagery ? `${imagery.loadedTiles}/${imagery.activeTiles}` : "-"}`,
    `imagery.pending=${imagery?.pendingTiles ?? "-"}`,
    `imagery.errors=${imagery?.errorTiles ?? "-"}`,
    `imagery.render=${imagery?.renderTiles ?? "-"}`,
    `imagery.renderExact=${imagery?.exactRenderTiles ?? "-"}`,
    `imagery.renderFallback=${imagery?.fallbackRenderTiles ?? "-"}`,
    `imagery.requestLevelRange=${formatLevelRange(imagery?.requestLevels)}`,
    `imagery.requestLevels=${formatLevelHistogram(imagery?.requestLevels)}`,
    `imagery.renderLevelRange=${formatLevelRange(imagery?.renderLevels)}`,
    `imagery.renderLevels=${formatLevelHistogram(imagery?.renderLevels)}`,
    `imagery.exactRenderLevels=${formatLevelHistogram(imagery?.exactRenderLevels)}`,
    `imagery.fallbackRenderLevels=${formatLevelHistogram(imagery?.fallbackRenderLevels)}`,
    `imagery.errorLevels=${formatLevelHistogram(imagery?.errorLevels)}`,
    `imagery.compositeRender=${imagery?.compositeRenderTiles ?? "-"}`,
    `imagery.compositeDescendants=${imagery?.compositeDescendants ?? "-"}`,
    `imagery.compositeMaxLevel=${imagery?.compositeMaxLevel ?? "-"}`,
    `imagery.compositeCache=${imagery?.compositeCacheSize ?? "-"}`,
    `vt.feedbackPages=${imagery?.vtFeedbackPages ?? "-"}`,
    `vt.residentPages=${imagery?.vtResidentPages ?? "-"}`,
    `vt.missingPages=${imagery?.vtMissingPages ?? "-"}`,
    `vt.unavailablePages=${imagery?.vtUnavailablePages ?? "-"}`,
    `vt.fallbackPages=${imagery?.vtFallbackPages ?? "-"}`,
    `vt.compositePages=${imagery?.vtCompositePages ?? "-"}`,
    `vt.compositeChildren=${imagery?.vtCompositeChildren ?? "-"}`,
    `vt.compositeMaxLevel=${imagery?.vtCompositeMaxLevel ?? "-"}`,
    `imagery.cache=${imagery?.cacheSize ?? "-"}`,
    `tileTelemetry.imageryRequested=${tiles.imagery.requested.length}`,
    `tileTelemetry.imageryRendered=${tiles.imagery.rendered.length}`,
    `tileTelemetry.imageryVisible=${tiles.imagery.visible.length}`,
    `tileTelemetry.imageryOffscreen=${tiles.imagery.offscreen.length}`,
    `terrain.lod=${terrain?.level ?? "-"}`,
    `terrain.providerMinLevel=${terrain?.providerMinLevel ?? tiles.terrain.providerMinLevel ?? "-"}`,
    `terrain.providerMaxNativeLevel=${terrain?.providerMaxNativeLevel ?? tiles.terrain.providerMaxNativeLevel ?? "-"}`,
    `terrain.tiles=${terrain ? `${terrain.loadedTiles}/${terrain.activeTiles}` : "-"}`,
    `terrain.pending=${terrain?.pendingTiles ?? "-"}`,
    `terrain.render=${terrain?.renderTiles ?? "-"}`,
    `terrain.renderExact=${terrain?.exactRenderTiles ?? "-"}`,
    `terrain.renderFallback=${terrain?.fallbackRenderTiles ?? "-"}`,
    `terrain.requestLevelRange=${formatLevelRange(terrain?.requestLevels)}`,
    `terrain.requestLevels=${formatLevelHistogram(terrain?.requestLevels)}`,
    `terrain.renderLevelRange=${formatLevelRange(terrain?.renderLevels)}`,
    `terrain.renderLevels=${formatLevelHistogram(terrain?.renderLevels)}`,
    `terrain.exactRenderLevels=${formatLevelHistogram(terrain?.exactRenderLevels)}`,
    `terrain.fallbackRenderLevels=${formatLevelHistogram(terrain?.fallbackRenderLevels)}`,
    `terrain.meshCache=${terrain?.meshCacheSize ?? "-"}`,
    `terrain.cpuMeshes=${terrain?.cpuMeshes ?? "-"}`,
    `terrain.gpuDisplacement=${terrain?.gpuDisplacement ?? "-"}`,
    `terrain.gpuSkirts=${terrain?.gpuSkirts ?? "-"}`,
    `tileTelemetry.terrainRequested=${tiles.terrain.requested.length}`,
    `tileTelemetry.terrainRendered=${tiles.terrain.rendered.length}`,
    `tileTelemetry.terrainVisible=${tiles.terrain.visible.length}`,
    `tileTelemetry.terrainLoading=${tiles.terrain.loading.length}`,
    `tileTelemetry.terrainErrors=${tiles.terrain.errors.length}`,
    `tileTelemetry.terrainTargetLevel=${tiles.terrain.targetLevel ?? "-"}`,
    `tileTelemetry.terrainGridSize=${tiles.terrain.gridSize ?? "-"}`,
    `tileTelemetry.terrainProviderMaxNativeLevel=${tiles.terrain.providerMaxNativeLevel ?? "-"}`,
    `frame.statsAgeMs=${lastFrameStats ? Math.round(performance.now() - lastFrameStats.timestampMs) : "-"}`,
    `frame.rawFrameMs=${lastFrameStats ? lastFrameStats.rawFrameMs.toFixed(1) : "-"}`,
    `frame.rawCpuMs=${lastFrameStats ? lastFrameStats.rawCpuMs.toFixed(1) : "-"}`,
    `frame.rawUpdateMs=${lastFrameStats ? lastFrameStats.rawUpdateMs.toFixed(1) : "-"}`,
    `frame.rawRenderMs=${lastFrameStats ? lastFrameStats.rawRenderMs.toFixed(1) : "-"}`,
    `frame.long=${lastFrameStats ? (lastFrameStats.rawFrameMs > 250 || lastFrameStats.rawCpuMs > 80 ? "yes" : "no") : "-"}`,
    `update.cameraLodMs=${lastFrameStats ? lastFrameStats.updateBreakdown.cameraAndLodMs.toFixed(2) : "-"}`,
    `update.sampleMs=${lastFrameStats ? lastFrameStats.updateBreakdown.sampleMs.toFixed(2) : "-"}`,
    `update.coverageMs=${lastFrameStats ? lastFrameStats.updateBreakdown.coverageMs.toFixed(2) : "-"}`,
    `update.imageryMs=${lastFrameStats ? lastFrameStats.updateBreakdown.imageryMs.toFixed(2) : "-"}`,
    `update.terrainMs=${lastFrameStats ? lastFrameStats.updateBreakdown.terrainMs.toFixed(2) : "-"}`,
    `update.debugTilesetMs=${lastFrameStats ? lastFrameStats.updateBreakdown.debugTilesetMs.toFixed(2) : "-"}`,
    `coverage.tiles=${lastFrameStats?.coverageTiles ?? "-"}`,
    `coverage.budget=${lastFrameStats?.coverageBudget ?? "-"}`,
    `coverage.samples=${lastFrameStats?.coverageSamples ?? "-"}`,
    `coverage.strategy=${lastFrameStats?.coverageStrategy ?? "-"}`,
    `coverage.levelRange=${formatLevelRange(lastFrameStats?.coverageLevels)}`,
    `coverage.levels=${formatLevelHistogram(lastFrameStats?.coverageLevels)}`,
    `lod.altitudeMeters=${lod ? Math.round(lod.altitudeMeters) : "-"}`,
    `lod.cameraDistance=${lod ? lod.cameraDistance.toFixed(6) : "-"}`,
    `lod.projectedLevel=${lastFrameStats?.lodDebug.projectedImageryLevel ?? "-"}`,
    `lod.projectedTerrainLevel=${lastFrameStats?.lodDebug.projectedTerrainLevel ?? "-"}`,
    `lod.metricInputLevel=${lastFrameStats?.lodDebug.metricImageryLevel ?? "-"}`,
    `lod.combinedLevel=${lastFrameStats?.lodDebug.imageryLevel ?? "-"}`,
    `lod.terrainInputLevel=${lastFrameStats?.lodDebug.terrainLevel ?? "-"}`,
    `lod.cameraSlope=${lastFrameStats ? lastFrameStats.lodDebug.cameraSlope.toFixed(3) : "-"}`,
    `lod.equalizedTerrainZoom=${lastFrameStats?.lodDebug.equalizedTerrainZoom ?? "-"}`,
    `lod.requestedImageryLevel=${lastFrameStats?.lodDebug.requestedImageryTargetLevel ?? "-"}`,
    `lod.requestedTerrainLevel=${lastFrameStats?.lodDebug.requestedTerrainTargetLevel ?? "-"}`,
    `lod.stableImageryLevel=${lastFrameStats?.lodDebug.stableImageryTargetLevel ?? "-"}`,
    `lod.stableTerrainLevel=${lastFrameStats?.lodDebug.stableTerrainTargetLevel ?? "-"}`,
    `lod.effectiveRequestBudget=${lastFrameStats?.effectiveRequestBudget ?? "-"}`,
    `lod.profile=${lod?.profile ?? "-"}`,
    `lod.adaptiveReduction=${lod ? lod.adaptiveQualityReduction.toFixed(2) : "-"}`,
    `lod.tileBudget=${lod?.tileBudget ?? "-"}`,
    `lod.requestBudget=${lod?.requestBudget ?? "-"}`,
    `lod.metersPerPixel=${lod ? lod.metersPerPixel.toFixed(2) : "-"}`,
    `lod.imageryTargetTilePixels=${lod?.imageryTargetTilePixels ?? "-"}`,
    `lod.terrainTargetTilePixels=${lod?.terrainTargetTilePixels ?? "-"}`,
    `lod.terrainEqualizedZoom=${lod?.terrainEqualizedZoom ?? "-"}`,
    `lod.metricLevelRaw=${metricLevelRaw ?? "-"}`,
    `lod.metricLevel=${lastFrameStats?.metricLevel ?? "-"}`,
    `lod.imageryTargetLevel=${lastFrameStats?.imageryTargetLevel ?? "-"}`,
    `lod.terrainTargetLevel=${lastFrameStats?.terrainTargetLevel ?? "-"}`,
    `lod.pixelErrorBudget=${lod ? lod.pixelErrorBudget.toFixed(2) : "-"}`,
    `camera.lat=${toDegrees(surface.lat).toFixed(5)}`,
    `camera.lon=${toDegrees(surface.lon).toFixed(5)}`,
    `camera.ellipsoidHeight=${Math.round(surface.ellipsoidHeight)}`,
    `camera.heightAboveTerrain=${Math.round(surface.heightAboveTerrain)}`,
    `camera.terrainHeight=${surface.terrainHeight === undefined ? "-" : Math.round(surface.terrainHeight)}`,
    `camera.distance=${camera.distance.toFixed(6)}`,
    `camera.pitchDeg=${toDegrees(camera.pitch).toFixed(2)}`,
    `camera.tiltDeg=${toDegrees(camera.tiltOffset).toFixed(2)}`,
    `camera.lookYawDeg=${toDegrees(camera.lookYawOffset).toFixed(2)}`,
  ].join("\n");
}

function formatLevelRange(stats: TileLevelStats | undefined): string {
  if (!stats || stats.min === undefined || stats.max === undefined || stats.average === undefined) {
    return "-";
  }

  return `${stats.min}-${stats.max}, avg ${stats.average.toFixed(2)}`;
}

function formatLevelHistogram(stats: TileLevelStats | undefined): string {
  if (!stats) {
    return "-";
  }

  const entries = Object.entries(stats.histogram)
    .map(([level, count]) => [Number(level), count] as const)
    .filter(([level, count]) => Number.isFinite(level) && count > 0)
    .sort(([levelA], [levelB]) => levelA - levelB);

  return entries.length > 0 ? entries.map(([level, count]) => `${level}:${count}`).join(",") : "-";
}

function formatCameraStatus(): string {
  const status = viewer.cameraSurfaceStatus();
  const lon = toDegrees(status.lon).toFixed(5);
  const lat = toDegrees(status.lat).toFixed(5);

  if (status.heightReference === "terrain") {
    return `${lat}, ${lon}, AGL ${formatHeight(status.heightAboveTerrain)}, terrain ${formatHeight(status.terrainHeight ?? 0)}`;
  }

  return `${lat}, ${lon}, ellipsoid ${formatHeight(status.ellipsoidHeight)}`;
}

function formatPickStatus(hit: { lon: number; lat: number; height: number }): string {
  const lat = toDegrees(hit.lat).toFixed(5);
  const lon = toDegrees(hit.lon).toFixed(5);

  return `${lat}, ${lon}, quota ${formatHeight(hit.height)}`;
}

function demoAssetUrl(path: string): string {
  if (/^https?:\/\//u.test(path)) {
    return path;
  }

  const url = `${import.meta.env.BASE_URL}${path.replace(/^\/+/u, "")}`;

  return demoAssetCacheBust ? `${url}${url.includes("?") ? "&" : "?"}v=${demoAssetCacheBust}` : url;
}

function bindCanvasPicking(): void {
  if (activePickingCanvas === viewer.canvas) {
    return;
  }

  activePickingCanvas?.removeEventListener("pointerdown", handlePickPointerDown);
  activePickingCanvas?.removeEventListener("pointerup", handlePickPointerUp);
  activePickingCanvas = viewer.canvas;
  activePickingCanvas.addEventListener("pointerdown", handlePickPointerDown);
  activePickingCanvas.addEventListener("pointerup", handlePickPointerUp);
}

function syncRendererToggle(): void {
  const isWebGpu = viewer.renderer.backend === "webgpu";
  const target = isWebGpu ? "webgl2" : "webgpu";

  rendererToggleElement.setAttribute("aria-pressed", String(isWebGpu));
  rendererToggleElement.dataset.currentRenderer = viewer.renderer.backend;
  rendererToggleElement.dataset.targetRenderer = target;
  rendererToggleElement.dataset.testid = "renderer-toggle";
  rendererToggleElement.textContent = target === "webgl2" ? "WebGL2" : "WebGPU";
}

function syncResponsivePanels(compact: boolean): void {
  setMenuOpen(false);
  setInfoOpen(!compact);
}

function setMenuOpen(open: boolean): void {
  menuToggleElement.setAttribute("aria-expanded", String(open));
  menuToggleElement.textContent = open ? "Menu ON" : "Menu";
  demoTocElement.classList.toggle("open", open);
  demoTocElement.style.opacity = open ? "1" : "";
  demoTocElement.style.transform = open ? "translateX(0)" : "";
}

function setInfoOpen(open: boolean): void {
  infoToggleElement.setAttribute("aria-expanded", String(open));
  infoToggleElement.textContent = open ? "Info ON" : "Info";
  infoPanelElement.classList.toggle("open", open);
}

function updateRendererUrl(backend: "webgl2" | "webgpu"): void {
  const url = new URL(window.location.href);

  if (backend === "webgpu") {
    url.searchParams.set("renderer", "webgpu");
  } else {
    url.searchParams.delete("renderer");
  }

  window.history.replaceState(null, "", url);
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
