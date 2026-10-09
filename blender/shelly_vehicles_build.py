# Shelly vehicles, trees and site props for Gateway (and any other world): modelled in Blender with
# rounded panels (Bevel modifier), real wheels (tyre, rim, hub, nuts), glass and trim as separate parts
# so the website can paint each one (fleet colour, glass, black plastic, chrome, rubber).
# Run headless:  python blender/shelly_vehicles_build.py   -> docs/kit/vehicle-mesh.js
# Coordinates are given in WEB axes (x right, y up, z forward) and converted for Blender here.
import bpy, bmesh, math, os, base64, struct, json
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "kit", "vehicle-mesh.js")
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
SC = bpy.context.scene.collection

def B(x, y, z): return Vector((x, -z, y))           # web -> Blender

def obj(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); SC.objects.link(o); return o

def bevel(o, w, seg=3, angle=True):
    m = o.modifiers.new("bev", "BEVEL"); m.width = w; m.segments = seg; m.limit_method = "ANGLE" if angle else "NONE"; m.harden_normals = False
    return o

def cube(name, w, h, d, x=0, y=0, z=0, bev=0.0, seg=3, taper=None):
    """box in web coords: centre (x, y + h/2, z). taper: dict of vertex nudges by corner flags."""
    bm = bmesh.new(); vs = []
    for sy in (0, 1):
        for sz in (-1, 1):
            for sx in (-1, 1):
                p = [x + sx * w / 2, y + sy * h, z + sz * d / 2]
                if taper: p = taper(p, sx, sy, sz)
                vs.append(bm.verts.new(B(*p)))
    F = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    for f in F: bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = obj(name, bm)
    if bev: bevel(o, bev, seg)
    return o

