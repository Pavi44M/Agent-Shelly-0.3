import bpy, bmesh, math, random
from mathutils import Vector, Matrix
def col(h):
    h=h.lstrip('#'); return tuple(int(h[i:i+2],16)/255 for i in (0,2,4))
def lin(c): return tuple(((x+0.055)/1.055)**2.4 if x>0.04045 else x/12.92 for x in c)
def M(name, color, metal=0.0, rough=0.5, emit=None, estr=0.0, alpha=1.0, trans=0.0, coat=0.0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value=(*lin(col(color)),1); b.inputs['Metallic'].default_value=metal; b.inputs['Roughness'].default_value=rough
    if emit:
        b.inputs['Emission Color'].default_value=(*lin(col(emit)),1); b.inputs['Emission Strength'].default_value=estr
    if trans: b.inputs['Transmission Weight'].default_value=trans
    if coat: b.inputs['Coat Weight'].default_value=coat
    if alpha<1:
        b.inputs['Alpha'].default_value=alpha
        try: m.surface_render_method='BLENDED'
        except Exception: pass
    m.diffuse_color=(*lin(col(color)),1)
    return m
def C(name, parent=None):
    c=bpy.data.collections.get(name)
    if not c:
        c=bpy.data.collections.new(name); (parent or bpy.context.scene.collection).children.link(c)
    return c
def addbox(bm, w, d, h, x, y, z):
    vs=[bm.verts.new((x+sx*w/2, y+sy*d/2, z+sz*h)) for sz in (0,1) for sy in (-1,1) for sx in (-1,1)]
    idx=[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)]
    for f in idx: bm.faces.new([vs[i] for i in f])
def obj_from_bm(name, bm, mat, coll, loc=(0,0,0)):
    me=bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth=False
    o=bpy.data.objects.new(name, me); o.location=loc
    if mat: me.materials.append(mat) if not isinstance(mat,list) else [me.materials.append(x) for x in mat]
    coll.objects.link(o); return o
def box(name, w, d, h, x, y, z, mat, coll, bevel=0.0):
    bm=bmesh.new(); addbox(bm, w, d, h, 0, 0, 0); o=obj_from_bm(name, bm, mat, coll, (x,y,z))
    if bevel:
        mo=o.modifiers.new('bev','BEVEL'); mo.width=bevel; mo.segments=2; mo.limit_method='ANGLE'
    return o

# ---------------- clear the scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
FL = __import__("json").loads(r"""[["R", 999, "amenity", "#ffb066", "Rooftop vertiport, drone hub & solar"], ["31", 31, "core-business", "#f2c14e", "Group boardroom"], ["30", 30, "core-business", "#f2c14e", "Group management & finance"], ["29", 29, "core-tech", "#63b6d8", "Shelly OS \u00b7 AI operations centre"], ["28", 28, "core-tech", "#63b6d8", "Edge data centre & security operations"], ["27", 27, "core-tech", "#63b6d8", "Launchpad \u00b7 innovation & living lab"], ["26", 26, "business", "#63b6d8", "Neighbourhood Store \u00b7 head office"], ["25", 25, "business", "#63b6d8", "Neighbourhood Store \u00b7 retail media & store support"], ["24", 24, "business", "#b69cf2", "T\u014dtara Medical \u00b7 supply chain command"], ["23", 23, "business", "#b69cf2", "T\u014dtara Medical \u00b7 quality & regulatory"], ["22", 22, "business", "#2f6fd6", "Gateway \u00b7 transport control tower"], ["21", 21, "business", "#2f6fd6", "Gateway \u00b7 management & client accounts"], ["20", 20, "new", "#c38bff", "Shelly Ventures & Shelly Academy"], ["19", 19, "shared", "#7fd1a8", "Shared services"], ["18", 18, "amenity", "#ffb066", "Sky lobby & conference centre"], ["17", 17, "hospitality", "#ffd27a", "Hotel \u00b7 delegation suites"], ["16", 16, "hospitality", "#ffd27a", "Serviced apartments"], ["15", 15, "trade", "#ff7ad9", "International Trade Centre"], ["14", 14, "trade", "#ff7ad9", "Deal rooms & trade showrooms"], ["13", 13, "tenant", "#3d7dd9", "Harbourline Insurance"], ["12", 12, "available", "#3fb87f", "Available \u00b7 half floors"], ["11", 11, "tenant", "#e0a32e", "K\u014dwhai Legal"], ["10", 10, "tenant", "#d94a3d", "T\u016b\u012b Tech Labs"], ["9", 9, "available", "#3fb87f", "Flex space \u00b7 available"], ["8", 8, "tenant", "#2a9d8f", "P\u016briri Design Studio"], ["7", 7, "tenant", "#7a5cc4", "Mata\u012b Capital Partners"], ["6", 6, "tenant", "#3fb87f", "Rimu Health Clinic"], ["5", 5, "amenity", "#ffb066", "Wellbeing floor"], ["4", 4, "amenity", "#ffb066", "Food hall & ghost kitchen"], ["3", 3, "podium", "#e8692f", "Experiential mall \u00b7 upper"], ["2", 2, "podium", "#e8692f", "Experiential mall \u00b7 Neighbourhood Store flagship"], ["G", 0, "podium", "#e8692f", "Public ground floor & plaza"], ["B1", -1, "basement", "#5b6b80", "Micro-fulfilment centre (MFC)"], ["B2", -2, "basement", "#5b6b80", "Parking, EV charging & valet"], ["B3", -3, "basement", "#5b6b80", "Loading dock, battery microgrid & plant"]]
""")
T = C("ShellyTower")
TW, TD, PW, PD = 34.0, 26.0, 62.0, 48.0
def H(lv, order):
    if lv == "G": return 6.5
    if 1 <= order <= 4: return 5.2
    if lv == "R": return 3.0
    return 4.2
