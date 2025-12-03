"""Hilfsfunktionen für Extraktion, Normalisierung und Typ-Erkennung."""

import re
from datetime import datetime
from typing import Any, Dict, Optional, Tuple, List

from dateutil import parser as date_parser
from dateutil.parser import ParserError


FIELD_SPECS: Dict[str, Dict[str, str]] = {
    "INVOICE_NO": {"type": "text"},
    "INVOICE_DATE": {"type": "date"},
    "SERVICE_DATE": {"type": "date"},
    "SUPPLIER_NAME": {"type": "text"},
    "SUPPLIER_ADDRESS_STREET": {"type": "text"},
    "SUPPLIER_ADDRESS_CITY": {"type": "text"},
    "CUSTOMER_NAME": {"type": "text"},
    "CUSTOMER_ADDRESS_STREET": {"type": "text"},
    "CUSTOMER_ADDRESS_CITY": {"type": "text"},
    "VAT_ID": {"type": "text"},
    "TAX_ID": {"type": "text"},
    "PAYMENT_TERMS": {"type": "text"},
    "TOTAL_GROSS": {"type": "number"},
    "IBAN": {"type": "text"},
    "BIC": {"type": "text"},
    "BANK_NAME": {"type": "text"},
}

FIELD_ORDER = list(FIELD_SPECS.keys())
REFERENCE_COMPANY = {
    "NAME": "Mustergesellschaft mbH",
    "ADDRESS_STREET": "Musterstr. 11",
    "ADDRESS_CITY": "12345 Musterstadt",
}
GERMAN_MONTHS = {
    "januar": "january",
    "februar": "february",
    "märz": "march",
    "maerz": "march",
    "april": "april",
    "mai": "may",
    "juni": "june",
    "juli": "july",
    "august": "august",
    "september": "september",
    "oktober": "october",
    "november": "november",
    "dezember": "december",
}

MONTH_PATTERN = re.compile(r"\b([A-Za-zÄÖÜäöüß]+)\b")


def _replace_german_months(value: str) -> str:
    def repl(match: re.Match[str]) -> str:
        token = match.group(0)
        lower = token.lower()
        replacement = GERMAN_MONTHS.get(lower)
        return replacement if replacement else token

    return MONTH_PATTERN.sub(repl, value)


def parse_date(value: str) -> Optional[str]:
    """Wandelt verschiedene Datums-Formate in ISO-Strings um."""
    if not value:
        return None
    normalized = _replace_german_months(value.strip())
    try:
        parsed = date_parser.parse(normalized, dayfirst=True, default=datetime(1900, 1, 1))
    except (ParserError, ValueError, TypeError):
        return None
    return parsed.date().isoformat()


def parse_number(value: str) -> Optional[float]:
    """Bereinigt Zahlenangaben und liefert sie als Float zurück."""
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    cleaned = cleaned.replace("€", "").replace("EUR", "")
    cleaned = cleaned.replace("\u202f", "").replace("\xa0", "").replace(" ", "")
    cleaned = cleaned.replace("'", "")
    if cleaned.count(",") > 0 and cleaned.count(".") > 0:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "")
            cleaned = cleaned.replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    else:
        cleaned = cleaned.replace(",", ".")
    cleaned = re.sub(r"[^0-9\.-]", "", cleaned)
    try:
        return float(cleaned)
    except ValueError:
        return None


def normalize_value(label: str, text: str):
    """Gibt je nach Feldtyp einen aufbereiteten Wert zurück."""
    spec = FIELD_SPECS.get(label, {})
    value_type = spec.get("type", "text")
    if value_type == "date":
        iso = parse_date(text)
        return iso if iso else ""
    if value_type == "number":
        num = parse_number(text)
        return num if num is not None else ""
    return text.strip()


def _normalize_party_value(value: Any) -> str:
    """Macht Namen/Adressen vergleichbar durch einfache Normalisierung."""
    if value is None:
        return ""
    text = str(value).strip().lower()
    text = (
        text.replace("ä", "ae")
        .replace("ö", "oe")
        .replace("ü", "ue")
        .replace("ß", "ss")
    )
    text = re.sub(r"[^a-z0-9]", "", text)
    return text


REFERENCE_COMPANY_NORMALIZED = {
    key: _normalize_party_value(val) for key, val in REFERENCE_COMPANY.items()
}


def _matches_company(field_values: Dict[str, str], prefix: str) -> bool:
    """Vergleicht Felder mit den Referenzdaten für Lieferant/Kunde."""
    suffixes = ["NAME", "ADDRESS_STREET", "ADDRESS_CITY"]
    for suffix in suffixes:
        expected = REFERENCE_COMPANY_NORMALIZED[suffix]
        candidate = _normalize_party_value(field_values.get(f"{prefix}_{suffix}", ""))
        if not candidate or candidate != expected:
            return False
    return True


def detect_invoice_type(field_values: Dict[str, str]) -> str:
    """Liefert OUTGOING oder INGOING basierend auf den Referenzfeldern."""
    if _matches_company(field_values, "SUPPLIER"):
        return "OUTGOING"
    if _matches_company(field_values, "CUSTOMER"):
        return "INGOING"
    return "UNKNOWN"


def build_field_payload(
    extractions: Dict[str, str],
    default_confidence: Optional[float],
    confidence_map: Optional[Dict[str, float]] = None,
) -> Tuple[List[Dict[str, Any]], int]:
    """Erstellt die Feldliste inklusive Trefferzahl und Konfidenzen."""
    fields: List[Dict[str, Any]] = []
    hits = 0
    base_confidence = default_confidence if default_confidence is not None else 0.0
    for name in FIELD_ORDER:
        raw_value = extractions.get(name)
        if raw_value is None:
            fields.append({"name": name, "value": "", "confidence": 0.0})
            continue
        normalized = normalize_value(name, raw_value)
        if normalized == "" or normalized is None:
            value = ""
            confidence = 0.0
        else:
            value = normalized
            confidence = confidence_map.get(name) if confidence_map and name in confidence_map else base_confidence
            hits += 1
        fields.append({"name": name, "value": value, "confidence": confidence})
    return fields, hits
