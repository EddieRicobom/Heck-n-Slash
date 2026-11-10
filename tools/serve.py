"""Local static server for the game with caching disabled, so edits show up on reload."""
import functools, http.server, pathlib, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".glb": "model/gltf-binary"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64


print(f"Eddie Wolfunny: http://localhost:{PORT}/", flush=True)
srv = Server(("127.0.0.1", PORT), functools.partial(NoCache, directory=str(ROOT)))
while True:  # Windows can briefly run out of socket buffers (WinError 10055); keep serving
    try:
        srv.serve_forever(poll_interval=.5)
    except OSError as e:
        print("server hiccup:", e, flush=True)
        time.sleep(.5)
