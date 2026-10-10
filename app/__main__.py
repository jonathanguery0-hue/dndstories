"""Lance le jeu : `python -m app` démarre le serveur et ouvre le navigateur."""

import socket
import threading
import webbrowser

import uvicorn


def _port_libre(depart: int = 8000) -> int:
    for port in range(depart, depart + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return depart


def main() -> None:
    port = _port_libre()
    adresse = f"http://127.0.0.1:{port}"
    print("\n  ⚔️  Contes & Dragons")
    print(f"  Le jeu est ouvert dans ton navigateur : {adresse}")
    print("  Pour arrêter le jeu, ferme cette fenêtre (ou Ctrl+C).\n")
    threading.Timer(1.5, lambda: webbrowser.open(adresse)).start()
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
