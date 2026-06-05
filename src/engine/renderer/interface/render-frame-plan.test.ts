import { describe, expect, it } from "vitest";
import { OrbitCamera } from "../../core/camera/orbit-camera";
import { Scene } from "../../core/scene/scene";
import { createRenderPassList, createRendererFramePlan } from "./render-frame-plan";

describe("createRenderPassList", () => {
  it("always includes globe and overlay passes", () => {
    expect(createRenderPassList()).toEqual(["globe", "overlay"]);
  });

  it("adds optional passes in stable draw order", () => {
    expect(createRenderPassList({ imageryEnabled: true, vectorLinesVisible: true, modelVisible: true })).toEqual([
      "globe",
      "imagery",
      "vector",
      "model",
      "overlay",
    ]);
  });
});

describe("createRendererFramePlan", () => {
  it("collects visible scene nodes outside the draw submission path", () => {
    const scene = new Scene();
    scene.addNode({ id: "visible" });
    scene.addNode({ id: "hidden", visible: false });

    const plan = createRendererFramePlan({ scene, camera: new OrbitCamera() }, 16 / 9);

    expect(plan.nodes.map((node) => node.id)).toEqual(["visible"]);
    expect(plan.projection).toBeInstanceOf(Float32Array);
    expect(plan.view).toBeInstanceOf(Float32Array);
  });
});
