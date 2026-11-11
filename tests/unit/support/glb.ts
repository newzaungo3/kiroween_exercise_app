// Test-only reader for binary glTF 2.0 (GLB) files, used by the Coach_Asset budget test.
// Pure functions over bytes: no imports from src/, no file I/O, no new dependency.
// It only reads containers that the caller passes in; it never writes a GLB (ADR 0004).
//
// GLB layout (glTF 2.0 spec, "Binary glTF Layout"), all integers little-endian uint32:
//   header:  magic 'glTF' (0x46546C67), version (2), total length in bytes
//   chunk 0: length, type 'JSON' (0x4E4F534A), UTF-8 JSON padded with spaces
//   chunk 1: length, type 'BIN\0' (0x004E4942), binary data padded with zeros (optional)
// Chunks of other types are ignored, as the spec requires.

const glbMagic = 0x46546c67;
const glbVersion = 2;
const headerBytes = 12;
const chunkHeaderBytes = 8;
const chunkTypeJson = 0x4e4f534a;
const chunkTypeBin = 0x004e4942;

/** A GLB container or glTF document that this reader cannot accept. */
export class GlbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GlbError';
  }
}

/** The two chunks of a GLB container. */
export interface GlbContainer {
  /** The parsed JSON chunk: the glTF document. */
  readonly json: Readonly<Record<string, unknown>>;
  /** The BIN chunk's bytes, including its zero padding, or null if the file has none. */
  readonly bin: Uint8Array | null;
}

/**
 * Reads a GLB container. Throws a GlbError when the magic is not 'glTF', the
 * container version is not 2, the declared length differs from the byte length,
 * a chunk runs past the end, the first chunk is not JSON, the JSON is not an
 * object, or there is more than one BIN chunk.
 */
export function readGlb(bytes: Uint8Array): GlbContainer {
  if (bytes.byteLength < headerBytes) {
    throw new GlbError(`Not a GLB: ${bytes.byteLength} bytes is shorter than the 12-byte header`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== glbMagic) {
    throw new GlbError(`Not a GLB: magic is 0x${magic.toString(16).padStart(8, '0')}, expected 'glTF'`);
  }
  const version = view.getUint32(4, true);
  if (version !== glbVersion) {
    throw new GlbError(`Unsupported GLB container version ${version}, expected ${glbVersion}`);
  }
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== bytes.byteLength) {
    throw new GlbError(
      `GLB header declares ${declaredLength} bytes but the file has ${bytes.byteLength} bytes`,
    );
  }

  let json: Readonly<Record<string, unknown>> | undefined;
  let bin: Uint8Array | null = null;
  let offset = headerBytes;
  let index = 0;
  while (offset < bytes.byteLength) {
    if (offset + chunkHeaderBytes > bytes.byteLength) {
      throw new GlbError(`GLB chunk ${index} header runs past the end of the file`);
    }
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const dataStart = offset + chunkHeaderBytes;
    const dataEnd = dataStart + chunkLength;
    if (dataEnd > bytes.byteLength) {
      throw new GlbError(`GLB chunk ${index} declares ${chunkLength} bytes, past the end of the file`);
    }
    const data = bytes.subarray(dataStart, dataEnd);
    if (index === 0) {
      if (chunkType !== chunkTypeJson) {
        throw new GlbError('The first GLB chunk is not a JSON chunk');
      }
      json = parseJsonChunk(data);
    } else if (chunkType === chunkTypeJson) {
      throw new GlbError(`GLB chunk ${index} is a second JSON chunk`);
    } else if (chunkType === chunkTypeBin) {
      if (bin !== null) {
        throw new GlbError(`GLB chunk ${index} is a second BIN chunk`);
      }
      bin = data.slice();
    }
    offset = dataEnd;
    index += 1;
  }
  if (json === undefined) {
    throw new GlbError('The GLB has no JSON chunk');
  }
  return { json, bin };
}