asc = sorted([f for f in FL if f[1] >= 0], key=lambda f: f[1])
KG = {"core-business": "#ffe9b8", "core-tech": "#bfe8ff", "business": "#c9dbff", "new": "#e6d4ff", "shared": "#d4f2e3", "tenant": "#cfdbe8", "available": "#d5f0de",
      "amenity": "#ffe2c6", "podium": "#ffd9c2", "trade": "#ffd6f0", "hospitality": "#fff2cc", "basement": "#b5bfcc"}
slabM = M("Slab", "#eef1f5", rough=.6)
alu = M("Aluminium", "#c9d1db", metal=.9, rough=.28)
dark = M("CoreDark", "#3b4350", rough=.7)
y = 0.0; floors = []
for lv, order, kind, colour, name in asc:
    h = H(lv, order); pod = order <= 4; w, d = (PW, PD) if pod else (TW, TD)
    floors.append((lv, order, kind, colour, name, y, h, w, d)); y += h
TOP = y
fc = C("Floors", T)
for lv, order, kind, colour, name, y0, h, w, d in floors:
    box(f"L{lv}_slab", w, d, .45, 0, 0, y0, slabM, fc, bevel=.06)
    bm = M(f"Band_{colour}", colour, rough=.35, emit=colour, estr=.6)
    box(f"L{lv}_band", w + .35, d + .35, .32, 0, 0, y0 + .06, bm, fc)
    if lv == "R": continue
    g = M(f"Glass_{kind}", KG.get(kind, "#cfdbe8"), metal=.85, rough=.06, alpha=.62)
    box(f"L{lv}_glass", w - .4, d - .4, h - .45, 0, 0, y0 + .45, g, fc)
    li = M("InteriorLight", "#fff0d6", emit="#ffe2b0", estr=1.4)
    box(f"L{lv}_inside", w - 2.4, d - 2.4, h - 1.6, 0, 0, y0 + .6, li, fc)
# core, columns, vertical fins up the tower
t0 = [f for f in floors if f[1] == 5][0][5]
box("Core", 9, 9, TOP - 3, 0, 0, 0, dark, T)
bmf = bmesh.new()
for sx in (-1, 1):
    for sy in (-1, 1): addbox(bmf, 1.0, 1.0, TOP - t0 - 3, sx * (TW / 2 - .2), sy * (TD / 2 - .2), t0)
n = int(TW / 2.4)
for i in range(1, n):
    x = -TW / 2 + i * TW / n
    for sy in (-1, 1): addbox(bmf, .2, .7, TOP - t0 - 3, x, sy * (TD / 2 + .2), t0)
n = int(TD / 2.4)
for i in range(1, n):
    yy = -TD / 2 + i * TD / n
    for sx in (-1, 1): addbox(bmf, .7, .2, TOP - t0 - 3, sx * (TW / 2 + .2), yy, t0)
