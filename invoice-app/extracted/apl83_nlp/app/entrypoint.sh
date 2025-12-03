#!/bin/bash
set -euo pipefail

# Start cron to handle scheduled retraining.
cron

# Launch the web API.
exec python web_api.py
