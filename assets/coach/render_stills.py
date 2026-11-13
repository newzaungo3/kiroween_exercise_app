"""Render the front / side / back Still_Images for Coach clips.

    blender -b --factory-startup --python assets/coach/render_stills.py -- [clip ...]

Reads assets/coach/coach_<clip>.glb, poses it at the clip's key frame and writes
public/assets/coach/stills/<clip>_{front,side,back}.png: 360 x 480 PNGs on the
night-purple background of the Grave Rise stills, each well under 300 KB.
The Still_Images are the fallback when 3D cannot load, so each shows the pose
that best explains the move.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "..", "public", "assets", "coach", "stills")

# clip: loop frame (0-based, 30 fps) showing the key pose
KEY_FRAMES = {
    "skeleton_jacks": 15,        # landed wide, arms overhead
    "coffin_push": 22,           # halfway down, plank and elbows readable
    "stretch_side_reach": 86,    # holding the lean to the Coach's left
    "stretch_forward_fold": 115, # holding the fold
}

BACKGROUND = (18 / 255, 11 / 255, 31 / 255)  # sRGB of the Grave Rise stills
WIDTH, HEIGHT = 360, 480
FRAME_M = 2.15  # metres of scene the frame height covers; the standing Coach fills ~85%


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def setup_scene():
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "SINGLE"
    scene.display.shading.single_color = (0.62, 0.58, 0.78)  # lavender bone
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "WORLD"
    scene.display.shading.background_type = "VIEWPORT"
    scene.display.shading.background_color = tuple(srgb_to_linear(c) for c in BACKGROUND)
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 100
    world = bpy.data.worlds.new("bg")
    world.color = tuple(srgb_to_linear(c) for c in BACKGROUND)
    scene.world = world
    return scene


def mesh_bbox(mesh_obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh_obj.evaluated_get(dg)
    m = ev.to_mesh()
    pts = [mesh_obj.matrix_world @ v.co for v in m.vertices]
    ev.to_mesh_clear()
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def render_clip(clip):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = setup_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, f"coach_{clip}.glb"))
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    mesh_obj = next(o for o in scene.objects if o.type == "MESH")
    start = int(round(arm.animation_data.action.frame_range[0]))
    scene.frame_set(start + KEY_FRAMES[clip])
    lo, hi = mesh_bbox(mesh_obj)
    center = (lo + hi) / 2
    size = hi - lo

    cam_data = bpy.data.cameras.new("cam")
    cam_data.sensor_fit = "VERTICAL"
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    # glTF import keeps the Coach facing -Y in Blender (Z-up).
    distance = 8.0
    views = {
        "front": (Vector((0, -1, 0)), (90, 0, 0), size.x),
        "side": (Vector((1, 0, 0)), (90, 0, 90), size.y),
        "back": (Vector((0, 1, 0)), (90, 0, 180), size.x),
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    for view, (direction, rot, width) in views.items():
        # Keep the Coach at the Grave Rise stills' scale (frame height FRAME_M);
        # zoom out only when the pose would not fit the 3:4 frame with a margin.
        needed = max(size.z, width * HEIGHT / WIDTH) / 0.85
        frame_h = max(FRAME_M, needed)
        cam_data.lens = cam_data.sensor_height * distance / frame_h
        # Keep the floor near the bottom edge, as in the standing stills.
        look = Vector((center.x, center.y, max(center.z, frame_h / 2 - 0.12)))
        cam.location = look + direction * distance
        cam.rotation_euler = [math.radians(a) for a in rot]
        path = os.path.join(OUT_DIR, f"{clip}_{view}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        print("WROTE", os.path.normpath(path), f"{os.path.getsize(path) // 1024} KB")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    clips = argv or list(KEY_FRAMES)
    for clip in clips:
        if clip not in KEY_FRAMES:
            raise SystemExit(f"no key frame for {clip!r}; choose from {list(KEY_FRAMES)}")
        render_clip(clip)


if __name__ == "__main__":
    main()
