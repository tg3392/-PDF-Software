# NLP Service (apl83/nlp:1.0)

This folder contains helper scripts and instructions to prepare the model and cache directories required by the `apl83/nlp:1.0` image used by the project's `docker-compose` files.

Required paths (relative to repository root):

- `./cache/feedback` — writable directory the container uses to store feedback
- `./cache/pending_results` — writable directory for pending results
- `./nlp/invoice_nlp/model` — **read-only** path mounted into the container; must contain the model directory `model-best`

The image expects the model at `/app/invoice_nlp/model/model-best` inside the container, which maps to `./nlp/invoice_nlp/model/model-best` on the host.

Steps to prepare:

1. Create the directories (or run the provided PowerShell helper):

   ```powershell
   .\create_nlp_dirs.ps1
   ```

2. Obtain the `model-best` directory from the model provider and place it at `./nlp/invoice_nlp/model/model-best`.

   - If you have a `model.zip`, extract its contents so that the `model-best` directory is directly under `./nlp/invoice_nlp/model`.
   - The container mounts the model directory as read-only.

3. Start the services with `docker compose up -d` (or use `docker-compose.prod.yml` for production settings).

Healthcheck: the production compose file includes a container healthcheck which waits for `http://localhost:8000/` to respond.

If you want to automate downloading a model archive (if a URL is available), use `nlp/fetch_model.ps1 -ModelUrl <url>`; the script downloads the file but does not automatically unpack it.

Note for the API integration:
- The `api` service can forward `/nlp/extract` requests to the external NLP container when the environment variable `NLP_API_URL` is set (for example `http://nlp_api:8000/extract`).
- By default the repository `docker-compose` files set `NLP_API_URL` and `NLP_API_TOKEN` for the `api` service so forwarding will be active when you start the compose stack.

Host port note:
- To avoid conflicts with other services that may bind host port `8000`, the compose files map the NLP service to host port `8003` (`8003:8000`). From the host (your browser or curl) use `http://localhost:8003/` to reach the NLP web UI / health endpoint.
