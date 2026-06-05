# Plan2 - Roadmap evolutiva verso OrbixJS avanzato

Questo documento continua `Plan.md`, ma corregge un punto importante: OrbixJS non deve essere congelato in una piccola 0.1. La prima release serve solo come base verificabile. La direzione reale e uno strumento GIS 3D moderno: vicino all'idea di CesiumJS, ma piu snello, piu modulare, piu performante e progettato fin dall'inizio per WebGPU, terrain 3D, editing GIS, standard OGC, simulazione atmosferica e rendering Digital Twin.

## 1. Filosofia aggiornata

OrbixJS deve crescere per milestone, non per congelamento.

Significa:

- stabilizzare cio che serve per costruire sopra
- non chiudere prematuramente l'architettura
- progettare WebGPU come backend principale futuro
- mantenere WebGL2 come backend iniziale e compatibile
- rendere terrain, 3D Tiles e rendering fisico parti centrali della visione
- evitare scorciatoie che rendono difficile aggiungere luci, ombre, WebGPU o streaming avanzato

La release 0.1 non e il prodotto finito. E il primo checkpoint tecnico.

## 2. Visione prodotto

OrbixJS deve diventare un motore geospaziale 3D web capace di:

- renderizzare un globo WGS84 con imagery e terrain reale
- diventare uno strumento GIS 3D, non solo un viewer
- supportare editing geospaziale 2D/3D: punti, linee, poligoni, volumi, attributi e snapping
- gestire layer, feature, selezione, query, filtri, stili e transazioni
- supportare terrain 3D con LOD, normali, skirt, morphing e picking
- caricare e visualizzare glTF/GLB in coordinate geografiche
- implementare progressivamente OGC 3D Tiles
- visualizzare e interrogare Digital Twin urbani, infrastrutturali e industriali
- integrare BIM/GIS/IoT: 3D Tiles, CityGML, IFC, SensorThings e time-series
- coprire i casi d'uso chiave di CesiumJS: globe, terrain, imagery, 3D Tiles, glTF, camera, picking, styling, data layers e time-dynamic data
- usare WebGPU per rendering moderno, compute e pipeline piu avanzate
- offrire luci fisicamente piu corrette, PBR, atmosfera, ombre e tone mapping
- esportare scene GIS/Digital Twin verso Blender per render offline, video e immagini di qualita cinematografica
- simulare eventi atmosferici con dati reali: vento, nuvole, precipitazioni, aerosol e campi meteo time-dynamic
- rappresentare il vento con un sistema particellare GPU-driven
- rappresentare nuvole con layer 2D/3D e, in WebGPU, volumetric rendering progressivo
- sperimentare ray tracing/path tracing via WebGPU compute dove ha senso
- mantenere una API TypeScript pulita e headless
- restare modulare: renderer, terrain, imagery, 3D Tiles, loaders e picking separati
- avere una demo flagship centrata sull'Alto Adige/Südtirol, usando il DTM 2,5m reale come primo terrain ad alta risoluzione

## 3. Posizionamento rispetto a CesiumJS

CesiumJS e il riferimento di prodotto per il rendering geospaziale web: il benchmark funzionale, non un modello da copiare riga per riga. OrbixJS pero deve spingersi oltre il viewer: deve diventare anche GIS 3D editor e runtime per Digital Twin.

OrbixJS deve puntare a:

- stessa classe di problemi: globo 3D, terrain, imagery, 3D Tiles, modelli, picking e digital twin
- API familiare per chi conosce CesiumJS
- strumenti GIS 3D per creare, modificare, validare e salvare feature
- collegamento nativo tra geometria, semantica, attributi, sensori e serie temporali
- core piu piccolo e headless
- TypeScript-first
- nessun supporto legacy WebGL1
- WebGPU come backend moderno
- pipeline dati piu esplicita e misurabile
- budget di memoria, rete e GPU configurabili
- minore garbage collection nel render loop
- scheduler tile piu prevedibile
- separazione netta tra engine, UI, demo e strumenti debug

### Parita funzionale desiderata

| Area | CesiumJS oggi | Direzione OrbixJS |
| --- | --- | --- |
| Globo | WGS84 globale maturo | WGS84 modulare, WebGL2/WebGPU |
| Terrain | terrain globale, exaggeration, materiali | terrain provider astratto, mesh LOD, COG/OGC API Tiles/heightmap |
| Imagery | molti provider e layer multipli | XYZ, WMTS, OGC API Tiles, layer blending e color controls |
| 3D Tiles | streaming, styling, point cloud, metadata | subset 1.0 solido, poi 1.1, metadata, implicit tiling, styling |
| glTF | PBR, animazioni, skins, morph targets | PBR prima, poi animazioni e feature avanzate |
| Camera | flyTo, controller maturi, scene modes | camera 3D moderna, terrain collision, fly paths fluidi |
| Picking | primitive, terrain, 3D Tiles features | picking unificato: globe, terrain, mesh, feature, metadata |
| Data layers | GeoJSON, KML, CZML, entities | GeoJSON prima, entity layer opzionale, CZML/KML post-core |
| GIS editing | non e il focus principale del viewer | editing 2D/3D, snapping, attributi, transazioni, validazione |
| Digital Twin | visualizzazione 3D Tiles/BIM tramite ecosistema Cesium | runtime per 3D Tiles, CityGML, IFC, IoT, time-series e simulazioni |
| Styling | 3D Tiles style, materials, classification | styling dichiarativo e shader/material graph leggero |
| Meteo | time-dynamic data via CZML/data layers | weather providers, particelle vento, nuvole, forecast timeline |
| Export | screenshot e formati geospaziali indiretti | export glTF/USD + script Blender per render offline |
| Debug | inspector e debug flags | strumenti debug separati, non nel core |

