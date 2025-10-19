# Invoice App - Test Backend

This is a tiny Express-based test backend intended to help local frontend development. It provides simple, deterministic endpoints that mimic OCR, extraction and persistence behavior.

Available endpoints:

- GET /api/health — returns { ok: true }
- POST /api/ocr — accepts multipart/form-data file upload (field name: `file`) and returns mocked OCR text
- POST /api/extract — accepts JSON { text } and returns a mocked extracted invoice object
- POST /api/invoices — accepts a JSON invoice object and returns { ok: true, id, invoice }
- POST /api/feedbacks — accepts JSON feedback object and returns { ok: true, feedbackId, feedback }

Start locally:

```powershell
cd "D:\Studium\5.Semester\Softwaretechnik-Labor\TEST\invoice-app\server"
npm install
npm run start
```

This server is intentionally simple. Replace the mocked implementations with real OCR/extraction and persistence as needed.
