from __future__ import annotations
import random
from typing import List, Dict, Set
from models import Player, PackConfig


def _compute_weights(ovr_range: List[int]) -> Dict[int, float]:
    sorted_range = sorted(ovr_range)
    base: float = 2.0
    return {ovr: base ** rank for rank, ovr in enumerate(sorted_range)}


def _player_matches(player: Player, config: PackConfig, excluded_set: Set[int]) -> bool:
    """Applica tutti i filtri al singolo giocatore."""
    # Range OVR
    if not (config.ovr_min <= player.overall <= config.ovr_max):
        return False
    # Portieri
    if not config.include_gk and player.is_gk:
        return False
    # Ruolo
    if config.position_filter:
        positions = [p.strip() for p in player.positions_all.split(',')]
        if config.position_filter not in positions:
            return False
    # Stats minime
    for stat_key, min_val in config.min_stats.items():
        player_val = player.stats.get(stat_key)
        if player_val is None or player_val < min_val:
            return False
    # Rose escluse
    if player.id in excluded_set:
        return False
    return True


def filter_pool(all_players: List[Player], config: PackConfig) -> List[Player]:
    """Restituisce il pool filtrato senza generare il pack."""
    excluded_set: Set[int] = set(config.excluded_ids)
    return [p for p in all_players if _player_matches(p, config, excluded_set)]


def generate_pack(all_players: List[Player], config: PackConfig) -> List[Player]:
    """
    Genera pack con pesi geometrici: OVR alto = priorità maggiore.
    Nessun duplicato.
    """
    excluded_set: Set[int] = set(config.excluded_ids)
    pool = [p for p in all_players if _player_matches(p, config, excluded_set)]

    if not pool:
        return []

    buckets: Dict[int, List[Player]] = {}
    for p in pool:
        buckets.setdefault(p.overall, []).append(p)

    ovr_values = sorted(buckets.keys())
    raw_weights = _compute_weights(ovr_values)
    remaining: Dict[int, List[Player]] = {k: list(v) for k, v in buckets.items()}
    selected: List[Player] = []

    for _ in range(config.num_cards):
        available = [ovr for ovr in ovr_values if ovr in remaining and remaining[ovr]]
        if not available:
            break
        weights = [raw_weights[ovr] for ovr in available]
        chosen_ovr = random.choices(available, weights=weights, k=1)[0]
        chosen_player = random.choice(remaining[chosen_ovr])
        remaining[chosen_ovr].remove(chosen_player)
        if not remaining[chosen_ovr]:
            del remaining[chosen_ovr]
        selected.append(chosen_player)

    return selected
