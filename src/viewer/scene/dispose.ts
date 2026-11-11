/**
 * Releases the GPU resources of a Three.js object tree (Requirement 5.8).
 *
 * R3F disposes the objects it creates, but never the contents of a
 * `<primitive object>`. The parsed Coach_Asset is mounted as a primitive, so
 * CoachActor calls this on unmount.
 */
import { BufferGeometry, Material, SkinnedMesh, Texture, type Object3D } from 'three';

/** Objects that carry a geometry and one or more materials (Mesh, SkinnedMesh, Line, Points). */
interface Drawable {
  readonly geometry: BufferGeometry;
  readonly material: Material | readonly Material[];
}

function isDrawable(object: Object3D): object is Object3D & Drawable {
  return 'geometry' in object && object.geometry instanceof BufferGeometry && 'material' in object;
}

function materialsOf(drawable: Drawable): readonly Material[] {
  const { material } = drawable;
  // Array.isArray does not narrow a readonly array out of the union, so the
  // single-material branch needs the cast.
  return Array.isArray(material) ? material : [material as Material];
}

function texturesOf(material: Material): readonly Texture[] {
  // A Material has no index signature, so Object.values types its result as
  // any[]; narrowing each value with instanceof keeps the result typed.
  const values: readonly unknown[] = Object.values(material);
  return values.filter((value): value is Texture => value instanceof Texture);
}

/**
 * Disposes every geometry, material and texture under `root`, each once, and
 * the bone texture of every skeleton. The objects stay in the tree; only
 * their GPU resources are released.
 */
export function disposeObject3D(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  root.traverse((object) => {
    if (object instanceof SkinnedMesh) object.skeleton.dispose();
    if (!isDrawable(object)) return;
    geometries.add(object.geometry);
    for (const material of materialsOf(object)) {
      if (!(material instanceof Material)) continue;
      materials.add(material);
      for (const texture of texturesOf(material)) textures.add(texture);
    }
  });

  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
