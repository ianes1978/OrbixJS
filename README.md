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

La pagina mostra una prima preview WebGL2 del globo e una roadmap aggiornata dalle fasi MVP del piano.

## Fase 1

La Fase 1 include:

- renderer WebGL2
- scene graph minimale
- camera orbitale
- input mouse per orbitare e zoomare
- ellissoide WGS84
- globo vuoto navigabile

I test coprono math, geodesia WGS84, camera, scene graph e mesh ellissoidale.

## Fase 2 in corso

Lo step imagery iniziale include:

- provider XYZ
- cache LRU base per tile
- tiling Web Mercator
- texture raster globale applicata al globo

Il quadtree e il caricamento tile per viewport saranno il prossimo raffinamento.
