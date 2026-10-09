# Shelly Tower - facade detail for the live 3D on the website.
# Builds window frames (mullions and transoms) for every floor, a roof parapet, and exports
# them with the aluminium fins as docs/tower/model/shelly-tower-detail.glb.
# Each floor's frame is its own object "Facade_<level>" built from the floor's base (z = 0),
# so the website can put it inside that floor: it slides out and twists with the floor.
# Edit the numbers below (spacing, sizes) and run again to change the look.
import bpy, bmesh, json, re, os

S = bpy.context.scene
HERE = os.path.dirname(bpy.data.filepath)
src = open(os.path.join(HERE, "scripts", "shelly_tower_01_build.py"), encoding="utf-8").read()
FL = json.loads(re.search(r'FL = __import__\("json"\)\.loads\(r"""(.*?)"""\)', src, re.S).group(1))
TW, TD, PW, PD = 34.0, 26.0, 62.0, 48.0
TOWER = dict(step=1.7, mw=.14, md=.32, corner=.5)     # office floors: slim frames every 1.7 m
PODIUM = dict(step=3.1, mw=.26, md=.45, corner=.8)    # podium: bigger shopfront frames

def H(lv, order):
    if lv == "G": return 6.5
    if 1 <= order <= 4: return 5.2
    if lv == "R": return 3.0
    return 4.2

def addbox(bm, w, d, h, x, y, z):
    vs = [bm.verts.new((x + sx * w / 2, y + sy * d / 2, z + sz * h)) for sz in (0, 1) for sy in (-1, 1) for sx in (-1, 1)]
    for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)): bm.faces.new([vs[i] for i in f])

def frames(bm, w, d, h, P):
    gw, gd, z0, gh = w - .3, d - .3, .45, h - .45          # the glass box of the floor
    for side, length, other in (("x", gw, gd), ("y", gd, gw)):
        n = max(2, round(length / P["step"]))
        for i in range(1, n):
            t = -length / 2 + i * length / n
            for s in (-1, 1):
                if side == "x": addbox(bm, P["mw"], P["md"], gh, t, s * (other / 2 + P["md"] / 2 - .05), z0)
                else:           addbox(bm, P["md"], P["mw"], gh, s * (other / 2 + P["md"] / 2 - .05), t, z0)
    for sx in (-1, 1):                                       # corner posts
        for sy in (-1, 1): addbox(bm, P["corner"], P["corner"], gh, sx * gw / 2, sy * gd / 2, z0)
    for z in (z0, z0 + gh - .14):                            # sill and head rails all round
        for s in (-1, 1):
            addbox(bm, gw, P["md"] * .8, .14, 0, s * (gd / 2 + P["md"] * .4 - .05), z)
            addbox(bm, P["md"] * .8, gd, .14, s * (gw / 2 + P["md"] * .4 - .05), 0, z)

old = bpy.data.collections.get("WebDetail")
if old:
    for o in list(old.objects): bpy.data.objects.remove(o, do_unlink=True)
else:
    old = bpy.data.collections.new("WebDetail"); S.collection.children.link(old)
WD = old
alu = bpy.data.materials.get("Aluminium")
made = []
for lv, order, kind, colour, name in FL:
    if order < 0: continue
    pod = order <= 4; w, d = (PW, PD) if pod else (TW, TD); h = H(lv, order)
    bm = bmesh.new()
    if lv == "R":                                            # roof parapet
        for s in (-1, 1):
            addbox(bm, w, .35, 1.1, 0, s * (d / 2 - .2), .45); addbox(bm, .35, d, 1.1, s * (w / 2 - .2), 0, .45)
    else:
        frames(bm, w, d, h, PODIUM if pod else TOWER)
    me = bpy.data.meshes.new("Facade_" + lv); bm.to_mesh(me); bm.free()
    if alu: me.materials.append(alu)
    o = bpy.data.objects.new("Facade_" + lv, me); WD.objects.link(o)
    # in Blender, sit it on its floor (and ride the film's drawer empty if there is one)
    base = bpy.data.objects.get("L%s_slab" % lv)
    D = bpy.data.objects.get("Floor_" + lv)
    z = base.location.z if base else 0
    if D: o.parent = D; o.matrix_parent_inverse.identity()
    o.location = (0, 0, z)
    made.append(o)

# ---------- export for the web: frames at the origin (the page places them), plus the fins
out = os.path.join(HERE, "web"); os.makedirs(out, exist_ok=True)
fp = os.path.join(out, "shelly-tower-detail.glb")
keep = {o: o.location.copy() for o in made}
par = {o: o.parent for o in made}
for o in made: o.parent = None; o.location = (0, 0, 0)
fins = bpy.data.objects["Fins"]
fh = (fins.hide_render, fins.hide_viewport, fins.hide_get())
fins.hide_viewport = False; fins.hide_set(False)
bpy.ops.object.select_all(action="DESELECT")
for o in made + [fins]: o.select_set(True)
bpy.context.view_layer.objects.active = fins
bpy.ops.export_scene.gltf(filepath=fp, export_format="GLB", use_selection=True, export_apply=True,
                          export_normals=False, export_texcoords=False, export_materials="NONE",
                          export_yup=True, export_animations=False)
for o in made:
    o.parent = par[o]
    if par[o]: o.matrix_parent_inverse.identity()
    o.location = keep[o]
fins.hide_viewport = fh[1]; fins.hide_set(fh[2])
print("exported", fp, os.path.getsize(fp), "bytes,", len(made), "floors")