### Dove OrbixJS deve provare a superare CesiumJS

- WebGPU-first per rendering e compute
- renderer graph piu moderno
- scheduler tile con priorita e cancellazione piu chiari
- cache CPU/GPU con budget espliciti
- architettura data-oriented per ridurre allocazioni
- terrain e 3D Tiles progettati insieme
- PBR, atmosphere, ombre e post-processing come pipeline unica
- weather simulation integrata nella scena 3D, non come overlay 2D separato
- editing GIS integrato con terrain, 3D Tiles e metadata
- Digital Twin come modello vivo: asset, sensori, stato operativo, timeline e scenari
- export verso Blender per produrre render ad alta qualita senza appesantire il runtime web
- ray/path tracing sperimentale senza compromettere il realtime
- bundle piu leggero e API modulare

### Compatibilita concettuale

OrbixJS dovrebbe offrire una API familiare:

```ts
const viewer = new GeoViewer({
  container: "map",
  renderer: "webgpu"
});

viewer.imagery.addXYZLayer({ url });
viewer.terrain.setProvider(provider);
viewer.scene.addTileset({ url: "/tileset.json" });
viewer.scene.addGltf({ url: "/model.glb", lon, lat, height });
viewer.camera.flyTo({ lon, lat, height });
const hit = viewer.pick({ x, y });

const edit = viewer.editing.startSession();
edit.createPolygon({ clampTo: "terrain" });
edit.enableSnapping({ layers: ["roads", "buildings"] });
await edit.commit();

const twin = viewer.digitalTwin.open({ id: "city-center" });
twin.connectSensors({ type: "sensorthings", url });
twin.setTime(new Date());

await viewer.export.blender({
  format: "gltf+python",
  path: "./exports/city-scene",
  includeTerrain: true,
  includeWeather: true,
  camera: viewer.camera.snapshot(),
  frameRange: { start: 0, end: 240 }
});
```

In futuro si puo aggiungere un adapter Cesium-like:

```ts
viewer.scene.primitives.add(...);
viewer.entities.add(...);
viewer.dataSources.add(...);
```

Questo adapter deve restare sopra il core, non dentro il renderer.

## 4. Decisioni strategiche

### WebGPU non e opzionale

WebGPU deve diventare un pilastro dell'engine, non un esperimento post-MVP.

Percorso:

- prima si mantiene WebGL2 per avere un motore funzionante
- poi si rifattorizza l'interfaccia renderer per supportare WebGPU senza duplicare il core
- infine WebGPU diventa il backend consigliato per features avanzate

### OGC 3D Tiles ha senso

Quando si parla di "OGC3", l'obiettivo corretto e OGC 3D Tiles. Ha senso per OrbixJS perche riguarda streaming e rendering di contenuti geospaziali 3D massivi: edifici, fotogrammetria, BIM/CAD, point cloud e tileset eterogenei.

La priorita consigliata:

1. sottoinsieme 3D Tiles 1.0 compatibile
2. glTF/GLB come contenuto principale
3. bounding volume, transform, geometric error e refined LOD solidi
4. 3D Tiles 1.1 con metadata e implicit tiling
5. styling e feature picking
6. point cloud e contenuti compositi

### Terrain 3D va separato dagli standard dati

Per il terrain non conviene aspettare un unico standard perfetto. Conviene progettare adapter diversi:

- DTM 2,5m Alto Adige come dataset flagship per la demo terrain
- heightmap XYZ/WMTS
- OGC API - Tiles per dati tiled moderni
- Cloud Optimized GeoTIFF come sorgente cloud-native
- quantized mesh o mesh terrain come formato ottimizzato interno/futuro
- 3D Tiles quando il terrain arriva gia come mesh geospaziale

Il motore deve convertire queste sorgenti in una pipeline comune di tile terrain.

### Ray tracing: ambizione realistica

WebGPU oggi e una base eccellente per compute e rendering moderno, ma il ray tracing hardware standard nel browser non va promesso come feature immediata. La strada giusta e:

1. PBR raster solido
2. shadow maps e cascaded shadow maps
3. screen-space ambient occlusion e reflections
4. global illumination approssimata
5. ray/path tracing WebGPU compute per scene limitate, preview o modalita sperimentale
6. hardware ray tracing solo quando il web lo espone in modo standard e portabile

### Meteo e simulazione atmosferica

OrbixJS deve trattare il meteo come dati geospaziali time-dynamic, non come una texture decorativa.

La pipeline consigliata:

- `WeatherProvider` per descrivere sorgente, variabili, livelli verticali, tempo e risoluzione
- adapter per OGC API - Environmental Data Retrieval
- adapter o preprocess per GRIB2/NetCDF/Zarr
- sorgenti operative come NOAA GFS/NOMADS, ECMWF Open Data e Copernicus CAMS
- conversione in texture/tile ottimizzati per GPU
- interpolazione temporale tra forecast step
- interpolazione spaziale su griglia lon/lat e livelli verticali
- cache dedicata per campi meteo
- rendering separato per vento, nuvole, precipitazioni e composizione atmosferica

Per il browser non conviene scaricare sempre GRIB globali completi. Per una demo va bene usare dataset ridotti o preprocessati; per produzione serve una pipeline server/worker che estragga solo variabili e area necessarie.

### GIS 3D ed editing

OrbixJS deve poter diventare uno strumento GIS 3D operativo. L'editing non deve essere un pannello UI appiccicato sopra il renderer: deve essere un sistema dati coerente.

