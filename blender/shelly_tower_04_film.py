# Shelly Tower - the film (about 30 s). Run after scripts 01-03 in shelly_tower.blend.
# Everything is driven by ONE control object: "FILM_Controls" (look in the Outliner).
#   era    0 = Today, 1 = 2050 Shelly Business Centre (twist, garden, satellite towers, skyways, air taxis)
#   dusk   0 = golden hour, 1 = dusk with the lights on
#   floor  which floor slides out like a drawer (0 = ground ... 31 = boardroom)
#   drawer 0 = closed, 1 = open
# Change the film by moving keyframes of these four values (Dope Sheet / Graph Editor),
# or by moving the camera "FilmCam" and its aim point "FilmTarget" keyframes.
# Timeline markers name the three acts: FLYOVER, FLOOR TOUR, 2050.
import bpy, math, json, re, random, os
from mathutils import Vector

S = bpy.context.scene
HERE = os.path.dirname(bpy.data.filepath)
src = open(os.path.join(HERE, "scripts", "shelly_tower_01_build.py"), encoding="utf-8").read()
FL = json.loads(re.search(r'FL = __import__\("json"\)\.loads\(r"""(.*?)"""\)', src, re.S).group(1))
TWIST = 0.021          # radians of twist per floor in 2050
SLIDE = 10.0           # how far (m) a floor slides out
random.seed(2050)

def coll(name):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name); S.collection.children.link(c)
    return c
FILM = coll("Film")

def empty(name, c=FILM, kind="PLAIN_AXES", size=2):
    o = bpy.data.objects.get(name)
    if not o:
        o = bpy.data.objects.new(name, None); c.objects.link(o)
    o.empty_display_type = kind; o.empty_display_size = size
    return o

CTL = empty("FILM_Controls", kind="SPHERE", size=6); CTL.location = (60, -60, 0)
for k, v, lo, hi, d in (("era", 0.0, 0, 1, "0 Today -> 1 2050"), ("dusk", 0.0, 0, 1, "0 golden hour -> 1 dusk"),
                        ("floor", 0.0, 0, 31, "floor that slides out"), ("drawer", 0.0, 0, 1, "0 closed -> 1 open")):
    CTL[k] = v
    ui = CTL.id_properties_ui(k); ui.update(min=lo, max=hi, soft_min=lo, soft_max=hi, description=d)

def drive(idb, path, expr, idx=-1, extra=()):
    """Add a driver reading FILM_Controls: e=era, d=dusk, F=floor, o=drawer."""
    try: idb.driver_remove(path, idx)
    except Exception: pass
    fc = idb.driver_add(path, idx) if idx >= 0 else idb.driver_add(path)
    dr = fc.driver; dr.type = "SCRIPTED"
    for v in list(dr.variables): dr.variables.remove(v)
    for name in ("e", "d", "F", "o"):
        if name not in expr: continue
        var = dr.variables.new(); var.name = name; var.type = "SINGLE_PROP"
        var.targets[0].id = CTL
        var.targets[0].data_path = '["%s"]' % {"e": "era", "d": "dusk", "F": "floor", "o": "drawer"}[name]
    dr.expression = expr
    return fc

# ---------- 1. reset the tower to Today, then put every floor on its own "drawer" empty
floors_coll = bpy.data.collections["Floors"]
for o in floors_coll.objects: o.rotation_euler.z = 0
for o in bpy.data.objects:
    if "p0" in o.keys():
        o.location = Vector(o["p0"]); o.rotation_euler.z = o["r0"]
