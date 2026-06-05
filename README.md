# OrbixJS

Ambiente di sviluppo per il piano in `Plan.md`.

## Comandi

```powershell
npm install
npm run dev
npm test
npm run build
npm run build:lib
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

## Focus demo

La demo pubblica deve evolvere verso un focus sull'Alto Adige/Südtirol.

Dataset terrain candidato:

- Modello Digitale del Terreno dell'Alto Adige (DTM 2,5m)
- layer ufficiale: `p_bz-Elevation:DigitalTerrainModel-2.5m`
- tile sperimentali: `https://test-static-mapview.civis.bz.it/working/tiles/raster/DEM/DTM/DigitalTerrainModel-2_5m/`

Basemap candidata:

- `2023 Orthofoto`
- WMTS: `https://geoservices.buergernetz.bz.it/mapproxy/p_bz-Orthoimagery/ows`
- layer: `Aerial-2023-RGB`
- matrix set: `EPSG_25832`
- CRS: `EPSG:25832`
- formato: `image/png`

CRS target per GIS e Digital Twin:

- `EPSG:4326`, `EPSG:4979`, `EPSG:4978`
- `EPSG:3857`
- UTM WGS84 `EPSG:326xx`/`EPSG:327xx`
- ETRS89/UTM `EPSG:258xx`, con priorita a `EPSG:25832`
- CRS italiani comuni come Gauss-Boaga `EPSG:3003`/`EPSG:3004`
- frame locali ENU per GPU, editing, Digital Twin e Blender

Modellazione parametrica target:

- estrusione da poligoni usando metadata come altezza, numero piani, quota base e destinazione d'uso
- setback, offset, tetti e facade rules per volumi edilizi
- sweep da linee per strade, tubazioni, cavi, barriere e gallerie
- instancing da punti per alberi, lampioni, sensori e arredo urbano
- regole non distruttive: la mesh resta derivata da feature, metadata e parametri

Layer styling target:

- stato comune: `visible`, `opacity`, `zIndex`, `pickable`, `locked`
- blend mode: `normal`, `multiply`, `screen`, `overlay`, `add`, `subtract`, `lighten`, `darken`, `mask`
- controlli colore: brightness, contrast, saturation, gamma, tint e color ramp
- gruppi layer, legenda, attribution e preset demo

Project/data pipeline target:

- `OrbixProject` JSON versionato per camera, camera paths, CRS, project frame, layer stack, timeline, editing state e regole parametriche
- `DataCatalog` per dataset, URL, CRS, extent, licenza, attribution, auth, cache policy, preview e fallback
- `PreprocessJob` per trasformare DTM/GeoTIFF/WCS/COG, feature, glTF/3D Tiles e meteo in asset runtime riproducibili
- manifest preprocessing con input, hash, CRS, extent, tool version, parametri, licenza e output
- catalogo demo Alto Adige con DTM 2,5m, Orthofoto 2023, layer debug e fallback GitHub Pages

Camera flight target:

- voli in soggettiva con `CameraPath`, keyframe, easing e playback fluido
- modalita first-person, look-at, orbit, follow feature e terrain-follow
- play, pause, scrub, loop, speed multiplier e trigger su timeline
- clearance minima dal terrain, smoothing LOD e prevenzione di scatti/collisioni
- salvataggio nel progetto ed export verso Blender per video e presentazioni

Prima dell'uso runtime va validato il formato delle tile terrain: schema, CRS, encoding quota e NoData. Per l'ortofoto 2023 serve inoltre supporto WMTS con `TileMatrixSet` custom/CRS `EPSG:25832`. Il motore deve mantenere CRS sorgente, CRS di progetto, quote e trasformazioni come metadata espliciti.

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

## Uso come libreria

`npm run build:lib` genera l'entrypoint ESM tipizzato in `dist-lib/index.js` con declaration TypeScript in `dist-lib/index.d.ts`.

```ts
import { GeoViewer } from "orbixjs";
```

## Stato MVP 0.1

Sono completate le fasi iniziali definite in `Plan.md`:

- Core: WebGL2, scene graph, camera orbitale, WGS84
- Imagery: XYZ, WMTS, cache, quadtree e tile raster sul globo
- Camera: zoom, pan, rotate, tilt e flyTo
- glTF: GLB, materiale base, texture e posizionamento geografico
- 3D Tiles: `tileset.json`, caricamento tile, LOD base e culling
- Picking: globo, mesh demo e coordinate geografiche
- Terrain: API `TerrainProvider` iniziale per heightmap tile

I test coprono math, geodesia, camera, scene graph, tiling, imagery, glTF e 3D Tiles.
