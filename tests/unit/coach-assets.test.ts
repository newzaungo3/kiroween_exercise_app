// Coach_Asset and Still_Image delivery checks (Requirements 13.1–13.4) and the
// Graveyard_Scene checks that need no browser (Requirements 5.2, 5.4, 5.5).
//
// Every asset path comes from the Catalog. The files are delivered by the
// Asset_Pipeline into public/assets/ (Open decision 1, Option A; ADR 0004);
// this test only reads them. Until they are delivered, the tests that read a
// delivered file fail with a message naming the missing path. They are never
// skipped, so a deployment without the Coach cannot pass the Unit_Suite.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BufferGeometry } from 'three';
import { afterAll, describe, expect, it } from 'vitest';

import { entries, stillViews, type SameOriginAssetPath } from '@/catalog';
import { colors } from '@/ui/theme/tokens';
import { computeFraming, projectToNdc } from '@/viewer/logic/framing';
import type { Box3Value } from '@/viewer/logic/geometry-types';
import { presetAzimuthDeg, presetElevationDeg } from '@/viewer/logic/orbit';
import { buildGraveyard } from '@/viewer/scene/graveyard-geometry';

import { readGlbBudget } from './support/glb';

const root = fileURLToPath(new URL('../..', import.meta.url));

// git calls can be slow on Windows.
const slow = { timeout: 30_000 };

/** Viewer budget for one Coach_Asset (Requirement 13.3). */
const maxCoachAssetBytes = 6_000_000;
const maxSceneTriangles = 35_000;
const maxMaterials = 4;
const maxTextureSide = 1024;
/** Largest Still_Image (Requirement 13.4). */
const maxStillImageBytes = 300_000;

/** Camera settings of the Viewer (design: Scene3D). */
const fovDeg = 40;
const near = 0.05;

// ---------------------------------------------------------------------------
// Delivered files
// ---------------------------------------------------------------------------

/** `/assets/coach/x.glb` → `public/assets/coach/x.glb` (posix, relative to the Repository root). */
function repositoryPath(assetPath: SameOriginAssetPath): string {
  return path.posix.join('public', assetPath);
}

function missingMessage(assetPath: SameOriginAssetPath): string {
  return (
    `${repositoryPath(assetPath)} is missing: the Asset_Pipeline has not delivered it yet ` +
    '(Open decision 1, Option A: Claude Code with Blender places the file under public/assets/; ' +
    'app code never creates it, ADR 0004).'
  );
}

/** Absolute path of a delivered file. Throws with the missing-file message if it is absent. */
function deliveredFile(assetPath: SameOriginAssetPath): string {
  const absolute = path.join(root, repositoryPath(assetPath));
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new Error(missingMessage(assetPath));
  }
  return absolute;
}

function readDelivered(assetPath: SameOriginAssetPath): Uint8Array {
  return new Uint8Array(readFileSync(deliveredFile(assetPath)));
}

interface CatalogAsset {
  readonly exerciseId: string;
  readonly kind: 'Coach_Asset' | 'Still_Image';
  readonly path: SameOriginAssetPath;
}

const coachAssets: readonly CatalogAsset[] = entries.map((e) => ({
  exerciseId: e.id,
  kind: 'Coach_Asset',
  path: e.coach.asset,
}));

const stillImages: readonly CatalogAsset[] = entries.flatMap((e) =>
  stillViews.map((view): CatalogAsset => ({ exerciseId: e.id, kind: 'Still_Image', path: e.stills[view] })),
);

const catalogAssets: readonly CatalogAsset[] = [...coachAssets, ...stillImages];

