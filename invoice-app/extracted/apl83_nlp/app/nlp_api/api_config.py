"""Konfigurationshelfer für die NLP-API."""

import os
from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class Settings:
    base_dir: Path
    default_model: Path
    api_token: str
    model_path: str
    feedback_dir: Path
    pending_dir: Path
    pending_retention_seconds: int

    @classmethod
    def from_env(cls) -> "Settings":
        """Liest alle relevanten Einstellungen aus den Umgebungsvariablen."""
        base_dir = Path(__file__).resolve().parent.parent
        default_model = base_dir / "invoice_nlp" / "model" / "model-best"
        pending_dir = Path(os.environ.get("NLP_PENDING_DIR", base_dir / "pending_results"))
        retention = int(os.environ.get("NLP_PENDING_RETENTION_SECONDS", "86400"))
        return cls(
            base_dir=base_dir,
            default_model=default_model,
            api_token=os.environ.get("NLP_API_TOKEN", "secret-token"),
            model_path=os.environ.get("NLP_MODEL_PATH", str(default_model)),
            feedback_dir=Path(os.environ.get("NLP_FEEDBACK_DIR", base_dir / "feedback")),
            pending_dir=pending_dir,
            pending_retention_seconds=retention,
        )
