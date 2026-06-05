export type RendererResourceKind = "buffer" | "program" | "shader" | "texture" | "vertexArray";

export type RendererResourceStats = Record<RendererResourceKind, number>;

export type RendererResourceHandle = {
  readonly id: number;
  readonly kind: RendererResourceKind;
};

const resourceKinds: RendererResourceKind[] = ["buffer", "program", "shader", "texture", "vertexArray"];

export class RendererResourceManager {
  private nextId = 1;
  private readonly active = new Map<number, RendererResourceKind>();

  track(kind: RendererResourceKind): RendererResourceHandle {
    const handle = { id: this.nextId, kind };
    this.nextId += 1;
    this.active.set(handle.id, kind);
    return handle;
  }

  release(handle: RendererResourceHandle | undefined): void {
    if (!handle) {
      return;
    }

    this.active.delete(handle.id);
  }

  snapshot(): RendererResourceStats {
    const stats = emptyRendererResourceStats();

    for (const kind of this.active.values()) {
      stats[kind] += 1;
    }

    return stats;
  }
}

export function emptyRendererResourceStats(): RendererResourceStats {
  return {
    buffer: 0,
    program: 0,
    shader: 0,
    texture: 0,
    vertexArray: 0,
  };
}

export function rendererResourceKindList(): readonly RendererResourceKind[] {
  return resourceKinds;
}
