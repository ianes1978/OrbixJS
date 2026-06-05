export type RoadmapPhase = {
  step: string;
  title: string;
  items: Array<{
    label: string;
    done: boolean;
  }>;
};

export const roadmap: RoadmapPhase[] = [
  {
    step: "Fase 1",
    title: "MVP WebGL2",
    items: [
      { label: "Picking globo", done: true },
      { label: "Picking mesh", done: true },
      { label: "Coordinate lon/lat/height", done: true },
      { label: "API viewer.pick", done: true },
      { label: "Evento picking pubblico", done: true },
      { label: "LOD imagery stabile", done: true },
      { label: "tileset.json validato", done: true },
    ],
  },
  {
    step: "Fase 2",
    title: "Renderer interface v2",
    items: [
      { label: "Backend capabilities", done: true },
      { label: "Render pass dichiarati", done: true },
      { label: "Scene traversal separato", done: true },
      { label: "Resource manager GPU", done: true },
      { label: "Shader GLSL/WGSL separati", done: true },
    ],
  },
  {
    step: "Fase 3",
    title: "WebGPU",
    items: [
      { label: "Skeleton backend", done: true },
      { label: "Feature detection", done: true },
      { label: "Device/canvas WebGPU", done: true },
      { label: "Globo WGSL", done: true },
      { label: "Imagery WebGPU", done: false },
    ],
  },
  {
    step: "Trasv.",
    title: "CRS e precisione",
    items: [
      { label: "CRS dichiarato per layer", done: true },
      { label: "Coordinate transformer", done: true },
      { label: "TileMatrixSet generico", done: true },
      { label: "LocalFrame ENU", done: true },
      { label: "Quote e height reference", done: true },
    ],
  },
  {
    step: "Trasv.",
    title: "Progetti e cataloghi",
    items: [
      { label: "OrbixProject JSON", done: true },
      { label: "DataCatalog", done: true },
      { label: "Demo project/catalog", done: true },
      { label: "Schema e migrazioni", done: false },
      { label: "Preprocess manifest", done: false },
    ],
  },
  {
    step: "Trasv.",
    title: "Camera paths",
    items: [
      { label: "Modello CameraPath", done: false },
      { label: "Keyframe in progetto", done: false },
      { label: "Interpolazione playback", done: false },
      { label: "Terrain-follow", done: false },
      { label: "Export camera", done: false },
    ],
  },
  {
    step: "Fase 4",
    title: "Terrain 3D",
    items: [
      { label: "TerrainProvider API", done: true },
      { label: "Heightmap tiled", done: false },
      { label: "Mesh terrain LOD", done: false },
      { label: "Skirt e morphing", done: false },
      { label: "Picking terrain", done: false },
      { label: "Collisione camera-terrain", done: false },
    ],
  },
  {
    step: "Fase 5",
    title: "OGC 3D Tiles",
    items: [
      { label: "tileset.json", done: true },
      { label: "Bounding volume", done: true },
      { label: "GLB content", done: true },
      { label: "Frustum/SSE base", done: true },
      { label: "b3dm/i3dm/pnts", done: false },
      { label: "3D Tiles 1.1 metadata", done: false },
    ],
  },
  {
    step: "Fase 6",
    title: "Layer ed entity",
    items: [
      { label: "Vector coastline overlay", done: true },
      { label: "LayerState/LayerStyle", done: false },
      { label: "Point/line/polygon primitive", done: false },
      { label: "Billboard e label", done: false },
      { label: "GeoJSON datasource", done: false },
    ],
  },
  {
    step: "Fase 7",
    title: "GIS editing",
    items: [
      { label: "Feature model", done: false },
      { label: "EditingSession", done: false },
      { label: "Undo/redo", done: false },
      { label: "Snapping e gizmo", done: false },
      { label: "Regole parametriche", done: false },
    ],
  },
  {
    step: "Fase 8",
    title: "Digital Twin",
    items: [
      { label: "Twin scene model", done: false },
      { label: "Asset metadata", done: false },
      { label: "Sensor/time-series", done: false },
      { label: "Styling operativo", done: false },
      { label: "Scenario what-if", done: false },
    ],
  },
  {
    step: "Fase 9",
    title: "Meteo",
    items: [
      { label: "WeatherProvider", done: false },
      { label: "Adapter forecast", done: false },
      { label: "Particelle vento", done: false },
      { label: "Nuvole layer", done: false },
      { label: "Timeline forecast", done: false },
    ],
  },
  {
    step: "Fase 10",
    title: "Luci e colore",
    items: [
      { label: "Directional light solare", done: true },
      { label: "Sole da data/ora", done: true },
      { label: "Linear/sRGB pipeline", done: false },
      { label: "Tone mapping", done: false },
      { label: "Atmospheric scattering", done: false },
      { label: "Materiali terrain/imagery", done: false },
    ],
  },
  {
    step: "Fase 11",
    title: "Ombre",
    items: [
      { label: "Shadow map", done: false },
      { label: "Cascades geospaziali", done: false },
      { label: "Ombre terrain/modelli", done: false },
      { label: "Debug shadow atlas", done: false },
    ],
  },
  {
    step: "Fase 12",
    title: "Ray tracing",
    items: [
      { label: "BVH sperimentale", done: false },
      { label: "Ray picking accelerato", done: false },
      { label: "AO ray traced", done: false },
      { label: "Path tracing preview", done: false },
    ],
  },
  {
    step: "Fase 13",
    title: "Performance",
    items: [
      { label: "Tile scheduler", done: false },
      { label: "Request cancellation", done: false },
      { label: "Budget cache CPU/GPU", done: false },
      { label: "Worker parsing/mesh", done: false },
      { label: "Metriche frame time", done: false },
    ],
  },
  {
    step: "Fase 14",
    title: "API e packaging",
    items: [
      { label: "Entrypoint pubblici", done: true },
      { label: "Tipi TypeScript", done: true },
      { label: "Build ESM", done: true },
      { label: "Documentazione provider", done: false },
      { label: "Esempi indipendenti", done: false },
    ],
  },
  {
    step: "Fase 15",
    title: "Demo pubblica",
    items: [
      { label: "Build statica Vite", done: true },
      { label: "GitHub Actions", done: true },
      { label: "Demo da progetto/catalogo", done: true },
      { label: "Asset demo fallback", done: false },
      { label: "Focus Alto Adige", done: false },
    ],
  },
  {
    step: "Fase 16",
    title: "Export Blender",
    items: [
      { label: "SceneExport", done: false },
      { label: "Export GLB/texture", done: false },
      { label: "Script Blender Python", done: false },
      { label: "Camera/luci esportate", done: false },
      { label: "Metadata sidecar", done: false },
    ],
  },
];
