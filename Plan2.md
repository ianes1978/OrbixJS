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
- gestire layer, feature, selezione, query, filtri, visibilita, opacita, blending, stili e transazioni
- pianificare e riprodurre voli in soggettiva con camera paths, keyframe e transizioni fluide
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
| Imagery | molti provider e layer multipli | XYZ, WMTS, OGC API Tiles, layer state, blending e color controls |
| 3D Tiles | streaming, styling, point cloud, metadata | subset 1.0 solido, poi 1.1, metadata, implicit tiling, styling |
| glTF | PBR, animazioni, skins, morph targets | PBR prima, poi animazioni e feature avanzate |
| Camera | flyTo, controller maturi, scene modes | camera 3D moderna, terrain collision, voli in soggettiva, camera paths fluidi |
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

### Regole per mantenere OrbixJS leggero

OrbixJS non deve diventare un "CesiumJS piu piccolo". Deve restare un engine geospaziale modulare, leggero e moderno, capace di coprire i casi d'uso importanti senza trascinarsi dietro complessita non necessaria.

Regole:

- il core deve restare piccolo, headless e senza dipendenze pesanti obbligatorie
- la demo, la UI, i pannelli debug e gli esempi non devono entrare nel bundle della libreria pubblica
- renderer, terrain, imagery, 3D Tiles, glTF, CRS, editing e Digital Twin devono restare moduli separabili
- ogni feature pesante deve poter vivere in un entrypoint opzionale o in un adapter sopra il core
- evitare dipendenze grandi nel percorso di primo render; se servono, devono essere lazy, opzionali o sostituibili
- CRS avanzati, proiezioni specialistiche, import/export, meteo, IFC/BIM, post-processing e tooling devono essere progettati come pacchetti o moduli opzionali
- misurare regolarmente dimensione raw, gzip e brotli del bundle demo e della libreria ESM
- mantenere budget espliciti per memoria CPU, memoria GPU, cache tile, richieste rete e allocazioni per frame
- preferire API piccole e componibili a oggetti monolitici che imitano tutta la superficie di CesiumJS
- copiare i casi d'uso validi di CesiumJS, non la sua complessita storica

Budget iniziale indicativo:

- demo pubblica: restare sotto 200 KB JS raw finche possibile, esclusi asset e sourcemap
- libreria ESM core: restare sotto 250 KB JS raw finche possibile, esclusi sourcemap
- ogni nuovo modulo importante deve dichiarare il proprio costo approssimativo nel piano o nella changelog

Se un obiettivo funzionale richiede di superare questi budget, la regola non e bloccarlo: e misurarlo, isolarlo e renderlo opzionale quando possibile.

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
const path = viewer.camera.paths.create({ mode: "first-person" });
path.addKeyframe({ lon, lat, height, heading, pitch, duration: 3 });
await viewer.camera.paths.play(path, { easing: "smoothstep" });
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

### CRS e sistemi di coordinate sono core

OrbixJS deve supportare i CRS piu comuni in ambito GIS e Digital Twin. Non basta supportare WGS84 e Web Mercator: ogni layer deve dichiarare il proprio CRS, il motore deve trasformare i dati in modo verificabile e la GPU deve lavorare in coordinate locali stabili.

Supporto target iniziale:

- `EPSG:4326` WGS84 geografico, con gestione esplicita dell'axis order
- `EPSG:4979` WGS84 3D per coordinate geografiche con quota ellissoidica
- `EPSG:4978` WGS84 geocentrico/ECEF come base globale interna
- `EPSG:3857` Web Mercator per tile web, XYZ e molti servizi demo
- UTM WGS84: famiglia `EPSG:326xx` e `EPSG:327xx`, con priorita a `EPSG:32632` e `EPSG:32633` per l'Italia
- ETRS89 / UTM Europa: famiglia `EPSG:258xx`, con priorita a `EPSG:25832` per Alto Adige e ortofoto 2023
- CRS italiani storici/comuni dove utili per interoperabilita GIS, per esempio Gauss-Boaga `EPSG:3003` e `EPSG:3004`
- sistemi locali di progetto per Digital Twin, cantieri, edifici, BIM e Blender, basati su origine georeferenziata e frame ENU

Componenti da progettare:

- `CrsDefinition` con authority, code, unita, axis order, extent, datum e datum verticale quando noto
- `CrsRegistry` con definizioni built-in e possibilita di registrare CRS custom/proj string/WKT
- `CoordinateTransformer` per trasformazioni punto, bounding box, tile extent e geometrie
- `TileMatrixSet` generico per WMTS/OGC Tiles non Web Mercator
- `ProjectFrame` o `LocalFrame` per coordinate locali ad alta precisione in GPU, editing e export Blender
- gestione delle quote: ellissoidica, ortometrica, terrain height e offset locali dichiarati per layer
- test round-trip e tolleranze numeriche per ogni CRS supportato

Regola architetturale: il renderer non deve conoscere direttamente il CRS sorgente. Imagery, terrain, feature, 3D Tiles e Digital Twin asset entrano con CRS dichiarato, vengono trasformati in WGS84/ECEF o nel frame locale attivo, e solo dopo arrivano alla pipeline GPU.

### Layer state, blending e compositing

La rappresentazione dei layer deve essere uniforme tra imagery, terrain overlay, feature vettoriali, meteo, Digital Twin overlay e debug layer. Ogni layer deve avere uno stato visuale dichiarato e serializzabile, non parametri sparsi dentro provider diversi.

