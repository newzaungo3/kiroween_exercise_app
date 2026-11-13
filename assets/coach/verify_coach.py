"""Check an exported Coach GLB against the asset budget and motion rules.

    blender -b --factory-startup --python assets/coach/verify_coach.py -- <file.glb>
        [--planted BONE,BONE,...|none] [--render DIR]

Checks (ticket 02 / 04 budget):
    * file <= 6 MB, <= 35k triangles, <= 4 materials, textures <= 1024 px
    * <= 70 joints, <= 4 influences per vertex, no scale channels
    * a clip named `demo_loop`, ~30 fps keys, first pose == last pose
    * root stays put, the mesh stays rigid on its bones, nothing sinks below
      the floor, and the --planted bones (head and tail) never move
      (default: feet and toes; push-up: hands and toes; jumping jacks: none)
With --render, writes front / side / back / three-quarter stills at six
frames plus one contact sheet (sheet.png) to DIR.
Exits non-zero when a check fails.
"""

import json
import math
import os
import struct
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
GLB = os.path.abspath(args[0])
PLANTED = ["foot.L", "foot.R", "toe.L", "toe.R"]
RENDER_DIR = None
rest_args = args[1:]
while rest_args:
    flag = rest_args.pop(0)
    if flag == "--planted":
        value = rest_args.pop(0)
        PLANTED = [] if value == "none" else value.split(",")
    elif flag == "--render":
        RENDER_DIR = os.path.abspath(rest_args.pop(0))
    else:
        RENDER_DIR = os.path.abspath(flag)  # older positional form

failures = []


def check(ok, label, detail=""):
    print(("PASS " if ok else "FAIL ") + label + (f"  ({detail})" if detail else ""))
    if not ok:
        failures.append(label)


# ---------------------------------------------------------------------------
# Static checks on the glTF JSON
# ---------------------------------------------------------------------------

with open(GLB, "rb") as fh:
    data = fh.read()
magic, _version, _length = struct.unpack_from("<4sII", data, 0)
assert magic == b"glTF", "not a GLB"
json_len, _ = struct.unpack_from("<I4s", data, 12)
gltf = json.loads(data[20:20 + json_len])
bin_offset = 20 + json_len + 8

size_mb = len(data) / (1024 * 1024)
check(size_mb <= 6, "file size <= 6 MB", f"{size_mb:.2f} MB")

tris = 0
for mesh in gltf["meshes"]:
    for prim in mesh["primitives"]:
        if "indices" in prim:
            tris += gltf["accessors"][prim["indices"]]["count"] // 3
        else:
            tris += gltf["accessors"][prim["attributes"]["POSITION"]]["count"] // 3
        attrs = prim["attributes"]
        check("JOINTS_1" not in attrs, "<= 4 influences per vertex")
check(tris <= 35000, "triangles <= 35k", str(tris))
mats = len(gltf.get("materials", []))
check(mats <= 4, "materials <= 4", str(mats))
images = gltf.get("images", [])
if images:
    # Embedded PNGs carry their size in the IHDR chunk; JPEGs are not used here.
    for img in images:
        view = gltf["bufferViews"][img["bufferView"]]
        start = bin_offset + view.get("byteOffset", 0)
        w, h = struct.unpack_from(">II", data, start + 16)
        check(max(w, h) <= 1024, "textures <= 1024 px", f"{img.get('name')}: {w}x{h}")
else:
    check(True, "textures <= 1024 px", "no textures")

# glTF forward is +Z: the eye sockets (second material) must sit on the +Z side.
socket = next(
    gltf["accessors"][p["attributes"]["POSITION"]]
    for mesh in gltf["meshes"] for p in mesh["primitives"]
    if gltf["materials"][p["material"]]["name"] == "CoachSocket"
)
socket_z = (socket["min"][2] + socket["max"][2]) / 2
check(socket_z > 0.05, "Coach faces glTF forward (+Z)", f"eye sockets at z={socket_z:.3f}")

skin = gltf["skins"][0]
joints = skin["joints"]
check(len(joints) <= 70, "joints <= 70", str(len(joints)))
print("INFO joints:", ", ".join(gltf["nodes"][j]["name"] for j in joints))

anims = gltf.get("animations", [])
names = [a.get("name") for a in anims]
check(names == ["demo_loop"], "single clip named demo_loop", str(names))
anim = anims[0]
paths = {ch["target"]["path"] for ch in anim["channels"]}
check("scale" not in paths, "no scale channels", str(sorted(paths)))

