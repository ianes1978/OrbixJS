import "./styles.css";
import { GeoViewer, type GeoViewerFrameStats } from "./engine/geo-viewer";
import { cameraPathDuration, sampleCameraPath, type CameraPath } from "./engine/core/camera/camera-path";
import { findDataSource, loadDataCatalog } from "./engine/catalog/data-catalog";
import { loadOrbixProject, resolveOrbixLayerCrs } from "./engine/project/orbix-project";
import { createHeightmapTerrainProvider, loadHeightmapTerrainManifest } from "./engine/globe/terrain/heightmap-terrain-provider";
import {
  createCivisQuantizedMeshTerrainProvider,
  loadCivisQuantizedMeshLayer,
} from "./engine/globe/terrain/civis-quantized-mesh-terrain-provider";
import { createProceduralTerrainProvider } from "./engine/globe/terrain/procedural-terrain-provider";
import { findPreprocessJob, loadPreprocessManifest } from "./engine/preprocess/preprocess-manifest";
import { roadmap } from "./roadmap";

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
            <button id="tile-debug-toggle" class="debug-toggle" type="button" aria-pressed="true">
              LOD ON
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
              <span>Clearance <output data-camera-limit-value="collisionClearanceMeters">1 m</output></span>
              <input data-camera-limit="collisionClearanceMeters" type="range" min="0" max="50" step="0.1" value="1" />
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
          <section class="control-section" aria-label="Camera path">
            <h2>Camera path</h2>
            <div id="camera-paths" class="fly-presets path-presets" aria-label="Camera path presets"></div>
            <button id="camera-path-stop" class="debug-toggle compact-toggle" type="button" disabled>
              Stop path
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
const tileDebugToggle = document.querySelector<HTMLButtonElement>("#tile-debug-toggle");
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
const cameraCollisionToggle = document.querySelector<HTMLButtonElement>("#camera-collision-toggle");
const cameraPathControls = document.querySelector<HTMLElement>("#camera-paths");
const cameraPathStop = document.querySelector<HTMLButtonElement>("#camera-path-stop");
const cameraPathStatus = document.querySelector<HTMLElement>("#camera-path-status");
const cameraSnapshotCopy = document.querySelector<HTMLButtonElement>("#camera-snapshot-copy");
const cameraKeyframeCopy = document.querySelector<HTMLButtonElement>("#camera-keyframe-copy");
const cameraSnapshotStatus = document.querySelector<HTMLElement>("#camera-snapshot-status");
const cameraSnapshotOutput = document.querySelector<HTMLTextAreaElement>("#camera-snapshot-output");

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
  !tileDebugToggle ||
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
  !cameraCollisionToggle ||
  !cameraPathControls ||
  !cameraPathStop ||
  !cameraPathStatus ||
  !cameraSnapshotCopy ||
  !cameraKeyframeCopy ||
  !cameraSnapshotStatus ||
  !cameraSnapshotOutput ||
  flyPresetButtons.length === 0
) {
  throw new Error("Missing progress UI element");
}

const rendererToggleElement = rendererToggle;
const menuToggleElement = mobileControlsToggle;
const demoTocElement = hudControls;
const infoToggleElement = infoToggle;
const infoPanelElement = infoPanel;
const cameraLimitInputElements = [...cameraLimitInputs];
const cameraLimitOutputElements = [...cameraLimitOutputs];
const cameraCollisionToggleElement = cameraCollisionToggle;
const cameraPathControlsElement = cameraPathControls;
const cameraPathStopElement = cameraPathStop;
const cameraPathStatusElement = cameraPathStatus;
const cameraSnapshotCopyElement = cameraSnapshotCopy;
const cameraKeyframeCopyElement = cameraKeyframeCopy;
const cameraSnapshotStatusElement = cameraSnapshotStatus;
const cameraSnapshotOutputElement = cameraSnapshotOutput;
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
const urlParams = new URLSearchParams(window.location.search);
const rendererBackend = urlParams.get("renderer") === "webgpu" ? "webgpu" : "webgl2";
const terrainDebugEnabled = urlParams.get("debugTerrain") === "1" || urlParams.get("terrain") === "1";
let debugTileOverlay = true;
let lastImageryStats:
  | {
      level: number;
      activeTiles: number;
      loadedTiles: number;
      pendingTiles: number;
      cacheSize: number;
    }
  | undefined;
let lastFrameStats: GeoViewerFrameStats | undefined;

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
    clearance: 1,
  },
  date: new Date(sceneDateInput.value),
  onImageryStats: (stats) => {
    lastImageryStats = stats;
    imageryStatus.textContent = `LOD ${stats.level}`;
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
startCameraStatusLoop();

cameraLimitInputElements.forEach((input) => {
  input.addEventListener("input", () => {
    applyCameraLimitControls();
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
  syncRuntimeMetrics();
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
let activeCameraPathFrame: number | undefined;
let activeCameraPathId: string | undefined;

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

    renderCameraPathControls(project.cameraPaths ?? []);

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
        viewer.imagery.addXYZLayer({
          url: source.url,
          level: source.minLevel ?? 2,
          minLevel: source.minLevel,
          maxLevel: source.maxLevel,
          tileSize: source.tileSize,
        });
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

function syncRuntimeMetrics(): void {
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
  const terrain = lastFrameStats?.terrain
    ? `terrain ${lastFrameStats.terrain.loadedTiles}/${lastFrameStats.terrain.activeTiles}, pending ${lastFrameStats.terrain.pendingTiles}, mesh ${lastFrameStats.terrain.meshCacheSize}`
    : "terrain off";
  tileStatusElement.textContent = `${lastImageryStats.loadedTiles}/${lastImageryStats.activeTiles} img, pending ${lastImageryStats.pendingTiles}, cache ${lastImageryStats.cacheSize}, ${coverage}, ${terrain}, ${mode}`;
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

function renderCameraPathControls(paths: readonly CameraPath[]): void {
  cameraPathControlsElement.replaceChildren();
  cameraPathStatusElement.textContent = paths.length > 0 ? "pronto" : "nessun path";
  cameraPathStopElement.disabled = true;

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
  cameraPathStatusElement.textContent = `play ${path.name ?? path.id}`;
  cameraPathStopElement.disabled = false;
  syncCameraPathButtons();

  const step = (now: number) => {
    const elapsedSeconds = (now - startedAt) / 1000;
    const sample = sampleCameraPath(path, elapsedSeconds);

    viewer.flyTo({ lon: sample.lon, lat: sample.lat, height: sample.height });

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
  const update = () => {
    cameraStatusElement.textContent = formatCameraStatus();
    requestAnimationFrame(update);
  };

  update();
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

  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/u, "")}`;
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
