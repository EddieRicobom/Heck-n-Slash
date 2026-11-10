"""Extra clips for Eddie: dodges, counter, parry, strike variants, running jump, an idle dance -> raw/batch4.glb"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
import meshy_client
from meshy_client import api, download, wait
meshy_client.BASE = "https://api.meshy.ai/openapi/"
RIG = "01a1baab-7baf-75c8-84b2-6e9069d9f732"
CLIPS = [157, 162, 93, 147, 218, 212, 90, 96, 13, 22]
an = api("v1/animations", {"rig_task_id": RIG, "action_ids": CLIPS})["result"]
t = wait(f"v1/animations/{an}", "eddie extra clips", every=8)
download(t["result"]["animation_glb_url"], pathlib.Path(__file__).resolve().parent / "raw" / "batch4.glb")
print("DONE credits", t.get("consumed_credits"))
