#!/bin/bash
set -euo pipefail

# Launch the web API (same as upstream image)
exec python web_api.py
