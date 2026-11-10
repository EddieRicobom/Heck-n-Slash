"""Pack Meshy GLBs for the game with 512px JPEG textures.
usage: pack_world.py  -> world props to assets/world, new enemies to assets/enemies (rigged version preferred)"""
import io, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
from PIL import Image
from fix_eyes import read_glb, write_glb

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "raw" / "world"
PROPS = ["pine", "oldtree", "rocks", "crystals", "pillar", "arch", "shrine", "lantern", "shrooms", "tower", "bush"]
FOES = ["wolf", "bat", "shroom", "golem", "shaman", "archer", "treant"]


def pack(src, dst, size=512):
    j, chunk = read_glb(src)
    iv = {im["bufferView"]: k for k, im in enumerate(j.get("images", []))}
    out = bytearray()
    for i, v in enumerate(j["bufferViews"]):
        data = bytes(chunk[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])
        if i in iv:
            im = Image.open(io.BytesIO(data)).convert("RGB"); im.thumbnail((size, size), Image.LANCZOS)
            s = io.BytesIO(); im.save(s, "JPEG", quality=86); data = s.getvalue(); j["images"][iv[i]]["mimeType"] = "image/jpeg"
        out += b"\0" * (-len(out) % 4); v["byteOffset"] = len(out); v["byteLength"] = len(data); out += data
    j["buffers"][0]["byteLength"] = len(out)
    dst.parent.mkdir(parents=True, exist_ok=True)
    write_glb(dst, j, out)
    tris = sum(j["accessors"][p["indices"]]["count"] // 3 for m in j["meshes"] for p in m["primitives"] if "indices" in p)
    print(f"{dst.relative_to(ROOT)}: {dst.stat().st_size / 1e3:.0f} KB, {tris} tris, clips {[a.get('name') for a in j.get('animations', [])]}")


for n in PROPS:
    if (RAW / f"{n}.glb").exists():
        pack(RAW / f"{n}.glb", ROOT / "assets" / "world" / f"{n}.glb", 256 if n in ("bush", "shrooms", "rocks") else 512)
for n in FOES:
    src = RAW / f"{n}_rigged.glb" if (RAW / f"{n}_rigged.glb").exists() else RAW / f"{n}.glb"
    if src.exists():
        pack(src, ROOT / "assets" / "enemies" / f"{n}.glb")
