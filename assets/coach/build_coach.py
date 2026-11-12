"""Build the skeleton Coach and its Grave Rise (air squat) loop.

Run headless from the repository root:

    blender -b --factory-startup --python assets/coach/build_coach.py

Writes, next to this script:
    coach_grave_rise.blend  - Blender source (rig, mesh, `demo_loop` action)
    coach_grave_rise.glb    - export for the Site

Everything is generated from code here, so the asset is original and can be
rebuilt exactly (ADR 0003). Conventions:
    * Blender is Z-up and the Coach faces -Y; the glTF exporter turns that
      into Y-up facing +Z, the glTF forward convention.
    * The Coach's left side is +X, so `.L` bones sit at +X.
    * Every mesh piece is rigidly bound to one bone (one influence per vertex),
      so joints cannot collapse or candy-wrap.
    * The squat is posed analytically each frame: a two-bone IK solve keeps the
      ankles fixed and the feet flat, so the feet cannot slide.
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
BLEND_PATH = os.path.join(HERE, "coach_grave_rise.blend")
GLB_PATH = os.path.join(HERE, "coach_grave_rise.glb")

FPS = 30
CLIP_NAME = "demo_loop"
FORWARD = Vector((0.0, -1.0, 0.0))

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
    def __init__(self):
        self.bm = bmesh.new()
        self.deform = self.bm.verts.layers.deform.verify()
        self.groups = []  # bone names, index = vertex group index

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
# Animation: analytic posing, one key per frame
# ---------------------------------------------------------------------------


def smooth(x):
    x = min(max(x, 0.0), 1.0)
    return 0.5 - 0.5 * math.cos(math.pi * x)


# Timeline (frames at 30 fps): stand, descend, hold at the bottom, rise, stand.
T_TOP_HOLD = 6
T_DOWN = 30
T_BOTTOM_HOLD = 6
T_UP = 26
LOOP_FRAMES = T_TOP_HOLD + T_DOWN + T_BOTTOM_HOLD + T_UP  # 68 frames ~ 2.27 s


def depth_at(i):
    """Squat depth 0 (standing) .. 1 (bottom) at loop frame i."""
    t = i
    if t < T_TOP_HOLD:
        return 0.0
    t -= T_TOP_HOLD
    if t < T_DOWN:
        return smooth(t / T_DOWN)
    t -= T_DOWN
    if t < T_BOTTOM_HOLD:
        return 1.0
    t -= T_BOTTOM_HOLD
    if t < T_UP:
        return 1.0 - smooth(t / T_UP)
    return 0.0


def pose_params(s):
    return {
        "hip_drop": 0.40 * s,
        "hip_back": 0.15 * s,
        "pelvis_tilt": math.radians(16) * s,
        "spine_bend": math.radians(12) * s,
        "chest_bend": math.radians(8) * s,
        "neck_bend": math.radians(-14) * s,
        "head_bend": math.radians(-12) * s,
        # Arms swing from hanging to reaching forward, slightly below horizontal.
        "arm_reach": s,
    }


def world_rot(axis, angle):
    return Matrix.Rotation(angle, 4, axis)


def aim(inherited, direction):
    """Rotate `inherited` about its head so its Y axis points along `direction`."""
    cur = inherited.col[1].xyz.normalized()
    q = cur.rotation_difference(direction.normalized())
    head = inherited.translation.copy()
    rotated = q.to_matrix().to_4x4() @ inherited.to_3x3().to_4x4()
    rotated.translation = head
    return rotated


def solve_knee(hip, ankle, l1, l2, pole):
    d_vec = ankle - hip
    d = min(d_vec.length, (l1 + l2) * 0.9999)
    u = d_vec.normalized()
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    p = (pole - u * pole.dot(u)).normalized()
    return hip + u * a + p * h


def compute_pose(arm_obj, s):
    """Armature-space matrices for every bone at squat depth s."""
    bones = arm_obj.data.bones
    rest = {b.name: b.matrix_local.copy() for b in bones}
    prm = pose_params(s)
    out = {}

    def inherited(name):
        b = bones[name]
        if b.parent is None:
            return rest[name].copy()
        p = b.parent.name
        return out[p] @ rest[p].inverted() @ rest[name]

    def rotate_about_head(m, axis, angle):
        head = m.translation.copy()
        r = world_rot(axis, angle) @ m.to_3x3().to_4x4()
        r.translation = head
        return r

    out["root"] = rest["root"].copy()

    m = inherited("pelvis")
    m = rotate_about_head(m, "X", prm["pelvis_tilt"])
    m.translation += Vector((0, prm["hip_back"], -prm["hip_drop"]))
    out["pelvis"] = m

    out["spine"] = rotate_about_head(inherited("spine"), "X", prm["spine_bend"])
    out["chest"] = rotate_about_head(inherited("chest"), "X", prm["chest_bend"])
    out["neck"] = rotate_about_head(inherited("neck"), "X", prm["neck_bend"])
    out["head"] = rotate_about_head(inherited("head"), "X", prm["head_bend"])

    for side, sx in (("L", 1.0), ("R", -1.0)):
        out[f"shoulder.{side}"] = inherited(f"shoulder.{side}")

        # Arms: blend the hanging direction toward reaching forward.
        r = prm["arm_reach"]
        hang = (rest[f"upper_arm.{side}"].col[1].xyz).normalized()
        reach = Vector((0.04 * sx, -1.0, -0.12)).normalized()
        direction = hang.slerp(reach, smooth(r)) if r > 0 else hang
        out[f"upper_arm.{side}"] = aim(inherited(f"upper_arm.{side}"), direction)
        out[f"forearm.{side}"] = inherited(f"forearm.{side}")
        out[f"hand.{side}"] = inherited(f"hand.{side}")

        # Legs: analytic two-bone IK with the ankle pinned at its rest spot.
        thigh_rest = bones[f"thigh.{side}"]
        shin_rest = bones[f"shin.{side}"]
        l1 = thigh_rest.length
        l2 = shin_rest.length
        ankle = rest[f"shin.{side}"] @ Vector((0, l2, 0))
        hip_m = inherited(f"thigh.{side}")
        hip = hip_m.translation.copy()
        pole = Vector((0.18 * sx, -1.0, 0.0))  # knees forward and a little out
        knee = solve_knee(hip, ankle, l1, l2, pole)

        thigh = aim(hip_m, knee - hip)
        out[f"thigh.{side}"] = thigh
        shin_inh = inherited(f"shin.{side}")
        shin_inh.translation = knee
        out[f"shin.{side}"] = aim(shin_inh, ankle - knee)

        # Feet stay flat: keep the rest orientation, pinned to the ankle.
        foot = rest[f"foot.{side}"].copy()
        foot.translation = ankle
        out[f"foot.{side}"] = foot
        out[f"toe.{side}"] = inherited(f"toe.{side}")

    return out


def to_basis(arm_obj, pose):
    """Convert armature-space bone matrices into local pose (basis) matrices."""
    bones = arm_obj.data.bones
    basis = {}
    for b in bones:
        rest = b.matrix_local
        if b.parent is None:
            inh = rest
        else:
            inh = pose[b.parent.name] @ b.parent.matrix_local.inverted() @ rest
        basis[b.name] = inh.inverted() @ pose[b.name]
    return basis


def animate(arm_obj):
    scene = bpy.context.scene
    arm_obj.animation_data_create()
    action = bpy.data.actions.new(CLIP_NAME)
    action.use_fake_user = True
    arm_obj.animation_data.action = action

    prev = {}
    # Frames 1 .. LOOP_FRAMES+1; the last frame equals the first, so the loop is seamless.
    for i in range(LOOP_FRAMES + 1):
        frame = i + 1
        s = depth_at(i % LOOP_FRAMES)
        basis = to_basis(arm_obj, compute_pose(arm_obj, s))
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
    scene.frame_end = LOOP_FRAMES + 1
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


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    reset_scene()
    materials = [
        make_material("CoachBone", BONE_COLOR, 0.65),
        make_material("CoachSocket", SOCKET_COLOR, 0.9),
    ]
    arm_obj = build_armature()
    build_mesh(arm_obj, materials)
    animate(arm_obj)

    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH, compress=True)

    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH,
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
    print("WROTE", BLEND_PATH)
    print("WROTE", GLB_PATH)


if __name__ == "__main__":
    main()
