from __future__ import annotations

import re

_IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")


def validate_identifier(value: str, label: str = "identifier") -> str:
    """Validate a path component style identifier."""

    if not value or not _IDENTIFIER_PATTERN.fullmatch(value):
        raise ValueError(f"Invalid {label}")
    return value
