# COSTITUZIONE - OrbixJS

## 1. Identita

OrbixJS nasce come motore geospaziale 3D per il web.

Non nasce per copiare CesiumJS riga per riga, ne per diventare un framework generico senza direzione. Nasce per costruire un engine leggero, modulare, moderno e controllabile, capace di visualizzare, interrogare e modificare dati geospaziali 3D dentro applicazioni web reali.

OrbixJS deve restare comprensibile. Il codice deve poter essere letto, misurato, testato e migliorato senza dipendere da una complessita opaca.

## 2. Tesi

Il valore di OrbixJS non sta nel fare tutto cio che fanno gli strumenti esistenti.

Il valore sta nel fare bene una classe precisa di problemi:

- globo 3D WGS84
- imagery e terrain reali
- 3D Tiles e glTF georeferenziati
- picking e interrogazione degli oggetti
- editing GIS 2D/3D
- Digital Twin con metadata, sensori e timeline
- pipeline dati esplicita, riproducibile e misurabile
- runtime leggero, modulare e TypeScript-first

OrbixJS compete sulla qualita dell'architettura, sulla leggerezza, sulla chiarezza delle API e sulla capacita di essere integrato in applicazioni reali senza trascinare un peso non necessario.

## 3. Principi fondamentali

### 3.1 Leggerezza

Il core deve restare piccolo.

Ogni nuova funzionalita deve giustificare il proprio costo in termini di:

- dimensione bundle
- memoria CPU
- memoria GPU
- richieste rete
- allocazioni per frame
- complessita API
- complessita manutentiva

Una feature utile ma pesante deve essere isolata, resa opzionale o spostata sopra il core.

### 3.2 Modularita

Renderer, camera, terrain, imagery, 3D Tiles, glTF, CRS, editing, Digital Twin, meteo, export e UI devono restare separabili.

Il renderer non deve conoscere la UI.

La demo non deve diventare la libreria.

Il core non deve dipendere da feature applicative, pannelli debug, esempi o workflow specifici.

### 3.3 Chiarezza

Le API pubbliche devono essere piccole, esplicite e prevedibili.

OrbixJS deve preferire oggetti semplici, opzioni dichiarative, eventi chiari e metodi leggibili.

Le API devono essere progettate per durare, ma non devono essere congelate troppo presto.

### 3.4 Misurabilita

Le decisioni tecniche importanti devono poter essere misurate.

OrbixJS deve misurare regolarmente:

- dimensione raw, gzip e brotli
- tempo di primo render
- frame time
- memoria CPU/GPU
- tile caricate, pendenti e in cache
- errori di caricamento
- fallback renderer

Una regressione puo essere accettata solo se e consapevole, motivata e documentata.

### 3.5 Standard aperti

OrbixJS deve orientarsi verso standard e formati aperti:

- WGS84, ECEF, ENU e CRS dichiarati
- OGC 3D Tiles
- glTF/GLB
- WMTS, XYZ, OGC API Tiles
- GeoJSON e formati GIS interoperabili
- CityGML, IFC e SensorThings dove hanno senso

Gli standard non devono essere implementati in modo superficiale. Meglio un sottoinsieme piccolo e corretto che una compatibilita dichiarata ma fragile.

### 3.6 Web moderno

OrbixJS deve essere TypeScript-first, ESM-first e progettato per il web moderno.

WebGL2 e il backend compatibile iniziale.

WebGPU e il backend strategico per rendering avanzato, compute, simulazioni e pipeline future.

Non si introduce supporto legacy se compromette la semplicita del progetto.

## 4. Rapporto con CesiumJS

CesiumJS e un riferimento di prodotto e un benchmark funzionale.

OrbixJS deve imparare dai suoi casi d'uso:

- globe
- terrain
- imagery
- 3D Tiles
- camera
- picking
- data layers
- time-dynamic data
- debug tooling

OrbixJS non deve replicarne automaticamente la storia, la superficie API, il peso o la complessita.

La regola e:

> Copiare i problemi validi, non la complessita storica.

## 5. Cosa OrbixJS deve evitare

OrbixJS deve evitare:

- diventare un clone incompleto di CesiumJS
- introdurre dipendenze grandi nel core senza necessita
- mescolare demo, UI e engine
- congelare API immature
- nascondere CRS, quote, trasformazioni e assunzioni spaziali
- caricare feature non richieste nel primo render
- rendere il renderer responsabile di logica applicativa
- aggiungere astrazioni prima che esista un bisogno reale
- inseguire ogni formato prima di averne uno implementato bene

## 6. Cosa OrbixJS deve diventare

OrbixJS deve diventare:

- una libreria geospaziale 3D leggera
- un engine modulare per applicazioni web
- un viewer GIS/Digital Twin integrabile
- una base per editing 2D/3D su terrain
- una pipeline chiara per dati, CRS, asset e preprocessing
- un progetto in cui performance e architettura sono parte del prodotto

## 7. Regola della demo

La demo serve a dimostrare il valore della libreria, non a sostituirla.

La demo deve:

- usare l'API pubblica quando possibile
- mostrare casi d'uso reali
- rendere verificabili le feature importanti
- restare separata dal core
- funzionare come banco di test manuale

Una feature che esiste solo nella demo ma non e riusabile dalla libreria deve essere considerata incompleta.

## 8. Regola del Web Component

Il Web Component e una porta d'ingresso, non il cuore del progetto.

OrbixJS deve prima essere una buona libreria TypeScript. Il Web Component deve arrivare come wrapper sottile quando l'API base e abbastanza stabile.

Il Web Component dovra rendere facile questo uso:

```html
<orbix-viewer project="/projects/demo.orbix.json"></orbix-viewer>
```

Ma sotto deve continuare a esistere una API diretta:

```ts
const viewer = new GeoViewer({
  container: element,
  renderer: "webgl2"
});
```

## 9. Criterio di valore

OrbixJS produce valore se rende piu semplice, piu leggero o piu controllabile costruire applicazioni geospaziali 3D rispetto alle alternative disponibili.

Il valore deve essere validato con prove concrete:

- una demo terrain/imagery reale
- un caso minimo di editing GIS 3D
- un caso minimo di Digital Twin con metadata e timeline
- una integrazione semplice in una pagina o applicazione esterna

Se una feature non aiuta almeno uno di questi obiettivi, va rimandata.

## 10. Impegno tecnico

Ogni modifica importante dovrebbe rispettare queste domande:

- rafforza la tesi di OrbixJS?
- resta modulare?
- peggiora il peso del bundle?
- introduce dipendenze evitabili?
- e misurabile?
- e testabile?
- rende la demo piu utile senza contaminare il core?
- prepara WebGPU senza rompere WebGL2?
- espone dati geospaziali in modo esplicito?

Se la risposta non e chiara, la modifica va ridotta, isolata o documentata meglio.

## 11. Sintesi

OrbixJS deve essere un engine geospaziale 3D leggero, moderno e pragmatico.

Deve crescere con ambizione, ma senza perdere controllo.

Deve guardare a CesiumJS come riferimento, non come destino.

Deve privilegiare architettura, misura, modularita e integrazione reale.

La direzione e chiara:

> meno peso, piu controllo, piu chiarezza, piu valore applicativo.