white = bpy.data.materials.get("SignWhite")
for lv, order, kind, colour, name in FL:
    if order < 0: continue                       # basements are under ground
    n = 31 if lv == "R" else order               # R twists like the top floor
    D = empty("Floor_" + lv, size=1)
    D.location = (0, 0, 0); D.rotation_euler = (0, 0, 0)
    parts = [o for o in floors_coll.objects if o.name.startswith("L%s_" % lv)]
    for o in parts:
        o.parent = D; o.matrix_parent_inverse.identity()
    k = TWIST * max(0, n - 4)
    drive(D, "rotation_euler", "e*%.4f" % k, 2)
    if lv == "R": continue
    # slide out towards the harbour (-Y), following the twist; a soft wave so neighbours peek out too
    s = "%.1f*o*max(0,1-abs(F-%d)/1.3)" % (SLIDE, n)
    drive(D, "location", "-(%s)*sin(e*%.4f)" % (s, k) if k else "0", 0)
    drive(D, "location", "-(%s)*cos(e*%.4f)" % (s, k), 1)
    # floor label that appears when the floor is out
    glass = bpy.data.objects.get("L%s_glass" % lv)
    if glass:
        z = glass.location.z + glass.dimensions.z / 2; dep = glass.dimensions.y
        lab = bpy.data.objects.get("Label_" + lv)
        if not lab:
            cu = bpy.data.curves.new("Label_" + lv, "FONT"); lab = bpy.data.objects.new("Label_" + lv, cu); FILM.objects.link(lab)
            cu.materials.append(white)
        cu = lab.data
        cu.body = ("L%s  ·  %s" % (lv, name)) if lv != "G" else "Ground  ·  " + name
        cu.size = 1.25; cu.extrude = .03; cu.align_x = "CENTER"; cu.align_y = "CENTER"
        lab.parent = D; lab.matrix_parent_inverse.identity()
        lab.location = (0, -dep / 2 - .45, z); lab.rotation_euler = (math.pi / 2, 0, 0)
        for i in range(3): drive(lab, "scale", "min(1,o*max(0,1-abs(F-%d)/1.3)*1.6)" % n, i)

# roof pieces turn with the top floor
R = empty("Roof", size=3)
for o in bpy.data.objects:
    if "p0" in o.keys():
        o.parent = R; o.matrix_parent_inverse.identity()
drive(R, "rotation_euler", "e*%.4f" % (TWIST * 27), 2)
# today-only pieces (fins and glass lifts) leave in 2050
for o in bpy.data.collections["ShellyTower"].objects:
    if o.name.split(".")[0] in ("Fins", "LiftShaft", "LiftCar"):
        o.hide_render = False; o.hide_viewport = False
        drive(o, "hide_render", "e>0.5"); drive(o, "hide_viewport", "e>0.5")

# ---------- 2. 2050 pieces grow in one after another while era goes 0 -> 1
fut = bpy.data.collections["Future2050"]; fut.hide_render = False; fut.hide_viewport = False
for nm in [x.name for x in fut.objects]:
    o = bpy.data.objects[nm]
    o.hide_render = False; o.hide_viewport = False
    if "s0" not in o.keys(): o["s0"] = list(o.scale)
    s0 = o["s0"]; delay = random.uniform(0, 2.0)
    if o.name.startswith(("Skyway", "Pylon", "TowerLink")): delay = 1.2 + random.uniform(0, .4)
    for i in range(3):
        drive(o, "scale", "%.3f*min(max(e*3.2-%.2f,0),1)" % (s0[i], delay), i)

