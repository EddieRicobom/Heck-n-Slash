"""Open-world batch: low poly props + new enemies (humanoids rigged and animated).
usage: gen_world.py [names...]  -> tools/raw/world/<name>.glb (+ <name>_rigged.glb), log in world.json"""
import json, pathlib, sys, threading

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
import meshy_client
from meshy_client import api, download, wait
meshy_client.BASE = "https://api.meshy.ai/openapi/"

RAW = pathlib.Path(__file__).resolve().parent / "raw" / "world"
RAW.mkdir(parents=True, exist_ok=True)
LOG = RAW / "world.json"
PROP = "stylized low poly game environment asset, flat shaded faceted, night fantasy palette of deep violet, slate blue and moonlit teal, clean silhouette, single object, no base plate, no background"
FOE = "stylized low poly game enemy, flat shaded faceted, dark night fantasy palette, glowing eyes, clean readable silhouette, single creature, no base, no background"

ITEMS = {
    # props
    "pine": dict(kind="prop", poly=900, prompt="tall dark pine tree with layered triangular foliage tinted deep teal and violet, straight trunk"),
    "oldtree": dict(kind="prop", poly=1500, prompt="twisted ancient tree with gnarled dark bark and a canopy of glowing violet leaves"),
    "rocks": dict(kind="prop", poly=600, prompt="cluster of three angular slate grey boulders with patches of moss"),
    "crystals": dict(kind="prop", poly=600, prompt="cluster of tall glowing violet crystals growing from a small rock"),
    "pillar": dict(kind="prop", poly=800, prompt="broken ancient stone column with carved moon runes and hanging vines"),
    "arch": dict(kind="prop", poly=1500, prompt="ruined ancient stone archway with cracked blocks and moon symbol on the keystone"),
    "shrine": dict(kind="prop", poly=2000, prompt="small moon shrine altar of pale stone with a floating glowing crescent moon crystal above it and two candles"),
    "lantern": dict(kind="prop", poly=600, prompt="old japanese stone lantern with a warm glowing light inside"),
    "shrooms": dict(kind="prop", poly=800, prompt="cluster of bioluminescent cyan and purple mushrooms of different sizes"),
    "tower": dict(kind="prop", poly=3000, prompt="tall ruined dark castle tower with broken battlements, gothic windows glowing violet"),
    "bush": dict(kind="prop", poly=400, prompt="round leafy bush with dark violet leaves"),
    # new enemies
    "wolf": dict(kind="foe", poly=1500, prompt="crystal wolf beast, four legs, body of dark fur with sharp violet crystal shards growing on the back, running pose, glowing cyan eyes"),
    "bat": dict(kind="foe", poly=1000, prompt="giant shadow bat with wide spread membrane wings, small furry body, big ears, glowing red eyes, flying pose"),
    "shroom": dict(kind="foe", poly=1200, prompt="toxic mushroom monster with a huge spotted green and purple cap, stubby legs and an angry face, poison spores"),
    "golem": dict(kind="foe", poly=3000, pose=True, rig=2.8, prompt="hulking moss stone golem humanoid, mossy rock body, glowing green crystal core in the chest, huge arms, standing upright",
                  actions=[112, 0, 128, 127, 178, 8]),
    "shaman": dict(kind="foe", poly=2500, pose=True, rig=1.9, prompt="hooded goblin shaman humanoid in tattered purple robes, bone mask, holding a gnarled staff with a glowing skull, standing upright",
                   actions=[21, 0, 125, 131, 178, 8]),
    "archer": dict(kind="foe", poly=2500, pose=True, rig=1.9, prompt="skeleton archer humanoid with a dark hood and a ragged cape, holding a bone longbow, glowing blue eye sockets, standing upright",
                   actions=[21, 0, 224, 178, 8]),
    "treant": dict(kind="foe", poly=5000, pose=True, rig=3.6, prompt="ancient corrupted treant guardian humanoid boss, body of twisted dark wood and roots, glowing violet runes, mossy shoulders, antler like branches on the head, standing upright",
                   actions=[119, 0, 127, 128, 51, 178, 8]),
}

lock = threading.Lock()
state = json.loads(LOG.read_text()) if LOG.exists() else {}


def save(name, **kv):
    with lock:
        state.setdefault(name, {}).update(kv)
        LOG.write_text(json.dumps(state, indent=2))


def run(name):
    e, s = ITEMS[name], state.get(name, {})
    try:
        if not s.get("refine"):
            body = {"mode": "preview", "prompt": f"{e['prompt']}. {PROP if e['kind'] == 'prop' else FOE}", "model_type": "smart-topology",
                    "ai_model": "meshy-t2.5", "target_polycount": e["poly"], "target_formats": ["glb"]}
            if e.get("pose"):
                body["pose_mode"] = "a-pose"
            pid = api("v2/text-to-3d", body)["result"]
            save(name, preview=pid)
            wait(f"v2/text-to-3d/{pid}", f"{name} preview", every=10)
            rid = api("v2/text-to-3d", {"mode": "refine", "preview_task_id": pid, "target_formats": ["glb"]})["result"]
            save(name, refine=rid)
            t = wait(f"v2/text-to-3d/{rid}", f"{name} refine", every=10)
            download(t["model_urls"]["glb"], RAW / f"{name}.glb")
            if t.get("thumbnail_url"):
                download(t["thumbnail_url"], RAW / f"{name}.png")
        if e.get("rig") and not state.get(name, {}).get("anim_done"):
            rig = api("v1/rigging", {"input_task_id": state[name]["refine"], "height_meters": e["rig"]})["result"]
            save(name, rig=rig)
            wait(f"v1/rigging/{rig}", f"{name} rig", every=8)
            an = api("v1/animations", {"rig_task_id": rig, "action_ids": e["actions"]})["result"]
            t = wait(f"v1/animations/{an}", f"{name} anims", every=8)
            download(t["result"]["animation_glb_url"], RAW / f"{name}_rigged.glb")
            save(name, anim_done=True)
        save(name, done=True)
        print(name, "DONE", flush=True)
    except SystemExit as err:
        save(name, error=str(err))
        print(name, "ERROR", err, flush=True)


names = sys.argv[1:] or list(ITEMS)
ths = [threading.Thread(target=run, args=(n,)) for n in names]
for t in ths:
    t.start()
for t in ths:
    t.join()
print("ALL", json.dumps({k: ("done" if v.get("done") else v.get("error")) for k, v in state.items()}), flush=True)
