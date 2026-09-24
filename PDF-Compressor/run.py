"""
Point d'entrée : lance le serveur et ouvre le navigateur.
Usage :  python run.py            (port 3000 par défaut)
         python run.py --port 8080
"""
import argparse
import threading
import webbrowser

import uvicorn

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=3000)
parser.add_argument("--no-browser", action="store_true")
args = parser.parse_args()

url = f"http://localhost:{args.port}"
if not args.no_browser:
    threading.Timer(1.5, lambda: webbrowser.open(url)).start()

print(f"\n  PDF Compressor disponible sur : {url}\n  (Ctrl+C pour arrêter)\n")
# host=127.0.0.1 : l'application n'est accessible QUE depuis cette machine.
uvicorn.run("app.main:app", host="127.0.0.1", port=args.port, log_level="warning")
