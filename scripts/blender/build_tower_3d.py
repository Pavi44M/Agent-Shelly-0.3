"""Shelly Tower in 3D (v2.6): the tower and every floor's interior, modelled in Blender and exported as .glb.

Runs with Blender's Python (headless works):  python scripts/blender/build_tower_3d.py   (needs `pip install bpy`)
or:  blender -b -P scripts/blender/build_tower_3d.py

Reads docs/data/floors.js (each floor's plan in metres) and writes:
  docs/floors/model/tower.glb       the whole tower, one named block per level (F_<level>)
  docs/floors/model/L<level>.glb    each floor's interior: slab, glazing, core, walls and doors, furniture, people by role
  docs/floors/model/index.json      sizes and the rooms list for the page's labels

Rules: guest rooms, apartments and washrooms are closed rooms with closed doors; nobody is drawn inside them.
People are simple figures coloured by role, never faces. Every number comes from the synthetic floor data.
"""
from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/floors/model"
H_WALL, T_WALL, H_FLOOR = 2.8, 0.12, 4.0

PAL = {  # name: (r, g, b, alpha, roughness, metallic)
    "slab": (0.16, 0.18, 0.22, 1, .9, 0), "floor_carpet": (0.24, 0.27, 0.33, 1, 1, 0), "floor_tile": (0.62, 0.64, 0.66, 1, .6, 0),
    "floor_wood": (0.47, 0.33, 0.22, 1, .7, 0), "glass": (0.5, 0.72, 0.9, .3, .05, 0), "wall": (0.86, 0.86, 0.83, 1, .9, 0),
    "door": (0.42, 0.29, 0.2, 1, .6, 0), "door_closed": (0.32, 0.21, 0.14, 1, .6, 0), "core": (0.3, 0.33, 0.38, 1, .8, 0),
    "lift": (0.85, 0.7, 0.35, 1, .3, .7), "stair": (0.75, 0.3, 0.27, 1, .8, 0), "wash": (0.38, 0.62, 0.78, 1, .5, 0),
    "bed": (0.93, 0.93, 0.95, 1, 1, 0), "bed_frame": (0.36, 0.26, 0.2, 1, .7, 0), "sofa": (0.33, 0.4, 0.55, 1, 1, 0),
    "desk": (0.8, 0.72, 0.6, 1, .6, 0), "chair": (0.15, 0.16, 0.2, 1, .8, 0), "screen": (0.05, 0.06, 0.08, 1, .2, .3),
    "shelf": (0.85, 0.85, 0.82, 1, .7, 0), "goods": (0.9, 0.55, 0.25, 1, .9, 0), "chiller": (0.75, 0.9, 1, 1, .2, .3),
    "counter": (0.25, 0.27, 0.3, 1, .5, .2), "table": (0.7, 0.55, 0.4, 1, .6, 0), "plant": (0.25, 0.55, 0.3, 1, 1, 0),
    "medical": (0.92, 0.95, 0.97, 1, .5, 0), "curtain": (0.55, 0.78, 0.78, .9, 1, 0), "rack": (0.12, 0.14, 0.17, 1, .4, .6),
    "led": (0.3, 0.85, 1, 1, .2, 0), "car": (0.5, 0.55, 0.62, 1, .3, .6), "truck": (0.85, 0.85, 0.82, 1, .5, .2),
    "pallet": (0.65, 0.5, 0.3, 1, 1, 0), "pad": (0.3, 0.32, 0.36, 1, .9, 0), "pad_mark": (1, 0.82, 0.3, 1, .8, 0),
    "solar": (0.1, 0.16, 0.32, 1, .2, .6), "robot": (0.95, 0.6, 0.2, 1, .5, .3), "equip": (0.35, 0.36, 0.4, 1, .4, .5),
    "person_skin": (0.86, 0.72, 0.6, 1, .8, 0), "bath": (0.95, 0.96, 0.97, 1, .3, 0),
}
ROLE_COL = {"analyst": (0.39, 0.71, 0.85), "manager": (0.42, 0.37, 0.77), "director": (0.95, 0.76, 0.31), "host": (0.56, 0.89, 0.78),
            "engineer": (0.39, 0.71, 0.85), "clinician": (0.3, 0.75, 0.55), "GP": (0.3, 0.75, 0.55), "nurse": (0.35, 0.8, 0.8),
            "urgent care doctor": (0.9, 0.45, 0.4), "radiographer": (0.6, 0.5, 0.85), "lab scientist": (0.75, 0.75, 0.8), "pharmacist": (0.3, 0.75, 0.55),
            "receptionist": (0.56, 0.89, 0.78), "physio": (0.95, 0.75, 0.3), "trainer": (0.95, 0.75, 0.3), "housekeeper": (0.85, 0.85, 0.85),
            "chef": (0.97, 0.97, 0.97), "server": (0.2, 0.2, 0.25), "event host": (0.56, 0.89, 0.78), "concierge": (0.15, 0.2, 0.35),
            "store team": (0.25, 0.55, 0.85), "barista": (0.45, 0.3, 0.2), "picker": (0.95, 0.6, 0.2), "driver": (0.5, 0.5, 0.55)}
