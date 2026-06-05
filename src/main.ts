import "./styles.css";
import { GeoViewer } from "./engine/geo-viewer";
import { parseGlb } from "./engine/loaders/gltf/glb-loader";
import { extractFirstMeshPrimitive } from "./engine/loaders/gltf/gltf-mesh";
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

const viewer = new GeoViewer({
  container: globeHost,
  renderer: "webgl2",
  onImageryStats: (stats) => {
    imageryStatus.textContent = `LOD ${stats.level}`;
    const mode = debugTileOverlay ? "overlay" : "base";
    tileStatus.textContent = `${stats.loadedTiles}/${stats.activeTiles} attive, ${stats.pendingTiles} pending, cache ${stats.cacheSize}, ${mode}`;
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
const demoGlb = parseGlb(createDemoGlb());
const demoPrimitive = extractFirstMeshPrimitive(demoGlb.json, demoGlb.binaryChunk);
viewer.setDebugModelMesh({
  positions: demoPrimitive.positions,
  indices: demoPrimitive.indices,
  lon: 12.5,
  lat: 42.5,
  height: 90000,
  scale: 180000,
});
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

function createDemoGlb(): ArrayBuffer {
  const positions = new Float32Array([
    -0.5, 0, -0.5,
    0.5, 0, -0.5,
    0.5, 0, 0.5,
    -0.5, 0, 0.5,
    0, 1.35, 0,
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3, 0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0]);
  const binary = concatBytes(new Uint8Array(positions.buffer), new Uint8Array(indices.buffer));
  const json = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: indices.length,
        type: "SCALAR",
      },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  };

  return createGlb(json, binary);
}

function createGlb(json: unknown, binary: Uint8Array): ArrayBuffer {
  const jsonBytes = padTo4(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const binaryBytes = padTo4(binary, 0);
  const totalLength = 12 + 8 + jsonBytes.length + 8 + binaryBytes.length;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  view.setUint32(offset, 0x46546c67, true);
  view.setUint32(offset + 4, 2, true);
  view.setUint32(offset + 8, totalLength, true);
  offset += 12;
  view.setUint32(offset, jsonBytes.length, true);
  view.setUint32(offset + 4, 0x4e4f534a, true);
  bytes.set(jsonBytes, offset + 8);
  offset += 8 + jsonBytes.length;
  view.setUint32(offset, binaryBytes.length, true);
  view.setUint32(offset + 4, 0x004e4942, true);
  bytes.set(binaryBytes, offset + 8);

  return buffer;
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(first.byteLength + second.byteLength);
  bytes.set(first);
  bytes.set(second, first.byteLength);
  return bytes;
}

function padTo4(bytes: Uint8Array, padding: number): Uint8Array {
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4);
  padded.fill(padding);
  padded.set(bytes);
  return padded;
}
