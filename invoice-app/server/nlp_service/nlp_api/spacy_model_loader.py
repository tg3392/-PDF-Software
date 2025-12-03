"""Kleiner Wrapper zum Laden von spaCy-Modellen samt Fehlertext."""

from typing import Any, Optional, Tuple

import spacy

def load_spacy_model(path: str) -> Tuple[Optional[Any], Optional[str]]:
    """Lädt eine spaCy-Pipeline und gibt bei Problemen den Fehler zurück."""
    try:
        return spacy.load(path), None
    except Exception as exc:  # pragma: no cover - initialization failure
        return None, str(exc)
