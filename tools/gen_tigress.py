"""Titanium Tigress: the same combat clips as Eddie retargeted by Meshy onto her rig, plus her three weapons.
usage: gen_tigress.py [clips] [gauntlet glaive cannon]   (no args = everything)"""
import json, pathlib, sys, threading, time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
import meshy_client
from meshy_client import api, download, wait
meshy_client.BASE = "https://api.meshy.ai/openapi/"

RAW = pathlib.Path(__file__).resolve().parent / "raw" / "tigress"
RIG = (RAW / "rig_task.txt").read_text().strip()
BATCHES = [
    [89, 0, 16, 158, 156, 178, 8, 59, 88, 198],
    [191, 192, 193, 194, 208, 216, 217, 206, 219, 97],
    [240, 242, 221, 91, 102, 128, 237, 238, 99, 127],
    [86, 100, 94, 92, 105, 4, 215, 207, 241, 202],
    [157, 162, 93, 147, 218, 212, 90, 96, 13, 22],
]
STYLE = "stylized low poly game weapon, flat shaded faceted, clean silhouette, single object, no hand, no character, no base, no background"
WEAPONS = {
    "gauntlet": "single heavy cybernetic power gauntlet for one fist, white titanium armor plates with orange tiger stripes, thick knuckle plates, glowing green energy core on the back of the hand",
    "glaive": "long sci-fi glaive polearm standing upright, white titanium shaft with black grip wraps, one curved orange energy blade at the very top end, glowing green core where the blade meets the shaft",
    "cannon": "cybernetic plasma arm cannon worn over the forearm, white titanium cylindrical barrel with orange stripes, glowing green energy rings and a green glowing muzzle",
}
log = {}
gate = threading.Semaphore(3)  # Meshy limits how many tasks may be pending at once


def call(path, body):
    for _ in range(40):
        try:
            return api(path, body)["result"]
        except SystemExit as e:
            if "429" not in str(e):
                raise
            time.sleep(20)
    raise SystemExit("still rate limited")


def clips(i, ids):
    out = RAW / f"batch{i}.glb"
    if out.exists():
        return
    with gate:
        try:
            an = call("v1/animations", {"rig_task_id": RIG, "action_ids": ids})
            t = wait(f"v1/animations/{an}", f"clips {i}", every=10)
            download(t["result"]["animation_glb_url"], out)
            log[f"clips{i}"] = t.get("consumed_credits")
        except SystemExit as e:
            log[f"clips{i}"] = str(e)


def weapon(name):
    if (RAW / f"{name}.glb").exists():
        return
    with gate:
        try:
            pid = call("v2/text-to-3d", {"mode": "preview", "prompt": f"{WEAPONS[name]}. {STYLE}", "model_type": "smart-topology", "ai_model": "meshy-t2.5", "target_polycount": 1500, "target_formats": ["glb"]})
            wait(f"v2/text-to-3d/{pid}", f"{name} preview", every=10)
            rid = call("v2/text-to-3d", {"mode": "refine", "preview_task_id": pid, "target_formats": ["glb"]})
            t = wait(f"v2/text-to-3d/{rid}", f"{name} refine", every=10)
            download(t["model_urls"]["glb"], RAW / f"{name}.glb")
            if t.get("thumbnail_url"):
                download(t["thumbnail_url"], RAW / f"{name}.png")
            log[name] = "ok"
        except SystemExit as e:
            log[name] = str(e)


args = sys.argv[1:]
want_clips = not args or "clips" in args
names = [a for a in args if a in WEAPONS] or ([] if args else list(WEAPONS))
ths = [threading.Thread(target=weapon, args=(n,)) for n in names]
if want_clips:
    ths += [threading.Thread(target=clips, args=(i, b)) for i, b in enumerate(BATCHES)]
[t.start() for t in ths]
[t.join() for t in ths]
print("DONE", json.dumps(log), flush=True)