Componenti chiave:

- `LayerState` per stato operativo: `visible`, `opacity`, `zIndex`, `enabled`, `locked`, `pickable`
- `LayerStyle` per resa visiva: `blendMode`, color controls, filtri, maschere e classificazione
- `LayerMetadata` per titolo, descrizione, sorgente, CRS, licenza, tempo, legenda e attribution
- `LayerGroup` per accendere/spegnere gruppi, ordinare stack e gestire preset della demo
- eventi `layer:change`, `layer:visibility`, `layer:style` per UI esterne e dashboard

Blend mode target:

- `normal`
- `multiply`
- `screen`
- `overlay`
- `add`
- `subtract`
- `lighten`
- `darken`
- `alpha`
- `mask`

Parametri visuali minimi:

- `visible`
- `opacity`
- `blendMode`
- `zIndex` o ordine nello stack
- `minZoom` / `maxZoom`
- `brightness`, `contrast`, `saturation`, `gamma`
- `tintColor` e `colorRamp` per layer analitici
- `timeRange` per layer meteo/time-dynamic
- `legend` e `attribution`

Nota renderer: `normal` e `alpha` possono usare blending tradizionale, ma `multiply`, `screen`, `overlay` e color controls richiedono un compositing pass o shader dedicati per essere coerenti tra WebGL2 e WebGPU. Il compositing deve dichiarare spazio colore, premultiplied alpha e ordine dei layer, altrimenti la stessa scena puo apparire diversa tra backend.

### Formato progetto e sessione

OrbixJS deve poter salvare, riaprire e condividere uno stato di lavoro completo. Senza un formato progetto, la demo resta una configurazione hardcoded e il GIS editor non diventa uno strumento operativo.

Formato target:

- `OrbixProject` come documento JSON versionato e validabile
- `schemaVersion` e migrazioni tra versioni
- CRS di progetto, `ProjectFrame`, origine locale e height reference
- camera, preset vista, bookmarks, `CameraPath`, keyframe e voli in soggettiva
- stack layer con sorgenti, ordine, `LayerState`, `LayerStyle`, legenda e attribution
- riferimenti a catalogo dati, asset locali/remoti e output di preprocessing
- terrain provider, imagery provider, 3D Tiles, glTF, feature layers, weather layers e Digital Twin layers
- timeline, time range attivo, forecast step e stato animazioni
- editing session opzionale: change set, undo/redo serializzabile, lock e dirty state
- regole parametriche, parametri risolti e mapping feature -> mesh derivata
- preferenze demo/UI salvabili fuori dal core, senza rendere il renderer dipendente dalla UI

Formati pratici:

- `.orbix.json` come formato leggibile e versionabile in Git
- cartella progetto `.orbix/` per asset, cache metadata, thumbnail, manifest preprocessing e sidecar
- pacchetto `.orbixpkg` futuro per condividere progetto, asset leggeri e manifest riproducibile

Regola: il progetto salva riferimenti, metadata, regole e manifest; non deve duplicare asset pesanti se possono essere referenziati, rigenerati o scaricati in modo controllato.

### Catalogo dati

OrbixJS deve avere un catalogo dati per registrare, cercare, validare e riusare sorgenti geospaziali. Il catalogo evita che ogni layer sia configurato a mano e diventa il punto in cui si conservano licenza, attribution, CRS, extent, tempo, autenticazione e policy di cache.

Componenti chiave:

- `DataCatalog` per dataset registrati e sorgenti remote/locali
- `DataSourceDescriptor` con tipo, URL, CRS, extent, time extent, layer id, formati, licenza e attribution
- `CatalogProvider` per caricare cataloghi locali, JSON statici, servizi OGC e STAC
- validazione capability: WMS, WMTS, WFS, WCS, OGC API - Features, OGC API - Tiles, OGC API - EDR, STAC
- supporto file: GeoJSON, FlatGeobuf, GeoTIFF/COG, glTF/GLB, 3D Tiles, CityGML/IFC via preprocess
- health check e preview: thumbnail, sample tile, legenda, bounding box, livelli zoom e time steps
- gestione auth/cors/cors-proxy policy senza nasconderla dentro il renderer
- tagging e preset: basemap, terrain, meteo, edifici, sottoservizi, sensori, debug

Per la demo Alto Adige il catalogo deve includere almeno:

- DTM 2,5m come dataset terrain/preprocess
- Orthofoto 2023 come basemap WMTS `EPSG:25832`
- eventuali layer debug: hillshade, slope, exposition, confini, preset camera
- camera paths demo: sorvolo Bolzano, Dolomiti, Val Venosta, Brennero, Merano e volo terrain-follow
- fallback imagery/terrain minimo per GitHub Pages

### Preprocessing pipeline

Molti dati GIS e Digital Twin non sono pronti per il rendering realtime nel browser. OrbixJS deve prevedere una pipeline di preprocessing riproducibile, anche se all'inizio minima, per trasformare dataset grandi o complessi in asset ottimizzati.

Componenti chiave:

- CLI `orbix-preprocess` o script equivalente per generare asset runtime
- `PreprocessJob` descrivibile in JSON, versionato e rieseguibile
- manifest output con input, hash, CRS, extent, risoluzione, tempo, licenza, tool version e parametri
- cache deterministica: se input e parametri non cambiano, l'output non viene rigenerato
- validazione NoData, range quote, tile coverage, attributi richiesti e CRS
- output piccoli per demo GitHub e output piu pesanti fuori repository

