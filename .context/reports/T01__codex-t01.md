## 2026-09-26T07:04:11+00:00 | status: DONE
**Did:** ROUND 2 item 0 plus items 1–6 DONE. D15 lock borrowing + RUN_ID isolation shipped FIRST and T05 acknowledged resuming. D16 enforced by runner-wide lock and direct Playwright globalSetup. D12 canonical artifacts, readable repeat filenames, first-line ≤200-char verdict messages, AGENT_NAME owners, S00 step narration, waitForDevice/waitRow implemented. T02 multi-page axe video selection addressed via longest recording (ffprobe; size fallback). T05 subtle variant labels mutant-M03b/M03c/M09b/M05b now accepted. EVIDENCE_ROOT provides scratch collection without touching other workers' proof.
**Evidence:**
- Final typecheck PASS and live S01 desktop validation PASS (3.4s test, 4.1s batch), RUN_ID=t01-s01-check; artifacts/HTML/JSON under qa/test-results/t01-s01-check; scratch evidence /tmp/t01-validation-evidence/S01/clean. Runner, globalSetup and scenario appLock all borrowed the same validated token; isolatedDrone cleanup completed. Slot held only for brief batch.
- Direct lock verification PASS: fresh token exported; nested borrower release preserves parent lock; invalid token rejected; owner release clears token. No lock left behind by these checks.
- Synthetic collector QA confined to /tmp/t01-collector-check: unique readable repeats r0/r1, desktop first repeat picks main 2s recording over blank 0.2s axe-style page; phone override matches phone recording; first error line capped at 200 chars; canonical trace/screenshot copied; mutant-M03b accepted. Synthetic artifacts are NOT submission evidence.
- Separate RUN_ID=t01-round2 S00 run exercised failure path: correctly failed fixed-four-fleet precondition because shared runtime currently had FIVE drones; no product issue claimed and no other worker drone removed. Canonical failure collection succeeded. Earlier 9/9 qualification remains recorded in the earlier report; current evidence/S00/clean reflects this later precondition failure, and S00 is infrastructure only.
**Findings:** none newly reproduced by T01.
**Risks / flakes:** Legacy external shell lock holders MUST export their own matching APP_LOCK_TOKEN before child Playwright starts; prefer tools/run.sh. Direct npx Playwright without RUN_ID uses default per D15; runner creates unique ids. Keep each batch <5min per D16. S00 requires baseline four-drone fleet, so use scenario contracts for validation while others have isolated drones. Canonical collector uses available-project fallback when requested project is absent.
**Need from master:** nothing; T05 unblocked; all requested helper interfaces documented in qa/README.md.
**Next:** continue serving requests from worker reports. No product modifications, commits, restarts, faults, extra drones or owned locks left behind.

## 2026-09-26T07:02:11+00:00 | status: IN_PROGRESS
**Did:** ROUND 2 items 1–6 implemented: canonical desktop-first-repeat video/trace/screenshot with CANONICAL_PROJECT override; readable project-rN-title artifact names; 200-char first-error-line verdict message; AGENT_NAME lock owner; three S00 narration steps; api.waitForDevice and cockpit.waitRow. Addressed T02 axe request by choosing longest first-repeat recording via ffprobe, with size fallback. qa/README.md documents RUN_ID, runner-wide slot, validated token borrowing, canonical selection and helper signatures.
**Evidence:** Typecheck PASS across all current workers' specs. RUN_ID=t01-round2 AGENT_NAME=codex-t01 tools/run.sh clean --grep S00 --project desktop is queued on app.lock; existing T04/T06 runs have not been interrupted.
**Findings:** none
**Risks / flakes:** IMPORTANT for legacy hand-written shell runners: if holding app.lock outside run.sh, create/export your own random APP_LOCK_TOKEN in app.lock/token BEFORE launching the child. Direct Playwright globalSetup now honors D16 and otherwise waits for that parent lock. Prefer tools/run.sh; do not read/borrow another worker token manually.
**Need from master:** T05 can proceed on D15; queued runtime validation will use a brief slot. Existing long qualification batches should adopt run.sh or parent token to avoid nested acquisition.
**Next:** finish live canonical/lock validation then mark DONE.

## 2026-09-26T07:00:34+00:00 | status: IN_PROGRESS
**Did:** URGENT ROUND 2 ITEM 0 DONE: token-validated lock borrowing in fixtures.ts (matching APP_LOCK_TOKEN borrows; mismatch rejects; fresh acquire writes random token and exports it; borrower release no-op). Per-run Playwright artifact/HTML/JSON output under qa/test-results/${RUN_ID:-default}; evidence reads the same path. run.sh generates a unique RUN_ID when absent, holds app.lock through Playwright and evidence collection, and passes its token to child processes. Direct Playwright invocations acquire/borrow through globalSetup. T05 UNBLOCKED on D15 implementation.
**Evidence:** npm run typecheck --prefix qa PASS. Attempt to acquire lock with 1s deadline correctly refused while another worker owns it; no active run interrupted. Runtime borrow verification queued behind current owner.
**Findings:** none
**Risks / flakes:** direct npx Playwright uses RUN_ID=default unless supplied; run.sh generates unique id. Always prefer run.sh. No lock bypass or manually borrowed other owner token.
**Need from master:** notify T05 it can use the D15 interface now.
**Next:** ROUND 2 items 1–6, then locked runtime verification.

