import { identity, type Mat4 } from "../math/mat4";

export type SceneNode = {
  id: string;
  visible: boolean;
  modelMatrix: Mat4;
};

export class Scene {
  private readonly nodes: SceneNode[] = [];

  addNode(node: Partial<SceneNode> & Pick<SceneNode, "id">): SceneNode {
    const sceneNode: SceneNode = {
      visible: node.visible ?? true,
      modelMatrix: node.modelMatrix ?? identity(),
      id: node.id,
    };

    this.nodes.push(sceneNode);
    return sceneNode;
  }

  removeNode(id: string): boolean {
    const index = this.nodes.findIndex((node) => node.id === id);

    if (index === -1) {
      return false;
    }

    this.nodes.splice(index, 1);
    return true;
  }

  get visibleNodes(): readonly SceneNode[] {
    return this.nodes.filter((node) => node.visible);
  }

  get size(): number {
    return this.nodes.length;
  }
}
