# OCR wrapper Dockerfile
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# install system deps (tesseract + build basics)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       tesseract-ocr \
       tesseract-ocr-deu \
       libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /ocr
# copy only required files from server
COPY ../server/requirements.txt ./
COPY ../server/ocr_engine.py ./
COPY ../server/ocr_fastapi_single.py ./

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8003
CMD ["uvicorn", "ocr_fastapi_single:app", "--host", "0.0.0.0", "--port", "8003"]