function git(args: readonly string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function splitNul(output: string): string[] {
  return output.split('\0').filter((entry) => entry !== '');
}

// ---------------------------------------------------------------------------
// Graveyard_Scene
// ---------------------------------------------------------------------------

const graveyard = buildGraveyard();

afterAll(() => {
  for (const piece of graveyard) piece.geometry.dispose();
});

/** Triangles drawn by a non-indexed or indexed triangle-list geometry. */
function geometryTriangles(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  const vertices = index === null ? geometry.getAttribute('position').count : index.count;
  return Math.floor(vertices / 3);
}

const graveyardTriangles = graveyard.reduce((sum, piece) => sum + geometryTriangles(piece.geometry), 0);

/**
 * Bounds of a representative Coach: about 1.78 m tall, like the delivered
 * Grave Rise Coach, with the squat reaching a little forward and wider.
 */
const representativeStanding: Box3Value = {
  min: { x: -0.3, y: 0, z: -0.15 },
  max: { x: 0.3, y: 1.78, z: 0.15 },
};
const representativeMotion: Box3Value = {
  min: { x: -0.35, y: 0, z: -0.3 },
  max: { x: 0.35, y: 1.78, z: 0.55 },
};
/** Viewer_Area aspect ratios from a narrow phone to a wide laptop window. */
const representativeAspects = [0.8, 1.125, 1.6, 2.4] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Coach_Asset and Still_Image delivery', () => {
  it('every Coach_Asset and Still_Image in the Catalog is a file under public/', () => {
    expect(coachAssets).toHaveLength(5);
    expect(stillImages).toHaveLength(15);
    expect(catalogAssets).toHaveLength(20);
    const missing = catalogAssets
      .filter((asset) => {
        const absolute = path.join(root, repositoryPath(asset.path));
        return !existsSync(absolute) || !statSync(absolute).isFile();
      })
      .map((asset) => `${asset.exerciseId} ${asset.kind}: ${missingMessage(asset.path)}`);

    if (missing.length > 0) throw new Error(missing.join('\n'));
  });

  it('the delivered assets are tracked in git', slow, () => {
    // A file counts when git tracks it, or when it is untracked but not
    // ignored (so `git add` would commit it), as the secrets rule does.
    const paths = catalogAssets.map((asset) => asset.path);
    for (const assetPath of paths) deliveredFile(assetPath);

    const repositoryPaths = paths.map(repositoryPath);
    const tracked = new Set(splitNul(git(['ls-files', '-z', '--', ...repositoryPaths])));
    const committable = new Set(
      splitNul(git(['ls-files', '-z', '--others', '--exclude-standard', '--', ...repositoryPaths])),
    );
    const notCommittable = repositoryPaths.filter((file) => !tracked.has(file) && !committable.has(file));

    expect(notCommittable, 'these delivered assets are gitignored, so the Repository would not hold them').toEqual(
      [],
    );
  });

  it('every Coach_Asset is a glTF 2.0 binary within the Viewer budget', () => {
    for (const exercise of entries) {
      const assetPath = exercise.coach.asset;
      const bytes = readDelivered(assetPath);
      const budget = readGlbBudget(bytes);

      const problems: string[] = [];
      if (bytes.byteLength > maxCoachAssetBytes) {
        problems.push(`${bytes.byteLength} bytes, more than ${maxCoachAssetBytes}`);
      }
      if (budget.assetVersion !== '2.0') {
        problems.push(`asset.version is ${String(budget.assetVersion)}, expected 2.0`);
      }
      if (budget.triangles > maxSceneTriangles) {
        problems.push(`${budget.triangles} triangles, more than ${maxSceneTriangles}`);
      }
      if (budget.materials > maxMaterials) {
        problems.push(`${budget.materials} materials, more than ${maxMaterials}`);
      }
      budget.imageSizes.forEach((size, i) => {
        if (size === null) {
          problems.push(`image ${i} is external or not a readable PNG or JPEG`);
        } else if (size.width > maxTextureSide || size.height > maxTextureSide) {
          problems.push(`image ${i} is ${size.width} × ${size.height}, larger than ${maxTextureSide} × ${maxTextureSide}`);
        }
      });
      if (!budget.animationNames.includes(exercise.coach.demoClip)) {
        problems.push(
          `no animation named ${exercise.coach.demoClip} (found: ${budget.animationNames.join(', ') || 'none'})`,
        );
      }
      if (budget.decoderExtensions.length > 0) {
        problems.push(`needs a decoder: ${budget.decoderExtensions.join(', ')}`);
      }

      expect(problems, `${repositoryPath(assetPath)} (${exercise.id})`).toEqual([]);
    }
  });

  it('every Still_Image is at most 300 KB', () => {
    const tooLarge = stillImages
      .map((asset) => ({ asset, bytes: statSync(deliveredFile(asset.path)).size }))
      .filter(({ bytes }) => bytes > maxStillImageBytes)
      .map(({ asset, bytes }) => `${repositoryPath(asset.path)}: ${bytes} bytes, more than ${maxStillImageBytes}`);

    expect(tooLarge).toEqual([]);
  });
});