DEFAULT_ROLE = (0.6, 0.65, 0.72)

# rooms that are closed, private cells: (cell width m, furnish kind, people allowed inside?)
CELLS = [("Guest rooms", 4.2, "hotel", False), ("Suites", 7.0, "suite", False), ("Serviced apartments", 7.5, "apartment", False),
         ("GP consult rooms", 3.6, "consult", True), ("Consult rooms", 3.6, "consult", True), ("Nurse", 3.6, "consult", True),
         ("Urgent care bays", 3.4, "bay", True), ("Meeting rooms", 5.0, "meeting", True), ("Executive offices", 4.2, "office", True),
         ("Focus rooms", 2.6, "focus", True), ("Deal rooms", 5.5, "meeting", True), ("Breakout rooms", 5.0, "meeting", True),
         ("Team rooms", 5.0, "meeting", True), ("Quiet rooms", 3.0, "focus", False), ("Translation booths", 2.4, "focus", True),
         ("Conference suites", 7.0, "meeting", True), ("X-ray room", 99, "xray", True), ("Ultrasound room", 99, "consult", True),
         ("Minor procedures room", 99, "consult", True), ("Family room", 99, "lounge", False), ("Treatment room", 99, "consult", True)]


class Builder:
    """Collects boxes and prisms per material, then makes one mesh per material (few draw calls on the page)."""

    def __init__(self):
        self.parts = {}

    def _add(self, mat, verts, faces):
        v, f = self.parts.setdefault(mat, ([], []))
        o = len(v); v.extend(verts); f.extend([tuple(i + o for i in face) for face in faces])

    def box(self, mat, x0, y0, z0, x1, y1, z1):
        if x1 - x0 < 1e-3 or y1 - y0 < 1e-3 or z1 - z0 < 1e-3:
            return
        V = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        F = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        self._add(mat, V, F)

    def prism(self, mat, cx, cy, z0, z1, r, n=8):
        V = [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z) for z in (z0, z1) for i in range(n)]
        F = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        self._add(mat, V, F)

    def build(self, name):
        objs = []
        for mat, (v, f) in self.parts.items():
            me = bpy.data.meshes.new(f"{name}_{mat}"); me.from_pydata(v, [], f); me.update()
            ob = bpy.data.objects.new(f"{name}_{mat}", me); bpy.context.scene.collection.objects.link(ob)
            me.materials.append(material(mat)); objs.append(ob)
        return objs


_MATS = {}


def material(name):
    if name in _MATS:
        return _MATS[name]
    if name.startswith("role_"):
        r, g, b = ROLE_COL.get(name[5:], DEFAULT_ROLE); spec = (r, g, b, 1, .8, 0)
    elif name.startswith("kind_"):
        h = name[5:]; spec = (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, 1, .5, .1)
    else:
        spec = PAL[name]
    spec = tuple(c ** 2.2 for c in spec[:3]) + tuple(spec[3:])   # the palette is written in sRGB; glTF colours are linear
    m = bpy.data.materials.new(name); m.use_nodes = True
    bs = m.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = (spec[0], spec[1], spec[2], 1)
    bs.inputs["Alpha"].default_value = spec[3]; bs.inputs["Roughness"].default_value = spec[4]; bs.inputs["Metallic"].default_value = spec[5]
    if spec[3] < 1:
        m.blend_method = "BLEND"
    _MATS[name] = m
    return m


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()


def export(path):
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", export_apply=True, export_yup=True,
                              export_texcoords=False, export_cameras=False, export_lights=False)


