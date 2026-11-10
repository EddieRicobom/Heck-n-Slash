"""Evaluate skinning from a GLB and render: tail weights, bent tail, walk frames. usage: pose_test.py file.glb out.png"""
import io, sys
import numpy as np
from PIL import Image
from fix_eyes import read_glb
from inspect_rig import acc
from render_views import render


def quat_m(q):
    x, y, z, w = q / np.linalg.norm(q)
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def trs(t, r, s):
    M = np.eye(4); M[:3, :3] = quat_m(np.array(r)) * np.array(s); M[:3, 3] = t
    return M


class Rig:
    def __init__(s, path):
        s.j, s.b = j, b = read_glb(path)
        b = bytes(b); s.b = b
        s.skin = j["skins"][0]
        p = j["meshes"][0]["primitives"][0]
        s.V = acc(j, b, p["attributes"]["POSITION"])
        s.UV = acc(j, b, p["attributes"]["TEXCOORD_0"]).copy(); s.UV[:, 1] = 1 - s.UV[:, 1]
        s.F = acc(j, b, p["indices"]).reshape(-1, 3).astype(int)
        s.J = acc(j, b, p["attributes"]["JOINTS_0"]).astype(int)
        s.W = acc(j, b, p["attributes"]["WEIGHTS_0"])
        if s.W.max() > 2: s.W /= 65535 if s.W.max() > 255 else 255
        s.IBM = acc(j, b, s.skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
        im = j["images"][j["textures"][j["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]["index"]]["source"]]
        v = j["bufferViews"][im["bufferView"]]
        s.tex = np.asarray(Image.open(io.BytesIO(b[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])).convert("RGB"))
        s.names = [j["nodes"][n].get("name") for n in s.skin["joints"]]
        s.parent = {c: i for i, n in enumerate(j["nodes"]) for c in n.get("children", [])}

    def pose(s, t=None, extra=None):
        j = s.j
        L = {}
        for i, n in enumerate(j["nodes"]):
            L[i] = [list(n.get("translation", [0, 0, 0])), list(n.get("rotation", [0, 0, 0, 1])), list(n.get("scale", [1, 1, 1]))]
        if t is not None and j.get("animations"):
            a = j["animations"][0]
            for c in a["channels"]:
                sm = a["samplers"][c["sampler"]]
                T = acc(j, s.b, sm["input"]).ravel(); O = acc(j, s.b, sm["output"])
                k = min(int(np.searchsorted(T, t * T[-1])), len(T) - 1)
                slot = {"translation": 0, "rotation": 1, "scale": 2}[c["target"]["path"]]
                L[c["target"]["node"]][slot] = list(O[k])
        if extra:
            for i, q in extra.items():
                L[i][1] = q
        G = {}
        def g(i):
            if i not in G:
                m = trs(*L[i])
                G[i] = g(s.parent[i]) @ m if i in s.parent else m
            return G[i]
        M = np.array([g(n) @ s.IBM[k] for k, n in enumerate(s.skin["joints"])])
        Vh = np.c_[s.V, np.ones(len(s.V))]
        out = np.zeros((len(s.V), 3))
        for c in range(4):
            out += s.W[:, c, None] * np.einsum("ij,ij->i", M[s.J[:, c]][:, :3, :], Vh[:, None, :].repeat(1, 1)[:, 0, :][:, None, :].repeat(3, 1))[:, None][:, 0] if False else s.W[:, c, None] * (M[s.J[:, c], :3, :] @ Vh[..., None])[..., 0]
        return out


if __name__ == "__main__":
    r = Rig(sys.argv[1])
    if r.j["nodes"][0] is None:
        pass
    panels = []
    # tail weight tint
    tail_j = [i for i, n in enumerate(r.names) if n.startswith("Tail")]
    tw = sum((r.W * (r.J == k)).sum(1) for k in tail_j) if tail_j else np.zeros(len(r.V))
    tex = r.tex.copy()
    print("tail-weighted verts", int((tw > .5).sum()))
    panels += [render(r.V, r.F, r.UV, tex, y, size=480) for y in (90, 180)]
    if tail_j:
        s30 = np.sin(np.radians(14)); c30 = np.cos(np.radians(14))
        ex = {r.skin["joints"][k]: [0, s30, 0, c30] for k in tail_j}
        panels.append(render(r.pose(extra=ex), r.F, r.UV, tex, 180, size=480))
    if r.j.get("animations"):
        panels += [render(r.pose(t=x), r.F, r.UV, tex, 90, size=480) for x in (.25, .75)]
        panels.append(render(r.pose(t=.25), r.F, r.UV, tex, 200, size=480))
    W = sum(p.width for p in panels)
    o = Image.new("RGB", (W, 480))
    x = 0
    for p in panels:
        o.paste(p, (x, 0)); x += p.width
    o.save(sys.argv[2])
    print("saved", sys.argv[2])
