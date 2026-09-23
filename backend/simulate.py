"""
Simulated CBi Astute-style energy readings.

Generates data that behaves like real household smart-meter output:
- a daily load curve (low overnight, morning peak, evening peak)
- per-household baseline so households aren't identical
- random noise so it isn't a perfectly smooth curve

Each household config below is loosely modelled on the sample readings
you already sketched out (A ~0.4 kWh, B ~0.3 kWh, C ~0.55-0.6 kWh at
morning peak), so Stage A output looks consistent with what you'd
expect from Stage B once real CBi Astute data is connected.
"""

import math
import random
from datetime import datetime

HOUSEHOLD_PROFILES = {
    "A": {"base_kwh": 0.30, "peak_multiplier": 1.4, "noise": 0.03},
    "B": {"base_kwh": 0.22, "peak_multiplier": 1.3, "noise": 0.025},
    "C": {"base_kwh": 0.40, "peak_multiplier": 1.55, "noise": 0.04},
}


def _load_curve_factor(hour: float) -> float:
    """
    Returns a multiplier (roughly 0.3 - 1.6) representing typical
    residential demand at a given hour of day (0-24, fractional allowed).
    Two bumps: morning (~7-9) and evening (~18-21), low overnight.
    """
    morning = math.exp(-((hour - 8) ** 2) / (2 * 1.3 ** 2))
    evening = math.exp(-((hour - 19) ** 2) / (2 * 2.0 ** 2))
    base = 0.35
    return base + 1.1 * morning + 1.3 * evening


def generate_reading(household_name: str, when: datetime = None) -> dict:
    """
    Generate one realistic (energy_kwh, power_w) reading for a household
    at a given timestamp (defaults to now).
    """
    if when is None:
        when = datetime.utcnow()
    if household_name not in HOUSEHOLD_PROFILES:
        raise ValueError(f"Unknown household '{household_name}'")

    profile = HOUSEHOLD_PROFILES[household_name]
    hour = when.hour + when.minute / 60.0
    factor = _load_curve_factor(hour)

    energy_kwh = profile["base_kwh"] * factor
    energy_kwh += random.gauss(0, profile["noise"])
    energy_kwh = max(0.02, energy_kwh)  # never negative / implausibly zero

    # Power (W) for this interval, assuming the energy figure is per
    # 30-minute-ish interval-equivalent reading, scaled to instantaneous W.
    power_w = energy_kwh * 1000

    return {
        "household": household_name,
        "timestamp": when,
        "energy_kwh": round(energy_kwh, 3),
        "power_w": round(power_w, 1),
    }


def generate_batch(household_names, when: datetime = None) -> list:
    """Generate one reading per household for the same timestamp."""
    when = when or datetime.utcnow()
    return [generate_reading(name, when) for name in household_names]
