export type GltfMeshPrimitive = {
  positions: Float32Array;
  indices?: Uint16Array | Uint32Array;
};

type GltfDocument = {
  buffers?: Array<{ byteLength: number }>;
  bufferViews?: Array<{
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
  }>;
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
  }>;
  meshes?: Array<{
    primitives: Array<{
      attributes: Record<string, number>;
      indices?: number;
      mode?: number;
    }>;
  }>;
};

const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const TRIANGLES = 4;

export function extractFirstMeshPrimitive(json: unknown, binaryChunk: Uint8Array | undefined): GltfMeshPrimitive {
  const document = json as GltfDocument;
  const primitive = document.meshes?.[0]?.primitives[0];

  if (!primitive) {
    throw new Error("glTF mesh primitive is missing");
  }

  if (primitive.mode !== undefined && primitive.mode !== TRIANGLES) {
    throw new Error("Only triangle glTF primitives are supported");
  }

  if (!binaryChunk) {
    throw new Error("glTF binary buffer is missing");
  }

  const positionAccessorIndex = primitive.attributes.POSITION;

  if (positionAccessorIndex === undefined) {
    throw new Error("glTF POSITION attribute is missing");
  }

  return {
    positions: readVec3FloatAccessor(document, binaryChunk, positionAccessorIndex),
    indices:
      primitive.indices === undefined ? undefined : readIndexAccessor(document, binaryChunk, primitive.indices),
  };
}

function readVec3FloatAccessor(document: GltfDocument, binaryChunk: Uint8Array, accessorIndex: number): Float32Array {
  const accessor = document.accessors?.[accessorIndex];

  if (!accessor || accessor.componentType !== FLOAT || accessor.type !== "VEC3") {
    throw new Error("Only FLOAT VEC3 accessors are supported for POSITION");
  }

  const { byteOffset, byteStride } = resolveAccessorLayout(document, accessor);
  const values = new Float32Array(accessor.count * 3);

  for (let index = 0; index < accessor.count; index += 1) {
    const sourceOffset = byteOffset + index * byteStride;
    const view = new DataView(binaryChunk.buffer, binaryChunk.byteOffset + sourceOffset, 12);
    values[index * 3] = view.getFloat32(0, true);
    values[index * 3 + 1] = view.getFloat32(4, true);
    values[index * 3 + 2] = view.getFloat32(8, true);
  }

  return values;
}

function readIndexAccessor(
  document: GltfDocument,
  binaryChunk: Uint8Array,
  accessorIndex: number,
): Uint16Array | Uint32Array {
  const accessor = document.accessors?.[accessorIndex];

  if (!accessor || (accessor.componentType !== UNSIGNED_SHORT && accessor.componentType !== UNSIGNED_INT)) {
    throw new Error("Only UNSIGNED_SHORT and UNSIGNED_INT indices are supported");
  }

  if (accessor.type !== "SCALAR") {
    throw new Error("Index accessor must be SCALAR");
  }

  const { byteOffset, byteStride } = resolveAccessorLayout(document, accessor);

  if (accessor.componentType === UNSIGNED_SHORT) {
    const values = new Uint16Array(accessor.count);

    for (let index = 0; index < accessor.count; index += 1) {
      values[index] = new DataView(binaryChunk.buffer, binaryChunk.byteOffset + byteOffset + index * byteStride, 2).getUint16(
        0,
        true,
      );
    }

    return values;
  }

  const values = new Uint32Array(accessor.count);

  for (let index = 0; index < accessor.count; index += 1) {
    values[index] = new DataView(binaryChunk.buffer, binaryChunk.byteOffset + byteOffset + index * byteStride, 4).getUint32(
      0,
      true,
    );
  }

  return values;
}

function resolveAccessorLayout(
  document: GltfDocument,
  accessor: NonNullable<GltfDocument["accessors"]>[number],
): { byteOffset: number; byteStride: number } {
  if (accessor.bufferView === undefined) {
    throw new Error("Sparse or bufferless accessors are not supported");
  }

  const bufferView = document.bufferViews?.[accessor.bufferView];

  if (!bufferView || bufferView.buffer !== 0) {
    throw new Error("Only the first binary buffer is supported");
  }

  const componentSize = accessor.componentType === FLOAT || accessor.componentType === UNSIGNED_INT ? 4 : 2;
  const componentCount = accessor.type === "VEC3" ? 3 : 1;

  return {
    byteOffset: (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
    byteStride: bufferView.byteStride ?? componentSize * componentCount,
  };
}
