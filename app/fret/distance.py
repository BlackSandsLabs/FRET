"""Approximate range from received signal strength.

Log-distance path-loss model:  RSSI(d) = RSSI(1 m) - 10 * n * log10(d)
so                              d = 10 ** ((RSSI(1 m) - RSSI) / (10 * n))

The path-loss exponent n depends on the surroundings, and RSSI fluctuates by
several dB, so FRET reports a *band* (minimum - maximum) rather than a point.
Bearing cannot be measured with a single omnidirectional receiver.
"""
from __future__ import annotations

import math
import statistics
from dataclasses import dataclass

ENVIRONMENTS = {
    # name: (n_low, n_mid, n_high)
    "open": (1.8, 2.2, 2.7),
    "indoor": (2.2, 2.8, 3.5),
    "dense": (2.8, 3.5, 4.5),
}

DEFAULT_REF = {"wifi": -40.0, "ble": -59.0}  # expected RSSI at 1 m (dBm)
FSPL_1M_24GHZ = 40.0  # free-space loss at 1 m, 2.4 GHz


@dataclass
class Range:
    estimate_m: float
    min_m: float
    max_m: float
    rssi_median: float
    rssi_spread: float
    samples: int

    def as_dict(self) -> dict:
        return {
            "est": round(self.estimate_m, 1), "min": round(self.min_m, 1),
            "max": round(self.max_m, 1), "rssi": round(self.rssi_median, 1),
            "spread": round(self.rssi_spread, 1), "n": self.samples,
        }


def _d(ref: float, rssi: float, n: float) -> float:
    return 10 ** ((ref - rssi) / (10 * n))


def estimate(rssis: list[int], medium: str, environment: str = "indoor",
             ref_1m: float | None = None, tx_power: int | None = None) -> Range | None:
    if not rssis:
        return None
    if ref_1m is None:
        ref_1m = (tx_power - FSPL_1M_24GHZ) if (medium == "ble" and tx_power is not None) else DEFAULT_REF[medium]
    n_low, n_mid, n_high = ENVIRONMENTS.get(environment, ENVIRONMENTS["indoor"])
    med = statistics.median(rssis)
    spread = statistics.pstdev(rssis) if len(rssis) > 1 else 6.0
    margin = max(3.0, min(spread, 10.0)) + (3.0 if len(rssis) < 5 else 0.0)
    clamp = lambda x: max(0.3, min(x, 500.0))
    est = clamp(_d(ref_1m, med, n_mid))
    lo = clamp(_d(ref_1m, med + margin, n_high))
    hi = clamp(_d(ref_1m, med - margin, n_low))
    return Range(est, min(lo, est), max(hi, est), med, spread, len(rssis))


def ring_label(r: Range | None) -> str:
    if r is None:
        return "-"
    if r.max_m < 3:
        return "Immediate (< 3 m)"
    if r.estimate_m < 8:
        return "Near (same room)"
    if r.estimate_m < 25:
        return "Medium (nearby rooms)"
    return "Far (> 25 m)"


def calibrate_ref(rssis: list[int], distance_m: float, n: float = 2.0) -> float:
    """Derive RSSI@1m from samples taken at a known distance."""
    med = statistics.median(rssis)
    return med + 10 * n * math.log10(max(distance_m, 0.1))
