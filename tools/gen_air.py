"""Meshy batch for the aerial update: extra clips on Eddie's rig + three low poly weapon models."""
import json, pathlib, sys, threading

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
import meshy_client
from meshy_client import api, download, wait
meshy_client.BASE = "https://api.meshy.ai/openapi/"

RAW = (pathlib.Path(__file__).resolve().parent / "raw")
(RAW / "weapons").mkdir(parents=True, exist_ok=True)
RIG = "01a1baab-7baf-75c8-84b2-6e9069d9f732"
CLIPS = [86, 100, 94, 92, 105, 4, 215, 207, 241, 202]
STYLE = "stylized low poly game weapon, flat shaded faceted, clean silhouette, single object, no hand, no character, no base, no background"
WEAPONS = {
    "katana": "elegant slightly curved katana sword, dark violet wrapped hilt, crescent moon shaped guard, long thin blade with glowing cyan edge",
    "hammer": "heavy war hammer standing upright, long dark handle with a leather grip at the bottom, one big obsidian block head mounted at the very top end of the handle, nothing above the head, glowing amber runes and gold bands on the head",
    "claws": "clawed gauntlet glove for one hand, three long curved violet crystal blades extending forward from the knuckles",
}
log = {}


def clips():
    try:
        an = api("v1/animations", {"rig_task_id": RIG, "action_ids": CLIPS})["result"]
        t = wait(f"v1/animations/{an}", "air clips", every=8)
        download(t["result"]["animation_glb_url"], RAW / "batch3.glb")
        log["clips"] = t.get("consumed_credits")
    except SystemExit as e:
        log["clips_error"] = str(e)


def weapon(name):
    try:
        pid = api("v2/text-to-3d", {"mode": "preview", "prompt": f"{WEAPONS[name]}. {STYLE}", "model_type": "smart-topology", "ai_model": "meshy-t2.5", "target_polycount": 1500, "target_formats": ["glb"]})["result"]
        wait(f"v2/text-to-3d/{pid}", f"{name} preview", every=10)
        rid = api("v2/text-to-3d", {"mode": "refine", "preview_task_id": pid, "target_formats": ["glb"]})["result"]
        t = wait(f"v2/text-to-3d/{rid}", f"{name} refine", every=10)
        download(t["model_urls"]["glb"], RAW / "weapons" / f"{name}.glb")
        if t.get("thumbnail_url"):
            download(t["thumbnail_url"], RAW / "weapons" / f"{name}.png")
        log[name] = "ok"
    except SystemExit as e:
        log[name] = str(e)


only = sys.argv[1:]
ths = ([] if only else [threading.Thread(target=clips)]) + [threading.Thread(target=weapon, args=(n,)) for n in (only or WEAPONS)]
[t.start() for t in ths]
[t.join() for t in ths]
print("DONE", json.dumps(log), flush=True)