Componenti chiave:

- `FeatureLayer` per feature vettoriali e attributi
- `EditingSession` per modifiche transazionali
- undo/redo e history stack
- snapping a vertex, edge, grid, terrain, building e feature vicine
- editing di punti, polilinee, poligoni, multipoligoni, estrusioni e volumi
- editing attributi con schema e validazione
- validazione topologica: self-intersection, ring orientation, overlap, gap, containment
- misure 3D: distanza, area, volume, profilo altimetrico, visibilita
- supporto CRS e trasformazioni coordinate
- esportazione/importazione GeoJSON e, in seguito, GeoPackage/FlatGeobuf
- adapter OGC API - Features per query e modifiche dove supportate
- salvataggio remoto con conflitti, versioning e rollback

Il principio: editing alto livello sopra primitive e data layers, mai dentro il renderer.

### Digital Twin renderer/runtime

OrbixJS deve diventare un renderizzatore e runtime per Digital Twin, cioe una scena 3D collegata a dati operativi, sensori, stato e tempo.

Componenti chiave:

- `DigitalTwinScene` come composizione di asset, layer, sensori e simulazioni
- asset geospaziali via 3D Tiles e glTF
- modelli urbani semantici via CityGML o conversione verso 3D Tiles/glTF
- asset BIM/openBIM via IFC preprocessato verso glTF/3D Tiles e metadata
- collegamento tra feature visive e oggetti semantici
- time-series per stato, manutenzione, consumi, traffico, meteo, energia e sensoristica
- adapter OGC SensorThings API per osservazioni IoT
- timeline operativa con storico, realtime e simulazioni future
- styling dinamico basato su attributi, allarmi, soglie e stato asset
- picking semantico: clic su oggetto -> metadata, sensori, storico, documenti, relazioni
- scenari what-if: meteo, traffico, energia, ombre, vento, rischio

Il Digital Twin non e solo un modello 3D bello: e un grafo vivo di asset, dati e simulazioni renderizzato in modo leggibile e performante.

### Demo Alto Adige/Südtirol

La demo pubblica deve avere un focus geografico chiaro: Alto Adige/Südtirol. Questo rende OrbixJS piu concreto rispetto a un globo generico e permette di mostrare terreno alpino, vallate, pendenze, ombre, meteo e in futuro Digital Twin urbani/infrastrutturali.

Dataset iniziale:

- Modello Digitale del Terreno dell'Alto Adige (DTM 2,5m)
- layer: `p_bz-Elevation:DigitalTerrainModel-2.5m`
- licenza open data CC0 indicata dal portale dati
- risorse ufficiali WMS/WCS da GeoServer CIVIS
- tile sperimentali indicati da:
  `https://test-static-mapview.civis.bz.it/working/tiles/raster/DEM/DTM/DigitalTerrainModel-2_5m/`

Obiettivo demo:

- aprire direttamente sull'Alto Adige
- usare il DTM 2,5m come terreno reale
- mostrare hillshade, slope o exposition come layer debug/analisi
- aggiungere camera presets: Bolzano, Dolomiti, Val Venosta, Brennero, Merano
- dimostrare picking terrain con quota reale
- dimostrare profilo altimetrico e pendenza
- preparare terreno per meteo alpino: vento, nuvole e precipitazione
- preparare esportazione Blender di una valle o area urbana selezionata

Prima di implementare va verificato il formato esatto delle tile statiche: encoding quota, estensione file, schema z/x/y, CRS e gestione NoData. Se le tile statiche non sono adatte al terrain runtime, si usa WCS/GeoTIFF come sorgente di preprocessing e si genera un formato terrain interno.

### Export verso Blender

Blender deve essere trattato come destinazione di rendering offline, non come backend realtime. OrbixJS deve poter esportare una scena geospaziale o Digital Twin in un pacchetto riproducibile.

Strategia:

- glTF/GLB come formato base per mesh, materiali PBR, texture, camere, luci e animazioni semplici
- USD come formato futuro per scene piu articolate, gerarchie, volumi e pipeline DCC
- script Python Blender per ricostruire scena, camera, luci, sole, scala, coordinate locali e render settings
- export terrain come mesh semplificata o tiled mesh
- export 3D Tiles selezionati o baking dei tile visibili
- export feature GIS come curve/mesh con attributi in custom properties
- export Digital Twin con metadata essenziali come custom properties o file JSON sidecar
- export meteo come curve/particelle baked, texture sequence o volume approssimato
- export camera path e timeline per animazioni
- preset Cycles/Eevee: preview veloce, render tecnico, render cinematico

Il principio: il web resta interattivo e performante; Blender produce immagini, video, tavole e materiali di presentazione con qualita superiore.

## 5. Definition of Done per la base 0.1

La 0.1 e riuscita quando:

- `npm install`, `npm test` e `npm run build` funzionano
- la demo mostra globo, imagery, modello glTF, 3D Tiles semplice e picking
- le API minime sono tipizzate e documentate
- WebGL2 resta stabile
- il renderer ha una interfaccia abbastanza pulita da ospitare WebGPU
- cache e caricamenti hanno limiti espliciti
- il progetto e installabile come libreria TypeScript

Non deve chiudere il prodotto. Deve prepararlo.

## 6. Roadmap tecnica

### Fase 1 - Chiudere l'MVP attuale

Obiettivo: completare quello che manca nel prototipo WebGL2.

Step:

- implementare picking sul globo
- implementare picking sui mesh
- restituire lon, lat, height e tipo di hit
- esporre `viewer.pick(...)`
- aggiungere evento pubblico di picking
- mostrare coordinate nella demo
- migliorare frustum culling imagery
- introdurre screen-space error base per LOD
- rafforzare caricamento e validazione `tileset.json`