node_names = [n.get("name") for n in gltf["nodes"]]
animated_nodes = {node_names[ch["target"]["node"]] for ch in anim["channels"]}
check("root" not in animated_nodes or all(
    node_names[ch["target"]["node"]] != "root" or ch["target"]["path"] == "rotation"
    for ch in anim["channels"]), "root not translated", "")


def read_floats(acc_index):
    acc = gltf["accessors"][acc_index]
    view = gltf["bufferViews"][acc["bufferView"]]
    comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
    start = bin_offset + view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    flat = struct.unpack_from(f"<{acc['count'] * comps}f", data, start)
    return [flat[i:i + comps] for i in range(0, len(flat), comps)]


# Constant channels are trimmed to two keys by the exporter; judge the densest one.
inputs = {s["input"] for s in anim["samplers"]}
times = max(([t[0] for t in read_floats(i)] for i in inputs), key=len)
step = (times[-1] - times[0]) / (len(times) - 1)
check(abs(step - 1 / 30) < 1e-3, "~30 fps keys", f"{len(times)} keys, step {step:.4f}s, {times[-1]:.2f}s long")

worst = 0.0
for ch in anim["channels"]:
    vals = read_floats(anim["samplers"][ch["sampler"]]["output"])
    a, b = vals[0], vals[-1]
    if ch["target"]["path"] == "rotation":
        dot = abs(sum(x * y for x, y in zip(a, b)))
        worst = max(worst, 1 - min(dot, 1.0))
    else:
        worst = max(worst, max(abs(x - y) for x, y in zip(a, b)))
check(worst < 1e-4, "first frame == last frame (seamless loop)", f"max diff {worst:.2e}")

# ---------------------------------------------------------------------------
# Motion checks on the re-imported file
# ---------------------------------------------------------------------------

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30  # import keys onto whole frames at the clip's own rate
bpy.ops.import_scene.gltf(filepath=GLB)
arm = next(o for o in scene.objects if o.type == "ARMATURE")
mesh_obj = next(o for o in scene.objects if o.type == "MESH")
act = arm.animation_data.action
start, end = (int(round(x)) for x in act.frame_range)
scene.frame_start, scene.frame_end = start, end


def world_head(name):
    return arm.matrix_world @ arm.pose.bones[name].head


def world_tail(name):
    return arm.matrix_world @ arm.pose.bones[name].tail


track = {k: [] for k in ["root", "pelvis"] + [f"{b}:{end}" for b in PLANTED for end in ("head", "tail")]}
min_mesh_z = []
bbox_min = Vector((1e9, 1e9, 1e9))
bbox_max = Vector((-1e9, -1e9, -1e9))

# Every vertex should follow exactly one bone rigidly (no collapse, no stretch).
vgroups = [len([g for g in vtx.groups if g.weight > 0]) for vtx in mesh_obj.data.vertices]
check(all(n == 1 for n in vgroups), "every vertex bound to exactly one bone",
      f"{sum(n != 1 for n in vgroups)} of {len(vgroups)} vertices are not")
owner = [mesh_obj.vertex_groups[vtx.groups[0].group].name if vtx.groups else None
         for vtx in mesh_obj.data.vertices]
rest_dist = None
max_stretch = 0.0

for f in range(start, end + 1):
    scene.frame_set(f)
    for k in ("root", "pelvis"):
        track[k].append(world_head(k))
    for b in PLANTED:
        track[f"{b}:head"].append(world_head(b))
        track[f"{b}:tail"].append(world_tail(b))
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh_obj.evaluated_get(dg)
    m = ev.to_mesh()
    world_co = [mesh_obj.matrix_world @ vtx.co for vtx in m.vertices]
    min_mesh_z.append(min(co.z for co in world_co))
    for co in world_co:
        for axis in range(3):
            bbox_min[axis] = min(bbox_min[axis], co[axis])
            bbox_max[axis] = max(bbox_max[axis], co[axis])
    dist = [
        ((mesh_obj.matrix_world @ vtx.co) - world_head(owner[i])).length if owner[i] else 0.0
        for i, vtx in enumerate(m.vertices)
    ]
    if rest_dist is None:
        rest_dist = dist
    else:
        max_stretch = max(max_stretch, max(abs(a - b) for a, b in zip(dist, rest_dist)))
    ev.to_mesh_clear()


