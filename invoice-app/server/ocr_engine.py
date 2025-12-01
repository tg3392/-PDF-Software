try:
    import fitz  # PyMuPDF
    HAVE_PYMUPDF = True
except Exception:
    fitz = None
    HAVE_PYMUPDF = False

import pytesseract
from PIL import Image
import unicodedata
import io
import os
import uuid
try:
    # pdfminer fallback for digital text extraction when PyMuPDF is unavailable
    from pdfminer.high_level import extract_text
    HAVE_PDFMINER = True
except Exception:
    HAVE_PDFMINER = False

# --- Konfiguration ---
# Pfad ggf. anpassen oder Docker-Env nutzen
if os.path.exists("/usr/share/tesseract-ocr/4.00/tessdata/"):
    os.environ["TESSDATA_PREFIX"] = "/usr/share/tesseract-ocr/4.00/tessdata/"

# Quick runtime checks: ensure tesseract binary is available and languages are present
def _check_tesseract_available():
    try:
        v = pytesseract.get_tesseract_version()
        return True
    except Exception as e:
        # Not fatal here — we'll raise later when trying to OCR, but provide clear message
        print('Warning: Tesseract not available or not found in PATH:', e)
        return False

TESSERACT_OK = _check_tesseract_available()

def process_pdf_bytes(file_bytes: bytes, filename: str = "upload.pdf", dpi: int = 300, max_pages: int = None):
    """
    Verarbeitet PDF-Bytes und gibt das strukturierte Ergebnis zurück.
    """
    ocr_id = str(uuid.uuid4())
    full_text_accumulated = []
    pages_data = []

    try:
        # PDF öffnen: wenn PyMuPDF verfügbar, nutzen wir es für Seitenstruktur
        if HAVE_PYMUPDF:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            metadata = doc.metadata
            total_pages = len(doc)
        else:
            # fallback: wenn pdfminer vorhanden, extrahiere digitalen Text (keine Seitenmetadaten)
            if HAVE_PDFMINER:
                text_all = extract_text(io.BytesIO(file_bytes))
                # split pages by form-feed (pdfminer uses \f between pages)
                pages = [p for p in text_all.split('\f') if p.strip()]
                metadata = {}
                total_pages = len(pages) if pages else 1
            else:
                raise RuntimeError('Neither PyMuPDF nor pdfminer available to read PDF. Install PyMuPDF or pdfminer.six')

        if max_pages and total_pages > max_pages:
            total_pages = min(total_pages, max_pages)

        def _norm(s):
            try:
                return unicodedata.normalize('NFC', s) if isinstance(s, str) else s
            except Exception:
                return s

        for i in range(total_pages):
            if HAVE_PYMUPDF:
                page = doc.load_page(i)
            else:
                page = None
            # Versuch: Wenn PDF digitalen Text enthält, nutze diesen direkt (viel zuverlässiger)
            page_text = ''
            try:
                if HAVE_PYMUPDF:
                    txt = page.get_text('text')
                else:
                    # pdfminer: we split previously extracted pages
                    txt = pages[i] if i < len(pages) else ''
                if isinstance(txt, str) and len(txt.strip()) > 80:
                    # genügend extrahierter Text, kein OCR per Bild nötig
                    page_text = _norm(txt)
                    # erzeugen einen leeren pages_data Eintrag mit high confidence
                    pages_data.append({
                        "page_number": i + 1,
                        "width": 0,
                        "height": 0,
                        "dpi": dpi,
                        "coord_unit": "px",
                        "confidence": 0.99,
                        "lines": [{"line_text": _norm(l), "words": []} for l in txt.splitlines() if l.strip()]
                    })
                    # springe zur nächsten Seite
                    continue
            except Exception:
                # falls get_text fehlschlägt, fahren wir mit Bild‑OCR fort (falls möglich)
                page_text = ''

            # DPI für OCR (konfigurierbar) - nur möglich wenn PyMuPDF verfügbar
            if not HAVE_PYMUPDF:
                # Kein Bild-OCR möglich ohne PyMuPDF rendering
                # fülle mit leerem Text (oder bereits extrahiertem pdfminer Text)
                full_text_accumulated.append(page_text or '')
                pages_data.append({
                    "page_number": i + 1,
                    "width": 0,
                    "height": 0,
                    "dpi": dpi,
                    "coord_unit": "px",
                    "confidence": 0.0,
                    "lines": []
                })
                continue

            pix = page.get_pixmap(dpi=dpi)
            img = Image.open(io.BytesIO(pix.tobytes("png")))

            # 1. Reiner Text für das Pflichtfeld 'ocrText'
            # If language packs missing, fall back to default
            try:
                page_text = pytesseract.image_to_string(img, lang="deu+eng")
            except Exception:
                page_text = pytesseract.image_to_string(img)
            page_text = _norm(page_text)
            full_text_accumulated.append(page_text)

            # 2. Detaillierte Daten für 'ocrResult'
            try:
                data = pytesseract.image_to_data(img, lang="deu+eng", output_type=pytesseract.Output.DICT)
            except Exception:
                data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)

            # --- Deine Logik für Zeilen-Rekonstruktion --- (robust gegenüber leeren/ungewöhnlichen conf‑Werten)
            lines_dict = {}
            num_items = len(data.get('text', []))
            conf_scores = []

            for j in range(num_items):
                try:
                    level = int(data['level'][j])
                except Exception:
                    level = None

                if level == 5:  # Wort-Level
                    text = (data.get('text', [])[j] or '').strip()
                    # robustes Parsen von conf (kann leer oder nicht-int sein)
                    conf_raw = data.get('conf', [])[j] if j < len(data.get('conf', [])) else None
                    try:
                        conf = float(conf_raw)
                    except Exception:
                        conf = None

                    if conf is not None and conf >= 0:
                        conf_scores.append(conf)

                    if text:
                        line_key = (
                            int(data.get('block_num', [])[j]) if j < len(data.get('block_num', [])) else 0,
                            int(data.get('par_num', [])[j]) if j < len(data.get('par_num', [])) else 0,
                            int(data.get('line_num', [])[j]) if j < len(data.get('line_num', [])) else 0
                        )
                        if line_key not in lines_dict:
                            lines_dict[line_key] = []

                        left = int(data.get('left', [])[j]) if j < len(data.get('left', [])) and data.get('left', [])[j] != '' else 0
                        top = int(data.get('top', [])[j]) if j < len(data.get('top', [])) and data.get('top', [])[j] != '' else 0
                        width = int(data.get('width', [])[j]) if j < len(data.get('width', [])) and data.get('width', [])[j] != '' else 0
                        height = int(data.get('height', [])[j]) if j < len(data.get('height', [])) and data.get('height', [])[j] != '' else 0

                        lines_dict[line_key].append({
                            "text": _norm(text),
                            "left": left,
                            "top": top,
                            "width": width,
                            "height": height,
                            "conf": conf
                        })

            # Zeilen sortieren
            sorted_line_keys = sorted(lines_dict.keys())
            reconstructed_lines = []
            for key in sorted_line_keys:
                words_in_line = lines_dict[key]
                words_in_line.sort(key=lambda w: w['left'])
                
                # Wir bauen den String der Zeile zusammen
                line_text = " ".join([w['text'] for w in words_in_line])
                reconstructed_lines.append({
                    "line_text": _norm(line_text),
                    "words": words_in_line
                })

            # Durchschnittsconfidence normalisiert (0..1)
            if conf_scores:
                avg_conf = float(sum(conf_scores) / len(conf_scores))
                # Tesseract gibt häufig 0..100, wir standardisieren auf 0..1
                if avg_conf > 1.0:
                    avg_conf = avg_conf / 100.0
            else:
                avg_conf = 0.0

            # Ergänze normalisierte Bounding‑Boxes pro Wort (0..1 relativ zur Seite)
            for line in reconstructed_lines:
                for w in line['words']:
                    try:
                        w['x_rel'] = round(w['left'] / pix.width, 6) if pix.width else 0
                        w['y_rel'] = round(w['top'] / pix.height, 6) if pix.height else 0
                        w['w_rel'] = round(w['width'] / pix.width, 6) if pix.width else 0
                        w['h_rel'] = round(w['height'] / pix.height, 6) if pix.height else 0
                    except Exception:
                        w['x_rel'] = w['y_rel'] = w['w_rel'] = w['h_rel'] = 0

            pages_data.append({
                "page_number": i + 1,
                "width": pix.width,
                "height": pix.height,
                "dpi": dpi,
                "coord_unit": "px",
                "confidence": round(avg_conf, 4),
                "lines": reconstructed_lines
            })

        # close the PyMuPDF document if it was opened
        try:
            if HAVE_PYMUPDF and 'doc' in locals() and doc is not None:
                doc.close()
        except Exception:
            pass

        # Finales Ergebnis zusammenbauen
        return {
            "ocrId": ocr_id,
            "ocrText": _norm("\n\n".join(full_text_accumulated)), # Pflichtfeld
            "ocrResult": { # Optionales strukturiertes Feld
                "pages_structure": pages_data,
                "metadata": metadata
            },
            "pages": total_pages
        }

    except Exception as e:
        print(f"OCR Error: {e}")
        raise e