Criterio di uscita:

- click e puntatore restituiscono coordinate geografiche affidabili
- il tileset demo cambia LOD in modo prevedibile
- test e build restano verdi

### Fase 2 - Renderer interface v2

Obiettivo: evitare che WebGL2 blocchi WebGPU.

Step:

- definire astrazioni per device, buffer, texture, sampler, shader e pipeline
- separare scene traversal da draw submission
- introdurre un render graph o frame graph minimale
- separare materiali da shader hardcoded
- distinguere render pass: globe, imagery, terrain, vector, model, overlay
- isolare gestione risorse GPU dal viewer
- preparare shader source separati per GLSL e WGSL

Criterio di uscita:

- il core non dipende direttamente da `WebGL2RenderingContext`
- un secondo backend puo essere aggiunto senza riscrivere camera, scene, loaders o tiling

### Fase 3 - Backend WebGPU

Obiettivo: portare WebGPU da obiettivo a codice reale.

Step:

- creare `renderer/webgpu`
- inizializzare adapter, device, canvas context e swap chain
- implementare buffer vertex/index/uniform
- implementare texture e sampler
- convertire i primi shader in WGSL
- renderizzare globo vuoto con WebGPU
- renderizzare imagery sul globo
- renderizzare mesh glTF semplice
- aggiungere gestione device lost
- aggiungere feature detection e fallback esplicito a WebGL2

Criterio di uscita:

- la demo puo scegliere `renderer: "webgpu"` o `renderer: "webgl2"`
- WebGPU raggiunge parita minima con il globo WebGL2
- il backend WebGPU ha test o smoke test dedicati

### Fase 4 - Terrain 3D

Obiettivo: passare da ellissoide texturizzato a superficie terrestre 3D.

Step:

- definire `TerrainProvider`
- implementare `SouthTyrolDtmTerrainProvider` o preset equivalente per la demo
- validare tile statiche DTM 2,5m Alto Adige: schema, encoding quota, CRS e NoData
- supportare fallback da WCS/GeoTIFF preprocessato se le tile statiche non bastano
- supportare heightmap tiled
- supportare terrain da OGC API - Tiles dove applicabile
- studiare COG come sorgente elevation/coverage
- generare mesh tile su ellissoide WGS84
- aggiungere LOD quadtree terrain
- aggiungere skirt per evitare crepe tra tile
- aggiungere morphing tra livelli LOD
- calcolare normali terrain
- drapare imagery sopra terrain
- implementare picking terrain
- aggiungere collisione camera-terrain base
- introdurre cache CPU/GPU per terrain tile

Criterio di uscita:

- la demo mostra rilievo reale dell'Alto Adige, non solo globo liscio
- il terrain resta stabile durante zoom e pan
- picking e camera rispettano l'altezza del terreno

### Fase 5 - OGC 3D Tiles

Obiettivo: implementare lo standard in modo progressivo e dichiarato.

Step 1: 3D Tiles base

- leggere `tileset.json`
- supportare bounding sphere, box e region
- applicare transform gerarchiche
- calcolare geometric error
- implementare replacement/refinement base
- caricare contenuto glTF/GLB
- implementare frustum culling
- implementare screen-space error

Step 2: formati e contenuti

- supportare b3dm
- supportare i3dm
- supportare pnts
- valutare cmpt
- supportare multiple contents dove necessario

Step 3: 3D Tiles 1.1

- metadata
- implicit tiling
- subtree files
- content bounding volumes
- feature picking
- styling base

Criterio di uscita:

- OrbixJS carica tileset reali oltre al demo interno
- il subset supportato e documentato
- i dataset non supportati falliscono con errori chiari

### Fase 6 - Primitives, data layers ed entity layer opzionale

Obiettivo: coprire il lato applicativo di CesiumJS senza rendere pesante il core.

Step:

- definire `Primitive` come unita renderizzabile efficiente
- supportare point, polyline, polygon, billboard e label
- aggiungere batching e instancing per primitive ripetute
- supportare clamping su terrain e 3D Tiles
- aggiungere primitive classification dove utile
- introdurre `DataSource` come layer opzionale sopra il core
- supportare GeoJSON come primo formato vettoriale
- valutare KML e CZML dopo GeoJSON e time system
- aggiungere `Entity` come API di alto livello, non come dipendenza del renderer
- supportare proprieta time-dynamic in modo modulare
- mantenere una via low-level per chi vuole massime performance

Criterio di uscita:

- OrbixJS puo mostrare marker, linee, poligoni e label georeferenziati
- un'app Cesium-like puo essere costruita senza scrivere direttamente shader o mesh
- lo strato entity resta opzionale e non rallenta la pipeline low-level

### Fase 7 - GIS 3D editing

Obiettivo: trasformare OrbixJS da viewer a strumento GIS 3D modificabile.

Step 1: feature model

- definire `Feature`, `FeatureLayer`, `FeatureSchema` e `FeatureStore`
- supportare geometrie base: point, line, polygon, multipolygon
- supportare geometrie 3D: height, extruded polygon, volume, mesh reference
- mantenere attributi tipizzati e validabili
- collegare feature a primitive renderizzabili
- collegare feature a metadata e picking

Step 2: editing session

- definire `EditingSession`
- supportare create, update, delete e split/merge
- aggiungere undo/redo
- aggiungere dirty state e change set
- aggiungere commit, rollback e conflict handling
- mantenere separati dati originali e modifiche locali
- preparare adapter transazionali per backend remoti

