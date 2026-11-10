"""Shrink enemy GLBs for the game: every texture to 512px JPEG. Rigged versions win over static ones."""
import io, json, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
import numpy as np
from PIL import Image
from fix_eyes import read_glb, write_glb
from inspect_rig import acc

RAW = pathlib.Path(r"D:\EddieWolfunny\tools\raw\enemies")
OUT = pathlib.Path(r"D:\EddieWolfunny\assets\enemies")
OUT.mkdir(parents=True, exist_ok=True)
SIZE = 512

for name in ["crawler", "spitter", "bomber", "wraith", "brute", "boss1", "boss2"]:
    src = RAW / f"{name}_rigged.glb"
    if not src.exists():
        src = RAW / f"{name}.glb"
    j, chunk = read_glb(src)
    img_views = {im["bufferView"]: k for k, im in enumerate(j.get("images", []))}
    out = bytearray()
    for i, v in enumerate(j["bufferViews"]):
        data = bytes(chunk[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])
        if i in img_views:
            im = Image.open(io.BytesIO(data)).convert("RGB")
            im.thumbnail((SIZE, SIZE), Image.LANCZOS)
            s = io.BytesIO(); im.save(s, "JPEG", quality=86)
            data = s.getvalue(); j["images"][img_views[i]]["mimeType"] = "image/jpeg"
        out += b"\0" * (-len(out) % 4)
        v["byteOffset"] = len(out); v["byteLength"] = len(data)
        out += data
    j["buffers"][0]["byteLength"] = len(out)
    dst = OUT / f"{name}.glb"
    write_glb(dst, j, out)
    tris = sum(j["accessors"][p["indices"]]["count"] // 3 for m in j["meshes"] for p in m["primitives"] if "indices" in p)
    pos = [acc(j, bytes(out), p["attributes"]["POSITION"]) for m in j["meshes"] for p in m["primitives"]]
    P = np.concatenate(pos)
    clips = [a.get("name") for a in j.get("animations", [])]
    print(f"{name}: {src.name} -> {dst.stat().st_size / 1e6:.2f} MB, tris {tris}, skinned {bool(j.get('skins'))}, "
          f"bounds {P.min(0).round(2).tolist()} {P.max(0).round(2).tolist()}, clips {clips}")
