#!/usr/bin/env python3
"""Local preview server for the built site.

    python3 scripts/serve.py            → http://localhost:4173
    python3 scripts/serve.py 8080       → http://localhost:8080

ES modules and the contact form need http:// (they do not work from file://).
"""
import functools
import http.server
import mimetypes
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

for ext, kind in {".avif": "image/avif", ".webmanifest": "application/manifest+json", ".js": "text/javascript"}.items():
    mimetypes.add_type(kind, ext)


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128  # browsers open many parallel connections; the default backlog (5) drops some


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    handler = functools.partial(Handler, directory=str(ROOT))
    with Server(("127.0.0.1", port), handler) as httpd:
        print(f"Serving {ROOT.name} on http://localhost:{port}  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