Job iniziali utili:

- DTM/GeoTIFF/WCS/COG -> heightmap tiled, mesh terrain o formato terrain interno
- hillshade/slope/aspect -> raster analitici per layer debug
- WMTS/imagery -> manifest tile matrix, metadata e fallback preview
- GeoJSON/FlatGeobuf -> feature tiles, spatial index e schema attributi
- feature parametriche -> glTF/3D Tiles derivati, mantenendo regole e metadata
- glTF/GLB -> compressione, texture resize, meshopt/Draco dove opportuno
- 3D Tiles -> validazione tileset, bounding volumes, metadata e budget LOD
- GRIB/NetCDF/Zarr meteo -> tile/texture temporali per vento, nuvole e precipitazione
- thumbnail, legend e metadata summary per catalogo dati

Regola: il preprocessing non sostituisce i dati sorgente. Produce asset runtime ripetibili e tracciabili, con provenance chiara.

### Camera path planning e voli in soggettiva

OrbixJS deve permettere di creare, modificare, salvare ed eseguire voli in soggettiva. La camera non deve essere solo un controllo interattivo o un `flyTo`: deve diventare uno strumento di regia tecnica per demo, analisi GIS, Digital Twin, ispezioni infrastrutturali e video esportabili.

Componenti chiave:

- `CameraPath` come sequenza versionata di keyframe, segmenti e vincoli
- `CameraKeyframe` con posizione, orientamento, target/lookAt, FOV, timestamp/duration e metadata
- `CameraTransition` con easing, durata, velocita, accelerazione e continuita tra segmenti
- `CameraRig` per modalita orbitale, first-person, look-at target, follow feature e terrain-follow
- `CameraPathEditor` opzionale sopra il core per creare, selezionare, spostare e riordinare keyframe
- `CameraPlayback` con play, pause, stop, scrub, loop, reverse, speed multiplier e callbacks
- salvataggio dei percorsi dentro `OrbixProject` e, per export, nel sidecar Blender/glTF

Transizioni e interpolazione:

- interpolazione posizione con lineare, Catmull-Rom, Bezier o spline geodesica
- interpolazione orientamento con quaternion/slerp per evitare scatti
- easing: linear, ease-in, ease-out, ease-in-out, smoothstep e custom curve
- continuita su velocita e accelerazione per evitare cambi improvvisi
- opzione "constant speed" lungo il percorso
- eventi su timeline: trigger layer, meteo, annotazioni, highlight feature o cambio stile

Vincoli per voli GIS/Digital Twin:

- clearance minima sopra terrain e 3D Tiles
- collision avoidance base con terrain/building dove disponibile
- clamp/follow terrain con offset verticale
- look-at su feature, asset Digital Twin, punto geospaziale o target animato
- limiti su pitch/roll/FOV per evitare nausea e movimenti poco leggibili
- smoothing quando cambiano LOD terrain o 3D Tiles durante il volo
- fallback se un tile o un dataset non e ancora caricato

Workflow target:

- registrare un volo manuale e trasformarlo in keyframe editabili
- disegnare un percorso su mappa/terrain e generare keyframe automatici
- modificare quota, velocita, easing, target e pause in punti specifici
- preview realtime con scrubber
- esportare camera path per Blender, video render offline e presentazioni Digital Twin
- usare preset demo: sorvolo valle, avvicinamento urbano, ispezione infrastruttura, volo meteo

Regola: il percorso camera e dato di progetto, non animazione effimera. Deve essere salvabile, validabile, esportabile e rieseguibile in modo deterministico.

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
- supporto CRS per layer, trasformazioni coordinate, snapping e misure coerenti nel CRS di progetto
- esportazione/importazione GeoJSON e, in seguito, GeoPackage/FlatGeobuf
- adapter OGC API - Features per query e modifiche dove supportate
- salvataggio remoto con conflitti, versioning e rollback

Il principio: editing alto livello sopra primitive e data layers, mai dentro il renderer.

### Modellazione parametrica da feature e metadati

OrbixJS deve permettere di generare geometria 3D a partire da feature GIS, attributi e metadata. Questo e fondamentale per passare da "dati caricati" a "modello operativo": un poligono catastale puo diventare un edificio estruso, una linea puo diventare una strada o una tubazione, un punto puo istanziare un sensore, un albero, una lampada o un elemento BIM semplificato.

Componenti chiave:

- `ParametricFeatureRule` per collegare feature, metadata e generazione geometrica
- `ParameterSchema` per dichiarare parametri, tipi, unita, default, domini e vincoli
- expression binding tra attributi e parametri: `height`, `floors`, `roofType`, `usage`, `year`, `status`, `material`
- generazione non distruttiva: la geometria derivata si aggiorna quando cambiano feature o metadata
- preview interattiva prima del commit dentro `EditingSession`
- cache della mesh generata con invalidazione per feature/rule/metadata
- salvataggio della regola, non solo della mesh finale, per mantenere il modello modificabile

Strumenti iniziali utili:

