"""Check the Accessories against the skull and every clip, as the Site will show them.

    blender -b --factory-startup --python assets/coach/check_accessories.py -- [--render DIR]

Attaches each Accessory from coach_accessories.glb to the `head` bone of every
clip GLB the way the app does (same local transform under `head`), then plays
each clip and tests for mesh overlap, frame by frame:
    * no Accessory cuts through the skull (head-bone geometry);
    * no Accessory hits any other bone of the Coach during any clip
      (the pumpkin may wrap the neck, which goes into it);
    * the hat-on-pumpkin variant does not cut through the pumpkin;
    * budget with every Accessory on: <= 4 materials, Coach + Accessories
      triangles and bytes reported.
With --render, writes one sheet per clip with the Accessories on.
Exits non-zero when a check fails.
"""

import json
import math
import os
import struct
import sys

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
CLIPS = ["grave_rise", "skeleton_jacks", "coffin_push", "stretch_side_reach", "stretch_forward_fold"]
ACC_GLB = os.path.join(HERE, "coach_accessories.glb")

# Coach bones each Accessory may touch: it sits on the head, and the neck runs into the pumpkin.
ALLOWED = {
    "accessory_glowing_eyes": {"head"},
    "accessory_witch_hat": set(),
    "accessory_witch_hat_on_pumpkin": set(),
    "accessory_pumpkin_head": {"neck"},
}
EYES_IN_SOCKETS = "accessory_glowing_eyes"  # sits in the sockets by design

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
RENDER_DIR = os.path.abspath(args[args.index("--render") + 1]) if "--render" in args else None

failures = []


def check(ok, label, detail=""):
    print(("PASS " if ok else "FAIL ") + label + (f"  ({detail})" if detail else ""))
    if not ok:
        failures.append(label)


def glb_json(path):
    with open(path, "rb") as fh:
        data = fh.read()
    n = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + n]), len(data)


