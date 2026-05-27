from __future__ import annotations
import random
from typing import List, Dict
from models import Player, PackConfig


def _compute_weights(ovr_range: List[int]) -> Dict[int, float]:
    """
    Pesi geometrici: ogni OVR in più raddoppia il peso.
    OVR top del range ha sempre la probabilità più alta.
    """
    if not ovr_range:
        return {}
    sorted_range = sorted(ovr_range)
    base: float = 2.0
    return {ovr: base ** rank for rank, ovr in enumerate(sorted_range)}


def generate_pack(all_players: List[Player], config: PackConfig) -> List[Player]:
    """
    1. Filtra per range OVR e GK preference
    2. Raggruppa per OVR (bucket)
    3. Estrae iterativamente con pesi geometrici (alto OVR = più probabile)
    4. Nessun duplicato per carta
    """
    pool = [
        p for p in all_players
        if config.ovr_min <= p.overall <= config.ovr_max
        and (config.include_gk or not p.is_gk)
    ]
    if not pool:
        return []

    # Bucket per OVR
    buckets: Dict[int, List[Player]] = {}
    for p in pool:
        buckets.setdefault(p.overall, []).append(p)

    ovr_values = sorted(buckets.keys())
    raw_weights = _compute_weights(ovr_values)

    # Copia mutabile dei bucket
    remaining: Dict[int, List[Player]] = {k: list(v) for k, v in buckets.items()}
    selected: List[Player] = []

    for _ in range(config.num_cards):
        available = [ovr for ovr in ovr_values if ovr in remaining and remaining[ovr]]
        if not available:
            break

        weights = [raw_weights[ovr] for ovr in available]
        chosen_ovr: int = random.choices(available, weights=weights, k=1)[0]
        chosen_player: Player = random.choice(remaining[chosen_ovr])
        remaining[chosen_ovr].remove(chosen_player)
        if not remaining[chosen_ovr]:
            del remaining[chosen_ovr]

        selected.append(chosen_player)

    return selected