Step 3: strumenti interattivi

- tool punto, linea, poligono, rettangolo, cerchio e volume
- tool move, rotate, scale, extrude, reshape e vertex edit
- snapping a vertex, edge, midpoint, grid, terrain e 3D Tiles
- guide visuali, maniglie, gizmo 3D e misure live
- vincoli: altezza, distanza, angolo, ortogonalita, clamp to terrain
- selezione singola, multipla, box/lasso e gerarchica

Step 4: validazione e analisi

- validazione topologica 2D e 3D
- self-intersection, overlap, gap, ring orientation e duplicate vertices
- misure distanza, area, volume, profilo altimetrico e pendenza
- query spaziali: contains, intersects, nearest, within distance
- editing attributi con schema, required fields e domini
- esportazione GeoJSON iniziale
- adapter OGC API - Features per query e, dove possibile, modifica feature

Criterio di uscita:

- la demo permette di creare e modificare feature su globo/terrain
- le modifiche hanno undo/redo e possono essere salvate o annullate
- snapping e validazione evitano errori geometrici banali
- il layer GIS resta indipendente dal renderer

### Fase 8 - Digital Twin renderer/runtime

Obiettivo: visualizzare e interrogare Digital Twin reali collegando geometria, semantica, sensori e tempo.

Step 1: twin scene model

- definire `DigitalTwinScene`
- definire `TwinAsset`, `TwinLayer`, `TwinProperty`, `TwinRelationship`
- collegare asset visuali a metadata e feature
- supportare gerarchie: citta, distretto, edificio, piano, stanza, impianto, sensore
- supportare stato operativo e timeline
- supportare relazioni tra asset: contains, feeds, connects, monitors, locatedIn

Step 2: dati e standard

- usare 3D Tiles come formato principale per streaming visuale
- supportare metadata 3D Tiles per semantica e picking
- supportare CityGML come modello urbano semantico, direttamente o via conversione
- supportare IFC/openBIM via preprocess verso glTF/3D Tiles con metadata
- supportare OGC SensorThings API per osservazioni e sensori
- valutare OGC API - Connected Systems per integrazioni future
- mantenere mapping tra oggetto renderizzato e oggetto operativo

Step 3: rendering operativo

- styling dinamico per stato asset, allarmi, rischio, temperatura, consumo, occupancy
- overlay sensori e time-series
- highlighting, isolazione, x-ray e section/clipping planes
- viste per edificio, infrastruttura, citta e sottosuolo
- livelli informativi: geometry, semantic, operational, simulation
- dashboard esterna collegabile via eventi, non dentro il core

Step 4: simulazione e scenari

- timeline storico/realtime/forecast
- scenari what-if: vento, nuvole, ombre, traffico, energia, rischio
- comparazione tra stato reale e modello atteso
- esportazione snapshot e report tecnico in fasi successive

Criterio di uscita:

- un dataset Digital Twin puo essere caricato come composizione di 3D Tiles, metadata e sensori
- il picking restituisce asset, attributi, relazioni e misure operative
- il rendering supporta styling dinamico basato su stato e time-series
- la scena resta usabile anche con dataset grandi grazie a streaming e cache

### Fase 9 - Meteo, vento e nuvole da dati reali

Obiettivo: rappresentare eventi atmosferici reali dentro la scena 3D.

Step 1: data model meteo

- definire `WeatherProvider`
- definire variabili base: vento U/V/W, temperatura, pressione, umidita, cloud cover, precipitazione, aerosol
- supportare coordinate lon/lat/height e livelli di pressione
- supportare tempo corrente, forecast step e interpolazione temporale
- supportare griglie globali e regionali
- distinguere dati realtime, forecast e reanalysis

Step 2: adapter dati

- aggiungere adapter OGC API - Environmental Data Retrieval
- aggiungere pipeline per dati GRIB2 preprocessati
- valutare NetCDF e Zarr per dati multidimensionali
- supportare NOAA GFS/NOMADS come sorgente vento globale iniziale
- supportare ECMWF Open Data come sorgente forecast ad alta qualita
- supportare Copernicus CAMS per aerosol, composizione atmosferica e alcuni prodotti collegati a nuvole/aria
- creare formato interno tiled/texture-friendly per la demo

Step 3: sistema particellare vento

- implementare particelle vento su superficie e quote atmosferiche
- usare vector field U/V per advecting delle particelle
- interpolare direzione e velocita nello shader o compute pass
- aggiungere trails, fade, seed density e color ramp per velocita
- supportare livelli verticali selezionabili
- usare WebGPU compute per grandi volumi di particelle
- mantenere fallback WebGL2 con numero ridotto di particelle
- aggiungere picking o tooltip meteo per leggere velocita/direzione nel punto

Step 4: nuvole

- iniziare con layer cloud cover 2D drapato su globo/atmosfera
- aggiungere billboard/impostor cloud layer per quota e spessore
- introdurre volumetric clouds in WebGPU con raymarching leggero
- guidare densita nuvole da cloud cover, umidita e livelli verticali
- aggiungere animazione coerente con vento
- aggiungere ombre semplificate delle nuvole su terrain/globo
- collegare illuminazione nuvole al sole e all'atmospheric scattering

Step 5: eventi atmosferici

- rappresentare precipitazione come layer animato o particellare
- evidenziare fronti, celle temporalesche o aree intense tramite threshold sui dati
- supportare timeline forecast con play/pause/scrub
- visualizzare incertezza o ensemble in una fase successiva
- permettere preset: vento globale, tempesta, aerosol/sabbia, nuvolosita, precipitazioni

