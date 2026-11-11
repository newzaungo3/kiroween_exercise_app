import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { decoderExtensions, GlbError, readGlb, summarizeGlb, type ImageSize } from './glb';

// Every GLB in this file is built in memory and handed straight to the reader.
// Nothing is written to disk and nothing here is loaded by the Site (ADR 0004).

// ---------------------------------------------------------------------------
// In-memory test writer (glTF 2.0 "Binary glTF Layout")
// ---------------------------------------------------------------------------

/** Pads to a multiple of 4 bytes: spaces for the JSON chunk, zeros for the BIN chunk. */
function padTo4(bytes: Uint8Array, fill: number): Uint8Array {
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4).fill(fill);
  padded.set(bytes);
  return padded;
}

/** Writes a GLB container with a JSON chunk and an optional BIN chunk. */
function writeGlb(json: unknown, bin: Uint8Array | null): Uint8Array {
  const chunks: [number, Uint8Array][] = [[0x4e4f534a, padTo4(new TextEncoder().encode(JSON.stringify(json)), 0x20)]];
  if (bin !== null) chunks.push([0x004e4942, padTo4(bin, 0)]);
  const total = 12 + chunks.reduce((sum, [, data]) => sum + 8 + data.byteLength, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  let offset = 12;
  for (const [type, data] of chunks) {
    view.setUint32(offset, data.byteLength, true);
    view.setUint32(offset + 4, type, true);
    out.set(data, offset + 8);
    offset += 8 + data.byteLength;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Image headers
// ---------------------------------------------------------------------------

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33); // signature, IHDR (length, type, 13 data bytes, CRC)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  view.setUint32(12, 0x49484452, false); // 'IHDR'
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}

function jpegHeader(width: number, height: number, withApp0: boolean, sofMarker: number): Uint8Array {
  const app0 = withApp0 ? [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0] : [];
  const sof = [0xff, sofMarker, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 3];
  return Uint8Array.from([0xff, 0xd8, ...app0, ...sof, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const otherExtensions = ['KHR_materials_unlit', 'KHR_texture_transform', 'KHR_mesh_quantization'] as const;
const extensionNames: readonly string[] = [...decoderExtensions, ...otherExtensions];

const primitiveArb = fc.record({
  mode: fc.option(fc.integer({ min: 0, max: 6 }), { nil: undefined }),
  indexed: fc.boolean(),
  accessor: fc.nat(),
});

const imageArb = fc.record({
  format: fc.constantFrom('png', 'jpeg'),
  width: fc.integer({ min: 1, max: 4096 }),
  height: fc.integer({ min: 1, max: 4096 }),
  storage: fc.constantFrom('bufferView', 'dataUri', 'external'),
  jpegApp0: fc.boolean(),
  jpegSof: fc.constantFrom(0xc0, 0xc2),
});

const specArb = fc.record({
  accessorCounts: fc.array(fc.integer({ min: 0, max: 10_000 }), { minLength: 1, maxLength: 8 }),
  meshes: fc.array(fc.array(primitiveArb, { maxLength: 4 }), { maxLength: 4 }),
  materials: fc.integer({ min: 0, max: 6 }),
  images: fc.array(imageArb, { maxLength: 4 }),
  animationNames: fc.array(fc.option(fc.string({ unit: 'binary', maxLength: 20 }), { nil: undefined }), {
    maxLength: 4,
  }),
  extensionsUsed: fc.subarray([...extensionNames]),
  extensionsRequired: fc.subarray([...extensionNames]),
  binPrefix: fc.option(fc.uint8Array({ maxLength: 64 }), { nil: null }),
});
type Spec = typeof specArb extends fc.Arbitrary<infer S> ? S : never;

interface Generated {
  readonly doc: Record<string, unknown>;
  readonly bin: Uint8Array | null;
  readonly expected: {
    readonly triangles: number;
    readonly materials: number;
    readonly imageSizes: readonly (ImageSize | null)[];
    readonly largestTextureSide: number;
    readonly animationNames: readonly string[];
    readonly decoderExtensions: readonly string[];
  };
}

/** Builds the glTF document and BIN chunk for a spec, and computes the summary directly. */
function build(spec: Spec): Generated {
  const accessorCount = spec.accessorCounts.length;
  let triangles = 0;
  const meshes = spec.meshes.map((primitives) => ({
    primitives: primitives.map((p) => {
      const accessor = p.accessor % accessorCount;
      const count = spec.accessorCounts[accessor] ?? 0;
      const mode = p.mode ?? 4;
      triangles += mode === 4 ? Math.floor(count / 3) : mode >= 5 ? Math.max(count - 2, 0) : 0;
      return {
        attributes: { POSITION: p.indexed ? (accessor + 1) % accessorCount : accessor },
        ...(p.indexed ? { indices: accessor } : {}),
        ...(p.mode === undefined ? {} : { mode: p.mode }),
      };
    }),
  }));

  const binParts: Uint8Array[] = [];
  let binLength = 0;
  const prefix = spec.binPrefix;
  if (prefix !== null) {
    binParts.push(prefix);
    binLength += prefix.byteLength;
  }
  const bufferViews: { buffer: number; byteOffset: number; byteLength: number }[] = [];
  const imageSizes: (ImageSize | null)[] = [];
  const images = spec.images.map((image) => {
    const bytes =
      image.format === 'png'
        ? pngHeader(image.width, image.height)
        : jpegHeader(image.width, image.height, image.jpegApp0, image.jpegSof);
    const mimeType = image.format === 'png' ? 'image/png' : 'image/jpeg';
    if (image.storage === 'external') {
      imageSizes.push(null);
      return { uri: `textures/coach.${image.format}` };
    }
    imageSizes.push({ width: image.width, height: image.height });
    if (image.storage === 'dataUri') {
      return { uri: `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}` };
    }
    bufferViews.push({ buffer: 0, byteOffset: binLength, byteLength: bytes.byteLength });
    binParts.push(bytes);
    binLength += bytes.byteLength;
    return { bufferView: bufferViews.length - 1, mimeType };
  });

  let bin: Uint8Array | null = null;
  if (prefix !== null || bufferViews.length > 0) {
    bin = new Uint8Array(binLength);
    let offset = 0;
    for (const part of binParts) {
      bin.set(part, offset);
      offset += part.byteLength;
    }
  }

  const doc: Record<string, unknown> = {
    asset: { version: '2.0' },
    accessors: spec.accessorCounts.map((count) => ({ count, componentType: 5126, type: 'VEC3' })),
    meshes,
    materials: Array.from({ length: spec.materials }, (_, i) => ({ name: `material-${i}` })),
    images,
    animations: spec.animationNames.map((name) => (name === undefined ? { channels: [] } : { name, channels: [] })),
    ...(bufferViews.length > 0 ? { bufferViews } : {}),
    ...(bin !== null ? { buffers: [{ byteLength: bin.byteLength }] } : {}),
    ...(spec.extensionsUsed.length > 0 ? { extensionsUsed: spec.extensionsUsed } : {}),
    ...(spec.extensionsRequired.length > 0 ? { extensionsRequired: spec.extensionsRequired } : {}),
  };

  const listed = new Set([...spec.extensionsUsed, ...spec.extensionsRequired]);
  return {
    doc,
    bin,
    expected: {
      triangles,
      materials: spec.materials,
      imageSizes,
      largestTextureSide: imageSizes.reduce((m, s) => (s === null ? m : Math.max(m, s.width, s.height)), 0),
      animationNames: spec.animationNames.map((name) => name ?? ''),
      decoderExtensions: decoderExtensions.filter((name) => listed.has(name)),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const minimalDoc = { asset: { version: '2.0' } };

describe('GLB reader', () => {
  it('a file with the wrong magic is not a GLB', () => {
    const bytes = writeGlb(minimalDoc, null);
    new DataView(bytes.buffer).setUint32(0, 0x46546c66, true);
    expect(() => readGlb(bytes)).toThrow(GlbError);
    expect(() => readGlb(bytes)).toThrow(/magic/);
  });

  it('a version-1 container is rejected', () => {
    const bytes = writeGlb(minimalDoc, null);
    new DataView(bytes.buffer).setUint32(4, 1, true);
    expect(() => readGlb(bytes)).toThrow(GlbError);
    expect(() => readGlb(bytes)).toThrow(/version 1/);
  });

  it('a declared length that disagrees with the file is rejected', () => {
    const valid = writeGlb(minimalDoc, Uint8Array.from([1, 2, 3, 4]));
    const longer = new Uint8Array(valid.byteLength + 4);
    longer.set(valid);
    expect(() => readGlb(longer)).toThrow(GlbError);
    expect(() => readGlb(longer)).toThrow(/declares/);
    expect(() => readGlb(valid.subarray(0, valid.byteLength - 4))).toThrow(/declares/);
  });

  // Feature: exercise-page-3d-coach, Property 11: GLB reader round trip
  // **Validates: Requirements 13.3, 5.4**
  it('a GLB written in memory reads back with the same chunks and the directly calculated budget', () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const { doc, bin, expected } = build(spec);
        const container = readGlb(writeGlb(doc, bin));

        expect(container.json).toEqual(doc);
        // readGlb returns the BIN chunk with its zero padding.
        expect(container.bin).toEqual(bin === null ? null : padTo4(bin, 0));

        const budget = summarizeGlb(container);
        expect(budget.assetVersion).toBe('2.0');
        expect(budget.triangles).toBe(expected.triangles);
        expect(budget.materials).toBe(expected.materials);
        expect(budget.imageSizes).toEqual(expected.imageSizes);
        expect(budget.largestTextureSide).toBe(expected.largestTextureSide);
        expect(budget.animationNames).toEqual(expected.animationNames);
        expect(budget.decoderExtensions).toEqual(expected.decoderExtensions);
      }),
      { numRuns: 200 },
    );
  });
});
