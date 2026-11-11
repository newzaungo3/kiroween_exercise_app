/**
 * Graveyard_Scene geometry built from Three.js primitives (Open decision 4,
 * Option A). No React and no DOM, so the Unit_Suite can import it in the
 * `node` environment to count triangles and check the pieces.
 *
 * Every colour is a Halloween_Theme token (Requirement 5.5). No textures
 * (Requirement 5.4) and no shadows (Requirement 5.3).
 *
 * Layout, in metres, with the Coach standing at the origin facing +Z:
 * - ground: a flat disc of radius 25 at y = 0; fog (8–22 m) fades it into
 *   the sky colour before its edge;
 * - six gravestones on a ring of radius 8.5–12 m, outside the largest
 *   Camera_Distance (`sceneMaxDistanceM`), so the camera never passes through
 *   one and none stands between the camera and the Coach. Three are on the
 *   −Z half, behind the Coach in the Front view;
 * - the moon and its glow, unlit and unfogged, about 20 m behind the Coach,
 *   above and right of the view centre from the Front Camera_Preset.
 *
 * Triangles: 48 (ground) + 6 × 76 (stones) + 2 × 40 (moon, glow) = 584.
 */
import { BoxGeometry, BufferGeometry, CircleGeometry, CylinderGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { colors } from '@/ui/theme/tokens';

/** What a piece of the Graveyard_Scene is, so tests can count pieces by role. */
export type GraveyardRole = 'ground' | 'gravestone' | 'moon' | 'moonGlow';

export interface GraveyardPiece {
  readonly role: GraveyardRole;
  readonly geometry: BufferGeometry;
  /** A token value from `colors`. */
  readonly color: string;
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
  /** False for the moon and its glow, so they stay visible through the fog. */
  readonly fog: boolean;
  /** MeshLambertMaterial if true, else MeshBasicMaterial. */
  readonly lit: boolean;
  /** 1 is opaque; below 1 the material is transparent. */
  readonly opacity: number;
}

const groundRadiusM = 25;
const groundSegments = 48;

const stoneDepthM = 0.16;
const stoneTopSegments = 16;

const moonPosition = new Vector3(2.5, 4.5, -20);
const moonRadiusM = 1.6;
const moonGlowRadiusM = 3.2;
const moonSegments = 40;
/** The moon and its glow face roughly the Orbit_Target of a standing Coach. */
const moonFacing = new Vector3(0, 1, 0);
/** How far the glow sits behind the moon along the viewing direction. */
const moonGlowOffsetM = 0.3;

interface StoneSpot {
  /** Angle around the Coach: 0° is +Z (in front), 180° is −Z (behind). */
  readonly angleDeg: number;
  readonly radiusM: number;
  readonly widthM: number;
  readonly slabHeightM: number;
  /** Small turn away from facing the Coach, for a less tidy look. */
  readonly twistDeg: number;
}

/** Three spots on the −Z half (angles 90°–270°) and three on the +Z half. */
const stoneSpots: readonly StoneSpot[] = [
  { angleDeg: 162, radiusM: 9, widthM: 0.62, slabHeightM: 0.75, twistDeg: 8 },
  { angleDeg: 196, radiusM: 10, widthM: 0.55, slabHeightM: 0.9, twistDeg: -6 },
  { angleDeg: 230, radiusM: 11.5, widthM: 0.7, slabHeightM: 0.65, twistDeg: 12 },
  { angleDeg: 40, radiusM: 9.5, widthM: 0.6, slabHeightM: 0.8, twistDeg: -10 },
  { angleDeg: 80, radiusM: 11, widthM: 0.5, slabHeightM: 0.7, twistDeg: 5 },
  { angleDeg: -55, radiusM: 10.5, widthM: 0.66, slabHeightM: 0.85, twistDeg: -4 },
];

const degToRad = Math.PI / 180;

function buildGround(): GraveyardPiece {
  const geometry = new CircleGeometry(groundRadiusM, groundSegments);
  geometry.rotateX(-Math.PI / 2); // lie flat, facing up
  return {
    role: 'ground',
    geometry,
    color: colors.sceneGround,
    position: [0, 0, 0],
    rotationY: 0,
    fog: true,
    lit: true,
    opacity: 1,
  };
}

/**
 * One gravestone: a box slab with a half-cylinder top, merged into one
 * geometry (12 + 64 = 76 triangles). Its broad face points along local +Z.
 */
function buildStoneGeometry(widthM: number, slabHeightM: number): BufferGeometry {
  const slab = new BoxGeometry(widthM, slabHeightM, stoneDepthM);
  slab.translate(0, slabHeightM / 2, 0);

  const radius = widthM / 2;
  // A cylinder's axis is Y; after rotateX(π/2) it runs along Z, and the
  // vertex at angle θ lands at y = −r·cos θ, so θ in [π/2, 3π/2] is the upper half.
  const top = new CylinderGeometry(radius, radius, stoneDepthM, stoneTopSegments, 1, false, Math.PI / 2, Math.PI);
  top.rotateX(Math.PI / 2);
  top.translate(0, slabHeightM, 0);

  const merged = mergeGeometries([slab, top], false);
  slab.dispose();
  top.dispose();
  if (merged === null) {
    throw new Error('Could not merge the gravestone geometry.');
  }
  return merged;
}

function buildGravestone(spot: StoneSpot): GraveyardPiece {
  const angle = spot.angleDeg * degToRad;
  const x = spot.radiusM * Math.sin(angle);
  const z = spot.radiusM * Math.cos(angle);
  // Rotating local +Z by `angle + π` points the face back at the Coach.
  const rotationY = angle + Math.PI + spot.twistDeg * degToRad;
  return {
    role: 'gravestone',
    geometry: buildStoneGeometry(spot.widthM, spot.slabHeightM),
    color: colors.sceneGravestone,
    position: [x, 0, z],
    rotationY,
    fog: true,
    lit: true,
    opacity: 1,
  };
}

/** A disc whose front faces `moonFacing` from `position`. */
function buildMoonDisc(radiusM: number, position: Vector3): BufferGeometry {
  const geometry = new CircleGeometry(radiusM, moonSegments);
  geometry.lookAt(moonFacing.clone().sub(position));
  return geometry;
}

function buildMoon(): readonly GraveyardPiece[] {
  const awayFromCoach = moonPosition.clone().sub(moonFacing).normalize();
  const glowPosition = moonPosition.clone().addScaledVector(awayFromCoach, moonGlowOffsetM);
  return [
    {
      role: 'moon',
      geometry: buildMoonDisc(moonRadiusM, moonPosition),
      color: colors.sceneMoon,
      position: [moonPosition.x, moonPosition.y, moonPosition.z],
      rotationY: 0,
      fog: false,
      lit: false,
      opacity: 1,
    },
    {
      role: 'moonGlow',
      geometry: buildMoonDisc(moonGlowRadiusM, glowPosition),
      color: colors.sceneMoonGlow,
      position: [glowPosition.x, glowPosition.y, glowPosition.z],
      rotationY: 0,
      fog: false,
      lit: false,
      opacity: 0.7,
    },
  ];
}

/**
 * Builds the Graveyard_Scene pieces. Each call returns new geometries; the
 * caller owns them and disposes them when the scene unmounts.
 */
export function buildGraveyard(): readonly GraveyardPiece[] {
  return [buildGround(), ...stoneSpots.map(buildGravestone), ...buildMoon()];
}
