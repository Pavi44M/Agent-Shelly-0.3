# Shelly people - the human body used by every 3D world (Store Floor, Gateway, Shelly Tower, Shelly HQ).
# Builds each body part in Blender with the Skin modifier (smooth, rounded limbs), one mesh per part with
# its pivot at the joint, so the website can bend hips, knees, shoulders, elbows and the neck.
# Run headless:  python blender/shelly_people_build.py   (needs the bpy module)  -> writes
# docs/kit/human-mesh.js. Change the sizes below and run again to change the people.
# Blender axes: Z up, the person faces -Y. The web uses Y up, facing +Z: web = (x, z, -y).
import bpy, bmesh, json, math, os, base64, struct, sys
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "kit", "human-mesh.js")
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)

def skin(name, pts, sub=2, ends=True):
    """pts: list of (x, y, z, rx, ry) in Blender metres; builds a smooth tube through them."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((p[0], p[1], p[2])) for p in pts]
    for a, b in zip(vs, vs[1:]): bm.edges.new((a, b))
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    o.modifiers.new("skin", "SKIN")
    sv = me.skin_vertices[0].data
    for i, p in enumerate(pts): sv[i].radius = (p[3], p[4])
    sv[0].use_root = True
    s = o.modifiers.new("sub", "SUBSURF"); s.levels = sub; s.render_levels = sub
    return o

def ellipsoid(name, r, c=(0, 0, 0), seg=20, rings=14):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1)
    for v in bm.verts: v.co = Vector((v.co.x * r[0] + c[0], v.co.y * r[1] + c[1], v.co.z * r[2] + c[2]))
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o

def bake(o):
    """apply modifiers, return (positions, normals, indices) in WEB axes."""
    dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev); me.transform(o.matrix_world)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.normal_update()
    P, N, I = [], [], []
    for v in bm.verts:
        P += [v.co.x, v.co.z, -v.co.y]; n = v.normal; N += [n.x, n.z, -n.y]
    for f in bm.faces:
        a, b, c = [v.index for v in f.verts]; I += [a, b, c]
    bm.free(); return P, N, I

def join(*objs):
    P, N, I = [], [], []
    for o in objs:
        p, n, i = bake(o); off = len(P) // 3
        P += p; N += n; I += [k + off for k in i]
    return P, N, I

parts = {}
# ---- torso (shirt): pelvis top to the base of the neck; two builds (A broader shoulders, B narrower waist)
def torso(rows): return skin("torso", [(0, 0, z, rx, ry) for z, rx, ry in rows])
parts["torsoA"] = join(torso([(.90, .152, .102), (1.00, .150, .100), (1.12, .156, .104), (1.24, .172, .110), (1.33, .186, .108), (1.40, .168, .094), (1.46, .080, .068)]))
parts["torsoB"] = join(torso([(.90, .164, .108), (1.00, .146, .096), (1.10, .134, .092), (1.22, .152, .112), (1.31, .160, .102), (1.39, .150, .088), (1.46, .070, .062)]))
# ---- pelvis (trousers) and a skirt
parts["pelvis"] = join(skin("pelvis", [(0, 0, .80, .150, .100), (0, 0, .90, .162, .108), (0, 0, .99, .156, .102)]))
parts["skirt"] = join(skin("skirt", [(0, 0, .52, .215, .175), (0, 0, .72, .185, .140), (0, 0, .95, .158, .104)], sub=2))
# ---- neck and head (pivot at the base of the neck, web y = 1.46)
NZ = 1.46
neck = skin("neck", [(0, 0, -.03, .058, .056), (0, 0, .10, .052, .050)], sub=1)
parts["neck"] = join(neck)
skull = ellipsoid("skull", (.100, .112, .124), (0, .006, .138), 24, 18)
for v in skull.data.vertices:                         # a jaw: narrower and further forward low down
    z = v.co.z - .135
    if z < -.02:
        k = min(1, (-.02 - z) / .09); v.co.x *= 1 - .28 * k; v.co.y -= .018 * k * (1 if v.co.y < .006 else -.3)
    if v.co.y > .03 and z > -.02: v.co.y += .012 * (z + .02) / .14   # rounder back of the head
nose = skin("nose", [(0, -.098, .148, .016, .014), (0, -.112, .128, .020, .016)], sub=1)
earL = ellipsoid("earL", (.012, .022, .032), (.095, .012, .14), 10, 8); earR = ellipsoid("earR", (.012, .022, .032), (-.095, .012, .14), 10, 8)
parts["head"] = join(skull, nose, earL, earR)
eyeL = ellipsoid("eyeL", (.013, .006, .011), (.036, -.096, .158), 10, 8); eyeR = ellipsoid("eyeR", (.013, .006, .011), (-.036, -.096, .158), 10, 8)
browL = skin("browL", [(.018, -.099, .182, .006, .004), (.052, -.093, .184, .006, .004)], sub=1)
browR = skin("browR", [(-.018, -.099, .182, .006, .004), (-.052, -.093, .184, .006, .004)], sub=1)
parts["eyes"] = join(eyeL, eyeR, browL, browR)
mouth = skin("mouth", [(-.022, -.099, .092, .005, .004), (0, -.103, .090, .006, .004), (.022, -.099, .092, .005, .004)], sub=1)
parts["mouth"] = join(mouth)
# ---- hair styles (a shell over the skull, trimmed)
def hairshell(name, r, c, keep):
    o = ellipsoid(name, r, c, 26, 18); bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(v.co)], context="VERTS"); bm.to_mesh(o.data); bm.free()
    so = o.modifiers.new("thick", "SOLIDIFY"); so.thickness = .012; so.offset = 1
    return o
short = hairshell("short", (.101, .113, .123), (0, .008, .14), lambda c: c.z > .155 - (c.y + .02) * .9 or (c.y > .03 and c.z > .07))
parts["hairShort"] = join(short)
longh = hairshell("long", (.104, .115, .126), (0, .01, .14), lambda c: c.z > .16 - (c.y + .02) * .8 or (c.y > -.01 and c.z > .02))
drape = skin("drape", [(0, .045, .11, .085, .045), (0, .06, .00, .09, .04), (0, .07, -.07, .08, .03)], sub=1)
parts["hairLong"] = join(longh, drape)
bunbase = hairshell("bunb", (.100, .112, .122), (0, .008, .14), lambda c: c.z > .15 - (c.y + .02) * .7 or (c.y > .02 and c.z > .06))
bun = ellipsoid("bun", (.045, .04, .045), (0, .10, .22), 14, 10)
parts["hairBun"] = join(bunbase, bun)
curly = hairshell("curly", (.110, .120, .128), (0, .008, .15), lambda c: c.z > .14 - (c.y + .02) * .7 or (c.y > .03 and c.z > .06))
dp = curly.modifiers.new("bumps", "DISPLACE"); tx = bpy.data.textures.new("curl", "VORONOI"); tx.noise_scale = .025; dp.texture = tx; dp.strength = .012
parts["hairCurly"] = join(curly)
# ---- legs (pivot at the hip, then the knee, then the ankle), arms (shoulder, elbow, wrist)
parts["thigh"] = join(skin("thigh", [(0, 0, .05, .088, .092), (0, -.006, -.18, .078, .080), (0, 0, -.40, .062, .064), (0, 0, -.43, .058, .060)]))
parts["shin"] = join(skin("shin", [(0, 0, .03, .060, .062), (0, .008, -.14, .057, .063), (0, 0, -.36, .043, .045), (0, 0, -.42, .040, .042)]))
parts["shoe"] = join(skin("shoe", [(0, .035, -.035, .040, .034), (0, -.04, -.042, .044, .030), (0, -.11, -.048, .040, .022)]))
parts["upperArm"] = join(skin("upperArm", [(0, 0, .04, .060, .062), (0, 0, -.12, .052, .054), (0, 0, -.28, .043, .045), (0, 0, -.30, .040, .042)]))
parts["sleeve"] = join(skin("sleeve", [(0, 0, .05, .068, .070), (0, 0, -.14, .062, .064)], sub=1))
parts["forearm"] = join(skin("forearm", [(0, 0, .03, .043, .045), (0, -.004, -.09, .043, .045), (0, 0, -.24, .031, .033), (0, 0, -.25, .030, .032)]))
hand = skin("hand", [(0, 0, 0, .030, .018), (0, -.004, -.06, .036, .016), (0, -.008, -.11, .028, .014)], sub=1)
thumb = skin("thumb", [(.02, -.012, -.025, .010, .010), (.03, -.03, -.06, .009, .009)], sub=1)
parts["hand"] = join(hand, thumb)
# ---- work wear: hi-vis vest with reflective bands, a hard hat
vest = skin("vest", [(0, 0, z, rx, ry) for z, rx, ry in [(.96, .172, .118), (1.12, .170, .116), (1.26, .182, .120), (1.38, .180, .110), (1.44, .120, .085)]], sub=2)
parts["vest"] = join(vest)
bands = []
for z in (1.04, 1.18):
    b = skin("band%d" % z, [(0, 0, z, .178, .122), (0, 0, z + .025, .178, .122)], sub=1); bands.append(b)
parts["vestBands"] = join(*bands)
hat = ellipsoid("hat", (.118, .128, .095), (0, .0, .17), 20, 12)
bm = bmesh.new(); bm.from_mesh(hat.data); bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < .165], context="VERTS"); bm.to_mesh(hat.data); bm.free()
brim = skin("brim", [(0, -.01, .166, .135, .145), (0, -.01, .172, .135, .145)], sub=1)
parts["hardHat"] = join(hat, brim)
# chef hat and aprons stay as simple shapes in people.js

# ---- pack: Int16 positions (1/4000 m), Int8 normals, Uint16 indices, base64
def pack(P, N, I):
    q = struct.pack("<%dh" % len(P), *[max(-32767, min(32767, round(v * 4000))) for v in P])
    n = struct.pack("<%db" % len(N), *[max(-127, min(127, round(v * 127))) for v in N])
    i = struct.pack("<%dH" % len(I), *I)
    return [base64.b64encode(q).decode(), base64.b64encode(n).decode(), base64.b64encode(i).decode()]
lines = ["/* Generated by blender/shelly_people_build.py - do not edit by hand. Body parts for Shelly people:",
         "   [positions Int16 (x 1/4000 m), normals Int8, indices Uint16] as base64, web axes (Y up, facing +Z). */",
         "export const HUMAN = {"]
tv = 0
for k, (P, N, I) in parts.items():
    tv += len(P) // 3
    lines.append('  %s: %s,' % (k, json.dumps(pack(P, N, I))))
lines.append("};")
open(OUT, "w").write("\n".join(lines) + "\n")
print("parts", len(parts), "verts", tv, "bytes", os.path.getsize(OUT))
