# OrbixJS

Ambiente di sviluppo per il piano in `Plan.md`.

## Comandi

```powershell
npm install
npm run dev
npm test
npm run build
```

Apri la dashboard su:

```text
http://127.0.0.1:5173/
```

Per una vista senza server:

```powershell
npm run build
start .\dist\index.html
```

Su Windows puoi anche usare:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\stop-dev.ps1
```

La pagina mostra il checkpoint MVP 0.1: globo WebGL2 navigabile, imagery, glTF/GLB georeferenziato, 3D Tiles demo con LOD, culling e picking.

## API minime

```ts
const viewer = new GeoViewer({
  container: "map",
  renderer: "webgl2",
});

const hit = viewer.pick({ clientX, clientY });
```

`viewer.pick(...)` restituisce un hit `globe` con `lon`, `lat`, `height`, oppure un hit `mesh` con `id`. La demo emette anche un evento DOM pubblico `orbix:pick` sulla canvas.

## Demo pubblica da GitHub

Il repository include un workflow GitHub Actions in `.github/workflows/deploy-demo.yml`.

Quando il progetto sara' su GitHub:

- abilita GitHub Pages dalle impostazioni del repository
- scegli GitHub Actions come sorgente di deploy
- fai push su `main`

Il workflow esegue `npm ci`, `npm test`, `npm run build` e pubblica la cartella `dist` come demo statica.

## Stato MVP 0.1

Sono completate le fasi iniziali definite in `Plan.md`:

- Core: WebGL2, scene graph, camera orbitale, WGS84
- Imagery: XYZ, WMTS, cache, quadtree e tile raster sul globo
- Camera: zoom, pan, rotate, tilt e flyTo
- glTF: GLB, materiale base, texture e posizionamento geografico
- 3D Tiles: `tileset.json`, caricamento tile, LOD base e culling
- Picking: globo, mesh demo e coordinate geografiche

I test coprono math, geodesia, camera, scene graph, tiling, imagery, glTF e 3D Tiles.