- estrusione da poligono con altezza fissa, attributo o numero piani
- estrusione con setback, offset, altezza minima/massima e base terrain-relative
- generazione tetti: flat, gable, hip, shed e roof pitch da metadata
- facade rules semplici: divisione per piani, finestre procedural, materiali per uso edificio
- buffer 2D/3D e corridor generation da linee per strade, argini, piste, cavidotti e tubazioni
- sweep lungo linea con profilo: pipe, tunnel, barriere, ringhiere, condotte, cavi
- loft tra sezioni o profili per ponti, gallerie e strutture lineari
- drape e conform to terrain per feature che seguono il DTM
- cut/fill e volume analysis per scavi, riporti, bacini e opere di terra
- instancing da punti con regole: alberi, pali luce, sensori, segnaletica, arredo urbano
- labels e billboards guidati da attributi e stato operativo
- conversione feature-to-3D Tiles/glTF per dataset derivati pesanti
- vincoli parametrici: altezza massima da zoning, materiali ammessi, pendenza massima, distanza da vincoli
- scenari what-if: cambiare parametri e confrontare volume, ombre, esposizione, visibilita o impatto meteo

Il principio: la mesh renderizzata e un prodotto derivato. La verita resta nella feature, nei metadata e nella regola parametrica che l'ha generata.

### Digital Twin renderer/runtime

OrbixJS deve diventare un renderizzatore e runtime per Digital Twin, cioe una scena 3D collegata a dati operativi, sensori, stato e tempo.

Componenti chiave:

- `DigitalTwinScene` come composizione di asset, layer, sensori e simulazioni
- `ProjectFrame` georeferenziato per collegare CRS GIS, coordinate locali BIM e coordinate GPU
- asset derivati da feature tramite regole parametriche e metadata operativi
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
  `https://test-static-mapview.civis.bz.it/working/tiles/raster/DEM/DTM/DigitalTerrainModel-2_5m/layer.json`

Basemap demo candidata:

- `2023 Orthofoto`
- identifier: `PROV-ORTHOPHOTO-2023`
- server: `P_BZ-ORTHOIMAGERY`
- servizio WMTS: `https://geoservices.buergernetz.bz.it/mapproxy/p_bz-Orthoimagery/ows`
- layer: `Aerial-2023-RGB`
- matrix set: `EPSG_25832`
- CRS: `EPSG:25832`
- formato: `image/png`
- tile: 256x256, 18 livelli zoom
- top left corner dichiarato: `[449092.4, 5424522.8]`
- autenticazione: non richiesta

Nota tecnica: questa basemap non va collegata direttamente al provider WMTS attuale se la pipeline resta Web Mercator. Prima serve supporto a `TileMatrixSet` custom, CRS per layer e trasformazioni EPSG:25832, oppure va trovato un endpoint/fallback EPSG:3857/XYZ equivalente per la prima demo pubblica.

Obiettivo demo:

- aprire direttamente sull'Alto Adige
- usare l'ortofoto 2023 come basemap ad alta leggibilita quando il supporto CRS lo consente
- usare il DTM 2,5m come terreno reale
- mostrare hillshade, slope o exposition come layer debug/analisi
- aggiungere camera presets: Bolzano, Dolomiti, Val Venosta, Brennero, Merano
- aggiungere voli in soggettiva pianificati: sorvolo valle, avvicinamento urbano, ispezione terrain e volo meteo
- dimostrare picking terrain con quota reale
- dimostrare profilo altimetrico e pendenza
- preparare terreno per meteo alpino: vento, nuvole e precipitazione
- preparare esportazione Blender di una valle o area urbana selezionata

Prima di implementare va verificato il formato esatto delle tile statiche: encoding quota, estensione file, schema z/x/y, CRS e gestione NoData. Se le tile statiche non sono adatte al terrain runtime, si usa WCS/GeoTIFF come sorgente di preprocessing e si genera un formato terrain interno.

### Export verso Blender

Blender deve essere trattato come destinazione di rendering offline, non come backend realtime. L'implementazione concreta va tenuta tra le fasi finali, ma durante lo sviluppo bisogna conservare le informazioni che renderanno possibile esportare bene: camera, luci, materiali, metadata, timeline, coordinate locali e mapping tra oggetti renderizzati e oggetti semantici.

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

Il principio: il web resta interattivo e performante; Blender produce immagini, video, tavole e materiali di presentazione con qualita superiore. Si progetta con questa uscita in mente, ma non si implementa prima di avere renderer, terrain, GIS editing, Digital Twin e demo solidi.

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

### Fase trasversale - CRS, proiezioni e precisione

Obiettivo: rendere OrbixJS affidabile con dati GIS e Digital Twin in CRS diversi, senza vincolare il runtime a Web Mercator.

Step:

- definire `CrsDefinition`, `CrsRegistry` e `CoordinateTransformer`
- supportare almeno `EPSG:4326`, `EPSG:4979`, `EPSG:4978`, `EPSG:3857`, UTM WGS84, ETRS89/UTM `EPSG:258xx` e Gauss-Boaga `EPSG:3003`/`EPSG:3004`
- introdurre `TileMatrixSet` generico per WMTS e OGC API - Tiles in CRS non Web Mercator
- dichiarare `sourceCrs`, `targetCrs`, axis order, unita e height reference su ogni layer dati
- trasformare bounding box, tile extent, feature vettoriali, terrain sample e coordinate di picking
- introdurre `LocalFrame`/ENU per GPU, editing, misure 3D, Digital Twin e Blender
- gestire quote ellissoidiche, ortometriche, terrain-relative e offset locali come metadata espliciti
- aggiungere test round-trip e casi reali: Web Mercator, Alto Adige `EPSG:25832`, UTM Italia e coordinate locali di progetto

Criterio di uscita:

- una basemap WMTS `EPSG:25832` puo essere caricata senza scorciatoie Web Mercator
- feature GIS e asset Digital Twin possono dichiarare CRS diversi e apparire nello stesso frame locale
- picking, misure e export conservano CRS originale e coordinate trasformate

