"""Apply combat animations to Eddie's low poly rig on Meshy and pack them into assets/anims.json."""
import json, pathlib, sys, threading

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
import numpy as np
from meshy_client import api, download, wait
from inspect_rig import acc, load

GAME = pathlib.Path(__file__).resolve().parents[1]
RAW = GAME / "tools" / "raw"
RIG = "01a1baab-7baf-75c8-84b2-6e9069d9f732"
BATCHES = [
    [89, 0, 16, 158, 156, 178, 8, 59, 88, 198],
    [191, 192, 193, 194, 208, 216, 217, 206, 219, 97],
    [240, 242, 221, 91, 102, 128, 237, 238, 99, 127],
]


def fetch():
    def run(i, ids):
        tid = api("animations", {"rig_task_id": RIG, "action_ids": ids})["result"]
        print("batch", i, "task", tid, flush=True)
        t = wait(f"animations/{tid}", f"batch{i}", every=8)
        print("batch", i, "credits", t.get("consumed_credits"), flush=True)
        download(t["result"]["animation_glb_url"], RAW / f"batch{i}.glb")

    ths = [threading.Thread(target=run, args=(i, b)) for i, b in enumerate(BATCHES)]
    [t.start() for t in ths]
    [t.join() for t in ths]


def pack(raw=RAW, name="anims.json"):
    out = {}
    for f in sorted(raw.glob("batch*.glb")):
        j, b = load(f)
        rest = next(n for n in j["nodes"] if n.get("name") == "Hips").get("translation", [0, 0, 0])
        for a in j["animations"]:
            times, tracks = None, []
            for c in a["channels"]:
                node = j["nodes"][c["target"]["node"]].get("name")
                path = c["target"]["path"]
                if path == "scale" or node is None or (path == "translation" and node != "Hips"):
                    continue
                s = a["samplers"][c["sampler"]]
                t = acc(j, b, s["input"]).ravel()
                v = acc(j, b, s["output"])
                t = t - t[0]
                if path == "translation":  # gameplay drives horizontal motion
                    v[:, 0] = rest[0]
                    v[:, 2] = rest[2]
                if times is None or len(t) > len(times):
                    times = t
                tracks.append({"b": node, "p": "q" if path == "rotation" else "p",
                               "t": [round(float(x), 3) for x in t],
                               "v": [round(float(x), 4) for x in v.ravel()]})
            out[a["name"]] = {"d": round(float(times[-1]), 3), "tracks": tracks}
    (GAME / "assets").mkdir(exist_ok=True)
    p = GAME / "assets" / name
    p.write_text(json.dumps(out, separators=(",", ":")))
    print("clips", len(out), f"{p.stat().st_size / 1e6:.2f} MB")
    for k, v in out.items():
        print(f"  {k}: {v['d']}s, {len(v['tracks'])} tracks, {len(v['tracks'][0]['t'])} keys")


if __name__ == "__main__":
    if "pack" not in sys.argv:
        fetch()
    pack()
