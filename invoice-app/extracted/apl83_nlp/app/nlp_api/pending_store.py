"""Speichert NLP-Ergebnisse kurzzeitig, falls später Feedback kommt."""

import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional, List


def _safe_request_id(request_id: str) -> str:
    """Säubert eine requestId, damit sie sich als Dateiname eignet."""
    return re.sub(r"[^a-zA-Z0-9_-]", "", request_id) or "request"


def _now() -> datetime:
    """Gibt die aktuelle Zeit in UTC zurück."""
    return datetime.now(timezone.utc)


@dataclass
class PendingEntry:
    request_id: str
    payload: Dict[str, Any]
    response: Dict[str, Any]
    status_code: int
    stored_at: datetime
    text: str
    path: Path


class PendingResultStore:
    """Hält NLP-Ergebnisse kurzzeitig persistent, bis Feedback eingeht."""

    def __init__(self, directory: Path, retention_seconds: int = 86400):
        """Setzt Speicherpfad und Aufbewahrungsdauer für Pending-Files."""
        self.directory = directory
        self.retention = timedelta(seconds=retention_seconds)
        self.directory.mkdir(parents=True, exist_ok=True)

    def cleanup(self):
        """Entfernt alle Einträge, die älter als die erlaubte Zeit sind."""
        cutoff = _now() - self.retention
        for path in self.directory.glob("*.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                timestamp = datetime.fromisoformat(data.get("timestamp"))
            except Exception:
                path.unlink(missing_ok=True)
                continue
            if timestamp < cutoff:
                path.unlink(missing_ok=True)

    def _record_path(self, request_id: str) -> Path:
        """Erstellt einen Dateinamen für ein neues gespeichertes Ergebnis."""
        safe = _safe_request_id(request_id)
        timestamp = _now().strftime("%Y%m%dT%H%M%S")
        return self.directory / f"{timestamp}_{safe}.json"

    def save(
        self,
        request_id: str,
        request_payload: Dict[str, Any],
        result_payload: Dict[str, Any],
        status_code: int,
        text: Optional[str],
    ):
        if not text:
            return
        """Persistiert ein neues NLP-Ergebnis samt Rohtext."""
        self.cleanup()
        record = {
            "requestId": request_id,
            "timestamp": _now().isoformat(),
            "requestPayload": request_payload,
            "responsePayload": result_payload,
            "statusCode": status_code,
            "text": text,
        }
        path = self._record_path(request_id)
        path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

    def _load_from_path(self, path: Path) -> Optional[PendingEntry]:
        """Liest eine gespeicherte Datei und wandelt sie in ein PendingEntry."""
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            timestamp = datetime.fromisoformat(data.get("timestamp"))
            return PendingEntry(
                request_id=data.get("requestId", ""),
                payload=data.get("requestPayload") or {},
                response=data.get("responsePayload") or {},
                status_code=int(data.get("statusCode", 200)),
                stored_at=timestamp,
                text=data.get("text", ""),
                path=path,
            )
        except Exception:
            path.unlink(missing_ok=True)
            return None

    def _find_paths(self, request_id: str) -> List[Path]:
        """Sucht alle Dateien zur requestId und sortiert nach Zeit."""
        safe = _safe_request_id(request_id)
        return sorted(self.directory.glob(f"*_{safe}.json"), reverse=True)

    def pop(self, request_id: str) -> Optional[PendingEntry]:
        """Lieferte das neueste Ergebnis zur passenden requestId und löscht es."""
        self.cleanup()
        for path in self._find_paths(request_id):
            entry = self._load_from_path(path)
            if entry:
                path.unlink(missing_ok=True)
                return entry
        return None