Criterio di uscita:

- la demo mostra vento reale con particelle animate sul globo
- i dati meteo sono time-dynamic e interpolati tra forecast step
- le nuvole possono essere visualizzate almeno come layer atmosferico animato
- WebGPU abilita un livello qualitativo superiore senza rompere il fallback WebGL2
- la pipeline dati e separata dal renderer e puo cambiare sorgente senza riscrivere gli shader

### Fase 10 - Rendering fisico e luci

Obiettivo: ottenere immagini piu accurate, non solo geometria caricata.

Step:

- passare a pipeline linear color
- gestire sRGB, linear e tone mapping
- implementare PBR glTF piu completo
- aggiungere directional light solare
- aggiungere luce ambiente controllata
- aggiungere image-based lighting
- aggiungere atmospheric scattering
- aggiungere esposizione e gamma correction
- gestire materiali metallic/roughness
- preparare materiali terrain e imagery in modo coerente

Criterio di uscita:

- modelli glTF appaiono plausibili con luci e materiali
- terrain, globo e modelli condividono una pipeline colore coerente
- la scena non sembra piatta anche senza texture perfette

### Fase 11 - Ombre

Obiettivo: aggiungere profondita visiva e relazione tra oggetti, terrain e luce.

Step:

- shadow map per directional light
- cascaded shadow maps per scene geospaziali grandi
- bias e stabilizzazione ombre
- ombre da modelli su terrain
- ombre da terrain su terrain dove possibile
- contact shadows o screen-space shadows
- filtri soft shadow
- debug view per cascades e shadow atlas

Criterio di uscita:

- i modelli proiettano ombre sul globo/terrain
- le ombre restano stabili muovendo la camera
- la qualita e regolabile per hardware diversi

### Fase 12 - Ray tracing e global illumination sperimentale

Obiettivo: esplorare rendering avanzato senza promettere cio che il browser non standardizza ancora.

Step:

- creare una modalita sperimentale WebGPU compute
- costruire BVH CPU o GPU per mesh statiche
- implementare ray picking accelerato
- implementare ray traced ambient occlusion sperimentale
- implementare reflections limitate
- implementare path tracing progressivo per scene piccole
- aggiungere accumulazione temporale
- aggiungere denoising semplice
- separare chiaramente modalita realtime da modalita preview

Criterio di uscita:

- il motore ha una pipeline sperimentale ray/path tracing
- la feature e opzionale e non degrada la modalita realtime
- i limiti sono dichiarati in documentazione

### Fase 13 - Streaming, worker e performance

Obiettivo: rendere il motore robusto con dataset grandi.

Step:

- scheduler tile con priorita camera
- limiti di richieste simultanee
- cancellazione richieste non piu utili
- cache CPU e GPU con budget separati
- Web Workers per parsing e mesh generation
- metriche runtime per frame time, tile, upload GPU e memoria stimata
- profili performance WebGL2 e WebGPU
- stress test con navigazione rapida

Criterio di uscita:

- la cache non cresce senza limite
- i tile lontani o obsoleti vengono scartati
- la demo resta fluida con dataset piu pesanti

### Fase 14 - Export Blender e render offline

Obiettivo: esportare scene OrbixJS verso Blender per render fotorealistici, animazioni e presentazioni Digital Twin.

Step 1: formato export

- definire `SceneExport`
- esportare mesh visibili in glTF/GLB
- esportare materiali PBR compatibili con Principled BSDF
- esportare texture e UV
- esportare camera, focal length e clipping
- esportare luci principali e direzione solare
- salvare metadata geospaziali in JSON sidecar
- mantenere origine locale per evitare problemi di precisione in Blender

Step 2: script Blender

- generare script Python `.py`
- importare GLB/USD
- ricostruire camera e camera path
- impostare unita, scala, origine locale e orientamento
- ricostruire sole, ambiente, world background e render settings
- applicare materiali supplementari dove glTF non basta
- creare collection per terrain, 3D Tiles, GIS features, weather e annotations
- impostare Cycles/Eevee e risoluzione di output

Step 3: export geospaziale

- esportare terrain come mesh semplificata o tile visibili
- esportare 3D Tiles caricati o selezione per area/camera
- esportare feature GIS come mesh/curve con custom properties
- esportare label e annotation come text object o sidecar
- esportare Digital Twin asset con metadata, stato e sensor links
- mantenere mapping tra oggetto Blender e id OrbixJS

Step 4: export meteo e simulazioni

- esportare particelle vento come curve/trails baked
- esportare nuvole come mesh impostor, volume semplificato o texture sequence
- esportare timeline forecast come keyframe o frame sequence
- esportare scenari what-if con camera path e stati temporali

Step 5: preset di output

- preset tecnico: ortografico/prospettico, colori neutri, overlay informativi
- preset cinematico: Cycles, luci, atmosfera, ombre morbide, motion blur
- preset Digital Twin report: viste multiple, sezioni, asset evidenziati
- preset meteo: vento, nuvole, precipitazione e timeline

Criterio di uscita:

- una scena OrbixJS puo essere esportata e aperta in Blender senza interventi manuali essenziali
- camera, terrain, modelli, feature e luci mantengono scala e posizione coerenti
- il pacchetto include script Blender riproducibile
- un render offline puo mostrare un Digital Twin o scenario meteo con qualita superiore al realtime

### Fase 15 - API, packaging e documentazione

Obiettivo: rendere OrbixJS usabile da altri progetti.

Step:

