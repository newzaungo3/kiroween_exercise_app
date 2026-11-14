"""Build the skeleton Coach and its looping demo clips.

Run headless from the repository root (all clips, or name some):

    blender -b --factory-startup --python assets/coach/build_coach.py
    blender -b --factory-startup --python assets/coach/build_coach.py -- coffin_push

Clips: grave_rise, skeleton_jacks, coffin_push, stretch_side_reach,
stretch_forward_fold. For each clip <c> it writes, next to this script:
    coach_<c>.blend  - Blender source (rig, mesh, `demo_loop` action)
    coach_<c>.glb    - export, also copied to public/assets/coach/ for the Site

Every clip uses the same rig and mesh. Everything is generated from code
here, so the assets are original and can be rebuilt exactly (ADR 0003).
Conventions:
    * Blender is Z-up and the Coach faces -Y; the glTF exporter turns that
      into Y-up facing +Z, the glTF forward convention.
    * The Coach's left side is +X, so `.L` bones sit at +X.
    * Every mesh piece is rigidly bound to one bone (one influence per vertex),
      so joints cannot collapse or candy-wrap.
    * Every frame is posed analytically and keyed: two-bone IK solves pin
      whatever touches the floor (feet, or hands and toes), so it cannot slide.
"""

import math
import os
import shutil
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(HERE, "..", "..", "public", "assets", "coach")

FPS = 30
CLIP_NAME = "demo_loop"

# ---------------------------------------------------------------------------
# Rig layout (rest pose = relaxed standing pose, metres, Z-up, facing -Y)
# name: (head, tail, parent, deform)
# ---------------------------------------------------------------------------

BONES = {
    "root": ((0, 0, 0), (0, 0, 0.2), None, False),
    "pelvis": ((0, 0, 0.93), (0, 0, 1.05), "root", True),
    "spine": ((0, 0, 1.05), (0, 0, 1.22), "pelvis", True),
    "chest": ((0, 0, 1.22), (0, 0, 1.42), "spine", True),
    "neck": ((0, 0, 1.42), (0, 0, 1.53), "chest", True),
    "head": ((0, 0, 1.53), (0, 0, 1.78), "neck", True),
}
for side, sx in (("L", 1.0), ("R", -1.0)):
    BONES.update(
        {
            f"shoulder.{side}": ((0.03 * sx, 0, 1.39), (0.18 * sx, 0, 1.39), "chest", True),
            f"upper_arm.{side}": ((0.19 * sx, 0, 1.38), (0.225 * sx, 0, 1.10), f"shoulder.{side}", True),
            f"forearm.{side}": ((0.225 * sx, 0, 1.10), (0.245 * sx, 0, 0.85), f"upper_arm.{side}", True),
            f"hand.{side}": ((0.245 * sx, 0, 0.85), (0.25 * sx, 0, 0.72), f"forearm.{side}", True),
            f"thigh.{side}": ((0.10 * sx, 0, 0.93), (0.12 * sx, 0, 0.50), "pelvis", True),
            f"shin.{side}": ((0.12 * sx, 0, 0.50), (0.14 * sx, 0, 0.085), f"thigh.{side}", True),
            f"foot.{side}": ((0.14 * sx, 0, 0.085), (0.145 * sx, -0.13, 0.025), f"shin.{side}", True),
            f"toe.{side}": ((0.145 * sx, -0.13, 0.025), (0.15 * sx, -0.19, 0.02), f"foot.{side}", True),
        }
    )

BONE_COLOR = (0.91, 0.87, 0.77, 1.0)
SOCKET_COLOR = (0.03, 0.02, 0.04, 1.0)


def v(t):
    return Vector(t)


# ---------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    return scene


def make_material(name, color, roughness):
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    mat.diffuse_color = color
    return mat


# ---------------------------------------------------------------------------
# Armature
# ---------------------------------------------------------------------------


def build_armature():
    arm_data = bpy.data.armatures.new("CoachRig")
    arm_obj = bpy.data.objects.new("Coach", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent, deform) in BONES.items():
        eb = arm_data.edit_bones.new(name)
        eb.head = head
        eb.tail = tail
        eb.roll = 0.0
        eb.use_deform = deform
        if parent:
            eb.parent = arm_data.edit_bones[parent]
            eb.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return arm_obj


# ---------------------------------------------------------------------------
# Mesh: low-poly bone pieces, each rigidly bound to one bone
# ---------------------------------------------------------------------------