obj_from_bm("Fins", bmf, alu, T)
# podium canopy and entrance (front of the podium faces -Y, towards the harbour)
blue = M("ShellyBlue", "#2f6fd6", metal=.4, rough=.3)
box("Canopy", 26, 6, .5, 0, -PD / 2 - 3, 6.5, blue, T, bevel=.08)
for sx in (-11, 11): box("CanopyPost", .5, .5, 6.5, sx, -PD / 2 - 5.5, 0, alu, T)
def text(name, s, size, loc, rot, mat, coll, extrude=.05, align="CENTER"):
    cu = bpy.data.curves.new(name, "FONT"); cu.body = s; cu.size = size; cu.extrude = extrude; cu.align_x = align; cu.align_y = "CENTER"
    o = bpy.data.objects.new(name, cu); o.location = loc; o.rotation_euler = rot; cu.materials.append(mat); coll.objects.link(o); return o
white = M("SignWhite", "#ffffff", emit="#ffffff", estr=3.0)
green = M("StoreGreen", "#1f8a5b", rough=.4)
podTop = [f for f in floors if f[0] == "2"][0]
box("StoreSign", 34, .3, 2.6, 0, -PD / 2 - .3, podTop[5] + 2.2, green, T)
text("StoreText", "Neighbourhood Store · Café · Pharmacy", 1.5, (0, -PD / 2 - .52, podTop[5] + 3.5), (math.pi / 2, 0, 0), white, T)
# crown: SHELLY signs on all four faces of the top office floor
top = [f for f in floors if f[0] != "R"][-1]; navy = M("Navy", "#0e1d33", rough=.4)
cz = top[5] + top[6] / 2
for (x, yy, rz, wd) in [(0, -TD / 2 - .55, 0, TW - 6), (0, TD / 2 + .55, math.pi, TW - 6), (TW / 2 + .55, 0, math.pi / 2, TD - 6), (-TW / 2 - .55, 0, -math.pi / 2, TD - 6)]:
    p = box("CrownPanel", wd if rz in (0, math.pi) else .3, .3 if rz in (0, math.pi) else wd, 3.4, x, yy, cz - 1.7, navy, T)
    off = Vector((0, -.25, 0)); off.rotate(Matrix.Rotation(rz, 3, "Z"))
    text("CrownText", "SHELLY", 2.6, (x + off.x, yy + off.y, cz), (math.pi / 2, 0, rz), white, T, extrude=.08)
# roof: green roof, helipad, drone pads, solar canopy, spire with its red light
roofZ = TOP - 3 + .45
grass = M("Grass", "#6fbf5a", rough=.9)
box("RoofGarden", TW - 2, TD - 2, .6, 0, 0, roofZ, grass, T)
bpy.ops.mesh.primitive_cylinder_add(radius=7, depth=.3, location=(-6, 0, roofZ + .75)); hp = bpy.context.object; hp.name = "Helipad"; hp.data.materials.append(M("Pad", "#3b4350", rough=.6))
for c in hp.users_collection: c.objects.unlink(hp)
T.objects.link(hp)
text("Hmark", "H", 6, (-6, 0, roofZ + .92), (0, 0, 0), M("PadYellow", "#ffd23f", emit="#ffd23f", estr=.5), T, extrude=.02)
solar = M("Solar", "#1d3557", metal=.6, rough=.25)
box("Solar", 12, 9, .2, 9, 0, roofZ + 4.6, solar, T)
for sx in (4, 14):
    for sy in (-4, 4): box("SolarPost", .25, .25, 4.6, sx, sy, roofZ, alu, T)
bpy.ops.mesh.primitive_cone_add(radius1=.6, radius2=.12, depth=24, location=(12, -9, roofZ + 12)); sp = bpy.context.object; sp.name = "Spire"; sp.data.materials.append(alu)
for c in sp.users_collection: c.objects.unlink(sp)
T.objects.link(sp)
bpy.ops.mesh.primitive_uv_sphere_add(radius=.5, location=(12, -9, roofZ + 24.2)); rl = bpy.context.object; rl.name = "SpireLight"; rl.data.materials.append(M("Red", "#ff3b3b", emit="#ff3b3b", estr=20))
for c in rl.users_collection: c.objects.unlink(rl)
T.objects.link(rl)
# external glass lifts on the east face
shaftG = M("LiftGlass", "#bfe0f5", metal=.3, rough=.05, alpha=.25); liftY = M("LiftCar", "#f2c14e", rough=.3, emit="#f2c14e", estr=.4)
for sy, zc in ((-5, 44), (5, 92)):
    box("LiftShaft", 3.4, 3.4, TOP - 3, TW / 2 + 2, sy, 0, shaftG, T)
    box("LiftCar", 2.8, 2.8, 2.9, TW / 2 + 2, sy, zc, liftY, T, bevel=.1)
print("floors", len(floors), "top", round(TOP, 1), "objects", len(T.all_objects))