# ---------- 3. light, sky and glow follow dusk and era
sun = bpy.data.objects["Sun"]
drive(sun.data, "energy", "(7*(1-d)+1.6*d)*(1-e)+2*e")
for i, ex in enumerate(("1", "0.88-0.3*d", "0.74-0.38*d")): drive(sun.data, "color", ex, i)
drive(sun, "rotation_euler", "1.268+0.22*d", 0)
W = S.world; nt = W.node_tree
drive(nt.nodes["Fut2050Mix"].inputs[0], "default_value", "e")
drive(nt.nodes["Background"].inputs[1], "default_value", "(0.07+0.1*d)*(1-e)+0.6*e")
drive(nt.nodes["Sky Texture"], "sun_elevation", "0.28-0.24*d")
inter = bpy.data.materials["InteriorLight"]
drive(inter.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"], "default_value", "0.55+3.6*d*(1-e)+1.65*e")
cg = bpy.data.materials["CityGlass"]
drive(cg.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"], "default_value", "0.4*max(d,e)")
for i, ex in enumerate(("1-0.8*e", "0.72+0.08*e", "0.4+0.6*e")):
    drive(cg.node_tree.nodes["Principled BSDF"].inputs["Emission Color"], "default_value", ex, i)

# ---------- 4. camera on a path of keyframes, always aimed at FilmTarget
cam = bpy.data.objects.get("FilmCam")
if not cam:
    cam = bpy.data.objects.new("FilmCam", bpy.data.cameras.new("FilmCam")); FILM.objects.link(cam)
cam.data.lens = 28; cam.data.clip_end = 5000
tgt = empty("FilmTarget", kind="CUBE", size=2)
cam.constraints.clear(); tc = cam.constraints.new("TRACK_TO"); tc.target = tgt; tc.track_axis = "TRACK_NEGATIVE_Z"; tc.up_axis = "UP_Y"
S.camera = cam
for ob in (cam, tgt, CTL): ob.animation_data_clear()

def key(ob, f, loc):
    ob.location = loc; ob.keyframe_insert("location", frame=f)
CAM = [  # frame, camera, aim point
    (1,   (-300, -470, 150), (0, 0, 70)),     # ACT 1 - flyover from the harbour, golden hour into dusk
    (90,  (-60, -330, 95),   (0, 0, 72)),
    (190, (150, -170, 40),   (0, 0, 40)),
    (215, (30, -80, 8),      (0, 0, 10)),     # ACT 2 - floor tour: rise up the front, floors slide out
    (250, (-10, -74, 26),    (0, -8, 26)),
    (450, (20, -76, 136),    (0, -8, 133)),
    (480, (60, -150, 160),   (0, 0, 110)),    # ACT 3 - pull back, the tower becomes 2050
    (580, (-170, -260, 130), (0, 10, 85)),
    (660, (-120, -330, 75),  (0, 20, 80)),
    (720, (60, -330, 62),    (0, 20, 78)),
]
for f, c, t in CAM: key(cam, f, c); key(tgt, f, t)

def ckey(prop, pts):
    for f, v in pts:
        CTL[prop] = v; CTL.keyframe_insert('["%s"]' % prop, frame=f)
ckey("dusk",   [(1, 0), (80, 0), (200, 1), (720, 1)])
ckey("drawer", [(1, 0), (222, 0), (240, 1), (440, 1), (460, 0), (720, 0)])
ckey("floor",  [(1, 0), (240, 0), (440, 31), (720, 31)])
ckey("era",    [(1, 0), (490, 0), (610, 1), (720, 1)])
# floor tour moves at a steady pace
def fcurves(ob):
    a = ob.animation_data.action
    try:
        return list(a.fcurves)
    except Exception:
        from bpy_extras import anim_utils
        cb = anim_utils.action_get_channelbag_for_slot(a, ob.animation_data.action_slot)
        return list(cb.fcurves) if cb else []
for ob in (cam, tgt, CTL):
    for fc in fcurves(ob):
        for kp in fc.keyframe_points:
            if 240 <= kp.co.x < 440 and ("floor" in fc.data_path or ob is not CTL):
                kp.interpolation = "LINEAR"

S.timeline_markers.clear()
for f, n in ((1, "FLYOVER"), (215, "FLOOR TOUR"), (480, "2050")): S.timeline_markers.new(n, frame=f)
S.frame_start, S.frame_end = 1, 720; S.render.fps = 24
S.eevee.taa_render_samples = 16
drive(S.view_settings, "exposure", "0.35*d*(1-e)")
print("film ready", len(FILM.objects))