# ---------------------------------------------------------------- walls with door gaps
def wall_x(B, x0, x1, y, door=None, mat="wall", h=H_WALL, closed=False):
    """a wall along x at y; door = (centre x, width) leaves a gap with a door leaf"""
    if door:
        dc, dw = door
        B.box(mat, x0, y - T_WALL / 2, 0, dc - dw / 2, y + T_WALL / 2, h)
        B.box(mat, dc + dw / 2, y - T_WALL / 2, 0, x1, y + T_WALL / 2, h)
        B.box(mat, dc - dw / 2, y - T_WALL / 2, 2.1, dc + dw / 2, y + T_WALL / 2, h)
        B.box("door_closed" if closed else "door", dc - dw / 2, y - .04, 0, dc + dw / 2, y + .04, 2.1) if closed else \
            B.box("door", dc - dw / 2, y - .04, 0, dc - dw / 2 + .06, y + .9, 2.1)            # an open door swung back
    else:
        B.box(mat, x0, y - T_WALL / 2, 0, x1, y + T_WALL / 2, h)


def wall_y(B, y0, y1, x, door=None, mat="wall", h=H_WALL, closed=False):
    if door:
        dc, dw = door
        B.box(mat, x - T_WALL / 2, y0, 0, x + T_WALL / 2, dc - dw / 2, h)
        B.box(mat, x - T_WALL / 2, dc + dw / 2, 0, x + T_WALL / 2, y1, h)
        B.box(mat, x - T_WALL / 2, dc - dw / 2, 2.1, x + T_WALL / 2, dc + dw / 2, h)
        if closed: B.box("door_closed", x - .04, dc - dw / 2, 0, x + .04, dc + dw / 2, 2.1)
        else: B.box("door", x - .04, dc - dw / 2, 0, x + .9, dc - dw / 2 + .06, 2.1)
    else:
        B.box(mat, x - T_WALL / 2, y0, 0, x + T_WALL / 2, y1, h)


