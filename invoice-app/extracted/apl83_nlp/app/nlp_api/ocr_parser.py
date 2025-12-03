"""Werkzeuge zum Verarbeiten von OCR-Daten und deren Confidence."""

import re
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple


def parse_ocr_text(payload: Any) -> Tuple[str, Dict[str, Any]]:
    """Extrahiert den kombinierten Seitentext aus einem OCR-JSON."""
    if not isinstance(payload, dict):
        raise ValueError("OCR payload must be a JSON object")
    pages = payload.get("pages", [])
    text = " ".join(p.get("full_text", "") for p in pages)
    return text, payload


def _normalize_token(value: str) -> str:
    """Reduziert ein Token auf Kleinbuchstaben ohne Sonderzeichen."""
    return re.sub(r"[^0-9a-zA-Z]+", "", value.lower())


def _split_tokens(value: str) -> List[str]:
    """Zerlegt einen String anhand von Leerzeichen in Token."""
    return [part for part in re.split(r"\s+", value) if part]


def _build_token_confidence_lookup(ocr_payload: Optional[Dict[str, Any]]) -> Dict[str, List[float]]:
    """Erstellt ein Nachschlagewerk: Token -> Liste an Confidence-Werten."""
    lookup: Dict[str, List[float]] = defaultdict(list)
    if not isinstance(ocr_payload, dict):
        return lookup
    pages = ocr_payload.get("pages") or []
    for page in pages:
        words = page.get("words") or []
        for word in words:
            conf = word.get("confidence")
            if conf is None:
                continue
            try:
                confidence = float(conf)
            except (TypeError, ValueError):
                continue
            raw_text = str(word.get("text", "")).strip()
            if not raw_text:
                continue
            for part in _split_tokens(raw_text):
                normalized = _normalize_token(part)
                if not normalized:
                    continue
                lookup[normalized].append(confidence)
    return lookup


def _derive_text_confidence(value: str, lookup: Dict[str, List[float]]) -> Optional[float]:
    """Bildet den Durchschnitt der Token-Confidence für einen Text."""
    tokens = []
    for part in _split_tokens(value):
        normalized = _normalize_token(part)
        if normalized:
            tokens.append(normalized)
    if not tokens:
        return None
    token_scores: List[float] = []
    for token in tokens:
        values = lookup.get(token)
        if values:
            token_scores.append(values.pop(0))
    if not token_scores:
        return None
    avg = sum(token_scores) / len(token_scores)
    return max(0.0, min(avg / 100.0, 1.0))


def derive_field_confidences(extractions: Dict[str, str], ocr_payload: Optional[Dict[str, Any]]) -> Dict[str, float]:
    """Berechnet pro Feld die durchschnittliche Confidence der zugehörigen Tokens."""
    lookup = _build_token_confidence_lookup(ocr_payload)
    result: Dict[str, float] = {}
    for label, value in extractions.items():
        if not value:
            continue
        conf = _derive_text_confidence(value, lookup)
        if conf is not None:
            result[label] = conf
    return result
