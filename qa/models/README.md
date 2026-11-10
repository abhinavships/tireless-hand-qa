# Local model assistance

Coding review at the start, deterministic Playwright/API/socket oracles in the middle, vision review at the end. Models propose hypotheses and reproducer checks; model output never changes the existing pass/fail verdict. No generated commands or code execute.

The GPU host supplied for this project has Ollama and a 32 GB RTX 5090. Qwen2.5-Coder 7B was installed for text review; the existing Qwen3-VL 8B Instruct produced valid screenshot reviews. The 4B vision model returned empty output on this host, so it is not the default. The local service supports schema-constrained JSON and base64 screenshots ([Ollama API](https://github.com/ollama/ollama/blob/main/docs/openapi.yaml)).

Open a private tunnel in a separate terminal; SSH authentication is handled by SSH, never stored in this repo:

```bash
ssh -N -L 127.0.0.1:11435:127.0.0.1:11434 -o ExitOnForwardFailure=yes rtx5090@192.168.10.222
```

From `qa/`:

```bash
# Text planning from the already learned baseline; no app mutation
node --import tsx models/cli.ts plan auto/out/model.json
# Grounded bug triage of observed results
node --import tsx models/cli.ts triage auto/out/results.json
# Read-only source bug hypotheses with file/line evidence
node --import tsx models/source.ts product/backend/src/socket/server.ts
# Visual review of recorded simulator evidence and its contract
node --import tsx models/cli.ts vision contracts/cockpit.json ../evidence/S02/clean/screenshot.png
# Complete pipeline: existing engine owns its app lock; requires trusted model.json
node --import tsx models/pipeline.ts 3
# Track Claude's hub/map/engine files and current map proof results
node --import tsx models/status.ts --watch
node --import tsx --test models/client.test.ts
```

`pipeline.ts` forwards the engine's existing live events and emits `model-review` events for hub consumers. It samples at most two scenario frames for bounded latency. Its exit status comes from deterministic failures or engine errors; model unavailability is recorded and does not stop deterministic testing. Do not run the pipeline while another worker owns the app lock. Text/vision CLI exits 2 when the model is unavailable, not when a bug hypothesis is returned.

Import `reviewPlan(context)` and `reviewScreenshots(context, [imageBuffer])` from `models/client.ts` when integrating directly into the hub. Results have `status`, `advisory`, `model`, `cached`, `durationMs`, and either a validated `review` or `error`. Reviews contain `summary`, per-expectation `checks`, `issues` (observation, impact, confidence and steps), and `nextChecks`.

Configuration: `OLLAMA_URL` (default private tunnel `http://127.0.0.1:11435`), `CODING_MODEL`, `VISION_MODEL`, `MODEL_TIMEOUT_MS` (60000), `MODEL_REPORT`. Content-addressed cache keys include endpoint, model, prompt, settings and screenshot bytes. One in-process queue reduces GPU contention; separate processes may still compete. Input limits: 80k text characters, two images, 8 MB each, 8192 model context tokens and 1200 output tokens. Large inputs may require summarization to fit the context window. The client does not silently truncate evidence.

Cache, sampled images and reports stay in ignored `models/out/`. Only pass the evidence needed for the review. No API key or SSH password is needed by the model client.

Source review accepts only explicit code files under `product/` or `qa/`, resolves symlinks, adds line numbers, and discards issue citations whose file, line and exact code excerpt do not match the supplied source. Valid JSON does not establish that a security hypothesis is correct: even a grounded observation needs runtime confirmation. The source review is a local coding-model helper, not an autonomous code-editing agent.