function parseJsonChunk(data: Uint8Array): Readonly<Record<string, unknown>> {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    throw new GlbError('The GLB JSON chunk is not valid UTF-8');
  }
  let parsed: unknown;
  try {
    // JSON.parse accepts the trailing space padding the spec requires.
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GlbError(`The GLB JSON chunk is not valid JSON: ${String(error)}`);
  }
  if (!isRecord(parsed)) {
    throw new GlbError('The GLB JSON chunk is not a JSON object');
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Budget summary
// ---------------------------------------------------------------------------

/** glTF extensions that need a decoder the Viewer never loads (Requirement 13.3). */
export const decoderExtensions = [
  'KHR_draco_mesh_compression',
  'EXT_meshopt_compression',
  'KHR_texture_basisu',
] as const;
export type DecoderExtension = (typeof decoderExtensions)[number];

/** Pixel size of an image read from its PNG or JPEG header. */
export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/** What the asset budget test checks about one GLB (Requirements 13.3, 5.4). */
export interface GlbBudget {
  /** `asset.version` of the glTF document, or null when absent. */
  readonly assetVersion: string | null;
  /** Triangles over every primitive of every mesh, each mesh counted once. */
  readonly triangles: number;
  /** Length of the `materials` array. */
  readonly materials: number;
  /**
   * One entry per glTF image, in image order: its size from the PNG or JPEG
   * header, or null when the bytes are not reachable (external URI) or the
   * header is neither a readable PNG nor a readable JPEG.
   */
  readonly imageSizes: readonly (ImageSize | null)[];
  /** The largest width or height over all readable images; 0 when there are none. */
  readonly largestTextureSide: number;
  /** `animations[i].name` in order; an unnamed animation is reported as ''. */
  readonly animationNames: readonly string[];
  /** Decoder-requiring extensions found in `extensionsUsed` or `extensionsRequired`. */
  readonly decoderExtensions: readonly DecoderExtension[];
}

/**
 * Summarises the budget-relevant facts of a GLB container. Throws a GlbError
 * when a field the summary needs has the wrong type or points at a missing
 * accessor, buffer view or buffer range.
 */
export function summarizeGlb(container: GlbContainer): GlbBudget {
  const doc = container.json;
  const accessors = optionalArray(doc, 'accessors');
  const meshes = optionalArray(doc, 'meshes');
  const images = optionalArray(doc, 'images');
  const animations = optionalArray(doc, 'animations');

  let triangles = 0;
  meshes.forEach((mesh, meshIndex) => {
    const meshRecord = requireRecord(mesh, `meshes[${meshIndex}]`);
    optionalArray(meshRecord, 'primitives', `meshes[${meshIndex}]`).forEach((primitive, primitiveIndex) => {
      const path = `meshes[${meshIndex}].primitives[${primitiveIndex}]`;
      triangles += primitiveTriangles(requireRecord(primitive, path), accessors, path);
    });
  });

  const imageSizes = images.map((image, imageIndex) =>
    imageSize(requireRecord(image, `images[${imageIndex}]`), container, `images[${imageIndex}]`),
  );
  const largestTextureSide = imageSizes.reduce(
    (largest, size) => (size === null ? largest : Math.max(largest, size.width, size.height)),
    0,
  );

  const animationNames = animations.map((animation, animationIndex) => {
    const record = requireRecord(animation, `animations[${animationIndex}]`);
    const name = record['name'];
    if (name === undefined) return '';
    if (typeof name !== 'string') {
      throw new GlbError(`animations[${animationIndex}].name is not a string`);
    }
    return name;
  });

  const listed = new Set([
    ...optionalStringArray(doc, 'extensionsUsed'),
    ...optionalStringArray(doc, 'extensionsRequired'),
  ]);

  return {
    assetVersion: assetVersion(doc),
    triangles,
    materials: optionalArray(doc, 'materials').length,
    imageSizes,
    largestTextureSide,
    animationNames,
    decoderExtensions: decoderExtensions.filter((name) => listed.has(name)),
  };
}

/** Reads a GLB container and summarises its budget in one call. */
export function readGlbBudget(bytes: Uint8Array): GlbBudget {
  return summarizeGlb(readGlb(bytes));
}

function assetVersion(doc: Readonly<Record<string, unknown>>): string | null {
  const asset = doc['asset'];
  if (asset === undefined) return null;
  const version = requireRecord(asset, 'asset')['version'];
  if (version === undefined) return null;
  if (typeof version !== 'string') throw new GlbError('asset.version is not a string');
  return version;
}

/**
 * Triangles drawn by one primitive. The vertex count is the indices accessor's
 * count when the primitive is indexed, else the POSITION accessor's count.
 * Modes (glTF 2.0): 0 points, 1 lines, 2 line loop, 3 line strip, 4 triangles
 * (the default), 5 triangle strip, 6 triangle fan.
 */
function primitiveTriangles(
  primitive: Readonly<Record<string, unknown>>,
  accessors: readonly unknown[],
  path: string,
): number {
  const mode = optionalInteger(primitive, 'mode', path) ?? 4;
  if (mode < 0 || mode > 6) {
    throw new GlbError(`${path}.mode ${mode} is not a glTF primitive mode (0–6)`);
  }
  if (mode < 4) return 0;

  const indices = optionalInteger(primitive, 'indices', path);
  let accessorIndex: number;
  let accessorPath: string;
  if (indices !== undefined) {
    accessorIndex = indices;
    accessorPath = `${path}.indices`;
  } else {
    const attributes = primitive['attributes'];
    const position = attributes === undefined ? undefined : requireRecord(attributes, `${path}.attributes`)['POSITION'];
    if (position === undefined) return 0;
    if (!isNonNegativeInteger(position)) {
      throw new GlbError(`${path}.attributes.POSITION is not an accessor index`);
    }
    accessorIndex = position;
    accessorPath = `${path}.attributes.POSITION`;
  }
  const count = accessorCount(accessors, accessorIndex, accessorPath);
  return mode === 4 ? Math.floor(count / 3) : Math.max(count - 2, 0);
}

function accessorCount(accessors: readonly unknown[], index: number, path: string): number {
  const accessor = accessors[index];
  if (accessor === undefined) {
    throw new GlbError(`${path} points at accessor ${index}, which does not exist`);
  }
  const count = requireRecord(accessor, `accessors[${index}]`)['count'];
  if (!isNonNegativeInteger(count)) {
    throw new GlbError(`accessors[${index}].count is not a non-negative integer`);
  }
  return count;
}

/** Image bytes come from a buffer view into the BIN chunk or from a base64 data URI. */
function imageSize(
  image: Readonly<Record<string, unknown>>,
  container: GlbContainer,
  path: string,
): ImageSize | null {
  const bytes = imageBytes(image, container, path);
  return bytes === null ? null : readImageSize(bytes);
}

function imageBytes(
  image: Readonly<Record<string, unknown>>,
  container: GlbContainer,
  path: string,
): Uint8Array | null {
  const bufferViewIndex = optionalInteger(image, 'bufferView', path);
  if (bufferViewIndex !== undefined) {
    return bufferViewBytes(container, bufferViewIndex, `${path}.bufferView`);
  }
  const uri = image['uri'];
  if (uri === undefined) return null;
  if (typeof uri !== 'string') throw new GlbError(`${path}.uri is not a string`);
  const match = /^data:[^,]*;base64,(.*)$/s.exec(uri);
  if (match === null) return null; // an external file: not reachable from the GLB alone
  return Uint8Array.from(Buffer.from(match[1] ?? '', 'base64'));
}

function bufferViewBytes(container: GlbContainer, index: number, path: string): Uint8Array {
  const bufferViews = optionalArray(container.json, 'bufferViews');
  const bufferView = bufferViews[index];
  if (bufferView === undefined) {
    throw new GlbError(`${path} points at buffer view ${index}, which does not exist`);
  }
  const viewPath = `bufferViews[${index}]`;
  const record = requireRecord(bufferView, viewPath);
  const buffer = optionalInteger(record, 'buffer', viewPath);
  const byteOffset = optionalInteger(record, 'byteOffset', viewPath) ?? 0;
  const byteLength = optionalInteger(record, 'byteLength', viewPath);
  if (buffer !== 0) {
    throw new GlbError(`${viewPath} uses buffer ${String(buffer)}; only buffer 0 (the BIN chunk) is readable`);
  }
  if (byteLength === undefined) {
    throw new GlbError(`${viewPath}.byteLength is missing`);
  }
  const bin = container.bin;
  if (bin === null || byteOffset + byteLength > bin.byteLength) {
    throw new GlbError(`${viewPath} runs past the end of the BIN chunk`);
  }
  return bin.subarray(byteOffset, byteOffset + byteLength);
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** Width and height from a PNG IHDR chunk or a JPEG start-of-frame segment; null otherwise. */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  return readPngSize(bytes) ?? readJpegSize(bytes);
}

function readPngSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.byteLength < 24) return null;
  if (!pngSignature.every((value, i) => bytes[i] === value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The first chunk must be IHDR: length (4), type 'IHDR' (4), width (4), height (4), big-endian.
  if (view.getUint32(12, false) !== 0x49484452) return null;
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

function readJpegSize(bytes: Uint8Array): ImageSize | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null;
    // Any number of 0xFF fill bytes may precede a marker.
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    if (marker === undefined) return null;
    offset += 1;
    // Standalone markers without a length: TEM and RST0–RST7 (SOI was consumed above).
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    // End of image or start of scan before any frame header: no size to read.
    if (marker === 0xd9 || marker === 0xda || marker === 0xd8) return null;
    if (offset + 2 > bytes.byteLength) return null;
    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2) return null;
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      // Segment: length (2), precision (1), height (2), width (2).
      if (segmentLength < 7 || offset + 7 > bytes.byteLength) return null;
      return { width: view.getUint16(offset + 5, false), height: view.getUint16(offset + 3, false) };
    }
    offset += segmentLength;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Narrowing helpers for the parsed JSON (typed as unknown)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function requireRecord(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new GlbError(`${path} is not a JSON object`);
  return value;
}

function optionalArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path?: string,
): readonly unknown[] {
  const value = record[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new GlbError(`${path === undefined ? key : `${path}.${key}`} is not an array`);
  return value;
}

function optionalStringArray(record: Readonly<Record<string, unknown>>, key: string): readonly string[] {
  return optionalArray(record, key).map((entry, i) => {
    if (typeof entry !== 'string') throw new GlbError(`${key}[${i}] is not a string`);
    return entry;
  });
}

function optionalInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!isNonNegativeInteger(value)) throw new GlbError(`${path}.${key} is not a non-negative integer`);
  return value;
}
