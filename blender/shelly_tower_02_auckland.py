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

# ---------------- Auckland setting: plaza, roads, harbour, city massing, the Sky Tower, sky, sun and camera
random.seed(7)
for c in ("Setting",):
    old = bpy.data.collections.get(c)
    if old:
        for o in list(old.all_objects): bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(old)
E = C("Setting")
PD = 48.0
ground = M("Ground", "#d9dde2", rough=.85); plazaM = M("Plaza", "#e9e3d8", rough=.8); road = M("Road", "#4f5864", rough=.75)
water = M("Harbour", "#1f6f7a", metal=.2, rough=.06, coat=1.0)
box("Ground", 1900, 1100, .2, 0, 450, -.2, ground, E)
box("Water", 2600, 1300, .2, 0, -116 - 650, -.9, water, E)
box("Seawall", 1300, 4, 1.4, 0, -116, -1.1, M("Seawall", "#b9c2cc", rough=.7), E)
box("PlazaPaving", 120, 100, .14, 0, -10, 0, plazaM, E)
box("RoadFront", 1300, 16, .1, 0, -74, 0, road, E)
for x in (-78, 78): box("RoadSide", 16, 830, .1, x, 305, 0, road, E)
lane = M("LaneWhite", "#f4f4f4", rough=.5)
bml = bmesh.new()
for x in range(-640, 640, 10): addbox(bml, 5, .3, .03, x, -74, .1)
obj_from_bm("LaneMarks", bml, lane, E)
# street grid and parks
street = M("Street", "#6b7480", rough=.8); park = M("Park", "#6fb85a", rough=.9)
bms = bmesh.new()
for x in range(-620, 621, 62):
    if abs(x) > 100: addbox(bms, 9, 820, .08, x, 310, 0)
for y in range(60, 721, 56): addbox(bms, 1240, 9, .08, 0, y, 0)
addbox(bms, 26, 1100, .1, -470, 250, 0)
obj_from_bm("Streets", bms, street, E)
parks = [(300, 250, 120, 100), (-230, 150, 110, 80), (-60, 560, 160, 120)]
bmp = bmesh.new()
for x, y, w, d in parks: addbox(bmp, w, d, .14, x, y, 0)
obj_from_bm("Parks", bmp, park, E)
# trees: one mesh, many linked copies
tm = bpy.data.meshes.new("TreeMesh"); bmt = bmesh.new(); bmesh.ops.create_icosphere(bmt, subdivisions=2, radius=2.4); bmt.to_mesh(tm); bmt.free()
for p in tm.polygons: p.use_smooth = True
tm.materials.append(M("Leaves", "#4f9e4a", rough=.8))
trunkM = M("Trunk", "#7a5a3a")
def tree(x, y, s=1.0):
    o = bpy.data.objects.new("Tree", tm); o.location = (x, y, 3.6 * s); o.scale = (s, s, s * 1.15); E.objects.link(o)
pts = [(x, 30) for x in range(-55, 56, 11)] + [(x, -52) for x in range(-55, 56, 11)] + [(sx, y) for sx in (-56, 56) for y in range(-50, 31, 10)]
for x, y, w, d in parks:
    for k in range(int(w * d / 160)): pts.append((x + random.uniform(-w / 2 + 3, w / 2 - 3), y + random.uniform(-d / 2 + 3, d / 2 - 3)))
for x in range(-400, 400, 18):
    if abs(x) > 90: pts.append((x, -86))
for x, y in pts: tree(x, y, random.uniform(.8, 1.3))
# the city: white low-rise massing everywhere, glassy towers in the CBD
low = M("CityWhite", "#f3f5f8", rough=.75)
glassC = M("CityGlass", "#b8c8da", metal=.7, rough=.12)
bmL = bmesh.new(); bmT = bmesh.new()
SKY = (225, 175)
def inpark(x, y, m=4): return any(abs(x - px) < w / 2 + m and abs(y - py) < d / 2 + m for px, py, w, d in parks)
def near(x, y): return (abs(x) < 115 and y < 130) or math.hypot(x - SKY[0], y - SKY[1]) < 24 or inpark(x, y)
for bx in range(-620, 620, 62):
    for by in range(-96, 720, 56):
        cx, cy = bx + 31, by + 28
        if cy < -96 + 0 or (cy < 60 and abs(cx) <= 140): continue
        cbd = 60 < cx < 470 and -40 < cy < 420
        for k in range(random.randint(2, 4)):
            w, d = random.uniform(14, 24), random.uniform(14, 22)
            x, y = cx + random.choice((-1, 1)) * random.uniform(4, 13), cy + random.choice((-1, 1)) * random.uniform(4, 11)
            if near(x, y) or y < -100: continue
            if cbd and random.random() < .55:
                h = random.uniform(40, 150) * (1 - math.hypot(x - 260, y - 150) / 700); addbox(bmT, w, d, h, x, y, 0)
            else: addbox(bmL, w, d, random.uniform(6, 30 if cbd else 18), x, y, 0)
# Viaduct and the wharves out into the harbour
for x in range(-300, 520, 34):
    if abs(x) > 110: addbox(bmL, random.uniform(14, 22), 12, random.uniform(6, 16), x, -98, 0)
wharfM = M("Wharf", "#cfd6de", rough=.7)
for x, w, ln in ((170, 46, 150), (255, 40, 190), (345, 50, 170), (430, 36, 130)):
    box("Wharf", w, ln, 1.4, x, -118 - ln / 2, -1.2, wharfM, E)
    for k in range(3): addbox(bmL, w * .55, ln / 4.5, random.uniform(8, 14), x, -130 - k * ln / 3.4, 0)
obj_from_bm("CityLow", bmL, low, E); obj_from_bm("CityTowers", bmT, glassC, E)
# boats in the marina
boatM = M("Boat", "#ffffff", rough=.4)
for k in range(22):
    b = box("Boat", 2.4, 9, 1.6, random.uniform(-60, 120), random.uniform(-220, -132), -.8, boatM, E, bevel=.4); b.rotation_euler.z = random.uniform(-.3, .3)
# the Sky Tower
skyW = M("SkyTowerWhite", "#e9edf2", rough=.4)
def cyl(name, r1, r2, h, x, y, z, mat, v=24):
    bpy.ops.mesh.primitive_cone_add(vertices=v, radius1=r1, radius2=r2, depth=h, location=(x, y, z + h / 2)); o = bpy.context.object; o.name = name; o.data.materials.append(mat)
    for c in o.users_collection: c.objects.unlink(o)
    E.objects.link(o); bpy.ops.object.shade_smooth(); return o
sx, sy = SKY
cyl("SkyShaft", 6, 4.2, 190, sx, sy, 0, skyW)
for a in (0, 2.1, 4.2): cyl("SkyLeg", 2.2, 1.2, 190, sx + math.cos(a) * 7, sy + math.sin(a) * 7, 0, skyW, 10)
cyl("SkyPodA", 9, 12, 9, sx, sy, 186, skyW)
cyl("SkyPodGlass", 12.4, 12.4, 4, sx, sy, 190, M("SkyPodGlass", "#5f8fb0", metal=.6, rough=.15, emit="#ffd99a", estr=.3))
cyl("SkyPodB", 6, 7, 6, sx, sy, 213, skyW)
cyl("SkyMast", 2.2, .5, 108, sx, sy, 220, skyW, 12)
print("setting ok", len(E.all_objects))
