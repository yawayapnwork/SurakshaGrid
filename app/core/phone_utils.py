"""E.164 phone number normalization shared by SMS alerting.

Twilio rejects (HTTP 400) any 'To'/'From' number that isn't in strict E.164 form
(a leading '+', country code, no spaces/punctuation). Numbers coming from citizen
SOS reports, dispatcher config (DISPATCHER_ALERT_PHONE_NUMBERS), or the on-demand
alert form are not guaranteed to already be in that shape — this module is the one
place that normalizes them before they ever reach the Twilio client.
"""

import re

E164_PATTERN = re.compile(r"^\+[1-9]\d{7,14}$")

# Applied only to numbers with no country code at all (e.g. a bare 10-digit local
# number). Numbers that already look like they carry *some* country code — anything
# starting with '+', or a 00-prefixed international dialing code — are left alone.
DEFAULT_COUNTRY_CODE = "91"  # India


def format_phone_e164(raw: str, default_country_code: str = DEFAULT_COUNTRY_CODE) -> str:
    """Normalizes `raw` into strict E.164 form, assuming `default_country_code` for

    numbers with no country code of their own. Raises ValueError if the result still
    isn't a valid E.164 number (empty input, non-numeric junk, wrong length).

    Handles:
      - stripping spaces, hyphens, dots, and parentheses: "+91 98765-43210" -> "+919876543210"
      - "00" international prefix: "0091 9876543210" -> "+919876543210"
      - a bare local number with no country code: "9876543210" -> "+919876543210"
      - a number with the country code but no leading '+': "919876543210" -> "+919876543210"

    Does NOT try to guess a *different* country's code for a plain local-looking
    number — that's inherently ambiguous without more context, so such numbers are
    assumed to be in `default_country_code`. A number that already starts with '+'
    is only stripped of stray punctuation, never reinterpreted.
    """
    if not raw or not raw.strip():
        raise ValueError("Phone number is empty")

    cleaned = re.sub(r"[\s\-().]", "", raw.strip())

    if cleaned.startswith("00"):
        cleaned = "+" + cleaned[2:]

    if not cleaned.startswith("+"):
        cleaned = cleaned.lstrip("0")
        # Already carries the default country code, just missing the '+' (e.g. a
        # 12-digit "919876543210") vs. a bare 10-digit local number.
        if cleaned.startswith(default_country_code) and len(cleaned) == len(default_country_code) + 10:
            cleaned = f"+{cleaned}"
        else:
            cleaned = f"+{default_country_code}{cleaned}"

    if not E164_PATTERN.match(cleaned):
        raise ValueError(f"'{raw}' is not a valid E.164 phone number after normalization (got '{cleaned}')")

    return cleaned
