FROM python:3.11-slim

# Install build deps for packages like spacy
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app
RUN chmod +x /app/entrypoint.sh || true
COPY healthcheck.sh /app/healthcheck.sh
RUN chmod +x /app/healthcheck.sh || true

EXPOSE 8000
CMD ["/app/entrypoint.sh"]
