"""Generate Eddie's enemies on Meshy as super low poly models.
Humanoids are rigged and get their combat clips; the rest stay static and are animated in code.
usage: gen_enemies.py [names...]   (default: all). Results: tools/raw/enemies/*.glb + enemies.json"""
import io, json, pathlib, sys, threading

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
import meshy_client
from meshy_client import api, download, wait
meshy_client.BASE = "https://api.meshy.ai/openapi/"

RAW = pathlib.Path(__file__).resolve().parent / "raw" / "enemies"
RAW.mkdir(parents=True, exist_ok=True)
LOG = RAW / "enemies.json"
STYLE = ("stylized low poly game enemy, flat shaded faceted look, dark obsidian and deep violet palette, "
         "glowing eyes, night fantasy, clean readable silhouette, single creature, no base, no background")

ENEMIES = {
    "crawler": dict(poly=1500, prompt="small four-legged shadow hound beast, crouched hunting pose, row of crystal spikes along the back, long snout, glowing red eyes"),
    "spitter": dict(poly=1200, prompt="floating hooded jellyfish spirit, cone shaped dark hood, big glowing toxic green mouth orb, four short dangling tentacles"),
    "bomber": dict(poly=1000, prompt="round walking bomb imp, cracked black stone sphere body with glowing orange lava cracks, short stubby legs, burning fuse on top"),
    "wraith": dict(poly=2500, pose=True, rig=1.9, prompt="tall thin hooded reaper specter humanoid, tattered dark robe, pale bone mask face, long blade arms, standing upright, two legs visible",
                   actions=[21, 89, 97, 178, 8]),
    "brute": dict(poly=3000, pose=True, rig=2.6, prompt="hulking brute ogre humanoid, huge shoulders and fists, small horned head, stone armor plates, standing upright",
                  actions=[112, 0, 127, 128, 178, 8]),
    "boss1": dict(poly=5000, pose=True, rig=3.4, prompt="obsidian gargoyle warlord humanoid boss, bat wings folded on back, curved horns, cracked stone body with violet glowing veins, standing upright",
                  actions=[112, 0, 127, 16, 125, 51, 178, 8]),
    "boss2": dict(poly=5000, pose=True, rig=3.4, prompt="moonless night king humanoid boss, tall dark armored knight with golden spiked crown, flowing tattered cape, holding a huge pale blue greatsword, standing upright",
                  actions=[106, 0, 102, 16, 125, 101, 178, 8]),
}

lock = threading.Lock()
state = json.loads(LOG.read_text()) if LOG.exists() else {}


def save(name, **kv):
    with lock:
        state.setdefault(name, {}).update(kv)
        LOG.write_text(json.dumps(state, indent=2))


def run(name):
    e, s = ENEMIES[name], state.get(name, {})
    try:
        if not s.get("refine"):
            body = {"mode": "preview", "prompt": f"{e['prompt']}. {STYLE}", "model_type": "smart-topology", "ai_model": "meshy-t2.5",
                    "target_polycount": e["poly"], "target_formats": ["glb"]}
            if e.get("pose"):
                body["pose_mode"] = "a-pose"
            pid = api("v2/text-to-3d", body)["result"]
            save(name, preview=pid)
            t = wait(f"v2/text-to-3d/{pid}", f"{name} preview", every=10)
            save(name, preview_credits=t.get("consumed_credits"))
            rid = api("v2/text-to-3d", {"mode": "refine", "preview_task_id": pid, "target_formats": ["glb"], "enable_pbr": False})["result"]
            save(name, refine=rid)
            t = wait(f"v2/text-to-3d/{rid}", f"{name} refine", every=10)
            save(name, refine_credits=t.get("consumed_credits"))
            download(t["model_urls"]["glb"], RAW / f"{name}.glb")
            if t.get("thumbnail_url"):
                download(t["thumbnail_url"], RAW / f"{name}.png")
        if e.get("rig") and not s.get("anim_done"):
            rid = state[name]["refine"]
            rig = api("v1/rigging", {"input_task_id": rid, "height_meters": e["rig"]})["result"]
            save(name, rig=rig)
            wait(f"v1/rigging/{rig}", f"{name} rig", every=8)
            an = api("v1/animations", {"rig_task_id": rig, "action_ids": e["actions"]})["result"]
            save(name, anim=an)
            t = wait(f"v1/animations/{an}", f"{name} anims", every=8)
            download(t["result"]["animation_glb_url"], RAW / f"{name}_rigged.glb")
            save(name, anim_done=True)
        save(name, done=True)
        print(name, "DONE", flush=True)
    except SystemExit as err:  # meshy_client exits on API errors; keep the other enemies going
        save(name, error=str(err))
        print(name, "ERROR", err, flush=True)


names = sys.argv[1:] or list(ENEMIES)
ths = [threading.Thread(target=run, args=(n,)) for n in names]
[t.start() for t in ths]
[t.join() for t in ths]
print("ALL", json.dumps({k: {kk: vv for kk, vv in v.items() if kk in ("done", "error")} for k, v in state.items()}), flush=True)