class Builder:
    def __init__(self, colors=False):
        self.bm = bmesh.new()
        self.deform = self.bm.verts.layers.deform.verify()
        self.groups = []  # bone names, index = vertex group index
        # Optional per-face-corner color, exported as glTF COLOR_0.
        self.color = self.bm.loops.layers.color.new("Color") if colors else None
        self.paint = (1.0, 1.0, 1.0, 1.0)

    def _group(self, bone):
        if bone not in self.groups:
            self.groups.append(bone)
        return self.groups.index(bone)

    def _claim(self, verts, faces, bone, mat):
        gi = self._group(bone)
        for vert in verts:
            vert[self.deform].clear()
            vert[self.deform][gi] = 1.0
        for f in faces:
            f.material_index = mat
            if self.color is not None:
                for loop in f.loops:
                    loop[self.color] = self.paint

    def _claim_op(self, result, bone, mat):
        # Use the verts the op returns: bmesh reuses freed slots, so "the last N
        # verts" is not reliably the new piece.
        verts = result["verts"]
        faces = {f for vert in verts for f in vert.link_faces}
        self._claim(verts, faces, bone, mat)

    def ball(self, bone, center, radius, scale=(1, 1, 1), segs=10, rings=7, mat=0):
        m = Matrix.Translation(v(center)) @ Matrix.Diagonal((*scale, 1.0))
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=rings, radius=radius, matrix=m)
        self._claim_op(res, bone, mat)

    def rod(self, bone, a, b, r1, r2=None, segs=6, mat=0):
        """Tapered cylinder from point a to point b."""
        a, b = v(a), v(b)
        axis = b - a
        rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
        m = Matrix.Translation((a + b) / 2) @ rot
        res = bmesh.ops.create_cone(
            self.bm,
            cap_ends=True,
            segments=segs,
            radius1=r1,
            radius2=r2 if r2 is not None else r1,
            depth=axis.length,
            matrix=m,
        )
        self._claim_op(res, bone, mat)

    def box(self, bone, center, size, rot=None, mat=0):
        m = Matrix.Translation(v(center))
        if rot is not None:
            m = m @ rot.to_4x4()
        m = m @ Matrix.Diagonal((*size, 1.0))
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        self._claim_op(res, bone, mat)

    def ring(self, bone, center, rx, ry, minor, segs=14, tube=5, open_front=0.0, mat=0):
        """Elliptical torus in the XY plane; open_front cuts a gap (radians) at -Y."""
        c = v(center)
        start = -math.pi / 2 + open_front / 2
        span = 2 * math.pi - open_front
        closed = open_front == 0.0
        count = segs if closed else segs + 1
        loops = []
        for i in range(count):
            t = start + span * i / segs
            p = c + Vector((rx * math.cos(t), ry * math.sin(t), 0))
            outward = Vector((math.cos(t) / rx, math.sin(t) / ry, 0)).normalized()
            loop = []
            for j in range(tube):
                s = 2 * math.pi * j / tube
                off = outward * math.cos(s) * minor + Vector((0, 0, math.sin(s) * minor))
                loop.append(self.bm.verts.new(p + off))
            loops.append(loop)
        faces = []
        pairs = range(count) if closed else range(count - 1)
        for i in pairs:
            l0, l1 = loops[i], loops[(i + 1) % count]
            for j in range(tube):
                faces.append(self.bm.faces.new((l0[j], l0[(j + 1) % tube], l1[(j + 1) % tube], l1[j])))
        if not closed:
            for loop in (loops[0], loops[-1]):
                faces.append(self.bm.faces.new(loop))
        self._claim([vert for loop in loops for vert in loop], faces, bone, mat)

    def lathe(self, bone, profile, matrix, segs=16, mat=0, closed=False, warp=None):
        """Revolve a profile [(radius, height), ...] about local Z, placed by `matrix`.

        A final radius of 0 closes the shape with a point; `closed` joins the last
        profile point back to the first (a solid ring); `warp(local_vec)` can bend
        the local shape before it is placed.
        """
        rings = []
        tip = None
        for k, (r, h) in enumerate(profile):
            if r == 0 and k == len(profile) - 1:
                p = Vector((0, 0, h))
                tip = self.bm.verts.new(matrix @ (warp(p) if warp else p))
                continue
            ring = []
            for i in range(segs):
                t = 2 * math.pi * i / segs
                p = Vector((r * math.cos(t), r * math.sin(t), h))
                ring.append(self.bm.verts.new(matrix @ (warp(p) if warp else p)))
            rings.append(ring)
        faces = []
        n = len(rings)
        for k in range(n if closed else n - 1):
            a, b = rings[k], rings[(k + 1) % n]
            for i in range(segs):
                j = (i + 1) % segs
                faces.append(self.bm.faces.new((a[i], a[j], b[j], b[i])))
        if tip is not None:
            last = rings[-1]
            for i in range(segs):
                faces.append(self.bm.faces.new((last[i], last[(i + 1) % segs], tip)))
        verts = [vert for ring in rings for vert in ring] + ([tip] if tip else [])
        self._claim(verts, faces, bone, mat)
        return verts

    def polygon(self, bone, points, mat=0):
        """One flat face through the given points (used for carved-face decals)."""
        verts = [self.bm.verts.new(p) for p in points]
        face = self.bm.faces.new(verts)
        self._claim(verts, [face], bone, mat)

    def to_bone_child(self, name, arm_obj, bone, materials):
        """A rigid mesh parented to `bone` (no skin), so it can be re-attached at runtime."""
        mesh = bpy.data.meshes.new(name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for mat in materials:
            mesh.materials.append(mat)
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = arm_obj
        obj.parent_type = "BONE"
        obj.parent_bone = bone
        bpy.context.view_layer.update()
        obj.matrix_world = Matrix.Identity(4)  # vertices are authored in rest-pose world space
        return obj

    def to_object(self, name, arm_obj, materials):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        mesh = bpy.data.meshes.new(name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for mat in materials:
            mesh.materials.append(mat)
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        for bone in self.groups:
            obj.vertex_groups.new(name=bone)
        obj.parent = arm_obj
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = arm_obj
        return obj


def build_mesh(arm_obj, materials):
    B = Builder()
    SOCKET = 1

    # Skull, jaw, eye sockets and nose (head)
    B.ball("head", (0, 0.005, 1.665), 0.105, scale=(0.95, 1.08, 1.05), segs=14, rings=10)
    B.box("head", (0, -0.055, 1.565), (0.13, 0.08, 0.05))
    for x in (-0.042, 0.042):
        B.ball("head", (x, -0.093, 1.672), 0.03, scale=(1, 0.6, 1.1), segs=8, rings=6, mat=SOCKET)
    B.ball("head", (0, -0.104, 1.632), 0.014, scale=(0.8, 0.5, 1.2), segs=6, rings=4, mat=SOCKET)
    for x in (-0.03, -0.01, 0.01, 0.03):  # teeth
        B.box("head", (x, -0.096, 1.588), (0.016, 0.012, 0.022))

    # Neck vertebrae
    for z in (1.445, 1.48, 1.515):
        B.rod("neck", (0, 0.01, z - 0.012), (0, 0.01, z + 0.012), 0.024, segs=6)

    # Lumbar spine (spine) and pelvis
    for z in (1.065, 1.105, 1.145, 1.185):
        B.rod("spine", (0, 0.035, z - 0.015), (0, 0.035, z + 0.015), 0.028, segs=6)
    B.ring("pelvis", (0, 0.0, 0.985), 0.125, 0.085, 0.032, segs=14, tube=5)
    B.ball("pelvis", (0, 0.035, 1.025), 0.04, segs=8, rings=5)  # sacrum
    for sx in (1, -1):
        B.ball("pelvis", (0.10 * sx, 0, 0.935), 0.045, segs=8, rings=6)  # hip sockets
        B.box("pelvis", (0.085 * sx, -0.02, 1.035), (0.08, 0.05, 0.07),
              rot=Matrix.Rotation(math.radians(-25 * sx), 3, "Y"))  # iliac wings

    # Rib cage (chest): open rings with a sternum, thoracic spine behind
    for i, z in enumerate((1.36, 1.315, 1.27, 1.225)):
        shrink = 1.0 - 0.06 * abs(i - 1)
        B.ring("chest", (0, 0.005, z), 0.135 * shrink, 0.095 * shrink, 0.014,
               segs=14, tube=4, open_front=math.radians(40))
    B.box("chest", (0, -0.093, 1.29), (0.035, 0.02, 0.15))
    for z in (1.24, 1.29, 1.34, 1.39):
        B.rod("chest", (0, 0.06, z - 0.016), (0, 0.06, z + 0.016), 0.024, segs=6)

    for side, sx in (("L", 1.0), ("R", -1.0)):
        # Collarbone (shoulder)
        B.rod(f"shoulder.{side}", (0.03 * sx, -0.06, 1.40), (0.17 * sx, 0, 1.395), 0.014, segs=5)

        # Arm: knobbed bones, two forearm bones, a hand with fingers
        B.ball(f"upper_arm.{side}", (0.19 * sx, 0, 1.38), 0.038, segs=8, rings=6)
        B.rod(f"upper_arm.{side}", (0.19 * sx, 0, 1.37), (0.225 * sx, 0, 1.115), 0.02, 0.017)
        B.ball(f"upper_arm.{side}", (0.225 * sx, 0, 1.105), 0.03, scale=(1.3, 1, 0.9), segs=8, rings=5)
        B.rod(f"forearm.{side}", (0.218 * sx, -0.008, 1.09), (0.238 * sx, -0.008, 0.865), 0.012, 0.01)
        B.rod(f"forearm.{side}", (0.232 * sx, 0.012, 1.09), (0.252 * sx, 0.012, 0.865), 0.011, 0.012)
        B.box(f"hand.{side}", (0.247 * sx, 0, 0.82), (0.025, 0.07, 0.07))
        for k, dy in enumerate((-0.03, -0.01, 0.01, 0.03)):
            length = 0.07 - 0.008 * abs(k - 1.5)
            B.rod(f"hand.{side}", (0.249 * sx, dy, 0.79), (0.252 * sx, dy, 0.79 - length), 0.007, 0.005, segs=4)
        B.rod(f"hand.{side}", (0.245 * sx, -0.04, 0.83), (0.24 * sx, -0.065, 0.78), 0.008, 0.006, segs=4)  # thumb

        # Leg: thigh, knee cap, two shin bones, foot and toes
        B.rod(f"thigh.{side}", (0.10 * sx, 0, 0.92), (0.12 * sx, 0, 0.52), 0.026, 0.021)
        B.ball(f"thigh.{side}", (0.12 * sx, 0, 0.505), 0.036, scale=(1.3, 1, 0.9), segs=8, rings=5)
        B.ball(f"shin.{side}", (0.12 * sx, -0.035, 0.49), 0.022, segs=6, rings=4)  # knee cap
        B.rod(f"shin.{side}", (0.122 * sx, -0.008, 0.48), (0.138 * sx, -0.008, 0.10), 0.019, 0.015)
        B.rod(f"shin.{side}", (0.142 * sx, 0.015, 0.47), (0.152 * sx, 0.012, 0.10), 0.01, segs=5)
        B.ball(f"shin.{side}", (0.14 * sx, 0, 0.095), 0.03, scale=(1.3, 1, 0.8), segs=8, rings=5)  # ankle
        B.box(f"foot.{side}", (0.142 * sx, -0.045, 0.03), (0.075, 0.2, 0.04),
              rot=Matrix.Rotation(math.radians(-6), 3, "X"))
        B.ball(f"foot.{side}", (0.14 * sx, 0.045, 0.035), 0.033, scale=(1, 1.2, 0.9), segs=8, rings=5)  # heel
        for k, dx in enumerate((-0.026, -0.009, 0.009, 0.026)):
            B.rod(f"toe.{side}", ((0.147 + dx) * sx, -0.14, 0.018), ((0.149 + dx) * sx, -0.19, 0.014), 0.009, 0.007, segs=4)

    return B.to_object("CoachBones", arm_obj, materials)


# ---------------------------------------------------------------------------
# Accessories: rigid meshes on the head bone, delivered in their own GLB
# ---------------------------------------------------------------------------

GLOW_COLOR = (0.55, 1.0, 0.3, 1.0)  # ghost-light green
HAT_BLACK = (0.06, 0.04, 0.09, 1.0)
HAT_BAND = (0.36, 0.12, 0.58, 1.0)
HAT_BUCKLE = (0.85, 0.62, 0.16, 1.0)
PUMPKIN_ORANGE = (0.95, 0.42, 0.06, 1.0)
PUMPKIN_STEM = (0.25, 0.36, 0.1, 1.0)

ACCESSORIES = ("accessory_glowing_eyes", "accessory_witch_hat", "accessory_witch_hat_on_pumpkin",
               "accessory_pumpkin_head")


def make_glow_material():
    mat = bpy.data.materials.new("CoachGlow")
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.1, 0.18, 0.05, 1.0)
    bsdf.inputs["Emission Color"].default_value = GLOW_COLOR
    bsdf.inputs["Emission Strength"].default_value = 1.0
    mat.diffuse_color = GLOW_COLOR
    return mat


def make_painted_material():
    """Base color from the mesh's vertex colors, so hat and pumpkin share one material."""
    mat = bpy.data.materials.new("CoachAccessory")
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Color"
    mat.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.7
    return mat


# Pumpkin shell: an ellipsoid with 8 outward ribs that encloses the whole skull.
PUMPKIN_CENTER = Vector((0.0, 0.005, 1.64))
PUMPKIN_RADII = Vector((0.168, 0.172, 0.165))
PUMPKIN_RIBS = 8
PUMPKIN_RIB_DEPTH = 0.06


def _rib(theta):
    return 1.0 + PUMPKIN_RIB_DEPTH * (0.5 + 0.5 * math.cos(PUMPKIN_RIBS * theta))


def pumpkin_front_y(x, z):
    """World y of the pumpkin surface's front (-Y) side at world (x, z)."""
    px, pz = x - PUMPKIN_CENTER.x, z - PUMPKIN_CENTER.z
    y = -PUMPKIN_RADII.y
    for _ in range(8):
        f = _rib(math.atan2(y, px))
        a, b = PUMPKIN_RADII.x * f, PUMPKIN_RADII.y * f
        y = -b * math.sqrt(max(1 - (px / a) ** 2 - (pz / PUMPKIN_RADII.z) ** 2, 0.0))
    return PUMPKIN_CENTER.y + y


def build_accessories(arm_obj, glow, painted):
    GLOW = 0
    objs = []

    # Glowing eyes: two small lights set into the eye sockets.
    B = Builder()
    for x in (-0.042, 0.042):
        B.ball("head", (x, -0.098, 1.672), 0.017, segs=10, rings=6, mat=GLOW)
    objs.append(B.to_bone_child("accessory_glowing_eyes", arm_obj, "head", [glow]))

    # Witch hat: on the bare skull, and a second copy that sits on the pumpkin
    # (the app shows that one when both are equipped).
    objs.append(_witch_hat(arm_obj, painted, "accessory_witch_hat", base_z=1.735))
    objs.append(_witch_hat(arm_obj, painted, "accessory_witch_hat_on_pumpkin", base_z=1.795))

    # Pumpkin head: ribbed shell over the skull, a stem, and a glowing carved face.
    B = Builder(colors=True)
    PAINT, FACE = 0, 1
    B.paint = PUMPKIN_ORANGE
    m = Matrix.Translation(PUMPKIN_CENTER) @ Matrix.Diagonal((*PUMPKIN_RADII, 1.0))
    res = bmesh.ops.create_uvsphere(B.bm, u_segments=32, v_segments=12, radius=1.0, matrix=m)
    for vert in res["verts"]:
        p = vert.co - PUMPKIN_CENTER
        f = _rib(math.atan2(p.y, p.x))
        vert.co = PUMPKIN_CENTER + Vector((p.x * f, p.y * f, p.z))
    B._claim_op(res, "head", PAINT)
    B.paint = PUMPKIN_STEM
    B.rod("head", (0, 0.01, 1.79), (0.012, 0.03, 1.855), 0.024, 0.016, segs=6, mat=PAINT)

    B.paint = (1.0, 1.0, 1.0, 1.0)  # the face glows; keep its vertex color neutral

    def decal(points_xz, lift=0.004):
        B.polygon("head", [Vector((x, pumpkin_front_y(x, z) - lift, z)) for x, z in points_xz], mat=FACE)

    for sx in (-1, 1):  # triangle eyes
        decal([(0.035 * sx, 1.665), (0.095 * sx, 1.665), (0.065 * sx, 1.71)])
    decal([(-0.018, 1.625), (0.018, 1.625), (0.0, 1.65)])  # nose
    mouth = [(-0.1, 1.585), (-0.065, 1.575), (-0.05, 1.59), (-0.03, 1.57), (0.0, 1.565),
             (0.03, 1.57), (0.05, 1.59), (0.065, 1.575), (0.1, 1.585),
             (0.07, 1.545), (0.03, 1.535), (0.0, 1.532), (-0.03, 1.535), (-0.07, 1.545)]
    decal(mouth)
    objs.append(B.to_bone_child("accessory_pumpkin_head", arm_obj, "head", [painted, glow]))
    return objs


def _witch_hat(arm_obj, painted, name, base_z):
    """A brim ring and a crooked cone, tipped back, with its base ring at `base_z`."""
    B = Builder(colors=True)
    place = Matrix.Translation((0, 0.012, base_z)) @ Matrix.Rotation(math.radians(-10), 4, "X")
    B.paint = HAT_BLACK
    B.lathe("head", [(0.108, 0.006), (0.17, 0.004), (0.172, -0.004), (0.108, -0.006)],
            place, segs=20, closed=True)

    def crook(p):
        # Bend the top third of the cone backward (+Y) and let it droop.
        over = max(p.z - 0.17, 0.0)
        return Vector((p.x, p.y + 1.6 * over * over, p.z - 0.6 * over * over))

    cone = [(0.108, 0.0), (0.104, 0.03), (0.09, 0.075), (0.072, 0.12), (0.052, 0.17),
            (0.034, 0.22), (0.018, 0.27), (0.0, 0.31)]
    B.lathe("head", cone, place, segs=16, warp=crook)
    B.paint = HAT_BAND
    B.lathe("head", [(0.111, 0.004), (0.109, 0.03), (0.105, 0.03), (0.107, 0.004)],
            place, segs=16, closed=True)
    B.paint = HAT_BUCKLE
    B.box("head", place @ Vector((0, -0.112, 0.017)), (0.034, 0.008, 0.026),
          rot=place.to_3x3())
    return B.to_bone_child(name, arm_obj, "head", [painted])


def build_accessory_asset():
    """coach_accessories.blend/.glb: the rig in rest pose with every Accessory on `head`."""
    reset_scene()
    body_mats = [make_material("CoachBone", BONE_COLOR, 0.65),
                 make_material("CoachSocket", SOCKET_COLOR, 0.9)]
    arm_obj = build_armature()
    body = build_mesh(arm_obj, body_mats)  # kept in the .blend for context, not exported
    accessories = build_accessories(arm_obj, make_glow_material(), make_painted_material())

    blend_path = os.path.join(HERE, "coach_accessories.blend")
    glb_path = os.path.join(HERE, "coach_accessories.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)

    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(False)
    arm_obj.select_set(True)
    for obj in accessories:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_materials="EXPORT",
        export_vertex_color="MATERIAL",
        export_skins=False,
        export_animations=False,
        export_def_bones=False,
        export_leaf_bone=False,
        export_rest_position_armature=True,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
    )
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    shutil.copyfile(glb_path, os.path.join(PUBLIC_DIR, "coach_accessories.glb"))
    print("WROTE", blend_path)
    print("WROTE", glb_path, "+ public/assets/coach copy")


# ---------------------------------------------------------------------------
# Posing toolkit: armature-space matrices, built top-down each frame
# ---------------------------------------------------------------------------


def smooth(x):
    x = min(max(x, 0.0), 1.0)
    return 0.5 - 0.5 * math.cos(math.pi * x)


def track(i, keys):
    """Value at frame i from [(frame, value), ...], eased between keys."""
    if i <= keys[0][0]:
        return keys[0][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if i <= f1:
            return v0 + (v1 - v0) * smooth((i - f0) / (f1 - f0))
    return keys[-1][1]


def rotate_about_head(m, axis, angle):
    head = m.translation.copy()
    r = Matrix.Rotation(angle, 4, axis) @ m.to_3x3().to_4x4()
    r.translation = head
    return r


def aim(inherited, direction):
    """Rotate `inherited` about its head so its Y axis points along `direction`."""
    cur = inherited.col[1].xyz.normalized()
    q = cur.rotation_difference(direction.normalized())
    head = inherited.translation.copy()
    rotated = q.to_matrix().to_4x4() @ inherited.to_3x3().to_4x4()
    rotated.translation = head
    return rotated


def solve_knee(hip, ankle, l1, l2, pole):
    """Middle joint of a two-bone chain from `hip` to `ankle`, bending toward `pole`."""
    d_vec = ankle - hip
    d = min(d_vec.length, (l1 + l2) * 0.9999)
    u = d_vec.normalized()
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    p = (pole - u * pole.dot(u)).normalized()
    return hip + u * a + p * h


def frame_rotation(src_a, src_b, dst_a, dst_b):
    """Rotation taking direction src_a onto dst_a, and src_b (as near as possible) onto dst_b."""
    def basis(a, b):
        a = a.normalized()
        c = a.cross(b).normalized()
        b = c.cross(a)
        return Matrix((a, b, c)).transposed()
    return basis(dst_a, dst_b) @ basis(src_a, src_b).transposed()


SIDES = (("L", 1.0), ("R", -1.0))


class Poser:
    """Builds one frame's armature-space bone matrices.

    Set bones parent-first; any bone not set follows its parent rigidly.
    Rotations are about world axes (the Coach faces -Y, its left is +X, up is +Z):
    +X rotation leans the torso forward, +Y rotation leans it to the Coach's left.
    """

    def __init__(self, arm_obj):
        self.bones = arm_obj.data.bones
        self.rest = {b.name: b.matrix_local.copy() for b in self.bones}
        self.out = {}

    def get(self, name):
        if name not in self.out:
            self.out[name] = self.inherited(name)
        return self.out[name]

    def inherited(self, name):
        b = self.bones[name]
        if b.parent is None:
            return self.rest[name].copy()
        p = b.parent.name
        return self.get(p) @ self.rest[p].inverted() @ self.rest[name]

    def length(self, name):
        return self.bones[name].length

    def rest_dir(self, name):
        return self.rest[name].col[1].xyz.normalized()

    def rest_tail(self, name):
        return self.rest[name] @ Vector((0, self.length(name), 0))

    def body_turn(self, name="chest"):
        """How far `name` has turned from rest, as a world rotation (3x3)."""
        return self.get(name).to_3x3() @ self.rest[name].to_3x3().inverted()

    def set(self, name, m):
        self.out[name] = m

    def bend(self, name, axis, angle):
        self.out[name] = rotate_about_head(self.inherited(name), axis, angle)

    def aim(self, name, direction, head=None):
        m = self.inherited(name)
        if head is not None:
            m.translation = head
        self.out[name] = aim(m, direction)

    def place(self, name, rot3, head):
        m = rot3.to_4x4()
        m.translation = head
        self.out[name] = m

    def leg(self, side, ankle, pole, foot_rot=None):
        """Pin the ankle at `ankle`; the foot keeps `foot_rot` (default: flat, as at rest)."""
        hip = self.inherited(f"thigh.{side}").translation.copy()
        knee = solve_knee(hip, ankle, self.length(f"thigh.{side}"), self.length(f"shin.{side}"), pole)
        self.aim(f"thigh.{side}", knee - hip)
        self.aim(f"shin.{side}", ankle - knee, head=knee)
        rot = foot_rot if foot_rot is not None else self.rest[f"foot.{side}"].to_3x3()
        self.place(f"foot.{side}", rot, ankle)

    def arm(self, side, wrist, pole, hand_rot):
        """Pin the wrist at `wrist` with the hand held at `hand_rot`."""
        shoulder = self.inherited(f"upper_arm.{side}").translation.copy()
        elbow = solve_knee(shoulder, wrist, self.length(f"upper_arm.{side}"),
                           self.length(f"forearm.{side}"), pole)
        self.aim(f"upper_arm.{side}", elbow - shoulder)
        self.aim(f"forearm.{side}", wrist - elbow, head=elbow)
        self.place(f"hand.{side}", hand_rot, wrist)

    def finish(self):
        for b in self.bones:
            self.get(b.name)
        return self.out


# ---------------------------------------------------------------------------
# Clips. Each pose function returns the bone matrices for loop frame i
# (0 <= i < loop length); frame `loop length` is keyed as a copy of frame 0.
# ---------------------------------------------------------------------------


def breathe(i, period, degrees):
    """A small chest rise repeating every `period` frames, so holds never freeze."""
    return math.radians(degrees) * math.sin(2 * math.pi * i / period)


# Grave Rise (air squat): stand, descend, hold, rise. -------------------------

def pose_grave_rise(arm_obj, i):
    s = track(i, [(0, 0), (6, 0), (36, 1), (42, 1), (68, 0)])
    P = Poser(arm_obj)
    m = rotate_about_head(P.inherited("pelvis"), "X", math.radians(16) * s)
    m.translation += Vector((0, 0.15 * s, -0.40 * s))
    P.set("pelvis", m)
    P.bend("spine", "X", math.radians(12) * s)
    P.bend("chest", "X", math.radians(8) * s)
    P.bend("neck", "X", math.radians(-14) * s)
    P.bend("head", "X", math.radians(-12) * s)
    for side, sx in SIDES:
        # Arms swing from hanging to reaching forward, slightly below horizontal.
        hang = P.rest_dir(f"upper_arm.{side}")
        reach = Vector((0.04 * sx, -1.0, -0.12)).normalized()
        P.aim(f"upper_arm.{side}", hang.slerp(reach, smooth(s)) if s > 0 else hang)
        P.leg(side, P.rest_tail(f"shin.{side}"), Vector((0.18 * sx, -1.0, 0.0)))
    return P.finish()


# Skeleton Jacks (jumping jacks) ---------------------------------------------
# 32 frames: closed landing -> hop open -> open landing -> hop closed.
# Feet change position only while airborne, so they never slide on the floor.

JACK_AIR = ((4, 11), (20, 27))
JACK_CONTACT = ((27, 9), (11, 9))  # (start frame, length) of each floor contact; the first wraps
JACK_HOP = 0.07


def pose_skeleton_jacks(arm_obj, i):
    loop = 32
    open_ = track(i, [(0, 0), (4, 0), (11, 1), (20, 1), (27, 0), (32, 0)])
    air = 0.0
    for a, b in JACK_AIR:
        if a <= i <= b:
            air = JACK_HOP * math.sin(math.pi * (i - a) / (b - a))
    dip = 0.0
    for start, length in JACK_CONTACT:
        phase = (i - start) % loop
        if phase <= length:
            dip = 0.04 * math.sin(math.pi * phase / length)

    P = Poser(arm_obj)
    m = P.inherited("pelvis")
    m.translation += Vector((0, 0, -0.025 - 0.05 * open_ - dip + air))
    P.set("pelvis", m)
    P.bend("spine", "X", math.radians(4) * dip / 0.04)
    for side, sx in SIDES:
        # Arms sweep out to the side up to a wide V overhead, clear of any hat or pumpkin.
        alpha = math.radians(8 + 162 * open_)
        P.aim(f"upper_arm.{side}", Vector((sx * math.sin(alpha), -0.06, -math.cos(alpha))))
        rest_ankle = P.rest_tail(f"shin.{side}")
        ankle = Vector((sx * (0.14 + 0.18 * open_), rest_ankle.y, rest_ankle.z + air))
        point = math.radians(18) * (air / JACK_HOP)  # toes point down a little in the air
        foot_rot = Matrix.Rotation(point, 3, "X") @ P.rest[f"foot.{side}"].to_3x3()
        P.leg(side, ankle, Vector((0.35 * sx, -1.0, 0.0)), foot_rot)
    return P.finish()


# Coffin Push (push-up) ------------------------------------------------------
# The straight body pivots about the toe joints; hands stay planted under the
# shoulders, so nothing touching the floor slides.

PUSH_WRIST_Z = 0.018


def _push_pivot(P):
    return P.rest["toe.L"].translation.copy()  # both toe joints lie on this X-axis line


def _push_shoulder(P, side, phi):
    pivot = _push_pivot(P)
    rel = P.rest[f"upper_arm.{side}"].translation - pivot
    return pivot + Matrix.Rotation(phi, 3, "X") @ rel


def _push_phi(P, shoulder_z):
    """Body tilt (radians from upright) that puts the shoulders at `shoulder_z`."""
    lo, hi = 0.0, math.radians(89)
    for _ in range(60):
        mid = (lo + hi) / 2
        if _push_shoulder(P, "L", mid).z > shoulder_z:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def pose_coffin_push(arm_obj, i):
    s = track(i, [(0, 0), (8, 0), (35, 1), (39, 1), (64, 0)])
    P = Poser(arm_obj)
    reach = P.length("upper_arm.L") + P.length("forearm.L")
    phi_top = _push_phi(P, PUSH_WRIST_Z + 0.985 * reach)
    phi_bottom = _push_phi(P, 0.27)  # chest a fist above the floor, elbows near 90 degrees
    phi = phi_top + (phi_bottom - phi_top) * s

    pivot = _push_pivot(P)
    turn = Matrix.Rotation(phi, 4, "X")
    P.set("pelvis", Matrix.Translation(pivot) @ turn @ Matrix.Translation(-pivot) @ P.rest["pelvis"])
    P.bend("head", "X", math.radians(6))  # neutral neck, gaze at the floor ahead of the hands
    for side, sx in SIDES:
        top = _push_shoulder(P, side, phi_top)
        wrist = Vector((top.x + 0.07 * sx, top.y, PUSH_WRIST_Z))
        # Palm flat, fingers forward: rest fingers (down) -> forward, inner palm -> floor.
        hand_rot = frame_rotation(Vector((0, 0, -1)), Vector((-sx, 0, 0)),
                                  Vector((0.12 * sx, -1, 0)), Vector((0, 0, -1))) @ P.rest[f"hand.{side}"].to_3x3()
        # Elbows bend back toward the feet at about 45 degrees, not flared out wide.
        P.arm(side, wrist, Vector((0.45 * sx, 1.0, 0.35)), hand_rot)
        # Toes stay flat on the floor while the foot rolls over them.
        P.place(f"toe.{side}", P.rest[f"toe.{side}"].to_3x3(), P.rest[f"toe.{side}"].translation)
    return P.finish()


# Stretch: overhead side reach ----------------------------------------------
# Arms up, lean to the Coach's left and hold, back, lean right and hold, arms down.

def pose_stretch_side_reach(arm_obj, i):
    arms = track(i, [(0, 0), (8, 0), (32, 1), (248, 1), (272, 0), (280, 0)])
    lean = track(i, [(0, 0), (32, 0), (56, 1), (116, 1), (140, 0), (164, -1), (224, -1), (248, 0), (280, 0)])
    P = Poser(arm_obj)
    m = rotate_about_head(P.inherited("pelvis"), "Y", math.radians(5) * lean)
    m.translation += Vector((-0.045 * lean, 0, -0.01 * abs(lean)))
    P.set("pelvis", m)
    P.bend("spine", "Y", math.radians(13) * lean)
    m = rotate_about_head(P.inherited("chest"), "Y", math.radians(14) * lean)
    P.set("chest", rotate_about_head(m, "X", -breathe(i, 70, 1.5)))
    P.bend("neck", "Y", math.radians(4) * lean)
    turn = P.body_turn("chest")
    for side, sx in SIDES:
        # Arms in a wide V that leans with the torso; the outer arm reaches a little
        # further over but stays outside the head, so Accessories never clip.
        outer = sx * lean < 0
        overhead = Vector((0.24 * sx + lean * (0.1 if outer else 0.0), -0.04, 1.0))
        body_dir = P.rest_dir(f"upper_arm.{side}").slerp(overhead.normalized(), arms)
        P.aim(f"upper_arm.{side}", turn @ body_dir)
        P.leg(side, P.rest_tail(f"shin.{side}"), Vector((0.15 * sx, -1.0, 0.0)))
    return P.finish()


# Stretch: standing forward fold --------------------------------------------
# Hinge down with soft knees, hang and breathe, then roll up hips first, head last.

def pose_stretch_forward_fold(arm_obj, i):
    hips = track(i, [(0, 0), (10, 0), (70, 1), (160, 1), (200, 0), (240, 0)])
    back = track(i, [(0, 0), (10, 0), (70, 1), (170, 1), (210, 0), (240, 0)])
    head = track(i, [(0, 0), (10, 0), (70, 1), (180, 1), (220, 0), (240, 0)])
    P = Poser(arm_obj)
    m = rotate_about_head(P.inherited("pelvis"), "X", math.radians(55) * hips)
    m.translation += Vector((0, 0.14 * hips, -0.05 * hips))
    P.set("pelvis", m)
    P.bend("spine", "X", math.radians(20) * back + breathe(i, 60, 1.2) * back)
    P.bend("chest", "X", math.radians(20) * back)
    P.bend("neck", "X", math.radians(15) * head)
    P.bend("head", "X", math.radians(8) * head)
    for side, sx in SIDES:
        # Arms hang with gravity the whole time.
        P.aim(f"upper_arm.{side}", Vector((0.03 * sx, -0.08 * back, -1.0)))
        P.leg(side, P.rest_tail(f"shin.{side}"), Vector((0.15 * sx, -1.0, 0.0)))
    return P.finish()


# name: (pose function, loop length in frames at 30 fps)
CLIPS = {
    "grave_rise": (pose_grave_rise, 68),
    "skeleton_jacks": (pose_skeleton_jacks, 32),
    "coffin_push": (pose_coffin_push, 64),
    "stretch_side_reach": (pose_stretch_side_reach, 280),
    "stretch_forward_fold": (pose_stretch_forward_fold, 240),
}


# ---------------------------------------------------------------------------
# Keying and export
# ---------------------------------------------------------------------------


def to_basis(arm_obj, pose):
    """Convert armature-space bone matrices into local pose (basis) matrices."""
    basis = {}
    for b in arm_obj.data.bones:
        rest = b.matrix_local
        if b.parent is None:
            inh = rest
        else:
            inh = pose[b.parent.name] @ b.parent.matrix_local.inverted() @ rest
        basis[b.name] = inh.inverted() @ pose[b.name]
    return basis


def animate(arm_obj, pose_fn, loop_frames):
    scene = bpy.context.scene
    arm_obj.animation_data_create()
    action = bpy.data.actions.new(CLIP_NAME)
    action.use_fake_user = True
    arm_obj.animation_data.action = action

    prev = {}
    # Frames 1 .. loop_frames+1; the last frame repeats the first, so the loop is seamless.
    for i in range(loop_frames + 1):
        frame = i + 1
        basis = to_basis(arm_obj, pose_fn(arm_obj, i % loop_frames))
        for pb in arm_obj.pose.bones:
            loc, rot, _scale = basis[pb.name].decompose()
            q = Quaternion(rot)
            if pb.name in prev:
                q.make_compatible(prev[pb.name])
            prev[pb.name] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=frame, group=pb.name)
            if pb.name == "pelvis":
                pb.location = loc
                pb.keyframe_insert("location", frame=frame, group=pb.name)

    for fc in iter_fcurves(action):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"

    scene.frame_start = 1
    scene.frame_end = loop_frames + 1
    scene.frame_set(1)
    return action


def iter_fcurves(action):
    """F-curves of an action, for both legacy and layered (slotted) actions."""
    if hasattr(action, "layers") and len(action.layers):
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    yield from bag.fcurves
    elif hasattr(action, "fcurves"):
        yield from action.fcurves


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_materials="EXPORT",
        export_skins=True,
        export_influence_nb=4,
        export_all_influences=False,
        export_def_bones=False,
        export_leaf_bone=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_step=1,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=False,
        export_anim_slide_to_zero=True,
        export_rest_position_armature=True,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
    )


def build_clip(clip):
    pose_fn, loop_frames = CLIPS[clip]
    reset_scene()
    materials = [
        make_material("CoachBone", BONE_COLOR, 0.65),
        make_material("CoachSocket", SOCKET_COLOR, 0.9),
    ]
    arm_obj = build_armature()
    build_mesh(arm_obj, materials)
    animate(arm_obj, pose_fn, loop_frames)

    blend_path = os.path.join(HERE, f"coach_{clip}.blend")
    glb_path = os.path.join(HERE, f"coach_{clip}.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    export_glb(glb_path)
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    shutil.copyfile(glb_path, os.path.join(PUBLIC_DIR, f"coach_{clip}.glb"))
    print("WROTE", blend_path)
    print("WROTE", glb_path, "+ public/assets/coach copy")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    targets = argv or [*CLIPS, "accessories"]
    unknown = [t for t in targets if t not in CLIPS and t != "accessories"]
    if unknown:
        raise SystemExit(f"unknown target(s) {unknown}; choose from {[*CLIPS, 'accessories']}")
    for target in targets:
        if target == "accessories":
            build_accessory_asset()
        else:
            build_clip(target)


if __name__ == "__main__":
    main()
