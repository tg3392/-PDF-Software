"""Hilfsfunktionen, um Trainingsdaten dauerhaft als JSONL abzulegen."""

import json
from pathlib import Path
from typing import Dict, Any


def _training_file(feedback_dir: Path) -> Path:
    """Gibt den Zielpfad der einzigen JSONL-Datei zurück."""
    return feedback_dir / "training_samples.jsonl"


def save_feedback(feedback_dir: Path, payload: Dict[str, Any], request_id: str):
    """Hängt einen neuen Trainingsdatensatz unten an die Datei an."""
    feedback_dir.mkdir(parents=True, exist_ok=True)
    target = _training_file(feedback_dir)
    line = json.dumps(payload, ensure_ascii=False)
    with target.open("a", encoding="utf-8") as fp:
        fp.write(line + "\n")
