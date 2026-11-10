"""Recolor cyan irises to Eddie's lime green in a GLB's base color texture. usage: fix_eyes.py in.glb out.glb"""
import io, json, struct, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ni


def read_glb(p):
    b = open(p, "rb").read()
    jl = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    binl = struct.unpack("<I", b[20 + jl:24 + jl])[0]
    return j, bytearray(b[28 + jl:28 + jl + binl])


def write_glb(p, j, chunk):
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    chunk = bytes(chunk) + b"\0" * (-len(chunk) % 4)
    j_total = 12 + 8 + len(js) + 8 + len(chunk)
    with open(p, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, j_total))
        f.write(struct.pack("<I", len(js)) + b"JSON" + js)
        f.write(struct.pack("<I", len(chunk)) + b"BIN\0" + chunk)


def recolor(img):
    a = np.asarray(img.convert("RGB")).astype(float)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = a.mean(2)
    m = (g - r > 12) & (b - r > 8) & (lum > 55)
    m = ni.binary_opening(m, iterations=1)
    t = np.array([0.66, 0.78, 0.42])  # sheet eye color #A8C76B
    out = a.copy()
    out[m] = np.clip(lum[m, None] * t * 1.45, 0, 255)
    soft = ni.gaussian_filter(m.astype(float), 1.0)[..., None]
    final = a * (1 - soft) + out * soft
    final[m] = out[m]
    return Image.fromarray(final.astype("uint8")), int(m.sum())


def replace_base_color(j, chunk):
    tex = j["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    target = j["textures"][tex]["source"]
    out = bytearray()
    views = j["bufferViews"]
    for i, v in enumerate(views):
        data = bytes(chunk[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])
        if i == j["images"][target]["bufferView"]:
            im = Image.open(io.BytesIO(data)).convert("RGB")
            new, n = recolor(im)
            print("recolored texels:", n, "of", im.size)
            s = io.BytesIO()
            new.save(s, "JPEG", quality=92, subsampling=0)
            j["images"][target]["mimeType"] = "image/jpeg"
            data = s.getvalue()
        out += b"\0" * (-len(out) % 4)
        v["byteOffset"] = len(out)
        v["byteLength"] = len(data)
        out += data
    j["buffers"][0]["byteLength"] = len(out)
    return out


if __name__ == "__main__":
    j, chunk = read_glb(sys.argv[1])
    write_glb(sys.argv[2], j, replace_base_color(j, chunk))
    print("wrote", sys.argv[2])
