#!/usr/bin/env python3
"""Sammelt Feedback-Samples ein und stößt regelmäßige spaCy-Trainings an."""

import os
import subprocess
from pathlib import Path

from nlp_api.api_config import Settings
from nlp_api.storage import _training_file


SETTINGS = Settings.from_env()
FEEDBACK_DIR = SETTINGS.feedback_dir
BASE_DIR = SETTINGS.base_dir
TRAIN_CONFIG = Path(os.environ.get("NLP_TRAIN_CONFIG", BASE_DIR / "invoice_nlp" / "config.cfg"))
TRAIN_DATA = Path(os.environ.get("NLP_TRAIN_DATA", BASE_DIR / "invoice_nlp" / "data" / "train.spacy"))
DEV_DATA = Path(os.environ.get("NLP_DEV_DATA", BASE_DIR / "invoice_nlp" / "data" / "dev.spacy"))
OUTPUT_DIR = Path(os.environ.get("NLP_TRAIN_OUTPUT", BASE_DIR / "invoice_nlp" / "model"))
FEEDBACK_ARCHIVE = Path(os.environ.get("NLP_FEEDBACK_ARCHIVE", BASE_DIR / "invoice_nlp" / "data" / "feedback.jsonl"))


def aggregate_feedback():
    """Sammelt alle neuen Trainingsdaten in einer gemeinsamen JSONL-Datei."""
    training_file = _training_file(FEEDBACK_DIR)
    if not training_file.exists():
        return
    FEEDBACK_ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    FEEDBACK_ARCHIVE.write_text(training_file.read_text(encoding="utf-8"), encoding="utf-8")


def run_training():
    """Startet den spaCy-Trainingsjob mit den gesammelten Daten."""
    if not TRAIN_CONFIG.exists():
        raise SystemExit(f"Missing spaCy config: {TRAIN_CONFIG}")
    cmd = [
        "python",
        "-m",
        "spacy",
        "train",
        str(TRAIN_CONFIG),
        "--output",
        str(OUTPUT_DIR),
        "--paths.train",
        str(TRAIN_DATA),
        "--paths.dev",
        str(DEV_DATA),
    ]
    subprocess.run(cmd, check=True)


def main():
    """Ruft erst die Sammlung auf und stößt danach das Training an."""
    aggregate_feedback()
    run_training()


if __name__ == "__main__":
    main()
