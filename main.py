from __future__ import annotations
import json
import os
import traceback
from pathlib import Path
from typing import List, Optional

from flask import Flask, jsonify, request, send_from_directory, Response
from models import Player, PackConfig
from pack_generator import generate_pack, filter_pool

BASE_DIR = Path(__file__).parent
app = Flask(__name__)

DATA_PATH = BASE_DIR / "data" / "players.json"
STATIC_DIR = BASE_DIR / "static"

# ---- Caricamento database ----
def _load_players() -> List[Player]:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return [Player(**p) for p in raw]

try:
    PLAYERS: List[Player] = _load_players()
    print(f"[FC26] Database caricato: {len(PLAYERS)} giocatori", flush=True)
except Exception as e:
    print(f"[FC26] ERRORE caricamento database: {e}", flush=True)
    PLAYERS = []

# ---- Health check (per diagnostica) ----
@app.route("/health")
def health():
    return jsonify({"status": "ok", "players": len(PLAYERS)})

# ---- API ----
@app.route("/api/pack/config", methods=["GET"])
def get_default_config():
    if not PLAYERS:
        return jsonify({"error": "Database non caricato"}), 500
    overalls = [p.overall for p in PLAYERS]
    return jsonify({
        "ovr_min_default": 75,
        "ovr_max_default": 82,
        "num_cards_default": 5,
        "db_ovr_min": min(overalls),
        "db_ovr_max": max(overalls),
        "total_players": len(PLAYERS),
    })

@app.route("/api/pack/pool", methods=["POST"])
def get_pool_size():
    try:
        data = request.get_json(force=True, silent=True) or {}
        config = PackConfig.from_dict(data)
        error = config.validate()
        if error:
            return jsonify({"error": error}), 400
        pool = filter_pool(PLAYERS, config)
        return jsonify({"pool_size": len(pool)})
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

@app.route("/api/pack/open", methods=["POST"])
def open_pack():
    try:
        data = request.get_json(force=True, silent=True) or {}
        config = PackConfig.from_dict(data)
        error = config.validate()
        if error:
            return jsonify({"error": error}), 400

        pool = filter_pool(PLAYERS, config)
        pool_size = len(pool)

        if pool_size == 0:
            return jsonify({"error": "Nessun giocatore trovato con i filtri applicati"}), 404
        if pool_size < config.num_cards:
            return jsonify({
                "error": f"Pool insufficiente: {pool_size} disponibili, richiesti {config.num_cards}"
            }), 400

        pack = generate_pack(PLAYERS, config)
        return jsonify({
            "players": [p.to_dict() for p in pack],
            "config": {
                "ovr_min": config.ovr_min,
                "ovr_max": config.ovr_max,
                "num_cards": config.num_cards,
                "include_gk": config.include_gk,
                "position_filter": config.position_filter,
                "min_stats": config.min_stats,
            },
            "total_available": pool_size,
        })
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

@app.route("/api/players/positions", methods=["GET"])
def get_positions():
    positions = set()
    for p in PLAYERS:
        for pos in p.positions_all.split(','):
            positions.add(pos.strip())
    return jsonify({"positions": sorted(positions)})

# ---- Static files ----
@app.route("/")
def index():
    return send_from_directory(str(STATIC_DIR), "index.html")

@app.route("/static/<path:filename>")
def static_files(filename: str):
    return send_from_directory(str(STATIC_DIR), filename)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
