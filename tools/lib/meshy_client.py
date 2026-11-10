"""Minimal Meshy API helper. Reads the key from D:\\Meshy\\.env."""
import base64, json, pathlib, sys, time, urllib.error, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
ENV = ROOT / ".env"
KEY = next(l.split("=", 1)[1].strip() for l in ENV.read_text().splitlines() if l.startswith("MESHY_API_KEY="))
BASE = "https://api.meshy.ai/openapi/v1/"
UA = "meshy-client/1.0"


def api(path, body=None):
    req = urllib.request.Request(
        BASE + path,
        data=None if body is None else json.dumps(body).encode(),
        method="GET" if body is None else "POST",
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "User-Agent": UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} on {path}: {e.read().decode(errors='replace')[:800]}")


def data_uri(path):
    return "data:image/png;base64," + base64.b64encode(pathlib.Path(path).read_bytes()).decode()


def wait(path, label, every=15):
    while True:
        t = api(path)
        print(f"{label}: {t['status']} {t.get('progress')}%", flush=True)
        if t["status"] == "SUCCEEDED":
            return t
        if t["status"] in ("FAILED", "CANCELED", "EXPIRED"):
            sys.exit(f"{label} failed: {json.dumps(t.get('task_error'))}")
        time.sleep(every)


def download(url, dest):
    dest = pathlib.Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=300) as r:
        dest.write_bytes(r.read())
    print(f"saved {dest} ({dest.stat().st_size / 1e6:.1f} MB)", flush=True)
