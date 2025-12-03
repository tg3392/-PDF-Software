#!/bin/sh
# Simple healthcheck script for the NLP service.
# Sends an authenticated POST to /nlp/extract with a tiny payload
# and treats any HTTP status < 500 as healthy.

set -e

status=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NLP_API_TOKEN" \
  -d '{"ocrText":"healthcheck"}' \
  http://127.0.0.1:8000/nlp/extract || echo 000)

if [ "$status" -lt 500 ] && [ "$status" -ne 000 ]; then
  exit 0
else
  exit 1
fi
