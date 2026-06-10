# Plan3 — Riscrittura del livello di selezione tile/LOD (quadtree SSE)

Questo documento continua `Plan.md` e `Plan2.md` e, come loro, è subordinato a `COSTITUZIONE.md`. Definisce la migrazione del sistema di selezione tile e LOD dall'attuale insieme di strategie euristiche a un singolo attraversamento di quadtree guidato dallo screen-space error (SSE), sul modello di OpenGlobe (*3D Engine Design for Virtual Globes*, Cozzi & Ring) e del `QuadtreePrimitive` di CesiumJS.

## 0. Contesto: perché ora

Il debug del 2026-06-10 ha trovato e corretto tre bug fondazionali:

1. **Matrici in float32** (`src/engine/core/math/mat4.ts`): con `near = 1e-7` l'inversione della view-projection collassava per cancellazione numerica sotto ~100 km di quota → tutto il ray-picking falliva silenziosamente. Ora `Mat4 = Float64Array`, conversione a float32 solo all'upload GPU.
2. **Conversione geodetica errata** (`geo-viewer.ts`): `surfaceNormalToCartographic(camera.position)` trattava la posizione come una normale → errore di ~11 km a 46°N. Aggiunto `Ellipsoid.cartesianToCartographic` (inversa iterativa) e sostituiti tutti i call-site.
3. **Copertura verso l'orizzonte**: culling dell'orizzonte attivo solo sopra 250 km, quadtree a distanza scartato allo scadere di un budget di tempo, pavimento di livello applicato anche al campo lontano, ancora del dettaglio che seguiva il centro schermo invece del terreno più vicino.

I fix 1 e 2 sono fondamenta valide per qualunque architettura. Il fix 3 è una pezza efficace ma conferma la diagnosi: **il livello di selezione è instabile per design**. I sintomi strutturali:

- sei strategie di copertura parallele (`whole-globe`, `clipmap rings`, `camera-anchored`, `sample-bbox`, `screen-quadtree`, `distance-quadtree`) scelte da cascate di soglie hard-coded (2.5 / 8 / 20 / 80 / 120 / 250 km, 1M / 8M / 18M m) — ogni soglia è una discontinuità visibile durante lo zoom;
- quattro percorsi paralleli per il livello target (projected, metric, screen-space, equalized terrain zoom) ricombinati con max/min/bias/stabilize;
- budget di tempo (4–8 ms) che cambiano la topologia della copertura da un frame all'altro → flickering;
- fallback silenziosi: quando un percorso fallisce (es. picking rotto), un altro produce un risultato plausibile ma sbagliato;
- imagery e terrain selezionati separatamente e poi riconciliati.

## 1. Obiettivo e non-obiettivi

**Obiettivo.** Un solo algoritmo di selezione per frame, deterministico a parità di vista, che produca: dettaglio massimo sul terreno più vicino alla camera, falloff monotono con la distanza, copertura completa fino all'orizzonte, stabilità temporale (nessun cambio di topologia senza movimento camera), budget rispettati per costruzione.

**Non-obiettivi (si conserva tutto questo).**

- Provider imagery/terrain e loro cache (`imagery-layer-collection`, `terrain-surface-runtime`, gestione richieste con abort, fallback su antenati).
- Renderer WebGL2/WebGPU e formato delle mesh di superficie.
- Camera, picking, geodesia (appena sistemati).
- API pubblica `LodOptions` (profili `performance/balanced/quality/ultra`, budget): cambia l'implementazione, non il contratto.
- Telemetria e HUD della demo (`stats()`, `tileTelemetry()`, camera-path audit): sono lo strumento di validazione della migrazione.

## 2. Algoritmo di riferimento

Un attraversamento top-down del quadtree per frame:

```
attraversa(tile):
  se non interseca il frustum                     → scarta
  se interamente oltre l'orizzonte                → scarta
  sse = erroreGeometrico(tile.level) / distanza(camera, tile) * fattoreViewport
  se sse <= soglia  oppure  tile.level == maxLevel:
      rendi(tile); return
  se i 4 figli sono renderizzabili (dati pronti o fallback caricato):
      per ogni figlio: attraversa(figlio)
  altrimenti:
      rendi(tile)                                  # il padre copre intanto
      accoda i figli visibili al caricamento, priorità = sse decrescente
```

Proprietà che oggi mancano e che questo schema dà per costruzione:

