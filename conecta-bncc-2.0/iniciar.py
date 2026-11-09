"""Inicia o catálogo local e abre a versão correta no navegador."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import gzip
from pathlib import Path
import socket
import webbrowser
from urllib.parse import urlsplit


class LocalHandler(SimpleHTTPRequestHandler):
    """Serve os dois arquivos maiores comprimidos quando o navegador aceita gzip."""
    compressed = {}

    def do_GET(self):
        path = urlsplit(self.path).path
        names = {"/dados/bncc-grafo.json", "/dados/bncc-busca.min.json"}
        if path not in names or "gzip" not in self.headers.get("Accept-Encoding", ""):
            return super().do_GET()
        file = Path(self.directory) / path.lstrip("/")
        try:
            stamp = file.stat().st_mtime_ns
            cached = self.compressed.get(path)
            if not cached or cached[0] != stamp:
                cached = (stamp, gzip.compress(file.read_bytes(), compresslevel=6))
                self.compressed[path] = cached
            body = cached[1]
        except OSError:
            return super().do_GET()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Vary", "Accept-Encoding")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class LocalServer(ThreadingHTTPServer):
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main():
    root = Path(__file__).resolve().parent
    handler = partial(LocalHandler, directory=str(root))
    try:
        server = LocalServer(("127.0.0.1", 8766), handler)
    except OSError:
        server = LocalServer(("127.0.0.1", 0), handler)
    address = f"http://127.0.0.1:{server.server_port}/"
    print(f"Conecta BNCC 2.0: {address}", flush=True)
    print("Para encerrar, pressione Ctrl+C ou feche esta janela.", flush=True)
    webbrowser.open(address)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
