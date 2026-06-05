import "./styles.css";
import { GeoViewer } from "./engine/geo-viewer";
import { findDataSource, loadDataCatalog } from "./engine/catalog/data-catalog";
import { loadOrbixProject } from "./engine/project/orbix-project";
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
        <div class="hud">
          <div>
            <span class="eyebrow">MVP 1</span>
            <h1>OrbixJS</h1>
            <p class="hint">Drag orbit, Shift+drag pan, Alt+drag tilt, rotellina zoom</p>
          </div>
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
        <label class="metric wide scene-date">
          <span>Data sole</span>
          <input id="scene-date" type="datetime-local" value="2026-06-05T12:00" />
        </label>
        <button id="tile-debug-toggle" class="debug-toggle" type="button" aria-pressed="false">
          LOD overlay
        </button>
        <button id="coastline-toggle" class="debug-toggle" type="button" aria-pressed="false">
          Coastline
        </button>
        <button id="model-toggle" class="debug-toggle" type="button" aria-pressed="false">
          Model
        </button>
        <div class="fly-presets" aria-label="FlyTo presets">
          <button data-fly-to="italy" type="button">Italia</button>
          <button data-fly-to="usa" type="button">USA</button>
          <button data-fly-to="tokyo" type="button">Tokyo</button>
        </div>
      </div>
      </div>
      <aside class="panel" aria-label="Roadmap progress">
        <header>
          <p class="eyebrow">Plan2.md</p>
          <h2>Progressi</h2>
        </header>
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
    </section>
  </main>
`;

const list = document.querySelector<HTMLOListElement>("#roadmap");
const overallProgress = document.querySelector<HTMLElement>("#overall-progress");
const overallBar = document.querySelector<HTMLElement>("#overall-bar");
const rendererStatus = document.querySelector<HTMLElement>("#renderer-status");
const imageryStatus = document.querySelector<HTMLElement>("#imagery-status");
const tileStatus = document.querySelector<HTMLElement>("#tile-status");
const tiles3dStatus = document.querySelector<HTMLElement>("#tiles3d-status");
const pickingStatus = document.querySelector<HTMLElement>("#picking-status");
const tileDebugToggle = document.querySelector<HTMLButtonElement>("#tile-debug-toggle");
const coastlineToggle = document.querySelector<HTMLButtonElement>("#coastline-toggle");
const modelToggle = document.querySelector<HTMLButtonElement>("#model-toggle");
const sceneDateInput = document.querySelector<HTMLInputElement>("#scene-date");
const flyPresetButtons = document.querySelectorAll<HTMLButtonElement>("[data-fly-to]");

if (
  !list ||
  !overallProgress ||
  !overallBar ||
  !rendererStatus ||
  !imageryStatus ||
  !tileStatus ||
  !tiles3dStatus ||
  !pickingStatus ||
  !tileDebugToggle ||
  !coastlineToggle ||
  !modelToggle ||
  !sceneDateInput ||
  flyPresetButtons.length === 0
) {
  throw new Error("Missing progress UI element");
}

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

const viewer = new GeoViewer({
  container: globeHost,
  renderer: "webgl2",
  date: new Date(sceneDateInput.value),
  onImageryStats: (stats) => {
    imageryStatus.textContent = `LOD ${stats.level}`;
    const mode = debugTileOverlay ? "overlay" : "base";
    tileStatus.textContent = `${stats.loadedTiles}/${stats.activeTiles} attive, ${stats.pendingTiles} pending, cache ${stats.cacheSize}, ${mode}`;
  },
  onTilesetStats: (stats) => {
    tiles3dStatusElement.textContent = stats.status;
  },
  onImageryError: () => {
    imageryStatusElement.textContent = "fallback";
  },
});
rendererStatus.textContent = viewer.renderer.supported ? "WebGL2 attivo" : "WebGL2 non disponibile";
imageryStatus.textContent = "Ortofoto";

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

let debugTileOverlay = false;
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

const flyToPresets = {
  italy: { lon: 12.5, lat: 42.5, height: 1_500_000 },
  usa: { lon: -100, lat: 40, height: 2_500_000 },
  tokyo: { lon: 139.7, lat: 35.7, height: 1_200_000 },
};

flyPresetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const preset = flyToPresets[button.dataset.flyTo as keyof typeof flyToPresets];

    if (preset) {
      viewer.flyTo(preset);
    }
  });
});

let pickStart: { x: number; y: number } | undefined;
viewer.canvas.addEventListener("pointerdown", (event) => {
  pickStart = { x: event.clientX, y: event.clientY };
});
viewer.canvas.addEventListener("pointerup", (event) => {
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
    viewer.canvas.dispatchEvent(new CustomEvent("orbix:pick", { detail: hit }));

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
  viewer.canvas.dispatchEvent(new CustomEvent("orbix:pick", { detail: globe ? { type: "globe" as const, ...globe } : undefined }));

  if (!globe) {
    pickingStatusElement.textContent = "nessun hit";
    return;
  }

  pickingStatusElement.textContent = `${toDegrees(globe.lat).toFixed(3)}, ${toDegrees(globe.lon).toFixed(3)}`;
});

async function loadDemoProject(): Promise<void> {
  try {
    const project = await loadOrbixProject(demoAssetUrl("projects/demo.orbix.json"));
    const catalog = await loadDataCatalog(demoAssetUrl(project.catalogUrl ?? "catalogs/demo-catalog.json"));

    if (project.camera) {
      viewer.flyTo(project.camera);
    }

    for (const layer of project.layers) {
      if (layer.visible === false) {
        continue;
      }

      const source = findDataSource(catalog, layer.source);

      if (!source) {
        console.warn(`Missing data source: ${layer.source}`);
        continue;
      }

      if (layer.type === "imagery-xyz" && source.type === "imagery-xyz") {
        viewer.imagery.addXYZLayer({
          url: source.url,
          level: source.minLevel ?? 2,
          minLevel: source.minLevel,
          maxLevel: source.maxLevel,
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

function demoAssetUrl(path: string): string {
  if (/^https?:\/\//u.test(path)) {
    return path;
  }

  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/u, "")}`;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}
