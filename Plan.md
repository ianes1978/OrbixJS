# Geo Engine — Piano di Sviluppo MVP

## 1. Visione

Creare un motore geospaziale 3D per il web, moderno, headless, modulare e ad alte prestazioni, progettato per l'hardware attuale e futuro.

L'obiettivo non è replicare completamente CesiumJS, ma costruire un'alternativa più semplice, più veloce e più manutenibile, mantenendo la compatibilità concettuale con i principali casi d'uso geospaziali.

---

## 2. Principi Architetturali

### Headless First

Il motore non contiene:

* widget
* pannelli
* timeline
* geocoder
* strumenti di debug

Tutta l'interfaccia utente è esterna.

### Modern Hardware Only

Supporto minimo:

* WebGL2

Supporto futuro:

* WebGPU

Nessun supporto per:

* WebGL1
* browser legacy
* fallback obsoleti

### Modularità

Ogni componente è indipendente:

* rendering
* camera
* terrain
* imagery
* 3D Tiles
* glTF
* workers
* esportazione

### Performance First

Priorità assoluta a:

* semplicità
* throughput
* basso consumo memoria
* basso garbage collection
* caricamento rapido

---

## 3. Obiettivi del MVP

Il MVP deve permettere di:

* visualizzare un globo WGS84
* navigare liberamente
* mostrare layer raster
* caricare modelli glTF
* caricare 3D Tiles semplici
* effettuare picking
* dimostrare la validità dell'architettura

---

## 4. Cosa NON Fare nel MVP

### Funzionalità escluse

* Entity System
* DataSource System
* Timeline
* Animation System
* KML
* CZML
* GeoCoder
* VR
* AR
* Supporto legacy
* Plugin system avanzato

### Obiettivo

Ridurre al minimo la complessità iniziale.

---

# 5. Architettura Generale

```text
engine/
 ├─ core/
 │   ├─ math/
 │   ├─ geodesy/
 │   ├─ scene/
 │   ├─ camera/
 │   └─ events/
 │
 ├─ renderer/
 │   ├─ interface/
 │   ├─ webgl2/
 │   └─ webgpu/
 │
 ├─ globe/
 │   ├─ ellipsoid/
 │   ├─ terrain/
 │   ├─ imagery/
 │   └─ tiling/
 │
 ├─ loaders/
 │   ├─ gltf/
 │   ├─ tiles3d/
 │   └─ textures/
 │
 ├─ workers/
 │   ├─ tile-loader/
 │   ├─ terrain/
 │   └─ geometry/
 │
 ├─ exporters/
 │   ├─ gltf/
 │   ├─ blender/
 │   └─ tiles3d/
 │
 └─ compat/
     └─ cesium-like-api/
```

---

# 6. Stack Tecnologico

## Core

* TypeScript
* ES Modules
* Vite

## Rendering

* WebGL2

## Futuro

* WebGPU

## Formati

* glTF
* GLB
* 3D Tiles
* PNG/JPEG/WebP

---

# 7. Strategia TypeScript / Rust

## Principio

L’MVP sarà sviluppato principalmente in TypeScript.

Rust/WASM verrà introdotto solo dopo aver identificato reali colli di bottiglia.

L'obiettivo è massimizzare la velocità di sviluppo nelle fasi iniziali.

---

## TypeScript

Responsabile di:

* API pubblica
* Viewer
* Scene graph
* Camera
* Renderer
* Tile scheduler
* Layer manager
* Cache manager
* Loader iniziali
* Picking base
* Integrazione browser
* Event system

---

## Rust/WASM

Introdotto successivamente per:

* decoding mesh
* terrain processing
* parsing binario pesante
* BVH
* ray intersection
* geometry simplification
* spatial indexing
* compressione/decompressione avanzata

---

## Roadmap Rust