- stabilire entrypoint pubblici
- esportare tipi principali
- creare build ESM
- generare declaration TypeScript
- aggiungere esempi indipendenti
- documentare WebGL2/WebGPU
- documentare terrain provider
- documentare GIS editing, feature model e transazioni
- documentare Digital Twin scene, asset, metadata e sensori
- documentare 3D Tiles supportato
- documentare export Blender, glTF/USD e script Python generati
- documentare rendering avanzato, meteo e limiti
- preparare changelog e release notes

Criterio di uscita:

- un progetto Vite esterno puo installare OrbixJS e creare una scena geospaziale
- le API pubbliche non richiedono import da path interni
- ogni feature importante ha un esempio

### Fase 16 - Demo pubblica da GitHub

Obiettivo: quando OrbixJS sara su GitHub, ogni push stabile deve poter pubblicare una demo funzionante.

Step:

- mantenere la demo come build statica Vite
- usare `base: "./"` in Vite per supportare GitHub Pages sotto sottocartella
- aggiungere workflow GitHub Actions per test, build e deploy
- pubblicare `dist` con GitHub Pages
- mantenere asset demo piccoli e versionati
- evitare dipendenze remote indispensabili per il primo render
- mettere il focus iniziale sull'Alto Adige/Südtirol
- usare il DTM 2,5m come primo terrain reale della demo
- mostrare nella demo lo stato di WebGL2/WebGPU, terrain Alto Adige, imagery, 3D Tiles e picking
- aggiungere preset camera per aree altoatesine
- aggiungere badge README per build/deploy quando il repository pubblico esiste
- documentare l'URL della demo nel README

Criterio di uscita:

- un push su `main` genera una demo pubblica aggiornata
- il deploy fallisce se test o build falliscono
- la demo online mostra almeno l'Alto Adige navigabile con fallback terrain/imagery senza configurazioni esterne

## 7. Sprint consigliati

| Sprint | Focus | Output |
| --- | --- | --- |
| 1 | Picking MVP | `viewer.pick(...)`, coordinate, test |
| 2 | Renderer interface v2 | Core separato dal backend WebGL2 |
| 3 | WebGPU base | Globo WebGPU con WGSL |
| 4 | WebGPU parity | Imagery e mesh glTF su WebGPU |
| 5 | Terrain Alto Adige | DTM 2,5m, mesh terrain, picking quota |
| 6 | OGC 3D Tiles base | Tileset reali con SSE e culling |
| 7 | Primitives e data layers | Point, polyline, polygon, label, GeoJSON |
| 8 | GIS editing base | Feature model, editing session, snapping, undo/redo |
| 9 | Digital Twin runtime | Twin assets, metadata, sensors, time-series |
| 10 | Weather engine | WeatherProvider, vento particellare, cloud layer |
| 11 | PBR e luci | Pipeline colore, sole, IBL, materiali |
| 12 | Ombre | CSM, contact shadows, debug view |
| 13 | 3D Tiles 1.1 | Metadata, implicit tiling, feature picking |
| 14 | Ray tracing sperimentale | WebGPU compute AO/reflections/path tracing |
| 15 | Performance | Scheduler, workers, cache budget |
| 16 | Blender export | GLB/USD, script Python, camera, terrain, metadata |
| 17 | Demo GitHub Pages | Workflow test/build/deploy e demo pubblica |
| 18 | Release evolutiva | Packaging, docs, esempi, changelog |

## 8. Priorita immediata aggiornata

La prossima sequenza migliore e:

1. chiudere picking globo e mesh
2. esporre `viewer.pick(...)`
3. spostare glTF e 3D Tiles demo verso API scene pubbliche
4. progettare `Renderer` v2 con WebGPU in mente
5. creare skeleton `renderer/webgpu`
6. portare il globo vuoto in WGSL
7. iniziare `TerrainProvider` partendo dal DTM 2,5m Alto Adige
8. definire subset OGC 3D Tiles da supportare per primo
9. progettare `Primitive` e `Entity` come layer separati, non come cuore del renderer
10. progettare `FeatureLayer` e `EditingSession`
11. progettare `DigitalTwinScene` e mapping asset/metadata/sensori
12. progettare `WeatherProvider` e formato interno per vector field vento
13. progettare `SceneExport` per Blender con glTF/GLB e script Python
14. mantenere la demo sempre pubblicabile da GitHub Pages

Questa sequenza non congela il prodotto: costruisce le fondamenta per WebGPU, terrain e rendering avanzato.

## 9. Rischi e mitigazioni

### WebGPU aggiunto troppo tardi

Rischio: WebGL2 influenza troppo l'architettura.

Mitigazione: rifattorizzare il renderer prima di aggiungere altre feature pesanti.

### Ray tracing promesso troppo presto

Rischio: vendere come realtime una feature che nel browser non ha ancora hardware RT standard portabile.

Mitigazione: partire da PBR, ombre e compute ray tracing sperimentale.

### Terrain accoppiato a un solo formato

Rischio: supportare solo una sorgente dati e dover riscrivere tutto.

Mitigazione: `TerrainProvider` astratto e mesh terrain interna comune.

### DTM Alto Adige non pronto per runtime diretto

Rischio: le tile statiche o i servizi WMS/WCS espongono dati ottimi per GIS ma non direttamente adatti a mesh realtime nel browser.

Mitigazione: separare sorgente e runtime; validare encoding e schema tile, poi usare preprocessing verso heightmap tiled, mesh terrain o formato interno ottimizzato.

### 3D Tiles troppo ampio

Rischio: provare a implementare tutto lo standard subito.

Mitigazione: subset dichiarato, dataset di test, errori chiari e crescita progressiva verso 1.1.

### Clone CesiumJS troppo pesante