### Fase trasversale - Project format, catalogo dati e preprocessing

Obiettivo: dare a OrbixJS una spina dorsale operativa per salvare progetti, registrare dataset e preparare asset runtime riproducibili.

Step 1: formato progetto

- definire `OrbixProject`
- definire schema JSON versionato e migrazioni
- salvare camera, CRS, project frame, layer stack, styling, catalog refs, timeline e preset
- salvare editing change set e regole parametriche senza perdere metadata sorgenti
- distinguere progetto leggibile `.orbix.json`, cartella `.orbix/` e futuro pacchetto `.orbixpkg`
- aggiungere validazione schema e messaggi errore utili

Step 2: catalogo dati

- definire `DataCatalog`, `DataSourceDescriptor` e `CatalogProvider`
- registrare sorgenti WMS, WMTS, WFS, WCS, OGC API Features/Tiles/EDR, STAC e file locali
- salvare licenza, attribution, CRS, extent, time extent, cache policy e auth requirements
- aggiungere preview metadata: thumbnail, sample tile, legenda e livelli disponibili
- creare catalogo demo Alto Adige con DTM, Orthofoto 2023 e fallback

Step 3: preprocessing pipeline

- definire `PreprocessJob` e manifest output
- creare CLI/script iniziale `orbix-preprocess`
- supportare DTM/GeoTIFF/WCS/COG verso terrain runtime
- generare hillshade, slope e aspect per analisi demo
- generare asset demo piccoli e versionabili quando i servizi remoti non bastano
- preprocessare feature, glTF/3D Tiles e meteo in fasi progressive
- salvare provenance: input, hash, CRS, extent, tool version, parametri e licenza

Criterio di uscita:

- un progetto demo puo essere salvato, riaperto e validato
- i dataset della demo Alto Adige sono descritti in un catalogo, non hardcoded solo nel codice
- almeno un job di preprocessing produce asset runtime o manifest verificabile per DTM/terrain

### Fase trasversale - Camera paths e flight planning

Obiettivo: creare voli in soggettiva pianificabili, salvabili e riproducibili con transizioni fluide.

Step 1: modello dati

- definire `CameraPath`, `CameraKeyframe`, `CameraTransition` e `CameraRig`
- salvare path, keyframe, easing e vincoli dentro `OrbixProject`
- supportare modalita first-person, look-at, orbit, follow feature e terrain-follow
- definire validazione: durata, keyframe mancanti, CRS, height reference e limiti camera

Step 2: interpolazione e playback

- implementare interpolazione posizione con lineare, Catmull-Rom e Bezier
- implementare interpolazione orientamento con quaternion/slerp
- aggiungere easing e constant-speed mode
- aggiungere play, pause, stop, scrub, loop, reverse e speed multiplier
- sincronizzare path con timeline meteo/Digital Twin e trigger eventi

Step 3: vincoli geospaziali

- mantenere clearance minima da terrain
- supportare collision avoidance base con terrain e, in seguito, 3D Tiles
- gestire smoothing quando cambiano LOD terrain/tiles
- supportare look-at su feature, asset Digital Twin o punto geospaziale

Step 4: authoring e export

- registrare un volo manuale come keyframe editabili
- generare path da polilinea o punti selezionati
- aggiungere preview con scrubber
- esportare camera path verso Blender e sidecar glTF/USD

Criterio di uscita:

- la demo puo eseguire almeno un volo in soggettiva fluido sull'Alto Adige
- il volo resta stabile sopra terrain e non attraversa il suolo
- il path puo essere salvato in `OrbixProject`, riaperto ed esportato verso Blender

### Fase 4 - Terrain 3D

Obiettivo: passare da ellissoide texturizzato a superficie terrestre 3D.

Step:

- definire `TerrainProvider`
- implementare `SouthTyrolDtmTerrainProvider` o preset equivalente per la demo
- validare tile statiche DTM 2,5m Alto Adige: schema, encoding quota, CRS e NoData
- supportare fallback da WCS/GeoTIFF preprocessato se le tile statiche non bastano
- supportare heightmap tiled con manifest runtime, tile float32 e sampling cache
- supportare terrain da OGC API - Tiles dove applicabile
- studiare COG come sorgente elevation/coverage
- generare mesh tile su ellissoide WGS84
- aggiungere LOD quadtree terrain
- aggiungere skirt per evitare crepe tra tile
- aggiungere morphing tra livelli LOD
- calcolare normali terrain
- drapare imagery sopra terrain
- implementare picking terrain
- aggiungere camera clearance configurabile su ellissoide come fallback terrain-ready
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
- definire `Layer`, `LayerState`, `LayerStyle`, `LayerMetadata` e `LayerGroup`
- supportare parametri comuni: `visible`, `opacity`, `blendMode`, `zIndex`, `pickable`, `locked`
- supportare blend mode iniziali: `normal`, `multiply`, `screen`, `overlay`, `add`, `subtract`, `lighten`, `darken`, `mask`
- supportare color controls: brightness, contrast, saturation, gamma, tint e color ramp
- definire ordinamento e compositing pass per imagery, vector overlay, meteo e debug layer
- introdurre `DataSource` come layer opzionale sopra il core
- supportare GeoJSON come primo formato vettoriale
- valutare KML e CZML dopo GeoJSON e time system
- aggiungere `Entity` come API di alto livello, non come dipendenza del renderer
- supportare proprieta time-dynamic in modo modulare
- mantenere una via low-level per chi vuole massime performance

