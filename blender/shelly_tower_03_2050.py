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

# ---------------- 2050: the Shelly Business Centre (same floors, twisted; living garden; satellite towers, skyways, domes, rings, air taxis)
random.seed(50)
old = bpy.data.collections.get("Future2050")
if old:
    for o in list(old.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(old)
F = C("Future2050")
TW, TD = 34.0, 26.0
TOP = max(o.location.z + o.dimensions.z for o in bpy.data.collections["Floors"].objects)
# the vine: a thick green tube spiralling up the tower, with leaf clusters
cu = bpy.data.curves.new("VineCurve", "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = 1.3; cu.bevel_resolution = 3
sp = cu.splines.new("POLY"); N = 420; sp.points.add(N - 1)
for i in range(N):
    t = i / (N - 1); a = t * math.tau * 4.2
    sp.points[i].co = (math.cos(a) * 24, math.sin(a) * 20, 26 + t * (TOP - 30), 1)
vine = bpy.data.objects.new("Vine", cu); cu.materials.append(M("Vine", "#3f9d4a", rough=.7, emit="#2aff7a", estr=.15)); F.objects.link(vine)
lm = bpy.data.meshes.new("LeafMesh"); bml = bmesh.new(); bmesh.ops.create_icosphere(bml, subdivisions=1, radius=1.7); bml.to_mesh(lm); bml.free(); lm.materials.append(M("Leaf", "#5cc461", rough=.8))
for i in range(0, N, 6):
    t = i / (N - 1); a = t * math.tau * 4.2
    o = bpy.data.objects.new("Leaf", lm); o.location = (math.cos(a) * 25.5, math.sin(a) * 21.5, 26 + t * (TOP - 30) + random.uniform(-1, 1)); o.scale = [random.uniform(.7, 1.4)] * 3; F.objects.link(o)
# satellite towers and outer towers (Y = -webZ), with glowing rings and glass domes on top
def tower(name, x, y, h, r, c):
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r * 1.3, radius2=r, depth=h, location=(x, y, h / 2)); o = bpy.context.object; o.name = name
    o.data.materials.append(M("Sat_" + c, "#d6e6f5", metal=.6, rough=.12, emit=c, estr=.6))
    for cc in o.users_collection: cc.objects.unlink(o)
    F.objects.link(o)
    for k in range(7):
        bpy.ops.mesh.primitive_torus_add(major_radius=r * 1.28 - k * .4, minor_radius=.35, location=(x, y, 10 + k * h / 8)); t = bpy.context.object; t.data.materials.append(M("Ring_" + c, c, emit=c, estr=6))
        for cc in t.users_collection: cc.objects.unlink(t)
        F.objects.link(t)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r * .95, location=(x, y, h)); d = bpy.context.object; d.scale.z = .6; d.data.materials.append(M("Dome", "#bdefff", metal=.2, rough=0, alpha=.35))
    for cc in d.users_collection: cc.objects.unlink(d)
    F.objects.link(d)
SAT = [(-92, 36, 104, 10, "#9a7bff"), (96, 30, 118, 10, "#43d6ff"), (-190, 50, 96, 12, "#43d6ff"), (190, 50, 88, 12, "#9a7bff"), (-140, 128, 120, 12, "#ff7ad9"), (150, 120, 108, 12, "#43d6ff")]
for i, (x, y, h, r, c) in enumerate(SAT): tower(f"Sat{i}", x, y, h, r, c)
# skyways across the block (they pass through the towers on both sides) and sky bridges to the satellites
deck = M("Skyway", "#3b4656", metal=.5, rough=.3); edgeC = M("SkywayGlow", "#43d6ff", emit="#43d6ff", estr=8); edgeV = M("SkywayGlowV", "#9a7bff", emit="#9a7bff", estr=8)
sky_lobby = 18 * 4.2 + 6.5 + 3 * 5.2
for z, yy, em in ((sky_lobby, 44, edgeC), (TOP * .78, 58, edgeV)):
    box("Skyway", 560, 8, 1.6, 0, yy, z, deck, F)
    box("SkywayEdge", 560, .35, .35, 0, yy - 3.8, z + 1.7, em, F); box("SkywayEdge", 560, .35, .35, 0, yy + 3.8, z + 1.7, em, F)
    for x in range(-260, 261, 65):
        if abs(x) > 40: box("Pylon", 2.2, 2.2, z, x, yy, 0, M("Pylon", "#8995a3", metal=.4), F)
    box("TowerLink", 6, yy - TD / 2, 3.4, 0, (yy + TD / 2) / 2, z + 1.6, M("BridgeGlass", "#e9f6ff", alpha=.5, emit="#43d6ff", estr=.6), F)
# floating garden platforms under glass domes
for x, y, z in ((-52, -34, 64), (56, -30, 82), (-40, 26, 112), (44, 40, 46)):
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=4, radius2=9, depth=2.4, location=(x, y, z)); p = bpy.context.object; p.data.materials.append(M("PodBase", "#d9e6ee", metal=.5, rough=.2))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=8.6, location=(x, y, z + 1.2)); dm = bpy.context.object; dm.scale.z = .55; dm.data.materials.append(M("Dome", "#bdefff", metal=.2, rough=0, alpha=.35))
    for o in (p, dm):
        for cc in o.users_collection: cc.objects.unlink(o)
        F.objects.link(o)
    for k in range(6):
        o = bpy.data.objects.new("PodTree", lm); o.location = (x + random.uniform(-5, 5), y + random.uniform(-5, 5), z + 2.4); F.objects.link(o)
# holographic rings that show the businesses
for z, r, c in ((TOP * .62, 30, "#6ff7ff"), (TOP * .86, 25, "#ff7ad9")):
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=.25, location=(0, 0, z)); t = bpy.context.object; t.data.materials.append(M("Holo_" + c, c, emit=c, estr=12))
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=r, depth=3.2, end_fill_type="NOTHING", location=(0, 0, z + 1.8)); b = bpy.context.object
    b.data.materials.append(M("HoloBand_" + c, c, emit=c, estr=2.5, alpha=.28))
    for o in (t, b):
        for cc in o.users_collection: cc.objects.unlink(o)
        F.objects.link(o)
# the live world map panel in front of the tower
box("WorldMap", 50, .2, 25, 0, -TD / 2 - 16, TOP * .5 - 12.5, M("WorldMap", "#0a2a48", emit="#43d6ff", estr=1.2, alpha=.7), F)
# air taxis and flying cars with light trails
taxi = M("Taxi", "#f4f6f8", metal=.6, rough=.2); glow = M("TaxiGlow", "#5ff4ff", emit="#5ff4ff", estr=15)
for k in range(16):
    a = random.uniform(0, math.tau); r = random.uniform(45, 150); z = random.uniform(30, TOP + 20)
    x, y = math.cos(a) * r, math.sin(a) * r * .8
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(x, y, z)); o = bpy.context.object; o.scale = (2.6, 1, .8); o.rotation_euler.z = a + math.pi / 2; o.data.materials.append(taxi)
    bpy.ops.mesh.primitive_cylinder_add(radius=.12, depth=14, location=(x, y, z)); tr = bpy.context.object; tr.rotation_euler = (0, math.pi / 2, a + math.pi / 2); tr.data.materials.append(glow)
    for oo in (o, tr):
        for cc in oo.users_collection: cc.objects.unlink(oo)
        F.objects.link(oo)
print("future objects", len(F.all_objects), "top", round(TOP, 1))