def spread(points):
    first = points[0]
    return max((p - first).length for p in points)


for b in PLANTED:
    moved = max(spread(track[f"{b}:head"]), spread(track[f"{b}:tail"]))
    check(moved < 0.002, f"{b} planted", f"moves {moved * 1000:.2f} mm")
if not PLANTED:
    print("INFO no planted bones checked for this clip")
check(max_stretch < 1e-3, "mesh stays rigid on its bones (no joint collapse)", f"max stretch {max_stretch * 1000:.2f} mm")
check(spread(track["root"]) < 1e-5, "root stays in place", f"moves {spread(track['root']) * 1000:.3f} mm")
pz = [p.z for p in track["pelvis"]]
print(f"INFO pelvis height {max(pz):.3f} -> {min(pz):.3f} m (drop {max(pz) - min(pz):.3f})")
print(f"INFO lowest vertex z: {min(min_mesh_z):.4f} .. {max(min_mesh_z):.4f} m")
check(min(min_mesh_z) > -0.01, "nothing sinks below the floor", f"{min(min_mesh_z):.4f}")

# ---------------------------------------------------------------------------
# Optional preview renders
# ---------------------------------------------------------------------------

if RENDER_DIR:
    import numpy as np

    os.makedirs(RENDER_DIR, exist_ok=True)
    TILE = 320
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = TILE
    scene.render.resolution_y = TILE
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("bg")
    scene.world = world
    world.color = (0.12, 0.1, 0.16)

    # Floor reference, sized to the motion, so floor contact is easy to judge.
    center = (bbox_min + bbox_max) / 2
    extent = bbox_max - bbox_min
    floor = max(extent.x, extent.y) + 0.8
    bpy.ops.mesh.primitive_plane_add(size=floor, location=(center.x, center.y, 0))

    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    # Orthographic views framed on the whole motion; glTF import keeps the
    # Coach facing -Y in Blender (Z-up).
    look_z = (bbox_min.z + bbox_max.z) / 2
    views = {
        "front": ((center.x, center.y - 8, look_z), (90, 0, 0), max(extent.x, extent.z)),
        "side": ((center.x + 8, center.y, look_z), (90, 0, 90), max(extent.y, extent.z)),
        "back": ((center.x, center.y + 8, look_z), (90, 0, 180), max(extent.x, extent.z)),
        "3q": ((center.x + 5.5, center.y - 5.5, look_z + 2.6), (70, 0, 45), None),
    }
    length = end - start
    frames = [start + round(length * k / 6) for k in range(6)]
    tiles = {}
    for vname, (loc, rot, span) in views.items():
        cam.location = loc
        cam.rotation_euler = [math.radians(a) for a in rot]
        if span is None:
            cam_data.type = "PERSP"
            cam_data.lens = 50 * 2.0 / max(extent.length * 0.75, 1.0)
        else:
            cam_data.type = "ORTHO"
            cam_data.ortho_scale = span * 1.15 + 0.1
        for f in frames:
            scene.frame_set(f)
            path = os.path.join(RENDER_DIR, f"{vname}_{f:03d}.png")
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            tiles[(vname, f)] = path

    # One contact sheet: a row per view, a column per frame.
    names = list(views)
    sheet = np.zeros((len(names) * TILE, len(frames) * TILE, 4), dtype=np.float32)
    for r, vname in enumerate(names):
        for c, f in enumerate(frames):
            img = bpy.data.images.load(tiles[(vname, f)])
            px = np.empty(TILE * TILE * 4, dtype=np.float32)
            img.pixels.foreach_get(px)
            # Blender image rows run bottom-up; place row 0 of the view at the top.
            y0 = (len(names) - 1 - r) * TILE
            sheet[y0:y0 + TILE, c * TILE:(c + 1) * TILE] = px.reshape(TILE, TILE, 4)
            bpy.data.images.remove(img)
    out = bpy.data.images.new("sheet", len(frames) * TILE, len(names) * TILE, alpha=True)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(RENDER_DIR, "sheet.png")
    out.file_format = "PNG"
    out.save()
    print("RENDERS", RENDER_DIR, "rows:", names, "frames:", frames)

print("RESULT", "FAIL" if failures else "PASS", failures)
sys.exit(1 if failures else 0)
