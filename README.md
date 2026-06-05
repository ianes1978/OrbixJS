# OrbixJS

Ambiente di sviluppo per il piano in `Plan.md`.

## Comandi

```powershell
npm install
npm run dev
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
