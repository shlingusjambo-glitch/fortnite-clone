#!/usr/bin/env python3
"""Static dev server with caching disabled so edited ES modules always reload."""
import http.server, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate'); self.send_header('Expires', '0'); super().end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('', int(sys.argv[1]) if len(sys.argv) > 1 else 8765), H).serve_forever()
