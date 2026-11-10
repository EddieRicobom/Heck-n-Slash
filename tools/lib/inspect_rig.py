"""Print rig stats and which joints drive the tail. usage: inspect_rig.py file.glb"""
import collections, json, struct, sys
import numpy as np

COMP = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def load(p):
    b = open(p, "rb").read()
    jl = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20:20 + jl]), b[28 + jl:]


def acc(j, bin_, i):
    a = j["accessors"][i]
    v = j["bufferViews"][a["bufferView"]]
    n = NC[a["type"]]
    dt = np.dtype("<" + COMP[a["componentType"]])
    off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = v.get("byteStride", 0) or dt.itemsize * n
    raw = np.frombuffer(bin_, np.uint8, a["count"] * stride, off)
    if stride == dt.itemsize * n:
        out = np.frombuffer(raw.tobytes(), dt).reshape(a["count"], n)
    else:
        out = np.array([np.frombuffer(raw[k * stride:k * stride + dt.itemsize * n].tobytes(), dt) for k in range(a["count"])])
    return out.astype(float)


if __name__ == "__main__":
    j, b = load(sys.argv[1])
    skin = j["skins"][0]
    names = [j["nodes"][n].get("name", str(n)) for n in skin["joints"]]
    print("joints", len(names), names)
    print("meshes", len(j["meshes"]), "materials", len(j.get("materials", [])), "images", len(j.get("images", [])), "anims", len(j.get("animations", [])))
    tris = 0
    for m in j["meshes"]:
        for p in m["primitives"]:
            tris += j["accessors"][p["indices"]]["count"] // 3
            V = acc(j, b, p["attributes"]["POSITION"])
            J = acc(j, b, p["attributes"]["JOINTS_0"]).astype(int)
            W = acc(j, b, p["attributes"]["WEIGHTS_0"])
            W = W / (65535 if W.max() > 2 else 1)
    print("tris", tris, "verts", len(V), "bounds", V.min(0).round(3), V.max(0).round(3))
    h = V[:, 1].max() - V[:, 1].min()
    zmin = V[:, 2].min()
    tail = V[:, 2] < zmin + (V[:, 2].max() - zmin) * 0.32
    tip = tail & (V[:, 1] < np.percentile(V[tail, 1], 40))
    for label, mask in (("tail(all back-most)", tail), ("tail lower 40%", tip)):
        c = collections.Counter()
        for js, ws in zip(J[mask], W[mask]):
            for a, w in zip(js, ws):
                c[names[a]] += w
        tot = sum(c.values()) or 1
        print(label, int(mask.sum()), "verts:", [(k, round(v / tot, 2)) for k, v in c.most_common(6)])
    print("sizes", {i: j["images"][i].get("mimeType") for i in range(len(j.get("images", [])))})
