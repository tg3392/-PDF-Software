"""Flask-App, die NLP-Extraktion und Feedback-Endpunkte bereitstellt."""

import os
import uuid
from typing import Dict, Any

from flask import Flask, jsonify, request

from nlp_api.api_config import Settings
from nlp_api.helpers import FIELD_ORDER, build_field_payload, detect_invoice_type
from nlp_api.spacy_model_loader import load_spacy_model
from nlp_api.ocr_parser import parse_ocr_text, derive_field_confidences
from nlp_api.storage import save_feedback
from nlp_api.pending_store import PendingResultStore
from nlp_api.feedback_utils import extract_corrections, build_training_entry


SETTINGS = Settings.from_env()
BASE_DIR = SETTINGS.base_dir
DEFAULT_MODEL = SETTINGS.default_model
API_TOKEN = SETTINGS.api_token
MODEL_PATH = SETTINGS.model_path
FEEDBACK_DIR = SETTINGS.feedback_dir
PENDING_STORE = PendingResultStore(SETTINGS.pending_dir, SETTINGS.pending_retention_seconds)

NLP, NLP_ERROR = load_spacy_model(MODEL_PATH)

app = Flask(__name__)


def _auth_failed():
    """Antwortet mit 401, wenn kein gültiger Token vorhanden ist."""
    return jsonify({"status": "error", "message": "Unauthorized"}), 401


def _require_auth():
    """Prüft das Authorization-Header auf den erwarteten Token."""
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return False
    token = header.split(" ", 1)[1].strip()
    return token and token == API_TOKEN


def _ensure_request_id(payload: Dict[str, Any]) -> str:
    """Liefert eine saubere requestId, falls sie im Payload fehlt."""
    rid = payload.get("requestId")
    return rid if isinstance(rid, str) and rid.strip() else str(uuid.uuid4())


def _finalize_response(
    request_id: str,
    request_payload: Dict[str, Any],
    body: Dict[str, Any],
    status_code: int,
    store_pending_result: bool = False,
    stored_text: str | None = None,
):
    """Schickt die Antwort raus und legt optional das Ergebnis für Feedback ab."""
    if store_pending_result and "data" in body:
        PENDING_STORE.save(request_id, request_payload, body, status_code, stored_text)
    return jsonify(body), status_code


@app.route("/nlp/extract", methods=["POST"])
def extract():
    """Bearbeitet den OCR-Text und liefert strukturierte Felder zurück."""
    if not _require_auth():
        return _auth_failed()

    payload = request.get_json(silent=True) or {}
    request_id = _ensure_request_id(payload)
    if NLP is None:
        message = "NLP model not available"
        if NLP_ERROR:
            message = f"{message}: {NLP_ERROR}"
        response = {"requestId": request_id, "status": "error", "message": message}
        return _finalize_response(request_id, payload, response, 503)
    ocr_text = payload.get("ocrText")
    if ocr_text is None:
        response = {
            "requestId": request_id,
            "status": "error",
            "message": "missing ocrText",
        }
        return _finalize_response(request_id, payload, response, 400)

    try:
        text, raw_ocr = parse_ocr_text(ocr_text)
    except ValueError:
        response = {
            "requestId": request_id,
            "status": "error",
            "message": "invalid ocrText payload",
        }
        return _finalize_response(request_id, payload, response, 400)
    if not text.strip():
        response = {
            "requestId": request_id,
            "status": "partial",
            "warnings": ["OCR input did not contain extractable text."],
            "data": {
                "type": "UNKNOWN",
                "fields": [{"name": name, "value": "", "confidence": 0.0} for name in FIELD_ORDER],
            },
        }
        return _finalize_response(request_id, payload, response, 422, store_pending_result=True, stored_text=text)

    doc = NLP(text)
    extracted: Dict[str, str] = {}
    for ent in doc.ents:
        label = ent.label_
        if label not in FIELD_ORDER:
            continue
        if label in extracted:
            continue
        extracted[label] = ent.text

    field_confidence_map = derive_field_confidences(extracted, raw_ocr)
    fields, hit_count = build_field_payload(extracted, None, field_confidence_map)
    value_map = {entry["name"]: entry["value"] for entry in fields}
    invoice_type = detect_invoice_type(value_map)
    if hit_count == 0:
        response = {
            "requestId": request_id,
            "status": "partial",
            "warnings": ["no extractable fields"],
            "data": {"type": invoice_type, "fields": fields},
        }
        return _finalize_response(request_id, payload, response, 422, store_pending_result=True, stored_text=text)

    response = {
        "requestId": request_id,
        "status": "ok",
        "data": {"type": invoice_type, "fields": fields},
    }
    if hit_count < len(FIELD_ORDER):
        response["warnings"] = ["some fields missing"]
    return _finalize_response(request_id, payload, response, 200, store_pending_result=True, stored_text=text)


@app.route("/nlp/feedback", methods=["POST"])
def feedback():
    """Speichert Korrekturen aus dem Frontend als Trainingsdaten."""
    if not _require_auth():
        return _auth_failed()

    payload = request.get_json(silent=True) or {}
    request_id = _ensure_request_id(payload)
    pending_entry = PENDING_STORE.pop(request_id)
    saved = False
    if pending_entry:
        corrections = extract_corrections(payload)
        training_entry = build_training_entry(pending_entry, corrections, payload)
        save_feedback(FEEDBACK_DIR, training_entry, request_id)
        saved = True
    return jsonify({"requestId": request_id, "saved": saved}), 200


if __name__ == "__main__":
    host = os.environ.get("NLP_API_HOST", "0.0.0.0")
    port = int(os.environ.get("NLP_API_PORT", "8000"))
    app.run(host=host, port=port)
