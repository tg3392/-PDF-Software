from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import sys
import traceback
import importlib


app = FastAPI(title="OCR Wrapper Single")

# allow local dev origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _import_ocr_module():
    """Try to import `ocr_engine` from a few likely locations."""
    try:
        return importlib.import_module('ocr_engine')
    except Exception:
        pass

    here = os.path.dirname(__file__)
    candidates = [
        os.path.abspath(here),
        os.path.abspath(os.path.join(here, '..', '..', 'Archiv')),
        os.path.abspath(os.path.join(here, '..', '..')),
        os.path.abspath(os.path.join(here, '..')),
        os.path.abspath(os.getcwd()),
    ]

    for p in candidates:
        mod_path = os.path.join(p, 'ocr_engine.py')
        if os.path.exists(mod_path):
            if p not in sys.path:
                sys.path.insert(0, p)
            try:
                return importlib.import_module('ocr_engine')
            except Exception:
                continue

    raise ImportError('ocr_engine module not found in candidates: ' + ','.join(candidates))


try:
    ocr_engine = _import_ocr_module()
    process_pdf_bytes = getattr(ocr_engine, 'process_pdf_bytes')
except Exception as e:
    process_pdf_bytes = None
    _import_error = e


@app.post("/api/ocr")
async def api_ocr(file: UploadFile = File(...)):
    if process_pdf_bytes is None:
        return JSONResponse(status_code=500, content={"code": "ocr_not_available", "message": f"OCR module not available: {_import_error}"})

    filename = file.filename or 'upload.pdf'
    content_type = file.content_type or ''
    if not (content_type == 'application/pdf' or filename.lower().endswith('.pdf')):
        raise HTTPException(status_code=400, detail={"code": "invalid_file_type", "message": "Only PDF files are accepted"})

    try:
        data = await file.read()
        res = process_pdf_bytes(data, filename=filename)

        ocr_text = res.get('ocrText') if isinstance(res, dict) else None
        ocr_result = res.get('ocrResult') if isinstance(res, dict) else None
        pages = res.get('pages') if isinstance(res, dict) else None
        ocr_id = res.get('ocrId') if isinstance(res, dict) else None

        return {"ok": True, "ocrText": ocr_text, "ocrResult": ocr_result, "pages": pages, "ocrId": ocr_id}
    except Exception as e:
        tb = traceback.format_exc()
        return JSONResponse(status_code=422, content={"code": "ocr_error", "message": str(e), "trace": tb})


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8003)