def prism(name, prof, width, x=0, bev=0.0, seg=3, inset_top=0.0, ytop=None):
    """extrude a side profile [(z, y), ...] (anticlockwise seen from +x) across width; optional tumblehome."""
    bm = bmesh.new(); L = []; R = []
    for z, y in prof:
        k = inset_top * max(0, (y - (ytop or 0))) if ytop is not None else 0
        L.append(bm.verts.new(B(x - width / 2 + k, y, z))); R.append(bm.verts.new(B(x + width / 2 - k, y, z)))
    bm.faces.new(L); bm.faces.new(list(reversed(R)))
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n; bm.faces.new([L[i], L[j], R[j], R[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = obj(name, bm)
    if bev: bevel(o, bev, seg)
    return o

def cyl(name, r, length, x, y, z, axis="x", seg=24, r2=None, bev=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r2 if r2 is not None else r, depth=length)
    for v in bm.verts:
        a, b, c = v.co.x, v.co.y, v.co.z            # cone along Blender Z
        p = {"x": (c, a, b), "y": (a, c, b), "z": (a, b, c)}[axis]
        v.co = B(x + p[0], y + p[1], z + p[2])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = obj(name, bm)
    if bev: bevel(o, bev, 2)
    return o

def lathe(name, prof, seg=28, axis="x", at=(0, 0, 0)):
    """revolve [(r, t), ...] round an axis (t along the axis)."""
    bm = bmesh.new(); rings = []
    for k in range(seg):
        a = k / seg * math.tau; ring = []
        for r, t in prof:
            u, v = math.cos(a) * r, math.sin(a) * r
            p = {"x": (t, u, v), "z": (u, v, t), "y": (u, t, v)}[axis]
            ring.append(bm.verts.new(B(at[0] + p[0], at[1] + p[1], at[2] + p[2])))
        rings.append(ring)
    for k in range(seg):
        a, b = rings[k], rings[(k + 1) % seg]
        for i in range(len(prof) - 1): bm.faces.new([a[i], a[i + 1], b[i + 1], b[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return obj(name, bm)

def bake(o):
    dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev); me.transform(o.matrix_world)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:])
    # split sharp edges so flat panels stay flat and bevels stay round
    bmesh.ops.split_edges(bm, edges=[e for e in bm.edges if e.calc_face_angle(0) > math.radians(40)])
    bm.normal_update(); P, N, I = [], [], []
    for v in bm.verts:
        P += [v.co.x, v.co.z, -v.co.y]; N += [v.normal.x, v.normal.z, -v.normal.y]
    for f in bm.faces: I += [v.index for v in f.verts]
    bm.free(); return P, N, I

def join(*objs):
    P, N, I = [], [], []
    for o in objs:
        p, n, i = bake(o); off = len(P) // 3; P += p; N += n; I += [k + off for k in i]
    return P, N, I

parts = {}
# =============================================================== truck cab (cab-over), front face at z = 0, extends back
W, CL = 2.5, 2.45
def cabshape(p, sx, sy, sz):
    if sy == 1 and sz == 1: p[2] -= .22                # windscreen leans back
    if sy == 1: p[0] *= .97
    return p
shell = cube("cabShell", W, 2.42, CL, 0, .92, -CL / 2, bev=.16, taper=cabshape)
roof = cube("cabRoof", W - .5, .38, 1.5, 0, 3.32, -1.1, bev=.14, taper=lambda p, sx, sy, sz: ([p[0], p[1], p[2] - (.35 if sy == 1 and sz == 1 else 0)]))
parts["cabPaint"] = join(shell, roof)
ws = cube("ws", W - .34, .78, .05, 0, 2.28, .02, bev=.03, taper=lambda p, sx, sy, sz: [p[0], p[1], p[2] - (.2 if sy == 1 else 0)])
swL = cube("swL", .04, .62, 1.0, W / 2 + .005, 2.22, -.75, bev=.02); swR = cube("swR", .04, .62, 1.0, -W / 2 - .005, 2.22, -.75, bev=.02)
parts["cabGlass"] = join(ws, swL, swR)
grille = cube("grille", W - .5, .8, .06, 0, 1.25, .03, bev=.03)
bump = cube("bump", W + .06, .42, .3, 0, .62, .0, bev=.08)
steps = [cube("step%d" % i, .06, .08, .5, s * (W / 2 + .02), y, -.6, bev=.02) for s in (-1, 1) for i, y in enumerate((.55, .95))]
mir = []
for s in (-1, 1):
    mir.append(cyl("marm%d" % s, .025, .55, s * (W / 2 + .2), 2.55, -.05, "x", 8))
    mir.append(cube("mhead%d" % s, .12, .5, .2, s * (W / 2 + .45), 2.15, -.05, bev=.04))
chassis = [cube("rail%d" % s, .18, .28, CL + .4, s * .55, .55, -CL / 2 - .2) for s in (-1, 1)]
tank = cyl("tank", .3, 1.1, -W / 2 + .4, .62, -1.6, "z", 18)
parts["cabBlack"] = join(grille, bump, *steps, *mir, *chassis, tank)
bars = [cube("gb%d" % i, W - .62, .05, .05, 0, 1.36 + i * .14, .07) for i in range(5)]
visor = cube("visor", W - .2, .08, .35, 0, 3.12, -.02, bev=.03)
parts["cabChrome"] = join(*bars, visor)
# =============================================================== van (one-piece body), centred, length 5.7, width 2.0
VL = 5.7; zf, zr = VL / 2, -VL / 2
vprof = [(zr, .42), (zr, 2.42), (zr + .15, 2.55), (1.15, 2.55), (1.95, 1.55), (2.6, 1.28), (zf, 1.1), (zf, .42)]
parts["vanPaint"] = join(prism("van", vprof, 2.0, bev=.13, seg=3, inset_top=.06, ytop=1.5))
vws = prism("vws", [(1.18, 2.45), (1.95, 1.6), (1.98, 1.62), (1.21, 2.47)], 1.78)
vsw = [cube("vsw%d" % s, .04, .62, .85, s * .99, 1.72, 1.05, bev=.02) for s in (-1, 1)]
parts["vanGlass"] = join(vws, *vsw)
vb = cube("vbump", 2.04, .32, .25, 0, .42, zf - .05, bev=.07); vbr = cube("vbumpr", 2.04, .28, .2, 0, .42, zr + .05, bev=.06)
vgr = cube("vgr", 1.2, .28, .05, 0, .78, zf + .01, bev=.02)
vstrip = [cube("vst%d" % s, .04, .1, VL - .4, s * 1.005, .9, 0) for s in (-1, 1)]
parts["vanBlack"] = join(vb, vbr, vgr, *vstrip)
# =============================================================== car (saloon / hatch / SUV) centred, length 4.4
def car(name, prof, wd, top):
    body = prism(name, prof, wd, bev=.14, seg=4, inset_top=.18, ytop=.8)
    return body
saloon = [(-2.2, .32), (-2.22, .78), (-1.9, .98), (-1.3, 1.0), (-.75, 1.40), (.35, 1.42), (1.1, .99), (2.05, .82), (2.2, .62), (2.2, .32)]
hatch = [(-2.0, .32), (-2.02, .86), (-1.95, 1.05), (-1.7, 1.40), (.35, 1.44), (1.05, 1.0), (1.95, .84), (2.05, .62), (2.05, .32)]
suv = [(-2.3, .42), (-2.32, 1.0), (-2.25, 1.68), (.45, 1.72), (1.25, 1.18), (2.2, 1.02), (2.32, .8), (2.32, .42)]
for k, prof, wd, gl in (("saloon", saloon, 1.82, (.99, 1.38, -1.25, 1.05)), ("hatch", hatch, 1.76, (1.0, 1.4, -1.9, 1.0)), ("suv", suv, 1.92, (1.14, 1.66, -2.2, 1.2))):
    lower = [(z, min(y, gl[0])) for z, y in prof]
    body = prism(k + "Low", lower, wd, bev=.13, seg=4)
    roofp = [(z, y) for z, y in prof]
    cabin = prism(k + "Cab", [(gl[2] + .06, gl[0] - .02), (gl[2] + .06, gl[1] - .08)] + [(z, y) for z, y in prof if y > gl[0] + .02 and gl[2] < z < gl[3]] + [(gl[3], gl[0] - .02)], wd - .14, inset_top=.2, ytop=gl[0])
    # roof skin and pillars in body colour; the rest of the cabin is glass
    ztop = [z for z, y in prof if y >= gl[1] - .1]
    rf = cube(k + "Roof", wd - .3, .06, (max(ztop) - min(ztop)) + .1, 0, gl[1] - .04, (max(ztop) + min(ztop)) / 2, bev=.03)
    pil = [cube(k + "pil%d%d" % (s, i), .06, gl[1] - gl[0], .1, s * (wd / 2 - .12), gl[0], zz) for s in (-1, 1) for i, zz in enumerate(((gl[2] + gl[3]) / 2 - .1,))]
    parts[k + "Paint"] = join(body, rf, *pil)
    parts[k + "Glass"] = join(cabin)
    fb = cube(k + "fb", wd + .02, .26, .22, 0, .3, max(z for z, _ in prof) - .05, bev=.07)
    rb = cube(k + "rb", wd + .02, .26, .2, 0, .3, min(z for z, _ in prof) + .05, bev=.07)
    sk = [cube(k + "sk%d" % s, .05, .12, 2.4, s * (wd / 2 + .005), .33, 0) for s in (-1, 1)]
    parts[k + "Black"] = join(fb, rb, *sk)
# =============================================================== wheels: tyre (rubber) and rim (metal), axis along x, centred
def tyre(name, R, w):
    r0 = R * .62
    prof = [(r0, -w / 2), (R - .05, -w / 2), (R - .01, -w / 2 + .03), (R, -w / 4), (R, w / 4), (R - .01, w / 2 - .03), (R - .05, w / 2), (r0, w / 2)]
    o = lathe(name, prof, 32)
    return o
def rim(name, R, w):
    r0 = R * .62
    o1 = lathe(name, [(0, w / 2 - .04), (r0 * .35, w / 2 - .03), (r0 * .45, w / 2 - .07), (r0 * .95, w / 2 - .05), (r0, w / 2 - .02), (r0, -w / 2 + .02), (0, -w / 2 + .02)], 28)
    nuts = [cyl(name + "n%d" % k, .022, .05, w / 2 - .02, math.cos(k / 8 * math.tau) * r0 * .26, math.sin(k / 8 * math.tau) * r0 * .26, "x", 6) for k in range(8)]
    hub = cyl(name + "hub", r0 * .16, .08, w / 2 - .02, 0, 0, "x", 16)
    return o1, nuts, hub
parts["truckTyre"] = join(tyre("tt", .5, .34)); o1, nuts, hub = rim("tr", .5, .34); parts["truckRim"] = join(o1, *nuts, hub)
parts["carTyre"] = join(tyre("ct", .33, .22)); o1, nuts, hub = rim("cr", .33, .22); parts["carRim"] = join(o1, *nuts[:5], hub)
# =============================================================== reefer unit (fridge on the trailer front)
parts["reefer"] = join(cube("reef", 1.7, 1.0, .5, 0, 0, 0, bev=.08))
parts["reeferGrille"] = join(*[cube("rg%d" % i, 1.3, .05, .04, 0, .2 + i * .12, .26) for i in range(6)])
# =============================================================== forklift (counterbalance, 2.5 t), origin at ground centre, forks at +z
body = cube("fbody", 1.18, .62, 1.75, 0, .3, -.25, bev=.12)
cw = cube("fcw", 1.2, .85, .55, 0, .3, -1.05, bev=.16, taper=lambda p, sx, sy, sz: [p[0], p[1], p[2] - (.08 if sz == -1 and sy == 1 else 0)])
hood = cube("fhood", 1.0, .25, .9, 0, .92, -.55, bev=.1)
parts["liftPaint"] = join(body, cw, hood)
posts = [cyl("fp%d%d" % (sx, sz), .045, 1.25, sx * .52, 1.6, z, "y", 10) for sx in (-1, 1) for sz, z in ((0, .45), (1, -.85))]
canopy = cube("fcan", 1.15, .08, 1.45, 0, 2.2, -.2, bev=.03)
cslats = [cube("fsl%d" % i, .04, .05, 1.35, -.45 + i * .15, 2.17, -.2) for i in range(7)]
seat = cube("fseat", .5, .12, .45, 0, 1.17, -.45, bev=.05); back = cube("fback", .5, .5, .1, 0, 1.25, -.7, bev=.05)
wheel = lathe("fsw", [(.17, -.02), (.19, 0), (.17, .02)], 20, "y", (0, 1.55, .15))
col = cyl("fcol", .03, .5, 0, 1.33, .25, "y", 8)
tank = cyl("ftank", .16, .75, 0, 1.25, -1.05, "x", 16)
parts["liftBlack"] = join(*posts, canopy, *cslats, seat, back, wheel, col, tank)
mast = [cube("fm%d" % s, .1, 2.45, .14, s * .36, .12, .78, bev=.02) for s in (-1, 1)]
xb = [cube("fx%d" % i, .82, .08, .08, 0, y, .78) for i, y in enumerate((.6, 1.5, 2.5))]
parts["liftMast"] = join(*mast, *xb)
parts["forkCarriage"] = join(cube("fcar", .92, .55, .07, 0, 0, 0, bev=.02), *[cube("fk%d" % s, .11, .05, 1.1, s * .27, -.0, .58, bev=.01) for s in (-1, 1)], *[cube("fkv%d" % s, .11, .5, .05, s * .27, 0, .05) for s in (-1, 1)])
parts["liftTyre"] = join(tyre("ft", .27, .2)); o1, nuts, hub = rim("frm", .27, .2); parts["liftRim"] = join(o1, hub)
# =============================================================== trees: trunk and a clumped canopy (two kinds), origin at ground
trunk = cyl("trunk", .16, 2.4, 0, 1.2, 0, "y", 8, r2=.1)
br = [cyl("br%d" % i, .06, 1.0, math.cos(i * 2.1) * .3, 2.2, math.sin(i * 2.1) * .3, "y", 6, r2=.03) for i in range(3)]
parts["treeTrunk"] = join(trunk, *br)
def blob(name, r, c, sub=2):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts:
        n = (math.sin(v.co.x * 9.1) + math.sin(v.co.y * 7.3 + 1) + math.sin(v.co.z * 8.7 + 2)) * .045 * r
        v.co = v.co * (1 + n / r)
        v.co = B(c[0] + v.co.x, c[1] + v.co.z, c[2] - v.co.y)
    return obj(name, bm)
parts["treeCrownA"] = join(*[blob("ca%d" % i, r, c) for i, (r, c) in enumerate([(1.35, (0, 3.4, 0)), (1.0, (.85, 3.0, .3)), (1.05, (-.8, 3.1, -.2)), (.95, (.1, 4.25, .25)), (.9, (.2, 3.0, -.95)), (.85, (-.3, 3.0, .95))])])
parts["treeCrownB"] = join(*[blob("cb%d" % i, r, c) for i, (r, c) in enumerate([(1.05, (0, 2.6, 0)), (.95, (0, 3.5, 0)), (.75, (0, 4.3, 0)), (.5, (0, 4.95, 0))])])
# =============================================================== yard props: dock leveller lip, bumpers, bollard, light pole head, fence post
parts["bumper"] = join(cube("bp", .25, .5, .14, 0, 0, 0, bev=.05))
parts["bollard"] = join(cyl("bol", .11, 1.0, 0, .5, 0, "y", 14, bev=.02), cyl("bolcap", .12, .06, 0, 1.02, 0, "y", 14))
parts["lampHead"] = join(cube("lh", .45, .12, .9, 0, 0, .3, bev=.04), cyl("lpole", .08, 9.0, 0, -4.5, -.1, "y", 10, r2=.11))

def pack(P, N, I):
    q = struct.pack("<%dh" % len(P), *[max(-32767, min(32767, round(v * 2000))) for v in P])
    n = struct.pack("<%db" % len(N), *[max(-127, min(127, round(v * 127))) for v in N])
    fmt = "H" if len(P) // 3 < 65535 else "I"
    i = struct.pack("<%d%s" % (len(I), fmt), *I)
    return [base64.b64encode(q).decode(), base64.b64encode(n).decode(), base64.b64encode(i).decode()]
lines = ["/* Generated by blender/shelly_vehicles_build.py - do not edit by hand. Vehicles, wheels, forklift, trees and yard props:",
         "   [positions Int16 (x 1/2000 m), normals Int8, indices Uint16] as base64, web axes (Y up, front +Z). */",
         "export const VEHICLE = {"]
tv = 0
for k, (P, N, I) in parts.items():
    assert len(P) // 3 < 65535, k
    tv += len(P) // 3; lines.append('  %s: %s,' % (k, json.dumps(pack(P, N, I))))
lines.append("};")
open(OUT, "w").write("\n".join(lines) + "\n")
print("parts", len(parts), "verts", tv, "bytes", os.path.getsize(OUT))
