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
    title: "Core",
    items: [
      { label: "Ambiente Vite + TypeScript", done: true },
      { label: "Renderer WebGL2 iniziale", done: true },
      { label: "Canvas navigabile", done: true },
      { label: "Ellissoide WGS84", done: true },
      { label: "Scene graph", done: true },
    ],
  },
  {
    step: "Fase 2",
    title: "Imagery",
    items: [
      { label: "Layer XYZ", done: true },
      { label: "Layer WMTS", done: true },
      { label: "Cache base", done: true },
      { label: "Quadtree iniziale", done: true },
    ],
  },
  {
    step: "Fase 3",
    title: "Camera",
    items: [
      { label: "Zoom", done: true },
      { label: "Pan", done: false },
      { label: "Rotate", done: true },
      { label: "Tilt", done: false },
      { label: "flyTo", done: true },
    ],
  },
  {
    step: "Fase 4",
    title: "glTF",
    items: [
      { label: "Caricamento GLB", done: false },
      { label: "Materiali PBR", done: false },
      { label: "Texture", done: false },
      { label: "Posizionamento geografico", done: false },
    ],
  },
  {
    step: "Fase 5",
    title: "3D Tiles",
    items: [
      { label: "tileset.json", done: false },
      { label: "LOD base", done: false },
      { label: "Frustum culling", done: false },
      { label: "Caricamento tile", done: false },
    ],
  },
  {
    step: "Fase 6",
    title: "Picking",
    items: [
      { label: "Picking globo", done: false },
      { label: "Picking mesh", done: false },
      { label: "Coordinate geografiche", done: false },
    ],
  },
];
