import { type OrbitCamera } from "../../core/camera/orbit-camera";
import { type SceneNode } from "../../core/scene/scene";
import { type Mat4 } from "../../core/math/mat4";
import { type RendererFrame, type RenderPassId } from "./renderer";

export type RendererFramePlanOptions = {
  imageryEnabled?: boolean;
  vectorLinesVisible?: boolean;
  modelVisible?: boolean;
};

export type RendererFramePlan = {
  projection: Float32Array;
  view: Float32Array;
  cameraPosition: readonly [number, number, number];
  nodes: readonly RendererFrameNode[];
  passes: readonly RenderPassId[];
};

export type RendererFrameNode = Pick<SceneNode, "id" | "modelMatrix">;

export function createRendererFramePlan(
  frame: RendererFrame,
  aspect: number,
  options: RendererFramePlanOptions = {},
): RendererFramePlan {
  const passes = createRenderPassList(options);

  return {
    projection: frame.camera.projectionMatrix(aspect),
    view: frame.camera.viewMatrix(),
    cameraPosition: frame.camera.position,
    nodes: frame.scene.visibleNodes.map(toRendererFrameNode),
    passes,
  };
}

export function createRenderPassList({
  imageryEnabled = false,
  vectorLinesVisible = false,
  modelVisible = false,
}: RendererFramePlanOptions = {}): readonly RenderPassId[] {
  const passes: RenderPassId[] = ["globe"];

  if (imageryEnabled) {
    passes.push("imagery");
  }

  if (vectorLinesVisible) {
    passes.push("vector");
  }

  if (modelVisible) {
    passes.push("model");
  }

  passes.push("overlay");
  return passes;
}

function toRendererFrameNode(node: SceneNode): RendererFrameNode {
  return {
    id: node.id,
    modelMatrix: node.modelMatrix as Mat4,
  };
}
