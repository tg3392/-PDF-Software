"""Hilfsfunktionen, um Feedback auszulesen und Trainingsdaten zu bauen."""

from typing import Any, Dict, List, Optional, Tuple


def _list_to_map(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Verwandelt eine Liste von Feldern in ein Dictionary."""
    result: Dict[str, Any] = {}
    for entry in entries:
        name = entry.get("name")
        if not name:
            continue
        result[name] = entry.get("value", "")
    return result


def _dict_from_payload(data: Any) -> Dict[str, Any]:
    """Gleicht Feedback-Daten an, egal ob Liste oder Dict."""
    if isinstance(data, dict):
        return {str(k): v for k, v in data.items()}
    if isinstance(data, list):
        return _list_to_map(data)
    return {}


def extract_corrections(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Liest die korrigierten Feldwerte aus verschiedenen Payload-Formen."""
    for key in ("corrections", "labels", "fields"):
        if key in payload:
            return _dict_from_payload(payload[key])
    data = payload.get("data")
    if isinstance(data, dict):
        for key in ("corrections", "labels", "fields"):
            if key in data:
                return _dict_from_payload(data[key])
    return {}


def _find_span(text: str, value: str) -> Optional[Tuple[int, int]]:
    """Findet Start und Ende eines Wertes im Originaltext."""
    if not text or not value:
        return None
    text_lower = text.lower()
    value_lower = value.lower()
    idx = text_lower.find(value_lower)
    if idx == -1:
        return None
    return idx, idx + len(value)


def build_training_entry(pending_entry, corrections: Dict[str, Any], feedback_payload: Dict[str, Any]) -> Dict[str, Any]:
    """Setzt Prediction und Feedback zu einem spaCy-kompatiblen Datensatz zusammen."""
    response_data = pending_entry.response.get("data") or {}
    fields = response_data.get("fields") or []
    text = pending_entry.text or ""

    value_map: Dict[str, Any] = {}
    for entry in fields:
        name = entry.get("name")
        if not name:
            continue
        value = entry.get("value")
        if value in (None, ""):
            continue
        value_map[name] = value

    for label, value in corrections.items():
        value_map[label] = value

    entities: List[List[Any]] = []
    for label, value in value_map.items():
        value_str = str(value)
        span = _find_span(text, value_str)
        if span:
            entities.append([span[0], span[1], label])

    entry = {
        "text": text,
        "entities": entities,
    }
    return entry
