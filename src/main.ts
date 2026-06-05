import "./styles.css";
import { GeoViewer } from "./engine/geo-viewer";
import { loadGlb } from "./engine/loaders/gltf/glb-loader";
import { extractFirstMeshPrimitive } from "./engine/loaders/gltf/gltf-mesh";
import { selectTilesetTile } from "./engine/loaders/tiles3d/tile-selector";
import { loadTilesetJson, tileBoundingVolumeCenter, type TilesetJson } from "./engine/loaders/tiles3d/tileset";
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
          <p class="eyebrow">Plan.md</p>
          <h2>Progressi</h2>
        </header>
        <div class="overall">
          <div class="overall-copy">
            <span>Avanzamento MVP</span>
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
let demoTileset: TilesetJson | undefined;
let activeTilesetContentKey: string | undefined;
let pendingTilesetContentKey: string | undefined;
let activeModelPickSphere:
  | {
      center: [number, number, number];
      radius: number;
    }
  | undefined;

const viewer = new GeoViewer({
  container: globeHost,
  renderer: "webgl2",
  onImageryStats: (stats) => {
    imageryStatus.textContent = `LOD ${stats.level}`;
    const mode = debugTileOverlay ? "overlay" : "base";
    tileStatus.textContent = `${stats.loadedTiles}/${stats.activeTiles} attive, ${stats.pendingTiles} pending, cache ${stats.cacheSize}, ${mode}`;
    void syncDemoTilesetContent();
  },
  onImageryError: () => {
    imageryStatus.textContent = "fallback";
  },
});
rendererStatus.textContent = viewer.renderer.supported ? "WebGL2 attivo" : "WebGL2 non disponibile";
imageryStatus.textContent = "Ortofoto";
viewer.imagery.addXYZLayer({
  url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  level: 2,
});
void loadDemoTileset();
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

  if (debugModelVisible && activeModelPickSphere && viewer.pickSphere(event.clientX, event.clientY, activeModelPickSphere)) {
    pickingStatusElement.textContent = "mesh: demo marker";
    return;
  }

  const hit = viewer.pickGlobe(event.clientX, event.clientY);

  if (!hit) {
    pickingStatusElement.textContent = "nessun hit";
    return;
  }

  pickingStatusElement.textContent = `${toDegrees(hit.lat).toFixed(3)}, ${toDegrees(hit.lon).toFixed(3)}`;
});

async function loadDemoModel(
  url: string,
  placement: {
    lon: number;
    lat: number;
    height: number;
  },
): Promise<void> {
  try {
    const demoGlb = await loadGlb(url);
    const demoPrimitive = extractFirstMeshPrimitive(demoGlb.json, demoGlb.binaryChunk);
    const baseColorTexture = demoPrimitive.baseColorTexture
      ? await createImageBitmap(
          new Blob([demoPrimitive.baseColorTexture.bytes.slice().buffer], {
            type: demoPrimitive.baseColorTexture.mimeType,
          })
        )
      : undefined;
    viewer.setDebugModelMesh({
      positions: demoPrimitive.positions,
      texcoords: demoPrimitive.texcoords,
      indices: demoPrimitive.indices,
      lon: placement.lon,
      lat: placement.lat,
      height: placement.height,
      scale: 180000,
      baseColorFactor: demoPrimitive.baseColorFactor,
      baseColorTexture,
    });
    activeModelPickSphere = {
      center: viewer.cartographicToUnitSphere(placement),
      radius: 230000 / 6_378_137,
    };
  } catch (error) {
    console.warn("Demo GLB failed", error);
    modelToggle!.textContent = "Model -";
    modelToggle!.disabled = true;
  }
}

async function loadDemoTileset(): Promise<void> {
  try {
    demoTileset = await loadTilesetJson("/tilesets/demo/tileset.json");
    tiles3dStatusElement.textContent = "tileset OK";
    await syncDemoTilesetContent();
  } catch (error) {
    console.warn("Demo tileset failed", error);
    tiles3dStatusElement.textContent = "tileset -";
  }
}

async function syncDemoTilesetContent(): Promise<void> {
  if (!demoTileset) {
    return;
  }

  const selected = selectTilesetTile(demoTileset.root, viewer.camera.distance, {
    cameraPosition: viewer.camera.position,
    cameraTarget: viewer.camera.target,
  });

  if (!selected) {
    tiles3dStatusElement.textContent = "culled";
    activeTilesetContentKey = undefined;
    activeModelPickSphere = undefined;
    viewer.setDebugModelVisible(false);
    return;
  }

  viewer.setDebugModelVisible(debugModelVisible);
  const contentUri = selected.tile.content?.resolvedUri;

  if (!contentUri) {
    tiles3dStatusElement.textContent = `LOD ${selected.depth}: vuoto`;
    return;
  }

  const contentKey = `${selected.depth}:${contentUri}`;

  if (contentKey === activeTilesetContentKey || contentKey === pendingTilesetContentKey) {
    tiles3dStatusElement.textContent = `LOD ${selected.depth}: GLB`;
    return;
  }

  const placement = tileBoundingVolumeCenter(demoTileset.root);

  if (!placement) {
    tiles3dStatusElement.textContent = `LOD ${selected.depth}: root bounds -`;
    return;
  }

  pendingTilesetContentKey = contentKey;
  tiles3dStatusElement.textContent = `LOD ${selected.depth}: loading`;
  await loadDemoModel(contentUri, {
    lon: placement.lon,
    lat: placement.lat,
    height: placement.height + 90000,
  });
  activeTilesetContentKey = contentKey;
  pendingTilesetContentKey = undefined;
  tiles3dStatusElement.textContent = `LOD ${selected.depth}: GLB`;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}
