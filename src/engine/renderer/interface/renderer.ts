import { OrbitCamera } from "../../core/camera/orbit-camera";
import { Scene } from "../../core/scene/scene";
import { type TerrainSurfaceMeshEntry } from "../../globe/terrain/terrain-surface-runtime";
import { type RendererResourceStats } from "./resource-manager";

export type RendererBackend = "webgl2" | "webgpu";

export type RenderPassId = "globe" | "imagery" | "vector" | "model" | "overlay";

export type RendererCapabilities = {
  backend: RendererBackend;
  maxTextureSize: number;
  supportsInstancing: boolean;
  supportsFloatTextures: boolean;
};

export type RendererFrame = {
  scene: Scene;
  camera: OrbitCamera;
};

export interface Renderer {
  readonly supported: boolean;
  readonly backend: RendererBackend;
  readonly capabilities: RendererCapabilities;
  readonly resourceStats: RendererResourceStats;
  resize(): void;
  render(frame: RendererFrame): void;
  setTerrainMeshes(meshes: readonly TerrainSurfaceMeshEntry[]): void;
  destroy(): void;
}
