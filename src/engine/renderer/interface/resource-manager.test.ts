import { describe, expect, it } from "vitest";
import { RendererResourceManager, emptyRendererResourceStats, rendererResourceKindList } from "./resource-manager";

describe("RendererResourceManager", () => {
  it("starts with empty resource stats", () => {
    expect(new RendererResourceManager().snapshot()).toEqual(emptyRendererResourceStats());
  });

  it("tracks and releases active resources by kind", () => {
    const manager = new RendererResourceManager();
    const buffer = manager.track("buffer");
    manager.track("texture");

    expect(manager.snapshot()).toMatchObject({ buffer: 1, texture: 1 });

    manager.release(buffer);

    expect(manager.snapshot()).toMatchObject({ buffer: 0, texture: 1 });
  });

  it("exposes a stable resource kind list for diagnostics", () => {
    expect(rendererResourceKindList()).toEqual(["buffer", "program", "shader", "texture", "vertexArray"]);
  });
});