| Fase  | Rust                    |
| ----- | ----------------------- |
| MVP 1 | Nessuno                 |
| MVP 2 | Decoding e processing   |
| MVP 3 | BVH e ray picking       |
| MVP 4 | Ottimizzazioni avanzate |

---

## Regola

Prima si misura.

Poi si ottimizza.

Mai introdurre Rust senza evidenza di un beneficio reale.

---

# 8. Backend Grafici

## MVP

```text
Renderer Interface
 └─ WebGL2 Backend
```

---

## Evoluzione

```text
Renderer Interface
 ├─ WebGL2 Backend
 └─ WebGPU Backend
```

Il core deve essere indipendente dal renderer.

---

# 9. Blender

## Obiettivo

Blender non è un renderer realtime.

Viene trattato come destinazione di esportazione.

---

## Possibili funzionalità

* export glTF
* export scene
* export camera
* export terrain
* export materiali
* generazione script Python

---

## Architettura

```text
Scene
 ├─ WebGL2
 ├─ WebGPU
 └─ Blender Export
```

---

# 10. Roadmap MVP

## Fase 1 — Core

### Obiettivo

Creare una scena navigabile.

### Funzionalità

* renderer WebGL2
* scene graph
* camera
* WGS84
* ellissoide

### Risultato

Globo vuoto navigabile.

---

## Fase 2 — Imagery

### Funzionalità

* XYZ
* WMTS
* cache base
* quadtree

### Risultato

Visualizzazione mappe raster.

---

## Fase 3 — Camera

### Funzionalità

* zoom
* pan
* rotate
* tilt
* flyTo

### Risultato

Navigazione geospaziale completa.

---

## Fase 4 — glTF

### Funzionalità

* caricamento GLB
* materiali PBR
* texture
* posizionamento geografico

### Risultato

Visualizzazione modelli 3D.

---

## Fase 5 — 3D Tiles

### Funzionalità

* lettura tileset.json
* LOD base
* frustum culling
* caricamento tile

### Risultato

Visualizzazione tileset.

---

## Fase 6 — Picking

### Funzionalità

* picking globo
* picking mesh
* coordinate geografiche

### Risultato

Interazione completa.

---

# 11. Evoluzione Post-MVP

## Terrain avanzato

* terrain streaming
* quantized mesh
* terrain LOD

---

## Web Workers

* caricamento tile
* parsing
* processing

---

## WebGPU

* renderer alternativo
* compute shader
* culling GPU
* processing GPU

---

## Rust/WASM

* ottimizzazioni mirate

---

## Compatibilità Cesium

Possibile layer API compatibile:

```ts
viewer.camera.flyTo(...)
viewer.imagery.addLayer(...)
viewer.scene.addModel(...)
```

---

# 12. API Target

```ts
const viewer = new GeoViewer({
  container: "map",
  renderer: "webgl2"
});

viewer.imagery.addXYZLayer({
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
});

viewer.camera.flyTo({
  lon: 11.35,
  lat: 46.50,
  height: 3000
});

viewer.scene.addGltf({
  url: "/models/building.glb",
  lon: 11.35,
  lat: 46.50,
  height: 100
});
```

---

# 13. Criteri di Successo

Il MVP è considerato riuscito se:

* il globo è fluido
* il codice è semplice da comprendere
* l'architettura è modulare
* il caricamento è rapido
* i modelli glTF funzionano correttamente
* i 3D Tiles vengono caricati correttamente
* WebGPU può essere aggiunto senza modificare il core
* Rust può essere introdotto senza modificare le API pubbliche

---

# 14. Visione Finale

Un motore geospaziale 3D:

* moderno
* headless
* modulare
* open source
* compatibile con l'ecosistema Cesium
* ottimizzato per WebGL2 e WebGPU
* estendibile con Rust/WASM
* utilizzabile sia per GIS che per Digital Twin

Capace di diventare una base leggera e sostenibile per la prossima generazione di applicazioni geospaziali web.