Criterio di uscita:

- OrbixJS puo mostrare marker, linee, poligoni e label georeferenziati
- i layer possono essere accesi/spenti, ordinati, resi trasparenti e composti con blend mode diversi
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
- collegare feature a regole parametriche opzionali

Step 2: editing session

- definire `EditingSession`
- supportare create, update, delete e split/merge
- aggiungere undo/redo
- aggiungere dirty state e change set
- aggiungere commit, rollback e conflict handling
- mantenere separati dati originali e modifiche locali
- preparare adapter transazionali per backend remoti

Step 3: strumenti interattivi

- definire `SelectionTool`, `SelectionSet` e stato di selezione per feature, vertici, segmenti, facce e oggetti derivati
- supportare hover highlight, selezione singola, multipla, box/lasso e selezione gerarchica layer -> feature -> sub-elemento
- tool punto, linea, poligono, rettangolo, cerchio e volume
- tool move, rotate, scale, extrude, reshape e vertex edit
- snapping a vertex, edge, midpoint, grid, terrain e 3D Tiles
- guide visuali, maniglie, gizmo 3D e misure live
- vincoli: altezza, distanza, angolo, ortogonalita, clamp to terrain

Step 4: modellazione parametrica da metadata

- definire `ParametricFeatureRule`
- definire `ParameterSchema` con unita, default, min/max, enum e binding ad attributi
- implementare estrusione da poligono con height/floors/baseHeight/terrainOffset
- implementare setback e offset per volumi edilizi
- implementare roof generator base: flat, gable, hip e shed
- implementare sweep lungo linea con profilo per pipe, tunnel, barriere e cavi
- implementare instancing da punti per alberi, lampioni, sensori e arredo urbano
- implementare preview non distruttiva e commit dentro `EditingSession`
- aggiornare la mesh derivata quando cambiano feature, attributi o regola
- mantenere metadata e regola esportabili in glTF/3D Tiles sidecar

Step 5: validazione e analisi

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
- una feature puo generare un volume 3D parametrico modificabile dai suoi metadata
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
- calcolare la posizione del sole in funzione di data/ora della scena
- aggiungere luce ambiente controllata
- aggiungere image-based lighting
- aggiungere atmospheric scattering
- aggiungere esposizione e gamma correction
- aggiungere compositing layer con blend mode coerenti tra WebGL2 e WebGPU
- gestire premultiplied alpha, sRGB/linear e ordine dei layer in modo esplicito
- gestire materiali metallic/roughness
- preparare materiali terrain e imagery in modo coerente

Criterio di uscita:

- modelli glTF appaiono plausibili con luci e materiali
- cambiare data/ora sposta la direzione della luce solare in modo coerente
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
- job preprocessing eseguibili fuori dal render loop e, dove utile, in worker
- profili performance WebGL2 e WebGPU
- stress test con navigazione rapida

Criterio di uscita:

- la cache non cresce senza limite
- i tile lontani o obsoleti vengono scartati
- la demo resta fluida con dataset piu pesanti

### Fase 14 - API, packaging e documentazione

Obiettivo: rendere OrbixJS usabile da altri progetti.

Step:

- stabilire entrypoint pubblici
- esportare tipi principali
- creare build ESM
- generare declaration TypeScript
- aggiungere esempi indipendenti
- documentare WebGL2/WebGPU
- documentare terrain provider
- documentare formato progetto, catalogo dati e preprocessing pipeline
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

### Fase 15 - Demo pubblica da GitHub

Obiettivo: quando OrbixJS sara su GitHub, ogni push stabile deve poter pubblicare una demo funzionante.

Step:

- mantenere la demo come build statica Vite
- usare la demo come vetrina e banco di test manuale: ogni feature interattiva importante deve avere, quando possibile, un controllo, preset o pannello dedicato per presentarla e verificarla
- usare `base: "./"` in Vite per supportare GitHub Pages sotto sottocartella
- aggiungere workflow GitHub Actions per test, build e deploy
- pubblicare `dist` con GitHub Pages
- mantenere asset demo piccoli e versionati
- evitare dipendenze remote indispensabili per il primo render
- caricare la demo da un `OrbixProject` e da un catalogo dati statico
- includere manifest di preprocessing per DTM, fallback e layer debug
- usare l'ortofoto 2023 `Aerial-2023-RGB` come basemap quando il supporto WMTS `EPSG:25832` e pronto
- mettere il focus iniziale sull'Alto Adige/Südtirol
- usare il DTM 2,5m come primo terrain reale della demo
- mostrare nella demo lo stato di WebGL2/WebGPU, terrain Alto Adige, imagery, 3D Tiles e picking
- aggiungere preset camera per aree altoatesine
- aggiungere camera paths salvati nel progetto demo e riproducibili da UI/shortcut
- aggiungere badge README per build/deploy quando il repository pubblico esiste
- documentare l'URL della demo nel README

Criterio di uscita:

- un push su `main` genera una demo pubblica aggiornata
- il deploy fallisce se test o build falliscono
- la demo online mostra almeno l'Alto Adige navigabile con fallback terrain/imagery senza configurazioni esterne
- progetto, catalogo e manifest preprocessing della demo sono versionati e riproducibili

### Fase 16 - Export Blender e render offline

Obiettivo: esportare scene OrbixJS verso Blender per render fotorealistici, animazioni e presentazioni Digital Twin. Questa fase resta tra le ultime, ma beneficia delle scelte fatte prima su coordinate locali, metadata, materiali, camera e timeline.

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