# ---------------------------------------------------------------- furniture
def furnish_cell(B, kind, x0, y0, x1, y1, door_side, rnd):
    """furniture inside one private cell; door_side is where the corridor is: N, S, E or W"""
    w, d = x1 - x0, y1 - y0
    inner = lambda a, b: (a + .25, b - .25)
    if kind in ("hotel", "suite", "apartment"):
        # bathroom pod by the door, bed against the far wall, desk and chair, window side free
        far_y = y1 if door_side == "S" else y0
        near_y = y0 if door_side == "S" else y1
        sgn = 1 if door_side == "S" else -1
        bx0, bx1 = x0 + .15, x0 + min(2.2, w * .5)
        by0, by1 = sorted([near_y + sgn * .15, near_y + sgn * 2.4])
        for xx in (bx1,): B.box("wall", xx - .05, by0, 0, xx + .05, by1, H_WALL)
        B.box("wall", bx0, (by1 if sgn > 0 else by0) - .05, 0, bx1, (by1 if sgn > 0 else by0) + .05, H_WALL)
        B.box("bath", bx0 + .1, by0 + .1, 0, bx0 + 1.0, by0 + .9, .6)                     # shower tray / basin
        n_beds = 2 if kind == "apartment" else 1
        for k in range(n_beds):
            cx = x0 + w * (0.62 if n_beds == 1 else (0.45 + .3 * k))
            bw = 1.6 if kind != "apartment" else 1.4
            yA, yB = sorted([far_y - sgn * .2, far_y - sgn * 2.3])
            B.box("bed_frame", cx - bw / 2 - .05, yA, 0, cx + bw / 2 + .05, yB, .35)
            B.box("bed", cx - bw / 2, yA + (.1 if sgn > 0 else 0), .35, cx + bw / 2, yB - (0 if sgn > 0 else .1), .55)
            hy = far_y - sgn * .2
            B.box("bed_frame", cx - bw / 2 - .05, min(hy, hy - sgn * .1), 0, cx + bw / 2 + .05, max(hy, hy - sgn * .1), 1.1)
        B.box("desk", x1 - .7, (y0 + y1) / 2 - .6, 0, x1 - .15, (y0 + y1) / 2 + .6, .75)
        B.box("chair", x1 - 1.2, (y0 + y1) / 2 - .25, 0, x1 - .75, (y0 + y1) / 2 + .25, .45)
        if kind in ("suite", "apartment"):
            B.box("sofa", x0 + w * .15, (y0 + y1) / 2 - .5, 0, x0 + w * .15 + 2.0, (y0 + y1) / 2 + .4, .45)
    elif kind in ("consult", "bay"):
        B.box("medical", x0 + .3, y0 + .3, 0, x0 + .3 + .7, y0 + .3 + 1.9, .7)                 # exam couch
        B.box("desk", x1 - 1.4, y1 - .9, 0, x1 - .2, y1 - .3, .75); B.box("chair", x1 - 1.0, y1 - 1.5, 0, x1 - .6, y1 - 1.0, .45)
        if kind == "bay": B.box("curtain", x0 + .05, y0, 0, x0 + .1, y1, 2.0)
    elif kind == "xray":
        B.box("equip", x0 + w * .3, y0 + d * .3, 0, x0 + w * .3 + 2.1, y0 + d * .3 + .9, .9)
        B.box("equip", x0 + w * .3 + .9, y0 + d * .3 + .2, .9, x0 + w * .3 + 1.3, y0 + d * .3 + .6, 2.4)
        B.box("wall", x1 - 2.2, y1 - 1.6, 0, x1 - 2.1, y1 - .2, H_WALL)                          # control screen wall
    elif kind == "meeting":
        tw, td = max(1.2, w - 2.0), max(1.0, d - 2.4)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        B.box("table", cx - tw / 2, cy - td / 2, .7, cx + tw / 2, cy + td / 2, .76); B.box("chair", cx - .2, cy - .2, 0, cx + .2, cy + .2, .7)
        for i in range(int(tw // 0.9)):
            px = cx - tw / 2 + .45 + i * .9
            B.box("chair", px - .22, cy - td / 2 - .6, 0, px + .22, cy - td / 2 - .15, .46); B.box("chair", px - .22, cy + td / 2 + .15, 0, px + .22, cy + td / 2 + .6, .46)
        B.box("screen", cx - .8, y0 + .1, 1.0, cx + .8, y0 + .16, 1.9)
    elif kind in ("office", "focus"):
        B.box("desk", x0 + .3, y0 + .3, 0, x0 + min(1.8, w - .4), y0 + 1.0, .75); B.box("chair", x0 + .7, y0 + 1.1, 0, x0 + 1.15, y0 + 1.55, .46)
        B.box("screen", x0 + .6, y0 + .45, .75, x0 + 1.3, y0 + .5, 1.2)
    elif kind == "lounge":
        B.box("sofa", x0 + .4, y0 + .4, 0, x1 - .4, y0 + 1.2, .45); B.box("table", (x0 + x1) / 2 - .5, y0 + 1.6, 0, (x0 + x1) / 2 + .5, y0 + 2.2, .4)
        B.box("plant", x1 - .8, y1 - .8, 0, x1 - .3, y1 - .3, 1.1)


def furnish_open(B, name, x0, y0, x1, y1, rnd, people_spots):
    """open zones: desks, aisles, tables, racks... and spots where people can stand"""
    n = name.lower(); w, d = x1 - x0, y1 - y0
    def grid(step_x, step_y, fn, pad=1.0):
        nx, ny = max(1, int((w - 2 * pad) // step_x)), max(1, int((d - 2 * pad) // step_y))
        ox, oy = x0 + (w - (nx - 1) * step_x) / 2, y0 + (d - (ny - 1) * step_y) / 2
        for i in range(nx):
            for j in range(ny):
                fn(ox + i * step_x, oy + j * step_y)
    if any(k in n for k in ("workspace", "desks", "trade floor", "agent review", "control room", "transport control")):
        def pod(cx, cy):
            for dx in (-.8, .8):
                B.box("desk", cx + dx - .75, cy - .4, .72, cx + dx + .75, cy + .4, .76)
                B.box("screen", cx + dx - .3, cy - .05, .76, cx + dx + .3, cy + .02, 1.15)
                B.box("chair", cx + dx - .22, cy + .55, 0, cx + dx + .22, cy + 1.0, .46)
            people_spots.append((cx - .8, cy + .8)); people_spots.append((cx + .8, cy + .8))
        grid(3.6, 3.0, pod)
    elif any(k in n for k in ("grocery aisles", "fresh and produce", "chillers and freezers")):
        chill = "chiller" in n
        def gond(cx, cy):
            B.box("chiller" if chill else "shelf", cx - .45, cy - 2.0, 0, cx + .45, cy + 2.0, 1.8 if not chill else 2.0)
            for k in range(4): B.box("goods", cx - .5, cy - 1.8 + k * 1.0, .3, cx + .5, cy - 1.0 + k * 1.0, 1.4)
            people_spots.append((cx + 1.1, cy))
        grid(2.6, 5.0, gond)
    elif any(k in n for k in ("checkouts", "servery", "reception", "check-in", "security desk", "valet", "pharmacy", "café", "cafe", "sky lobby")):
        B.box("counter", x0 + 1, y0 + d / 2 - .4, 0, x1 - 1, y0 + d / 2 + .4, 1.05)
        people_spots.extend([(x0 + w * f, y0 + d / 2 - 1.0) for f in (.3, .6)])
        if any(k in n for k in ("café", "cafe", "sky lobby")):
            grid(2.2, 2.2, lambda cx, cy: (B.prism("table", cx, cy, 0, .74, .45, 10), people_spots.append((cx + .6, cy))), pad=1.6)
    elif any(k in n for k in ("seating", "restaurant", "food hall", "lounge", "social", "kitchen and social")):
        grid(2.4, 2.4, lambda cx, cy: (B.prism("table", cx, cy, 0, .74, .5, 10), B.box("chair", cx + .55, cy - .2, 0, cx + .95, cy + .2, .46),
                                       B.box("chair", cx - .95, cy - .2, 0, cx - .55, cy + .2, .46), people_spots.append((cx + .75, cy))))
    elif "ballroom" in n or "conference hall" in n:
        grid(3.0, 3.0, lambda cx, cy: (B.prism("table", cx, cy, 0, .74, .9, 12), people_spots.append((cx + 1.1, cy))))
        B.box("counter", x0 + 1, y1 - 2.2, 0, x0 + min(8, w - 1), y1 - 1, .6)                 # stage
    elif any(k in n for k in ("kitchen", "ghost kitchen")):
        B.box("counter", x0 + .5, y0 + .5, 0, x1 - .5, y0 + 1.2, .9); B.box("counter", x0 + .5, y1 - 1.2, 0, x1 - .5, y1 - .5, .9)
        B.box("equip", x0 + w / 2 - 1.5, y0 + d / 2 - .6, 0, x0 + w / 2 + 1.5, y0 + d / 2 + .6, .9)
        people_spots.extend([(x0 + w * f, y0 + d / 2 + 1.0) for f in (.3, .5, .7)])
    elif "day ward" in n:
        def bed(cx, cy):
            B.box("bed_frame", cx - .5, cy - 1.0, 0, cx + .5, cy + 1.0, .5); B.box("bed", cx - .45, cy - .95, .5, cx + .45, cy + .95, .62)
            B.box("curtain", cx + 1.0, cy - 1.3, 0, cx + 1.04, cy + 1.3, 2.1)
            people_spots.append((cx - 1.0, cy + 1.2))
        grid(2.6, 3.6, bed)
    elif any(k in n for k in ("gym", "studio", "rehab", "physio")):
        grid(2.6, 2.6, lambda cx, cy: (B.box("equip", cx - .5, cy - .9, 0, cx + .5, cy + .9, 1.0), people_spots.append((cx + .8, cy))))
    elif any(k in n for k in ("server hall", "battery", "cooling", "plant room", "battery microgrid")):
        grid(2.0, 4.2, lambda cx, cy: (B.box("rack", cx - .4, cy - 1.6, 0, cx + .4, cy + 1.6, 2.2), B.box("led", cx + .41, cy - 1.5, 1.0, cx + .43, cy + 1.5, 1.05)))
    elif "robot picking grid" in n or "chilled store" in n or "returns" in n:
        grid(1.4, 1.4, lambda cx, cy: B.box("rack", cx - .6, cy - .6, 0, cx + .6, cy + .6, 2.4), pad=1.2)
        for k in range(4): B.box("robot", x0 + 2 + k * 3, y0 + 1, 2.45, x0 + 2.8 + k * 3, y0 + 1.8, 2.75)
    elif "parking" in n or "ev chargers" in n:
        grid(2.6, 5.4, lambda cx, cy: (B.box("car", cx - .9, cy - 2.2, 0, cx + .9, cy + 2.2, 1.0), B.box("car", cx - .8, cy - 1.0, 1.0, cx + .8, cy + 1.2, 1.45)))
    elif "loading dock" in n or "dispatch" in n:
        for k in range(int(w // 4.5)):
            cx = x0 + 2.4 + k * 4.5; B.box("truck", cx - 1.2, y0 + .5, 0, cx + 1.2, y0 + min(9, d - .5), 3.4)
        grid(1.6, 1.6, lambda cx, cy: B.box("pallet", cx - .55, cy - .55, 0, cx + .55, cy + .55, 1.2), pad=2.5)
    elif "drone pads" in n or "vertiport" in n:
        grid(8, 8, lambda cx, cy: (B.prism("pad", cx, cy, 0, .1, 3.2, 16), B.prism("pad_mark", cx, cy, .1, .12, 1.0, 16)), pad=4)
    elif "solar" in n:
        grid(3.0, 2.2, lambda cx, cy: B.box("solar", cx - 1.3, cy - .8, .4, cx + 1.3, cy + .8, .6), pad=.8)
    elif "garden" in n or "plaza" in n:
        grid(4.0, 4.0, lambda cx, cy: (B.prism("plant", cx, cy, 0, 1.4, .9, 10), B.box("table", cx + 1.3, cy - .2, 0, cx + 2.6, cy + .2, .45), people_spots.append((cx + 1.9, cy + .6))))
    elif any(k in n for k in ("pods", "showroom", "media wall", "retail")):
        grid(4.5, 4.5, lambda cx, cy: (B.box("shelf", cx - 1.2, cy - 1.2, 0, cx + 1.2, cy + 1.2, .9), B.box("screen", cx - 1.0, cy - 1.25, .9, cx + 1.0, cy - 1.2, 2.2), people_spots.append((cx, cy + 1.8))))
    elif "lockers" in n:
        B.box("shelf", x0 + .5, y0 + .3, 0, x1 - .5, y0 + .9, 2.1)
    elif any(k in n for k in ("waiting", "lift lobby")):
        grid(1.4, 2.0, lambda cx, cy: (B.box("chair", cx - .25, cy - .25, 0, cx + .25, cy + .25, .46), people_spots.append((cx, cy))), pad=1.2)
    elif "shell space" in n or "viewing" in n:
        pass
    else:
        grid(3.0, 3.0, lambda cx, cy: (B.box("desk", cx - .7, cy - .4, 0, cx + .7, cy + .4, .75), people_spots.append((cx, cy + .7))))


def person(B, role, x, y):
    B.prism(f"role_{role}", x, y, 0, 1.25, .22, 8)              # body, coloured by role
    B.prism("person_skin", x, y, 1.3, 1.62, .13, 8)              # head (no face, by design)


def cell_spec(name):
    for key, width, kind, inside in CELLS:
        if name.startswith(key) or key in name:
            return width, kind, inside
    return None


# ---------------------------------------------------------------- one floor
def build_floor(f, out):
    clear(); B = Builder(); rnd = random.Random(f["level"])
    P = f["plan"]; W, H = P["w"], P["h"]
    fam_floor = "floor_tile" if f["kind"] in ("podium", "basement") or any(k in f["name"].lower() for k in ("clinic", "food")) else "floor_carpet"
    B.box("slab", -.3, -.3, -.25, W + .3, H + .3, 0)
    B.box(fam_floor, 0, 0, 0, W, H, .02)
    # curtain-wall glazing with mullions round the edge (low enough to look into)
    if f["level"] not in ("R", "B1", "B2", "B3"):
        for (a, b, c, d2) in ((0, 0, W, .06), (0, H - .06, W, H), (0, 0, .06, H), (W - .06, 0, W, H)):
            B.box("glass", a, b, 0, c, d2, H_WALL)
        for x in range(0, int(W) + 1, 3): B.box("core", x - .04, -.06, 0, x + .04, .06, H_WALL); B.box("core", x - .04, H - .06, 0, x + .04, H + .06, H_WALL)
        for y in range(0, int(H) + 1, 3): B.box("core", -.06, y - .04, 0, .06, y + .04, H_WALL); B.box("core", W - .06, y - .04, 0, W + .06, y + .04, H_WALL)
    elif f["level"] == "R":
        for (a, b, c, d2) in ((0, 0, W, .1), (0, H - .1, W, H), (0, 0, .1, H), (W - .1, 0, W, H)): B.box("glass", a, b, 0, c, d2, 1.2)
    else:
        for (a, b, c, d2) in ((0, 0, W, .3), (0, H - .3, W, H), (0, 0, .3, H), (W - .3, 0, W, H)): B.box("core", a, b, 0, c, d2, H_WALL)
    # the core: lifts, two fire stairs, risers, cleaner's room, washrooms (closed doors, never the inside)
    core = P["core"]
    cx0 = min(c["x"] for c in core); cy0 = min(c["y"] for c in core)
    cx1 = max(c["x"] + c["w"] for c in core); cy1 = max(c["y"] + c["h"] for c in core)
    for c in core:
        x0, y0, x1, y1 = c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"]
        nm = c["name"]
        if nm == "Lifts":
            for k in range(4):
                lx = x0 + k * c["w"] / 4
                B.box("core", lx, y0, 0, lx + c["w"] / 4, y1, H_WALL + .3)
                B.box("lift", lx + .3, y0 - .02, 0, lx + c["w"] / 4 - .3, y0 + .02, 2.2)       # lift doors facing north
        elif "Stair" in nm:
            B.box("stair", x0, y0, 0, x1, y1, H_WALL + .3)
            for k in range(8): B.box("core", x0 + .3, y0 + .5 + k * (c["h"] - 1) / 8, H_WALL + .3, x1 - .3, y0 + .6 + k * (c["h"] - 1) / 8, H_WALL + .32)
        elif c.get("wash"):
            B.box("wash", x0, y0, 0, x1, y1, H_WALL)                                               # closed block
            B.box("door_closed", x0 + c["w"] / 2 - .45, y1 - .02, 0, x0 + c["w"] / 2 + .45, y1 + .04, 2.1)
            B.box("led", x0 + c["w"] / 2 - .25, y1 + .04, 2.25, x0 + c["w"] / 2 + .25, y1 + .06, 2.55)  # door sign
        else:
            B.box("core", x0, y0, 0, x1, y1, H_WALL)
    rooms_out = []
    people_spots = []
    for r in P["rooms"]:
        x0, y0, x1, y1 = r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]
        rooms_out.append({"name": r["name"], "x": round((x0 + x1) / 2, 1), "y": round((y0 + y1) / 2, 1), "label": r["label"]})
        # which side faces the core (the corridor): doors go there
        side = "S" if y1 <= cy0 + .5 else "N" if y0 >= cy1 - .5 else "E" if x1 <= cx0 + .5 else "W"
        spec = cell_spec(r["name"])
        if spec:
            cw, kind, inside = spec
            horizontal = side in ("N", "S")
            span = (x1 - x0) if horizontal else (y1 - y0)
            n = max(1, int(span // cw)) if cw < 90 else 1
            step = span / n
            # corridor gap of 1.6 m on the core side
            if side == "S": y1c = y1 - 1.6; yy0, yy1 = y0, y1c
            elif side == "N": y0c = y0 + 1.6; yy0, yy1 = y0c, y1
            else: yy0, yy1 = y0, y1
            if side == "E": xx0, xx1 = x0, x1 - 1.6
            elif side == "W": xx0, xx1 = x0 + 1.6, x1
            else: xx0, xx1 = x0, x1
            closed = not inside
            for i in range(n):
                if horizontal:
                    a, b = x0 + i * step, x0 + (i + 1) * step
                    wall_y(B, yy0, yy1, a)
                    door_y = yy1 if side == "S" else yy0
                    wall_x(B, a, b, door_y, door=((a + b) / 2, .95), closed=closed)
                    furnish_cell(B, kind, a + .1, yy0 + .1, b - .1, yy1 - .1, side, rnd)
                    if inside: people_spots.append(((a + b) / 2, (yy0 + yy1) / 2))
                else:
                    a, b = y0 + i * step, y0 + (i + 1) * step
                    wall_x(B, xx0, xx1, a)
                    door_x = xx1 if side == "E" else xx0
                    wall_y(B, a, b, door_x, door=((a + b) / 2, .95), closed=closed)
                    furnish_cell(B, kind, xx0 + .1, a + .1, xx1 - .1, b - .1, "S", rnd)
                    if inside: people_spots.append(((xx0 + xx1) / 2, (a + b) / 2))
            if horizontal: wall_y(B, yy0, yy1, x1)
            else: wall_x(B, xx0, xx1, y1)
        else:
            # open zone: low partition on the core side with a wide opening, then furniture
            if side in ("N", "S"):
                yw = y1 if side == "S" else y0
                mid = (x0 + x1) / 2
                B.box("wall", x0, yw - T_WALL / 2, 0, max(x0, mid - 1.4), yw + T_WALL / 2, 1.1)
                B.box("wall", min(x1, mid + 1.4), yw - T_WALL / 2, 0, x1, yw + T_WALL / 2, 1.1)
            furnish_open(B, r["name"], x0, y0, x1, y1, rnd, people_spots)
    # people: one figure per person in now (capped), only where people can be seen working
    roles = [k for k, v in sorted(f["roles"].items(), key=lambda kv: -kv[1]) for _ in range(v)]
    rnd.shuffle(people_spots)
    n = min(len(roles), len(people_spots), 60)
    for i in range(n):
        x, y = people_spots[i]
        person(B, roles[i], x + rnd.uniform(-.2, .2), y + rnd.uniform(-.2, .2))
    B.build(f"L{f['level']}")
    export(out)
    return {"level": f["level"], "w": W, "h": H, "rooms": rooms_out, "people_drawn": n, "people_in": f["here_now"]}


# ---------------------------------------------------------------- the tower
def build_tower(floors, out):
    clear(); B = Builder()
    order = list(reversed(floors))                # B3 at the bottom ... R at the top
    z = -3 * H_FLOOR
    for f in order:
        W, H = f["plan"]["w"], f["plan"]["h"]
        ox, oy = -W / 2, -H / 2
        col = f.get("colour", "#63b6d8").lstrip("#")
        Bf = Builder()
        Bf.box("slab", ox, oy, z, ox + W, oy + H, z + .35)
        if f["level"] == "R":
            Bf.box("pad", ox, oy, z + .35, ox + W, oy + H, z + .5)
            for k in range(3): Bf.prism("pad_mark", ox + W * (.25 + .25 * k), oy + H * .3, z + .5, z + .55, 2.5, 16)
            for k in range(6): Bf.box("solar", ox + 2 + k * 6, oy + H * .65, z + .6, ox + 6.5 + k * 6, oy + H * .9, z + .9)
        else:
            Bf.box(f"kind_{col}", ox + .3, oy + .3, z + .35, ox + W - .3, oy + H - .3, z + H_FLOOR - .05)   # floor colour, seen through glass
            Bf.box("glass", ox, oy, z + .35, ox + W, oy + H, z + H_FLOOR)
            for x in range(int(W) // 3 + 1):
                Bf.box("core", ox + x * 3 - .06, oy - .05, z + .35, ox + x * 3 + .06, oy + .05, z + H_FLOOR)
                Bf.box("core", ox + x * 3 - .06, oy + H - .05, z + .35, ox + x * 3 + .06, oy + H + .05, z + H_FLOOR)
        objs = Bf.build(f"F_{f['level']}")
        # group the floor's parts under one empty named for the level, so the page can pick it
        em = bpy.data.objects.new(f"F_{f['level']}", None); bpy.context.scene.collection.objects.link(em)
        for o in objs: o.parent = em
        z += H_FLOOR
    # the lift core and a mast on the roof
    B.box("core", -4, -2, -3 * H_FLOOR, 4, 2, z + 4); B.box("led", -.15, -.15, z + 4, .15, .15, z + 14)
    # ground plane and plaza
    B.box("pad", -60, -60, -.4, 60, 60, -.3)
    B.build("site")
    export(out)
    return {"height_m": z + 14, "levels": len(floors)}


def main():
    t = (ROOT / "docs/data/floors.js").read_text(encoding="utf-8")
    D = json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])
    OUT.mkdir(parents=True, exist_ok=True)
    only = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else None
    idx = {"floors": [], "tower": None}
    for f in D["floors"]:
        if only and f["level"] not in only: continue
        idx["floors"].append(build_floor(f, OUT / f"L{f['level']}.glb"))
        print("floor", f["level"], "ok", flush=True)
    if not only:
        idx["tower"] = build_tower(D["floors"], OUT / "tower.glb")
        (OUT / "index.json").write_text(json.dumps(idx, separators=(",", ":")), encoding="utf-8")
    print("done", len(idx["floors"]), "floors")


if __name__ == "__main__":
    main()
    import os; sys.stdout.flush(); os._exit(0)   # bpy can crash on interpreter exit; the files are already written