Rischio: replicare anche la complessita storica di CesiumJS.

Mitigazione: copiare i casi d'uso, non l'architettura; entity e data sources devono restare layer opzionali sopra primitive e renderer.

### Editing GIS fragile

Rischio: offrire strumenti di editing belli ma capaci di generare geometrie invalide o dati incoerenti.

Mitigazione: usare `EditingSession`, validazione topologica, schema attributi, undo/redo, change set e commit transazionali.

### CRS e precisione sottovalutati

Rischio: un GIS 3D richiede precisione, trasformazioni coordinate e gestione di scale molto diverse.

Mitigazione: mantenere WGS84/ECEF come base, definire CRS per layer, testare trasformazioni e separare coordinate geografiche, locali e GPU.

### Digital Twin ridotto a buzzword

Rischio: chiamare Digital Twin una semplice scena 3D.

Mitigazione: ogni twin deve collegare geometria, asset semantici, relazioni, stato, sensori, tempo e almeno una forma di interrogazione operativa.

### Demo pubblica fragile

Rischio: la demo online dipende da servizi remoti o asset troppo pesanti e smette di funzionare proprio quando serve mostrarla.

Mitigazione: includere un percorso demo offline/minimale, asset piccoli nel repository e fallback visivi chiari per servizi imagery o terrain non disponibili.

### Dati meteo troppo pesanti

Rischio: GRIB/NetCDF globali completi sono troppo grandi da gestire direttamente nel browser.

Mitigazione: preprocessare i dati in tile/texture compatte, scaricare solo variabili e regioni necessarie, usare worker e cache temporale.

### Meteo visivamente bello ma scientificamente debole

Rischio: creare particelle e nuvole spettacolari ma scollegate dai dati reali.

Mitigazione: separare chiaramente rendering e data model; ogni layer deve dichiarare sorgente, variabile, unita, tempo, livello verticale e metodo di interpolazione.

### Export Blender non riproducibile

Rischio: esportare un file che richiede molte correzioni manuali in Blender.

Mitigazione: generare sempre un pacchetto completo con asset, sidecar metadata e script Python che ricostruisce scena, camera, luci, scala e render settings.

### Precisione geospaziale in Blender

Rischio: coordinate ECEF/WGS84 enormi causano perdita di precisione o scene ingestibili in Blender.

Mitigazione: esportare in coordinate locali rispetto a un'origine georeferenziata, salvando trasformazioni e metadata geospaziali nel sidecar.

## 10. Riferimenti tecnici da seguire

- OGC 3D Tiles Standard: `https://www.ogc.org/standards/3DTiles/`
- OGC 3D Tiles 1.1 Specification: `https://docs.ogc.org/cs/22-025r4/22-025r4.html`
- OGC API - Tiles: `https://ogcapi.ogc.org/tiles/`
- OGC API - Features: `https://www.ogc.org/publications/standard/ogcapi-features/`
- OGC Cloud Optimized GeoTIFF: `https://www.ogc.org/announcement/cloud-optimized-geotiff-cog-published-as-official-ogc-standard/`
- DTM 2,5m Alto Adige dataset: `https://data.civis.bz.it/it/dataset/modello-digitale-del-terreno-dtm-25m`
- DTM 2,5m Alto Adige tile sperimentali: `https://test-static-mapview.civis.bz.it/working/tiles/raster/DEM/DTM/DigitalTerrainModel-2_5m/`
- OGC CityGML: `https://www.ogc.org/standards/citygml/`
- OGC SensorThings API: `https://www.ogc.org/publications/standard/sensorthings/`
- WebGPU specification: `https://gpuweb.github.io/gpuweb/`
- buildingSMART IFC: `https://technical.buildingsmart.org/standards/ifc/`
- Blender glTF 2.0 import/export: `https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html`
- Blender USD import/export: `https://docs.blender.org/manual/en/latest/files/import_export/usd.html`
- Blender Python API: `https://docs.blender.org/api/4.2/`
- Cesium 3D Tiles overview: `https://cesium.com/why-cesium/3d-tiles/`
- CesiumJS feature checklist: `https://github.com/CesiumGS/cesium/wiki/CesiumJS-Features-Checklist`
- GitHub Pages custom workflows: `https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages`
- OGC API - Environmental Data Retrieval: `https://ogcapi.ogc.org/edr/`
- NOAA NOMADS: `https://nomads.ncep.noaa.gov/`
- ECMWF Open Data: `https://www.ecmwf.int/en/forecasts/datasets/open-data`
- Copernicus Atmosphere Monitoring Service: `https://www.copernicus.eu/en/copernicus-services/atmosphere`

## 11. Direzione finale

OrbixJS deve diventare un motore geospaziale 3D web capace di partire leggero ma crescere verso:

- WebGPU-first
- GIS 3D con editing, validazione, snapping, transazioni e analisi
- terrain 3D reale
- demo flagship Alto Adige/Südtirol con DTM 2,5m
- OGC 3D Tiles progressivamente completo
- Digital Twin renderer/runtime per BIM, GIS, IoT, sensori e time-series
- primitives, entities e data layers in stile CesiumJS, ma opzionali
- rendering PBR con luci e ombre moderne
- sistema meteo con vento particellare, nuvole e dati atmosferici reali
- streaming massivo
- picking accurato
- pipeline sperimentale ray/path tracing
- export Blender per render offline, video e presentazioni Digital Twin
- demo pubblica sempre aggiornata da GitHub Pages
- architettura pronta per WebGPU, worker e, se misurato utile, Rust/WASM

La regola resta: costruire in modo misurabile, ma non ridurre l'ambizione.
