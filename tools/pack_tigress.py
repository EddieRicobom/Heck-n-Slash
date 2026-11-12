"""Pack the Tigress assets: her retargeted clips -> assets/anims_tigress.json, weapon textures -> 256px JPEG."""
import io, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import numpy as np
from PIL import Image
from fix_eyes import read_glb, write_glb
from inspect_rig import acc
from gen_anims import pack

RAW = pathlib.Path(__file__).resolve().parent / "raw" / "tigress"
OUT = pathlib.Path(__file__).resolve().parents[1] / "assets" / "weapons"

pack(RAW, "anims_tigress.json")
for name in ["gauntlet", "glaive", "cannon"]:
    j, chunk = read_glb(RAW / f"{name}.glb")
    img_views = {im["bufferView"]: k for k, im in enumerate(j.get("images", []))}
    out = bytearray()
    for i, v in enumerate(j["bufferViews"]):
        data = bytes(chunk[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])
        if i in img_views:
            im = Image.open(io.BytesIO(data)).convert("RGB")
            im.thumbnail((256, 256), Image.LANCZOS)
            s = io.BytesIO(); im.save(s, "JPEG", quality=85)
            data = s.getvalue(); j["images"][img_views[i]]["mimeType"] = "image/jpeg"
        out += b"\0" * (-len(out) % 4)
        v["byteOffset"] = len(out); v["byteLength"] = len(data)
        out += data
    j["buffers"][0]["byteLength"] = len(out)
    dst = OUT / f"{name}.glb"
    write_glb(dst, j, out)
    P = np.concatenate([acc(j, bytes(out), p["attributes"]["POSITION"]) for m in j["meshes"] for p in m["primitives"]])
    print(f"{name}: {dst.stat().st_size / 1e3:.0f} KB, bounds {P.min(0).round(3).tolist()} {P.max(0).round(3).tolist()}")