def glb_triangles(g):
    return sum(g["accessors"][p["indices"]]["count"] // 3 for m in g["meshes"] for p in m["primitives"])


# ---------------------------------------------------------------------------
# Budget with every Accessory on
# ---------------------------------------------------------------------------

acc_json, acc_bytes = glb_json(ACC_GLB)
acc_mats = {m["name"] for m in acc_json["materials"]}
for clip in CLIPS:
    g, size = glb_json(os.path.join(HERE, f"coach_{clip}.glb"))
    mats = {m["name"] for m in g["materials"]} | acc_mats
    tris = glb_triangles(g) + glb_triangles(acc_json)
    check(len(mats) <= 4 and size + acc_bytes <= 6_000_000 and tris <= 35_000,
          f"{clip}: budget with every Accessory on",
          f"{len(mats)} materials {sorted(mats)}, {tris} triangles, {(size + acc_bytes) / 1e6:.2f} MB")


# ---------------------------------------------------------------------------
# Scene helpers
# ---------------------------------------------------------------------------


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def head_world(arm, posed):
    m = arm.pose.bones["head"].matrix if posed else arm.data.bones["head"].matrix_local
    return arm.matrix_world @ m


def world_polys(obj, matrix, keep_vertex=None):
    """World-space (verts, polys) of an object's evaluated mesh; optionally filter by vertex."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    verts = [matrix @ v.co for v in me.vertices]
    polys = [list(p.vertices) for p in me.polygons
             if keep_vertex is None or all(keep_vertex(i) for i in p.vertices)]
    ev.to_mesh_clear()
    return verts, polys


def bvh(verts, polys):
    return BVHTree.FromPolygons(verts, polys) if polys else None


def overlaps(a, b):
    return 0 if a is None or b is None else len(a.overlap(b))


# ---------------------------------------------------------------------------
# Clip by clip
# ---------------------------------------------------------------------------

for clip in CLIPS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 30
    coach_objs = import_glb(os.path.join(HERE, f"coach_{clip}.glb"))
    arm = next(o for o in coach_objs if o.type == "ARMATURE")
    body = next(o for o in coach_objs if o.type == "MESH")
    acc_objs = import_glb(ACC_GLB)
    bpy.context.view_layer.update()

    # Both files share the rig's rest pose (same `head` joint chain), so an
    # Accessory kept at its local transform under `head` moves exactly as the
    # head bone moves away from rest.
    accessories = {}
    head_rest_inv = head_world(arm, posed=False).inverted()
    for o in acc_objs:
        if o.type == "MESH" and o.name in ALLOWED:
            accessories[o.name] = (o, head_rest_inv @ o.matrix_world)
    check(set(accessories) == set(ALLOWED), f"{clip}: Accessories found", ", ".join(sorted(accessories)))

    owner = [body.vertex_groups[v.groups[0].group].name for v in body.data.vertices]
    start, end = (int(round(x)) for x in arm.animation_data.action.frame_range)

    hits = {name: {} for name in accessories}
    skull_hits = {name: 0 for name in accessories}
    hat_in_pumpkin = 0
    bones = sorted(set(owner))
    for f in range(start, end + 1):
        scene.frame_set(f)
        head_m = head_world(arm, posed=True)
        acc_trees = {}
        for name, (o, local) in accessories.items():
            acc_trees[name] = bvh(*world_polys(o, head_m @ local))
        body_v, body_p = world_polys(body, body.matrix_world)
        for bone in bones:
            tree = bvh(body_v, [p for p in body_p if owner[p[0]] == bone])
            for name, acc_tree in acc_trees.items():
                if bone in ALLOWED[name]:
                    continue
                n = overlaps(acc_tree, tree)
                if n and bone == "head":
                    skull_hits[name] = max(skull_hits[name], n)
                elif n:
                    hits[name][bone] = hits[name].get(bone, 0) + 1
        hat_in_pumpkin = max(hat_in_pumpkin, overlaps(acc_trees["accessory_witch_hat_on_pumpkin"],
                                                      acc_trees["accessory_pumpkin_head"]))

    frames = end - start + 1
    for name in sorted(accessories):
        if name != EYES_IN_SOCKETS:
            check(skull_hits[name] == 0, f"{clip}: {name} does not cut through the skull",
                  f"{skull_hits[name]} face pairs")
        detail = ", ".join(f"{b} in {n}/{frames} frames" for b, n in sorted(hits[name].items())) or "clear"
        check(not hits[name], f"{clip}: {name} clear of the moving Coach", detail)
    check(hat_in_pumpkin == 0, f"{clip}: hat-on-pumpkin sits on the pumpkin", f"{hat_in_pumpkin} face pairs")

    if RENDER_DIR:
        import numpy as np

        os.makedirs(RENDER_DIR, exist_ok=True)
        # Show the combinations: hat + glowing eyes, then pumpkin + hat-on-pumpkin.
        for o in acc_objs:
            if o.type == "MESH":
                o.parent = None
        looks = [("accessory_witch_hat", "accessory_glowing_eyes"),
                 ("accessory_pumpkin_head", "accessory_witch_hat_on_pumpkin")]
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "MATERIAL"
        scene.display.shading.show_cavity = True
        scene.render.resolution_x = scene.render.resolution_y = 300
        world = bpy.data.worlds.new("bg")
        world.color = (0.012, 0.007, 0.03)
        scene.world = world
        cam_data = bpy.data.cameras.new("cam")
        cam = bpy.data.objects.new("cam", cam_data)
        scene.collection.objects.link(cam)
        scene.camera = cam
        cam_data.type = "ORTHO"
        sample = [start + round((end - start) * k / 4) for k in range(4)]
        views = [((0, -8, 0), (90, 0, 0)), ((8, 0, 0), (90, 0, 90)), ((5.6, -5.6, 2.5), (72, 0, 45))]
        tiles = []
        for look in looks:
            for o in acc_objs:
                if o.type == "MESH":
                    o.hide_render = o.name not in look
            for loc, rot in views:
                row = []
                for f in sample:
                    scene.frame_set(f)
                    head_m = head_world(arm, posed=True)
                    for name, (o, local) in accessories.items():
                        o.matrix_world = head_m @ local
                    # Frame on the posed Coach.
                    pts, _ = world_polys(body, body.matrix_world)
                    lo = Vector((min(q.x for q in pts), min(q.y for q in pts), min(q.z for q in pts)))
                    hi = Vector((max(q.x for q in pts), max(q.y for q in pts), max(q.z for q in pts)))
                    cam.rotation_euler = [math.radians(a) for a in rot]
                    cam.location = (lo + hi) / 2 + Vector(loc)
                    cam_data.ortho_scale = max((hi - lo).length * 0.95, 1.2)
                    path = os.path.join(RENDER_DIR, f"{clip}_{len(tiles)}_{len(row)}.png")
                    scene.render.filepath = path
                    bpy.ops.render.render(write_still=True)
                    row.append(path)
                tiles.append(row)
        T = 300
        sheet = np.zeros((len(tiles) * T, len(sample) * T, 4), dtype=np.float32)
        for r, row in enumerate(tiles):
            for c, path in enumerate(row):
                img = bpy.data.images.load(path)
                px = np.empty(T * T * 4, dtype=np.float32)
                img.pixels.foreach_get(px)
                y0 = (len(tiles) - 1 - r) * T
                sheet[y0:y0 + T, c * T:(c + 1) * T] = px.reshape(T, T, 4)
                bpy.data.images.remove(img)
                os.remove(path)
        out = bpy.data.images.new("sheet", len(sample) * T, len(tiles) * T, alpha=True)
        out.pixels.foreach_set(sheet.ravel())
        out.filepath_raw = os.path.join(RENDER_DIR, f"{clip}.png")
        out.file_format = "PNG"
        out.save()
        print("SHEET", out.filepath_raw)

print("RESULT", "FAIL" if failures else "PASS", failures)
sys.exit(1 if failures else 0)