## 7. Sprint consigliati

| Sprint | Focus | Output |
| --- | --- | --- |
| 1 | Picking MVP | `viewer.pick(...)`, coordinate, test |
| 2 | Renderer interface v2 | Core separato dal backend WebGL2 |
| 3 | WebGPU base | Globo WebGPU con WGSL |
| 4 | WebGPU parity | Imagery e mesh glTF su WebGPU |
| 5 | Project format e catalogo dati | `OrbixProject`, `DataCatalog`, catalogo demo Alto Adige |
| 6 | Preprocessing pipeline | `PreprocessJob`, DTM manifest, fallback demo, provenance |
| 7 | Camera flight planning | `CameraPath`, keyframe, easing, first-person playback, export path |
| 8 | CRS e basemap Alto Adige | `CrsRegistry`, CRS comuni GIS/Digital Twin, WMTS Orthofoto 2023 `EPSG:25832` |
| 9 | Terrain Alto Adige | DTM 2,5m, mesh terrain, picking quota |
| 10 | OGC 3D Tiles base | Tileset reali con SSE e culling |
| 11 | Primitives, data layers e compositing | Point, polyline, polygon, label, GeoJSON, visibilita/opacita/blend mode |
| 12 | GIS editing e modellazione parametrica | Feature model, selection tools, editing session, extrusion/rules da metadata, snapping, undo/redo |
| 13 | Digital Twin runtime | Twin assets, metadata, sensors, time-series |
| 14 | Weather engine | WeatherProvider, vento particellare, cloud layer |
| 15 | PBR e luci | Pipeline colore, sole, IBL, materiali |
| 16 | Ombre | CSM, contact shadows, debug view |
| 17 | 3D Tiles 1.1 | Metadata, implicit tiling, feature picking |
| 18 | Ray tracing sperimentale | WebGPU compute AO/reflections/path tracing |
| 19 | Performance | Scheduler, workers, cache budget |
| 20 | Demo GitHub Pages | Workflow test/build/deploy e demo pubblica |
| 21 | Blender export | GLB/USD, script Python, camera, terrain, metadata |
| 22 | Release evolutiva | Packaging, docs, esempi, changelog |

## 8. Priorita immediata aggiornata

La prossima sequenza migliore e:

1. chiudere picking globo e mesh
2. esporre `viewer.pick(...)`
3. spostare glTF e 3D Tiles demo verso API scene pubbliche
4. progettare `Renderer` v2 con WebGPU in mente
5. creare skeleton `renderer/webgpu`
6. portare il globo vuoto in WGSL
7. definire `OrbixProject`, schema JSON, serializer, validator e migrazioni
8. definire `DataCatalog` e registrare DTM, Orthofoto 2023, fallback e layer debug Alto Adige
9. definire `PreprocessJob` e manifest output per DTM/fallback demo
10. progettare `CameraPath`, `CameraKeyframe`, easing, first-person playback e salvataggio dei voli in `OrbixProject`
11. introdurre `CrsRegistry`, `CoordinateTransformer`, `TileMatrixSet` custom e CRS comuni GIS/Digital Twin, usando l'ortofoto 2023 `EPSG:25832` come primo caso reale
12. iniziare `TerrainProvider` partendo dal DTM 2,5m Alto Adige
13. definire subset OGC 3D Tiles da supportare per primo
14. progettare `LayerState` e `LayerStyle` comuni con `visible`, `opacity`, `blendMode`, `zIndex`, color controls e compositing pass
15. progettare `Primitive` e `Entity` come layer separati, non come cuore del renderer
16. progettare `FeatureLayer` e `EditingSession`
17. progettare `SelectionTool`, `SelectionSet`, hover highlight, selezione multipla, box/lasso e target sub-feature per editing
18. progettare `ParametricFeatureRule` per estrusione, sweep, roof, instancing e mesh derivate dai metadata
19. progettare `DigitalTwinScene` e mapping asset/metadata/sensori
20. progettare `WeatherProvider` e formato interno per vector field vento
21. mantenere camera, materiali, metadata, timeline e coordinate locali esportabili in futuro
22. mantenere la demo sempre pubblicabile da GitHub Pages

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

### Basemap Alto Adige in CRS diverso

Rischio: l'ortofoto 2023 e un WMTS in `EPSG:25832`, mentre il tiling runtime attuale e orientato a Web Mercator.

Mitigazione: implementare `TileMatrixSet` custom, CRS per layer e trasformazioni locali prima di abilitarla come basemap principale; per la demo pubblica mantenere un fallback imagery EPSG:3857/XYZ o un asset offline minimo.

### 3D Tiles troppo ampio

Rischio: provare a implementare tutto lo standard subito.

Mitigazione: subset dichiarato, dataset di test, errori chiari e crescita progressiva verso 1.1.

### Clone CesiumJS troppo pesante

Rischio: replicare anche la complessita storica di CesiumJS.

Mitigazione: copiare i casi d'uso, non l'architettura; entity e data sources devono restare layer opzionali sopra primitive e renderer.

### Blending layer incoerente

Rischio: `multiply`, `screen`, trasparenze e color controls producono risultati diversi tra WebGL2, WebGPU, imagery, vettoriali e layer meteo.

Mitigazione: centralizzare `LayerState`/`LayerStyle`, usare un compositing pass dichiarato, testare blend mode con immagini fixture e fissare spazio colore, premultiplied alpha, z-order e fallback.