## 2026-09-26T06:40:14+00:00 | status: NEEDS_REVIEW
**Did:**
- Built `qa/package.json`, lockfile, tsconfig and Playwright config: desktop/tablet/phone, 1 worker, 0 retries, videos/screenshots/traces always on, list/HTML/JSON reporters, SLOWMO support. Installed dependencies and Chromium; npm audit reported 0 vulnerabilities.
- Shared `qa/lib/api.ts`, `cockpit.ts`, `fixtures.ts`, `socket.ts`, `oracles.ts`, `overlay.ts`. API responses checked; missing numeric telemetry remains null; isolated drone fixture adds/removes paired drone; atomic appLock owner + finally release; faultLock alias; raw socket topic cache + bounded waits. Oracle/overlay helper delegated within T01 ownership under protocol.
- `qa/tools/run.sh` preserves test exit status and collects evidence after failures. `evidence.ts` writes D8 verdict keys and per-run manifest, with unique artifact names across projects/repeats. Replaces only old artifacts tracked by the previous manifest for that scenario/label. D7 labels enforced.
- `qa/scenarios/S00-smoke.spec.ts`, `qa/README.md` (helper signatures), top-level `README.md` (3 commands).
**Evidence:**
- `cd qa && ./tools/run.sh clean --grep S00 --repeat-each=3`: **9 passed**, desktop/tablet/phone each 3/3, 27.3 seconds total; no retries.
- `npm run typecheck --prefix qa`: PASS after final edits.
- `evidence/S00/clean/verdict.json`: status passed; `runs.json`: 9 passed runs, 27 unique artifacts (9 videos + 9 PNG screenshots + 9 traces).
- Playwright accessibility snapshot confirmed cockpit header, Devices, four site rows, telemetry heading/terms, live socket badge and rendered public testids. Initial video state connecting settles to live in every smoke run.
- Direct shared-helper integration: added drone-5, polled state, received retained/live battery via TruthSocket, closed socket, deleted drone; verified fleet restored to original count. Acquired/released appLock successfully.
- Failure-path collection exercised on initial run: 8 PASS / 1 FAIL because my helper validation briefly added drone-5 during the fixed-four-fleet smoke assertion. This was an orchestration mistake, not product flakiness; cleaned up then reran serially, final 9/9 pass. Failure verdict message and video/trace collection worked.
**Findings:** none; smoke validates harness only, not a submission scenario. No mutant proof claimed.
**Risks / flakes:** S00 deliberately requires the baseline four drones and first-drone live video; avoid fleet/fault mutations during smoke. Fault tests must open/waitReady before injection. API simulator connectivity and browser socket connectivity are distinct; the status oracle compares only explicit corresponding truth. Multi-test scenario verdict aggregates failures; detailed project/repeat/test results remain in runs.json. Model APIs unused.
**Need from master:** nothing. T02–T05 can build against interfaces documented in `qa/README.md`; no helper requests exist in current reports.
**Next:** harden shared helpers when other worker reports request changes. No commits, product changes, app restarts, faults or extra drones left behind; product git status clean.

### S00 — Harness smoke (infrastructure only)
- Categories: Functional / Telemetry / Video
- Description: Confirm browser, API and recording infrastructure work against the four-drone clean baseline.
- Starting state: running connected simulator, four drones, first-drone video enabled; no API reset performed.
- Steps: Read health/fleet; open cockpit; verify connected badge and four rows; select first drone; require numeric battery/altitude/speed; require live video label.
- Approach: Stable public testids plus control API starting-state checks, bounded polling for live telemetry/video.
- Catches: harness/runtime setup failures; no mutation proof (exclude from submission scenario count).
- Result: clean PASS x3 on each of 3 viewports (9/9).
- Evidence: `evidence/S00/clean/runs.json` maps each repeat to its video, screenshot and trace; `verdict.json` aggregates results.
- Spec: `qa/scenarios/S00-smoke.spec.ts`

## 2026-09-26 | status: IN_PROGRESS
**Did:** Read context and claimed T01; starting shared harness.
**Evidence:** Initial sandbox localhost health request could not connect; checking host access.
**Findings:** none
**Risks / flakes:** runtime accessibility pending
**Need from master:** nothing
**Next:** implement helpers, install Playwright, verify smoke x3.