describe('Graveyard_Scene', () => {
  it('the whole Graveyard_Scene with the Coach stays within 35,000 triangles', () => {
    expect(graveyardTriangles).toBeGreaterThan(0);
    for (const exercise of entries) {
      const coachTriangles = readGlbBudget(readDelivered(exercise.coach.asset)).triangles;
      const total = coachTriangles + graveyardTriangles;

      expect(
        total,
        `${exercise.id}: Coach ${coachTriangles} + Graveyard_Scene ${graveyardTriangles} triangles`,
      ).toBeLessThanOrEqual(maxSceneTriangles);
    }
  });

  it('the Graveyard_Scene has a ground, at least two gravestones and a moon visible from the Front view', () => {
    const grounds = graveyard.filter((piece) => piece.role === 'ground');
    const gravestones = graveyard.filter((piece) => piece.role === 'gravestone');
    const moons = graveyard.filter((piece) => piece.role === 'moon');

    expect(grounds).toHaveLength(1);
    expect(gravestones.length).toBeGreaterThanOrEqual(2);
    expect(moons).toHaveLength(1);

    // The Coach stands on the ground: a flat piece at y = 0 under the Coach's feet.
    const ground = grounds[0]!;
    ground.geometry.computeBoundingBox();
    const box = ground.geometry.boundingBox!;
    expect(ground.position[1]).toBe(0);
    expect(box.max.y - box.min.y).toBeLessThan(1e-6);
    expect(box.min.x).toBeLessThan(representativeMotion.min.x);
    expect(box.max.x).toBeGreaterThan(representativeMotion.max.x);
    expect(box.min.z).toBeLessThan(representativeMotion.min.z);
    expect(box.max.z).toBeGreaterThan(representativeMotion.max.z);

    // The moon's centre is inside the view from the Front Camera_Preset.
    const [mx, my, mz] = moons[0]!.position;
    for (const aspect of representativeAspects) {
      const framing = computeFraming({
        standingBounds: representativeStanding,
        motionBounds: representativeMotion,
        aspect,
        fovDeg,
        near,
      });
      const front = {
        azimuthDeg: presetAzimuthDeg.front,
        elevationDeg: presetElevationDeg,
        distance: framing.presetDistance.front,
      };
      const ndc = projectToNdc({ x: mx, y: my, z: mz }, front, framing.target, fovDeg, aspect);

      expect(ndc.depth, `aspect ${aspect}: the moon is in front of the camera`).toBeGreaterThan(0);
      expect(Math.abs(ndc.x), `aspect ${aspect}: the moon is inside the view horizontally`).toBeLessThan(1);
      expect(Math.abs(ndc.y), `aspect ${aspect}: the moon is inside the view vertically`).toBeLessThan(1);
    }
  });

  it('every Graveyard_Scene colour is a Halloween_Theme token', () => {
    const tokenValues = new Set<string>(Object.values(colors));
    const strays = graveyard
      .filter((piece) => !tokenValues.has(piece.color))
      .map((piece) => `${piece.role}: ${piece.color}`);

    expect(strays).toEqual([]);
  });
});
