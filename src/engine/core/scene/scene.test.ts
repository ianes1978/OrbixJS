import { describe, expect, it } from "vitest";
import { Scene } from "./scene";

describe("Scene", () => {
  it("adds, filters and removes nodes", () => {
    const scene = new Scene();

    scene.addNode({ id: "globe" });
    scene.addNode({ id: "hidden", visible: false });

    expect(scene.size).toBe(2);
    expect(scene.visibleNodes.map((node) => node.id)).toEqual(["globe"]);
    expect(scene.removeNode("hidden")).toBe(true);
    expect(scene.removeNode("missing")).toBe(false);
    expect(scene.size).toBe(1);
  });
});
