# Convenience script to create directories expected by docker-compose for the NLP service
Write-Host "Creating cache/feedback, cache/pending_results and nlp/invoice_nlp/model"
New-Item -ItemType Directory -Path .\cache\feedback -Force | Out-Null
New-Item -ItemType Directory -Path .\cache\pending_results -Force | Out-Null
New-Item -ItemType Directory -Path .\nlp\invoice_nlp\model -Force | Out-Null
# Create .gitkeep placeholders
if (-not (Test-Path .\cache\feedback\.gitkeep)) { New-Item -ItemType File -Path .\cache\feedback\.gitkeep | Out-Null }
if (-not (Test-Path .\cache\pending_results\.gitkeep)) { New-Item -ItemType File -Path .\cache\pending_results\.gitkeep | Out-Null }
Write-Host "Done. Place your model in .\nlp\invoice_nlp\model\model-best (read-only mount to the container)."
