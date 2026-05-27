from __future__ import annotations
import json
from pathlib import Path
from typing import List

from flask import Flask, jsonify, request, send_from_directory
from models import Player, PackConfig
from pack_generator import generate_pack

# ---------------------------------------------------------------------------
# App e database
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).parent
app = Flask(__name__, static_folder=str(BASE_DIR / "static"))

DATA_PATH = BASE_DIR / "data" / "players.json"


def _load_players() -> List[Player]:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return [Player(**p) for p in raw]


PLAYERS: List[Player] = _load_players()
print(f"[FC26] Database caricato: {len(PLAYERS)} giocatori")

# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
@app.get("/api/pack/config")
def get_default_config():
    overalls = [p.overall for p in PLAYERS]
    return jsonify({
        "ovr_min_default": 75,
        "ovr_max_default": 82,
        "num_cards_default": 5,
        "db_ovr_min": min(overalls),
        "db_ovr_max": max(overalls),
        "total_players": len(PLAYERS),
    })


@app.post("/api/pack/open")
def open_pack():
    data = request.get_json(force=True) or {}
    config = PackConfig.from_dict(data)

    error = config.validate()
    if error:
        return jsonify({"error": error}), 400

    pool_size = sum(
        1 for p in PLAYERS
        if config.ovr_min <= p.overall <= config.ovr_max
        and (config.include_gk or not p.is_gk)
    )

    if pool_size == 0:
        return jsonify({"error": f"Nessun giocatore trovato nel range OVR {config.ovr_min}–{config.ovr_max}"}), 404

    if pool_size < config.num_cards:
        return jsonify({
            "error": f"Pool insufficiente: {pool_size} giocatori disponibili, richiesti {config.num_cards}"
        }), 400

    pack = generate_pack(PLAYERS, config)
    return jsonify({
        "players": [p.to_dict() for p in pack],
        "config": {
            "ovr_min": config.ovr_min,
            "ovr_max": config.ovr_max,
            "num_cards": config.num_cards,
            "include_gk": config.include_gk,
        },
        "total_available": pool_size,
    })


@app.get("/api/players/stats")
def player_stats():
    from collections import Counter
    counter = Counter(p.overall for p in PLAYERS)
    return jsonify({
        "distribution": {str(k): v for k, v in sorted(counter.items(), reverse=True)},
        "total": len(PLAYERS),
    })


# ---------------------------------------------------------------------------
# Serve frontend
# ---------------------------------------------------------------------------
@app.get("/")
def index():
    return send_from_directory(str(BASE_DIR / "static"), "index.html")


@app.get("/<path:filename>")
def static_files(filename: str):
    return send_from_directory(str(BASE_DIR / "static"), filename)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
