# T06 — LLM vision judge + exploratory bug hunt

**Owns:** `qa/tools/judge.ts`, `qa/scenarios/S16-*`, `qa/explore/**`, `evidence/explore/**`
**PRIORITY IS B (explore). A is optional, do it last.** No API keys will be provided (D11).
A) Judge (optional, last): `judge.ts <screenshot> <contract.json>` shells out to an already-authenticated local agent CLI (`codex exec` with the image attached, or `claude -p`). Do NOT use Gemini/NVIDIA keys. Prompt: the operator persona + contract → JSON {ok, issues:[{severity, element, why}]}. Cache by image hash, respect the rate limit (429 → backoff). Advisory only.
B) Explore: act as a drone operator. Drive the cockpit + control panel through every fault kind, add/remove drones, resize to phone, switch drones rapidly, and let it run 10 min. Hunt for REAL user-facing bugs in the baseline (stale data shown as live, wrong drone's video, status mismatch, layout breaks, toasts replaying, etc.). For each: exact repro steps, expected vs actual, and a Playwright video (write a throwaway spec in `qa/explore/`). Reproduce 2x before reporting. Real bugs are worth a lot, so be thorough and precise.
GPU box (see `.context/local/secrets.md`) only if you decide to run a local vision model; ask the master first.

## FLAG 2026-09-26T07:11Z
Per master's **D20** (`.context/decisions.md`): explore is LAST. Let your current soak segment finish, release `.context/locks/app.lock`, and do **not** start another soak segment (no segment 3+) until `.context/BOARD.md` shows T03's P0 clean qualification (S03–S07) AND T05's P0 targeted mutant proofs (M02/M04/M09/M13/M14) are past IN_PROGRESS-blocked-on-lock. Your back-to-back segment reacquisition (segment 2 right after segment 1) is documented in T05's 07:08:57Z report as actively starving their P0 work — this is the critical path for the L1 submission, ahead of your exploration. Re-check BOARD.md before your next `mkdir .context/locks/app.lock`.
