"""Shared helpers for building outbound alert messages (SMS, Discord/n8n webhook, etc.)

that embed a Google Maps link to an incident's location.

The classic failure mode this guards against: a payload's coordinate fields aren't
named consistently everywhere they're produced — some code paths use `latitude`/
`longitude` (this codebase's DB column and API field names), others `lat`/`lng` (a
common shorthand in webhook/notification payloads). Reaching for the wrong name off
a dict returns `None` (or raises `AttributeError` off an object) instead of failing
loudly, and an f-string happily interpolates that `None` straight into the URL —
`https://www.google.com/maps?q=None,None` in Python, `...?q=undefined,undefined` in
JS. `build_google_maps_link` is the one place that extracts coordinates, tolerant of
either naming, and returns `None` instead of a broken link when nothing usable is
found — callers must omit the maps line rather than interpolate that `None`.
"""

from typing import Any


def _extract_coordinate(source: Any, *keys: str) -> float | None:
    """Tries each of `keys` in turn against `source` (a dict, or an object exposing

    them as attributes), returning the first value that parses as a float. Returns
    None if none of the keys are present/set, or every present value is None or
    non-numeric — never raises on a missing key/attribute or bad type.
    """
    for key in keys:
        value = source.get(key) if isinstance(source, dict) else getattr(source, key, None)
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return None


def build_google_maps_link(source: Any) -> str | None:
    """Safely extracts latitude/longitude from `source` — accepting either

    `latitude`/`longitude` or `lat`/`lng`/`lon` as the key/attribute names — and
    returns a Google Maps query URL, or None if no valid coordinate pair was found.

    Callers must treat None as "omit the maps link from this message" — never fall
    back to interpolating it into the URL template, which is exactly how
    `?q=undefined,undefined` / `?q=None,None` links get sent in the first place.
    """
    lat = _extract_coordinate(source, "latitude", "lat")
    lng = _extract_coordinate(source, "longitude", "lng", "lon")

    if lat is None or lng is None:
        return None
    if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lng <= 180.0):
        return None

    return f"https://www.google.com/maps?q={lat},{lng}"


def build_sos_alert_message(sos_id: str, trust_score: int, source: Any) -> str:
    """Builds the SMS/Discord alert body for a critical SOS report, embedding a

    Google Maps link when `source` carries valid coordinates (see
    `build_google_maps_link`) and falling back to a clean "location unavailable"
    line instead of a broken maps URL when it doesn't.
    """
    maps_link = build_google_maps_link(source)
    location_line = f"Location: {maps_link}" if maps_link else "Location: unavailable (no valid coordinates on this report)"

    return (
        f"SurakshaGrid CRITICAL SOS #{str(sos_id)[:8]}: trapped citizen reported. "
        f"Trust score {trust_score}. {location_line}. Immediate rescue dispatch required."
    )
