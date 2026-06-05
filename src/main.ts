import "./styles.css";
import { GeoViewer } from "./engine/geo-viewer";
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
            <p class="hint">Drag per orbitare, rotellina per zoomare</p>
          </div>
          <div class="metric">
            <span>Renderer</span>
            <strong id="renderer-status">WebGL2</strong>
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

if (!list || !overallProgress || !overallBar || !rendererStatus) {
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

const viewer = new GeoViewer({ container: globeHost, renderer: "webgl2" });
rendererStatus.textContent = viewer.renderer.supported ? "WebGL2 attivo" : "WebGL2 non disponibile";