### Editing GIS fragile

Rischio: offrire strumenti di editing belli ma capaci di generare geometrie invalide o dati incoerenti.

Mitigazione: usare `EditingSession`, validazione topologica, schema attributi, undo/redo, change set e commit transazionali.

### Modellazione parametrica opaca

Rischio: generare mesh spettacolari ma perdere il legame con feature, attributi, CRS, regole e motivazione tecnica della geometria.

Mitigazione: salvare sempre feature sorgente, metadata, `ParametricFeatureRule`, parametri risolti e versione della regola; la mesh deve essere rigenerabile e validabile, non diventare l'unica fonte di verita.

### CRS e precisione sottovalutati

Rischio: un GIS 3D e un Digital Twin reale richiedono CRS diversi, quote diverse, precisione locale e gestione di scale molto diverse.

Mitigazione: mantenere WGS84/ECEF come base globale, definire CRS per layer, usare frame locali ENU per GPU/editing/Blender, testare trasformazioni round-trip e mantenere metadata su axis order, unita e height reference.

### Digital Twin ridotto a buzzword

Rischio: chiamare Digital Twin una semplice scena 3D.

Mitigazione: ogni twin deve collegare geometria, asset semantici, relazioni, stato, sensori, tempo e almeno una forma di interrogazione operativa.

### Progetti non riproducibili

Rischio: una demo funziona solo perche lo stato e hardcoded nel codice o nella memoria del browser.

Mitigazione: introdurre presto `OrbixProject` versionato, validazione schema, migrazioni e salvataggio esplicito di camera, CRS, layer, catalog refs, timeline, editing state e regole parametriche.

### Camera path non fluido

Rischio: i voli in soggettiva mostrano scatti, cambi bruschi di orientamento, collisioni con terrain/edifici o differenze tra una riproduzione e l'altra.

Mitigazione: usare keyframe validati, interpolazione spline/quaternion, easing dichiarato, limiti su velocita/accelerazione, clearance terrain, smoothing su LOD e test di playback deterministico.

### Catalogo dati disordinato

Rischio: URL, licenze, CRS, attribution, auth e cache policy restano sparsi tra codice, README e configurazioni manuali.

Mitigazione: centralizzare tutto in `DataCatalog` e `DataSourceDescriptor`, con health check, preview, metadata obbligatori e catalogo demo Alto Adige versionato.

### Preprocessing non tracciabile

Rischio: asset terrain, meteo, 3D Tiles o glTF vengono generati una volta e poi non si sa piu da quali dati, parametri e versioni derivino.

Mitigazione: ogni `PreprocessJob` deve produrre manifest con input, hash, CRS, extent, licenza, tool version, parametri e output; gli asset derivati devono essere rigenerabili.

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
- OGC API - Environmental Data Retrieval: `https://ogcapi.ogc.org/edr/`
- OGC Web Map Tile Service: `https://www.ogc.org/standards/wmts/`
- SpatioTemporal Asset Catalogs: `https://stacspec.org/`
- JSON Schema: `https://json-schema.org/`
- FlatGeobuf: `https://flatgeobuf.org/`
- EPSG Geodetic Parameter Dataset: `https://epsg.org/`
- PROJ coordinate transformation library: `https://proj.org/`
- OGC Cloud Optimized GeoTIFF: `https://www.ogc.org/announcement/cloud-optimized-geotiff-cog-published-as-official-ogc-standard/`
- DTM 2,5m Alto Adige dataset: `https://data.civis.bz.it/it/dataset/modello-digitale-del-terreno-dtm-25m`
- DTM 2,5m Alto Adige tile sperimentali: `https://test-static-mapview.civis.bz.it/working/tiles/raster/DEM/DTM/DigitalTerrainModel-2_5m/layer.json`
- Orthofoto 2023 Alto Adige WMTS: `https://geoservices.buergernetz.bz.it/mapproxy/p_bz-Orthoimagery/ows`, layer `Aerial-2023-RGB`, matrix set `EPSG_25832`, CRS `EPSG:25832`
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
- formato progetto/sessione `OrbixProject` versionato e riproducibile
- catalogo dati per sorgenti, licenze, CRS, attribution, preview e fallback
- preprocessing pipeline per terrain, imagery, feature, meteo, 3D Tiles e asset demo
- camera flight planning con voli in soggettiva, keyframe, easing, terrain-follow ed export camera path
- GIS 3D con editing, validazione, snapping, transazioni e analisi
- modellazione parametrica da feature e metadata: extrusion, sweep, roof, instancing e regole non distruttive
- terrain 3D reale
- demo flagship Alto Adige/Südtirol con DTM 2,5m
- OGC 3D Tiles progressivamente completo
- Digital Twin renderer/runtime per BIM, GIS, IoT, sensori e time-series
- primitives, entities e data layers in stile CesiumJS, ma opzionali
- layer compositing con visibilita, opacita, blend mode, ordine, filtri e color controls
- rendering PBR con luci e ombre moderne
- sistema meteo con vento particellare, nuvole e dati atmosferici reali
- streaming massivo
- picking accurato
- pipeline sperimentale ray/path tracing
- export Blender per render offline, video e presentazioni Digital Twin
- demo pubblica sempre aggiornata da GitHub Pages
- architettura pronta per WebGPU, worker e, se misurato utile, Rust/WASM

La regola resta: costruire in modo misurabile, ma non ridurre l'ambizione.