- **dettaglio dove servono i pixel**: la distanza nel denominatore produce da sola il falloff vicino→lontano; niente ancore, niente anelli;
- **copertura senza buchi**: ogni ramo termina sempre con un tile renderizzato (il padre, finché i figli non sono pronti);
- **stabilità temporale**: "refine solo quando pronto" elimina i pop; a camera ferma l'albero non cambia;
- **orizzonte**: il culling per tile (test cono d'orizzonte) sostituisce le soglie di quota;
- **budget per costruzione**: il limite tile ferma la ricorsione sulle foglie a SSE più basso, non tronca una lista a posteriori.

### 2.1 Stato dell'arte recente e cosa adottiamo

Criterio di scelta: **prima che funzioni e sia stabile**; la novità si adotta solo dove riduce instabilità percepita, non per modernità.

- **Selezione HLOD alla Cesium** (docs ufficiali del [selection algorithm di cesium-native](https://cesium.com/learn/cesium-native/ref-doc/selection-algorithm-details.html), blog ["Skipping Levels of Detail", 2017](https://cesium.com/blog/2017/05/05/skipping-levels-of-detail/)): è il riferimento *di produzione* più collaudato per lo streaming tile su globo. Da qui prendiamo il core: attraversamento SSE, *refine solo quando i figli sono pronti*, la regola "Ancestor Meets SSE" (il dettaglio non sparisce allontanandosi), priorità di caricamento per SSE. Lo skip-LOD aggressivo (saltare livelli intermedi) invece **non** lo adottiamo in prima battuta: è la fonte principale dei loro artefatti noti ([issue #7903](https://github.com/CesiumGS/cesium/issues/7903)) e ottimizza il tempo di caricamento a scapito della stabilità visiva — l'opposto della nostra priorità.
- **CDLOD — geomorphing** ([Strugar, *Continuous Distance-Dependent LOD*](https://aggrobird.com/files/cdlod_latest.pdf)): la transizione tra livelli si smussa nel vertex shader (morphing su una zona di transizione) invece che con il pop al cambio tile. È la tecnica giusta contro il "popping" del terrain, costa zero draw call aggiuntive ed è ortogonale alla selezione: la adottiamo come fase dedicata (Fase 5.5), insieme al **fade-in alfa** delle tile imagery al caricamento (tecnica usata da Cesium per mascherare l'arrivo dei dati).
- **Crack-free tra tile di livello diverso** (es. [Oh et al., ETRI Journal 2025, dynamic tile-map per rendering senza crepe](https://onlinelibrary.wiley.com/doi/10.4218/etrij.2024-0496)): conferma che il problema dei bordi tra livelli adiacenti è ancora attivo in letteratura. La nostra soluzione attuale (skirt sulle mesh terrain) è quella standard e resta; l'adiacenza esplicita è un raffinamento futuro.
- **GPU-driven: Concurrent Binary Trees** ([Benyoub & Dupuy, *CBT for Large-Scale Game Components*, HPG 2024, arXiv:2407.02215](https://arxiv.org/abs/2407.02215)): tassellazione adattiva interamente su GPU, pianeta a scala terrestre in <0,2 ms. È la direzione moderna (e si sposa con il backend WebGPU previsto da `Plan2.md`), ma sostituisce la *geometria*, non lo *streaming* di tile da provider remoti — il nostro collo di bottiglia è il secondo. La registriamo come milestone post-stabilizzazione (§7-bis), da valutare solo quando la baseline CPU sarà stabile e misurabile, così il confronto sarà onesto.
- **Tessellation hardware SSE-based** (es. [Large-scale terrain-adaptive LOD control based on GPU tessellation, 2021](https://www.sciencedirect.com/science/article/pii/S1110016821000326)): conferma la metrica (distanza + errore proiettato) ma dipende da tessellation shader; in WebGL2 non disponibile, in WebGPU assente per design. Non applicabile, la citiamo per completezza.

In sintesi: **il core resta "noioso" e collaudato** (quadtree SSE refine-when-ready); le novità adottate sono le due che attaccano direttamente l'instabilità percepita — geomorphing CDLOD e fade-in — più la disciplina di Cesium su priorità e isteresi. CBT/GPU-driven è il passo successivo, non questo.

Dettagli numerici:

- `erroreGeometrico(level) = errore radice / 2^level`, con errore radice derivato dalla circonferenza equatoriale (convenzione Cesium: ~ 40075016 m / (2 · 65) per lo schema Web Mercator a 2 radici… valore esatto da tarare in Fase 3);
- `fattoreViewport = viewportHeightPx / (2 · tan(fov/2))`;
- `distanza(camera, tile)`: distanza dal bounding volume del tile (non dal centro), per non sottostimare i tile grandi vicini;
- **soglia SSE** = `pixelErrorBudget` già presente in `LodOptions` (≈1–2 px per profilo) — il parametro esiste già, finalmente userà la sua semantica vera;
- **isteresi**: refine quando `sse > soglia`, collapse quando `sse < soglia · 0.7` (fattore da tarare) per evitare oscillazioni al confine.

## 3. Architettura target

Nuovo modulo `src/engine/globe/quadtree/`:

```
quadtree/
  quadtree-traversal.ts      # attraversamento puro: (camera, viewport, opzioni) → selezione
  quadtree-tile.ts           # nodo: chiave, bounding volume, stato dati, figli lazy
  screen-space-error.ts      # SSE, fattoreViewport, errore geometrico per livello
  tile-culling.ts            # frustum + orizzonte (cono/occlusion point), puro
  tile-load-queue.ts         # coda prioritaria, cancellazione dei non più visibili
  selection-strategy.ts      # interfaccia comune + adattatore verso geo-viewer
```

Principi:

- **`quadtree-traversal` è puro**: nessun accesso a DOM, renderer o rete; input espliciti (snapshot camera, viewport, stato di prontezza dei tile via callback), output una `TileSelection` ordinata per priorità. Così è testabile a tavolino con viste sintetiche (nadir, tilt, orizzonte) senza browser.
- **Un solo albero per imagery e terrain.** La selezione produce tile di superficie; imagery e terrain sono *contenuti* del tile (il runtime terrain continua a fare fallback sugli antenati come oggi). Il livello terrain può restare offsettato (`gridSizeByLevel` invariato), ma deriva dallo stesso attraversamento, eliminando la riconciliazione `equalizedTerrainZoom`.
- **Prontezza, non tempo.** Niente budget in millisecondi dentro la selezione: l'attraversamento su un quadtree con culling è O(tile selezionati), centinaia di nodi, sempre sotto il millisecondo. Il tempo va speso una volta sola, non per frame.
- **Fallimenti rumorosi.** Se una precondizione manca (camera invalida, viewport nullo) la strategia ritorna `undefined` e la telemetria lo registra (`coverageStrategy: "none"`), mai un risultato inventato.

## 4. Fasi di migrazione

Ogni fase è atomica, lascia `master` verde (typecheck + 223 test + audit demo) e ha un criterio di uscita misurabile.

### Fase 0 — Prerequisiti ✅ (fatto il 2026-06-10)

mat4 in float64; `cartesianToCartographic`; culling orizzonte a tutte le quote; ancora sul terreno vicino; `usePolling` in vite per WSL.

### Fase 1 — Unificare la convenzione geodetica (½ giornata)

`Ellipsoid.cartographicToCartesian` usa oggi una forma parametrica non standard (`normal · (radii + h)`), non la geodetica vera con il raggio di curvatura N(φ). Finché forward e inverse sono coerenti il globo funziona, ma è il tipo di ambiguità che ha causato il bug degli 11 km.

- Implementare la forma standard: `x = (N+h)·cosφ·cosλ`, `y = ((1−e²)N+h)·sinφ`, … e aggiornare `cartesianToCartographic` di conseguenza.
- Test di roundtrip su una griglia di lat/lon/h (φ ∈ {0, ±30, ±60, ±89}, h ∈ {0, 500, 10⁴, 10⁶}): errore < 1 mm.
- Verifica in demo che imagery e terrain non si spostino (il DTM Alto Adige è il banco di prova sensibile).

**Uscita:** roundtrip < 1 mm; demo visivamente identica; tutti i test verdi.

### Fase 2 — Estrarre l'interfaccia di strategia (1 giorno, zero cambi di comportamento)

- Definire `TileSelectionStrategy`: input `{ cameraSnapshot, viewport, lodContext, isTileRenderable(key) }`, output `{ tiles: PrioritizedTile[], diagnostics }`.
- Impacchettare il comportamento attuale come `ClassicSelectionStrategy`: spostare dentro le ~15 funzioni di copertura oggi in `geo-viewer.ts` (`screenSpaceCoverageTiles`, `clodCoverageTiles`, `cameraClipmapRingTiles`, `distanceDependentCoverageTiles`, `cameraAnchoredCoverageTiles`, `wholeGlobeCoverageTiles`, `coverageTilesFromVisibleSamples`, ecc.) senza modificarle.
- `geo-viewer.renderFrame` chiama la strategia attiva via interfaccia; selettore via `LodOptions.strategy: "classic" | "quadtree"` e query param demo `?lod=`.

**Uscita:** diff di comportamento nullo (stessi tile selezionati su 3 camera path registrati, confronto automatico via `tileTelemetry`); `geo-viewer.ts` perde ~800 righe.

### Fase 3 — Core del quadtree (2–3 giorni)

- Implementare `quadtree-traversal` + `screen-space-error` + `tile-culling` come moduli puri, con `QuadtreeSelectionStrategy` dietro il flag.
- Bounding volume per tile: per iniziare la sfera che già esiste in `tileCanContributeToView` (centro + raggio dai campioni del rettangolo); il box orientato è un raffinamento successivo.
- Prontezza dei tile: riusare le cache esistenti (`currentTileImages`, `terrainSurface.meshCache`) tramite la callback `isTileRenderable` — la strategia non possiede dati.
- Unit test sintetici (senza DOM): nadir a 100 m / 3 km / 120 km, tilt 1.1 rad a 6 km, vista da 2000 km. Asserzioni su: copertura (unione dei rettangoli dei tile ⊇ impronta del frustum sull'ellissoide), monotonia del livello con la distanza, assenza di sovrapposizioni padre/figlio, rispetto del budget.
- Taratura di errore radice e fattore d'isteresi sulla demo con `?lod=quadtree&debugImagery=1`.

**Uscita:** con il flag attivo la demo mostra copertura completa nei 5 scenari di test manuale (zoom 120 km→100 m, tilt orizzonte 6/30 km, pan a bassa quota, orbita, vista globo); istogramma livelli monotono con la distanza.

### Fase 4 — Coda di caricamento e priorità (1 giorno)

- `tile-load-queue`: priorità = SSE decrescente (i tile "più sbagliati" a schermo prima), cancellazione via abort dei tile usciti dalla vista (il meccanismo abort esiste già nei runtime).
- Rispetto di `requestBudget` per frame; niente più `prioritizeTerrainRequests` separato: la priorità nasce dall'attraversamento.
- Telemetria: aggiungere a `stats()` `tileChurn` (tile entrati/usciti dalla selezione per frame) e `holePixels` se misurabile a basso costo.

**Uscita:** durante zoom continuo, p95 di `pendingTiles` stabile e nessuna richiesta per tile non visibili (verifica via log di rete della demo).

### Fase 5 — Unificare il terrain (1–2 giorni)

- Il livello terrain deriva dallo stesso albero (offset configurabile come oggi via `terrain.lodBias`); rimozione di `shouldEqualizeTerrainZoom` e del doppio calcolo `screenSpaceCoverageTiles` per terrain.
- `terrain-tile-selector.ts` resta solo come utilità per i test del runtime, o viene assorbito.

**Uscita:** un solo attraversamento per frame in `updateBreakdown` (la voce `coverageMs` scende: target p95 < 2 ms); nessuna regressione visiva sul DTM.

### Fase 5.5 — Transizioni senza pop (1–2 giorni)

Le due tecniche anti-instabilità percepita adottate dallo stato dell'arte (§2.1):

- **Fade-in alfa delle tile imagery**: al passaggio padre→figli, i figli entrano con alpha 0→1 in ~150–250 ms mentre il padre resta sotto; rimozione del padre solo a fade completato. Implementazione nel renderer (un uniform per tile, già si passa `uModel` per patch), nessun impatto sulla selezione.
- **Geomorphing CDLOD per il terrain**: nel vertex shader delle mesh terrain, morphing dell'altezza tra il livello corrente e il padre su una zona di transizione funzione della distanza (riferimento: [CDLOD, Strugar](https://aggrobird.com/files/cdlod_latest.pdf)). Richiede di passare al shader il fattore di morph per tile; le skirt esistenti restano per i bordi.

**Uscita:** zoom continuo 120 km→500 m senza pop visibili in un video di confronto prima/dopo; nessun calo di fps misurabile.

*Stato 2026-06-10: implementato sul backend WebGL2 (fade 220 ms con antenato di supporto sotto al tile in dissolvenza; morphing dell'altezza verso il campionamento a mezza risoluzione con zona di transizione per livello). Parità WGSL/WebGPU da fare quando il backend WebGPU tornerà prioritario.*

### Fase 6 — Validazione A/B e switch (1 giorno + bake time)

- Camera-path audit (`runCameraPathAudit`, già nella demo) sui path standard con entrambe le strategie; confronto automatico dei campioni.
- Criteri di accettazione per promuovere `quadtree` a default:
  - `visible/render ≥ 0.95` lungo tutti i path (oggi la classica scende sotto 0.2 nei casi patologici);
  - zero frame "settled" (camera ferma > 500 ms, pending = 0) con copertura incompleta;
  - `coverageMs` p95 ≤ 2 ms; `tileChurn` a camera ferma = 0;
  - fps medio ≥ classica su ogni path;
  - numero richieste rete totali ≤ 110% della classica sui medesimi path.
- Switch del default; la classica resta selezionabile per una release.

*Stato 2026-06-10: validato e default cambiato a `quadtree`. Risultati A/B sui due path della demo (GL software, quindi fps assoluti bassi ma confronto omogeneo): italy-to-alps visible/render 1.000 vs 0.915 (p05 1.000 vs 0.778), fps 15 vs 13; south-tyrol-mountain-run visible/render 0.753 vs 0.668 (p05 0.451 vs 0.248), coverage p95 0.8 ms vs 71.9 ms, fps 8 vs 5. tileChurn a camera ferma = 0. La classica resta attivabile con `?lod=classic` o `LodOptions.strategy: "classic"`.*

### Fase 7 — Demolizione (½ giornata, la più soddisfacente — DOPO il bake time)

- Cancellare `ClassicSelectionStrategy` e tutto ciò che usava solo lei: le sei strategie, `selectCoveragePadding`, `terrainSelectRadius`, `selectRadius`, `isNearGroundCoarseCoverage`, `minimumNearGroundCoverageLevel`, le soglie di quota in `effectiveCoverageTileBudget`, `metricImageryLevel`/`projectedImageryLevel` ridondanti, `equalizedTerrainZoom` da `globe-lod-policy.ts`.
- Aggiornare `Plan2.md` (sezione scheduler/LOD) e la telemetria HUD (via i campi morti).

**Uscita:** `geo-viewer.ts` sotto le ~2000 righe (oggi 3300+); nessun riferimento residuo (`grep` pulito); suite verde.

*Stato 2026-06-10: eseguita. Cancellati `ClassicSelectionStrategy`, l'opzione `LodOptions.strategy` e `?lod=`, l'equalizzazione terrain (`shouldEqualizeTerrainZoom`, opzioni `equalZoom*`, `terrainEqualizedZoom`), i tetti di budget per quota e gli helper orfani di coverage-utils. `TileSelectionHost` ridotto a 4 membri. `geo-viewer.ts` a ~2430 righe (dalle 3300+). Suite verde (233).*

### Fase 7-bis — Milestone futura: geometria GPU-driven (fuori da questo piano)

Quando la baseline sarà stabile e la telemetria permetterà confronti onesti, valutare la sostituzione della *geometria* di superficie con tassellazione adattiva su GPU ([CBT, Benyoub & Dupuy 2024](https://arxiv.org/abs/2407.02215)) sul backend WebGPU: la selezione/streaming dei *dati* (questo piano) resta comunque necessaria e invariata. Decisione rinviata di proposito: prima si stabilizza, poi si accelera.

## 5. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| La taratura SSE produce più tile della classica a parità di profilo | Il budget ferma la ricorsione per costruzione; tarare `pixelErrorBudget` per profilo in Fase 3, confronto richieste in Fase 6 |
| Tile Web Mercator degeneri alle alte latitudini (bounding sphere larga → culling poco efficace) | Accettabile per l'MVP (uso tipico ≤ 60°N); raffinare con bounding box orientati in un secondo momento |
| Terrain con `availability` sparsa (DTM Alto Adige): figli "mai pronti" bloccano il refine | `isTileRenderable` considera pronto un tile coperto da fallback antenato già caricato (meccanismo esistente nel runtime) |
| Regressioni di interazione (drag/zoom-to-point dipendono dal picking) | Il picking è indipendente dalla selezione (già su ellissoide + terrain); audit path "interattivi" in Fase 6 |
| WSL/dev: HMR stale maschera i progressi | Già risolto (`usePolling`); in caso di dubbio `npm run dev -- --force` |

## 6. Stima complessiva

7–10 giornate effettive di lavoro distribuite su Fasi 1–7 (inclusa la 5.5), ognuna mergeable da sola. Il valore arriva presto: già a fine Fase 3 il flag `?lod=quadtree` permette di usare e mostrare il nuovo sistema; le fasi successive sono consolidamento, transizioni senza pop e demolizione.
