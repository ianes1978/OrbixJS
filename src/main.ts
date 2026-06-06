import "./styles.css";
import { GeoViewer } from "./engine/geo-viewer";
import { cameraPathDuration, sampleCameraPath, type CameraPath } from "./engine/core/camera/camera-path";
import { findDataSource, loadDataCatalog } from "./engine/catalog/data-catalog";
import { loadOrbixProject, resolveOrbixLayerCrs } from "./engine/project/orbix-project";
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
          <p class="hint">Drag orbit, Shift+drag pan, Alt+drag tilt, rotellina zoom</p>
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
          <section class="control-section" aria-label="Camera path">
            <h2>Camera path</h2>
            <div id="camera-paths" class="fly-presets path-presets" aria-label="Camera path presets"></div>
            <button id="camera-path-stop" class="debug-toggle compact-toggle" type="button" disabled>
              Stop path
            </button>
            <div class="metric compact-metric">
              <span>Stato path</span>
              <strong id="camera-path-status">nessun path</strong>
            </div>
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
            <div class="metric">
              <span>3D Tiles</span>
              <strong id="tiles3d-status">tileset -</strong>
            </div>
            <div class="metric wide">
              <span>Picking</span>
              <strong id="picking-status">click globo</strong>
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
const tiles3dStatus = document.querySelector<HTMLElement>("#tiles3d-status");
const pickingStatus = document.querySelector<HTMLElement>("#picking-status");
const tileDebugToggle = document.querySelector<HTMLButtonElement>("#tile-debug-toggle");
const coastlineToggle = document.querySelector<HTMLButtonElement>("#coastline-toggle");
const modelToggle = document.querySelector<HTMLButtonElement>("#model-toggle");
const mobileControlsToggle = document.querySelector<HTMLButtonElement>("#mobile-controls-toggle");
const hudControls = document.querySelector<HTMLElement>("#demo-toc");
const infoToggle = document.querySelector<HTMLButtonElement>("#info-toggle");
const infoPanel = document.querySelector<HTMLElement>("#info-panel");
const sceneDateInput = document.querySelector<HTMLInputElement>("#scene-date");
const flyPresetButtons = document.querySelectorAll<HTMLButtonElement>("[data-fly-to]");
const cameraPathControls = document.querySelector<HTMLElement>("#camera-paths");
const cameraPathStop = document.querySelector<HTMLButtonElement>("#camera-path-stop");
const cameraPathStatus = document.querySelector<HTMLElement>("#camera-path-status");

if (
  !list ||
  !overallProgress ||
  !overallBar ||
  !rendererStatus ||
  !rendererToggle ||
  !imageryStatus ||
  !tileStatus ||
  !tiles3dStatus ||
  !pickingStatus ||
  !tileDebugToggle ||
  !coastlineToggle ||
  !modelToggle ||
  !mobileControlsToggle ||
  !hudControls ||
  !infoToggle ||
  !infoPanel ||
  !sceneDateInput ||
  !cameraPathControls ||
  !cameraPathStop ||
  !cameraPathStatus ||
  flyPresetButtons.length === 0
) {
  throw new Error("Missing progress UI element");
}

const rendererToggleElement = rendererToggle;
const menuToggleElement = mobileControlsToggle;
const demoTocElement = hudControls;
const infoToggleElement = infoToggle;
const infoPanelElement = infoPanel;
const cameraPathControlsElement = cameraPathControls;
const cameraPathStopElement = cameraPathStop;
const cameraPathStatusElement = cameraPathStatus;
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
const rendererBackend = new URLSearchParams(window.location.search).get("renderer") === "webgpu" ? "webgpu" : "webgl2";

const viewer = new GeoViewer({
  container: globeHost,
  renderer: rendererBackend,
  date: new Date(sceneDateInput.value),
  onImageryStats: (stats) => {
    imageryStatus.textContent = `LOD ${stats.level}`;
    const mode = debugTileOverlay ? "surface" : "base";
    tileStatus.textContent = `${stats.loadedTiles}/${stats.activeTiles} attive, ${stats.pendingTiles} pending, cache ${stats.cacheSize}, ${mode}`;
  },
  onTilesetStats: (stats) => {
    tiles3dStatusElement.textContent = stats.status;
  },
  onImageryError: () => {
    imageryStatusElement.textContent = "fallback";
  },
});
rendererStatus.textContent = viewer.renderer.supported
  ? `${viewer.renderer.backend === "webgpu" ? "WebGPU init" : "WebGL2"} attivo`
  : `${viewer.renderer.backend === "webgpu" ? "WebGPU" : "WebGL2"} non disponibile`;
imageryStatus.textContent = "Ortofoto";
syncRendererToggle();

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

let debugTileOverlay = true;
viewer.setDebugTileOverlay(debugTileOverlay);
tileDebugToggle.addEventListener("click", () => {
  debugTileOverlay = !debugTileOverlay;
  viewer.setDebugTileOverlay(debugTileOverlay);
  tileDebugToggle.setAttribute("aria-pressed", String(debugTileOverlay));
  tileDebugToggle.textContent = debugTileOverlay ? "LOD ON" : "LOD overlay";
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

    pickingStatusElement.textContent = `${toDegrees(hit.lat).toFixed(3)}, ${toDegrees(hit.lon).toFixed(3)}`;
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

  pickingStatusElement.textContent = `${toDegrees(globe.lat).toFixed(3)}, ${toDegrees(globe.lon).toFixed(3)}`;
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
      }
    }
  } catch (error) {
    console.warn("Demo project failed", error);
    imageryStatusElement.textContent = "fallback";
    tiles3dStatusElement.textContent = "tileset -";
  }
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

  rendererToggleElement.setAttribute("aria-pressed", String(isWebGpu));
  rendererToggleElement.textContent = isWebGpu ? "WebGL2" : "WebGPU";
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
