## 2026-09-26T07:26:08.452741+00:00 | status: NEEDS_REVIEW
**Did:** Added master-requested S11 missing-button failure message: "Operator cannot sign in: Sign in action missing" on the Sign in visibility assertion.
**Evidence:** Static edit verified; no browser runs performed.
**Findings:** No new findings.
**Risks / flakes:** Auth clean/M12/M16 proof remains pending T05 F-auth runs.
**Need from master:** Nothing; ready for T05 validation.
**Next:** Wait for T05 F-auth results. No other browser runs.

## 2026-09-26T07:15:49.718933+00:00 | status: NEEDS_REVIEW
**Did:** Finished the narrowed S11/S17 packaging request. No new XSS execution or browser run. Stopped the prior qualification process, preserved its completed recordings, and corrected qa/lib/ext/t04.ts globalSetup to an absolute path after T01 added the shared setup. S11 now explicitly starts signed-out, records its guarded-route context video/screenshot, checks redirect/absence of protected content, validates labelled Email/OTP + enabled Sign in, and verifies sign-in opens auth-settings. Contract and handoff: qa/contracts/routes.json, evidence/S11/README.md.
**Evidence:** Typecheck PASS. Browser-free discovery: node node_modules/@playwright/test/cli.js test --config lib/ext/t04.ts --list --grep S11 --project desktop → 2 tests. S17 completed recorded desktop PASS1 packaged as evidence/S17/clean/video.webm, trace.zip, screenshot.png, security-posture.json, verdict.json, runs.json, manifest.json; screenshot visually checked. No 3x S17 qualification claimed. Two planned later repeats did not execute (unresolved globalSetup path during shared harness update); qualification-note.md documents this infrastructure failure.
**Findings:** F2/F3 already confirmed/recorded; retained without rerunning payload suite, per latest user instruction. S17 advisory inventory: both pages HTTP200 with CSP=null and X-Frame-Options=null; actual malformed command POST rejected HTTP400 before any command and returned Access-Control-Allow-Origin:*; OPTIONS HTTP204 permits POST; dashboard renders inside cross-origin localhost iframe. No-auth is explicitly by design, so this is hardening posture, not an authentication regression.
**Risks / flakes:** S11 auth overlay clean/mutant proof remains pending: F-auth.patch does not yet exist. S17 is advisory and must not be presented as a proven security regression or 3x clean scenario. Cancelled mixed qualification has infrastructure failures; do not use its aggregate verdict as a product verdict.
**Need from master:** T05 apply F-auth after P0 proof, with AUTH_FIXTURE=1; clean S11 3x then stacked M12 guard-removal and M16 Sign-in-removal. Overlay interface is documented in evidence/S11/README.md. No further T04 browser execution requested.
**Next:** Master/T05 validation of the prepared auth fixture; packaging work complete. No git commits or product edits.

### S11 — Signed-out route guard and usable sign-in action
- Categories: Security & permissions / Functional / Visual.
- Description: A signed-out visitor cannot see protected settings. A valid fixture email and OTP expose a usable Sign in action and open settings after submission. This uses an explicit auth fixture; the real demo has no auth.
- Starting state: T05 applies F-auth under app.lock; AUTH_FIXTURE=1; new signed-out context with empty storage; desktop1440×900.
- Steps: 1. Visit /settings with empty storage. 2. Confirm /login (or HTTP401) and absence of auth-settings. 3. Visit /login, fill labelled Email and OTP. 4. Confirm Sign in visible/enabled, submit, and confirm /settings + auth-settings.
- Approach: Declarative route/login contract; fresh storage prevents session contamination; accessible labels/roles check actual operator controls. Protected-context recording attached separately.
- Catches: M12 signed-out guard removal and M16 missing Sign in button stacked on F-auth.
- Result: PREPARED; no auth fixture execution or mutant proof yet. Ordinary baseline skips explicitly.
- Evidence: evidence/S11/README.md is the handoff; videos pending T05 fixture runs.
- Spec: qa/scenarios/S11-auth-contract.spec.ts; contract qa/contracts/routes.json.

### S17 — Localhost framing and response-header posture (advisory)
- Categories: Security & permissions.
- Description: Inventory browser framing protection and CORS/header posture of the local cockpit/control demo, while recognizing its documented no-auth design.
- Starting state: Healthy localhost4010 cockpit and localhost4000 backend; desktop browser. No simulator reset, real command, or fault injection.
- Steps: 1. GET both pages and capture security headers. 2. Send OPTIONS for command POST and malformed POST{} (must return400 without a command). 3. Embed dashboard in a cockpit iframe and record whether it renders.
- Approach: Exact HTTP observations and a visible browser iframe, with JSON evidence. Missing hardening is advisory and never the sole product failure.
- Catches: No paired mutant; advisory inventory only, not a submission proof scenario.
- Result: Completed desktop PASS1; missing CSP/X-Frame-Options, wildcard CORS, dashboard frame allowed. Two later planned repetitions did not run due configuration infrastructure; no flake/product-failure claim.
- Evidence: evidence/S17/clean/video.webm, trace.zip, screenshot.png, security-posture.json, manifest.json.
- Spec: qa/scenarios/S17-security-posture.spec.ts.

## 2026-09-26T07:02:51.431500+00:00 | status: IN_PROGRESS
**Did:** Re-read D14–D19 and master update. S11 KEPT per D18: routes.json now declares /settings → /login; login contract uses exact labels Email / OTP and button Sign in, then confirms successful fixture sign-in opens /settings with [data-testid=auth-settings]. AUTH_FIXTURE=1 enables overlay runs; ordinary no-auth baseline explicitly skips. Every T04 browser spec now uses appLock (private extended fixture waits up to 360s, holds only for one short test). Typecheck PASS.
**Evidence:** Locked clean 3-repeat run progressing in evidence/.t04-artifacts and evidence/.t04-results.json. Current first completed cycle: cockpit payloads PASS2, dashboard payloads FAIL2 (expected F3), evil/missing org FAIL2 (expected F2), S11 SKIP2 (no overlay), S17 advisory PASS1. Final manifests pending.
**Findings:** F2 and F3 confirmed by master; recording clear narrate failure banners. S10 now displays raw received fleet/telemetry in a visible proof panel; samples contain no secrets.
**Risks / flakes:** Earlier unlocked/overlapping qualification not counted; cancelled initial run. T06 old unlocked 10min soak is informational only after D16. No runtime fault or drone cleanup left by T04.
**Need from master:** T05 F-auth interface: /login Email + OTP associated labels; Sign in button enables after filling operator@example.test + 123456, navigates /settings; protected root testid auth-settings; guard redirects signed-out /settings to /login. Set AUTH_FIXTURE=1 for --base F-auth clean/M12/M16 child runs. M10 proof should select S09 cockpit; dashboard already fails baseline.
**Next:** Finish clean repeats, canonical findings evidence + scenario cards; await T05 P0/M10 then auth overlay proof.

## 2026-09-26T06:48:40.810730+00:00 | status: IN_PROGRESS
**Did:** Implemented S09 XSS on cockpit/dashboard with both payloads; S10 wrong/missing-org socket probes with valid-org control; S11 declarative auth/login checks (explicitly skipped on no-auth baseline); S17 advisory headers/CORS/framing inventory. Private config qa/lib/ext/t04.ts avoids report collisions. Typecheck PASS.
**Evidence:** Initial desktop 3-repeat run in progress. Stable lock-protected rerun planned; initial dashboard rerender caused one scroll action failure, now replaced with synchronous DOM scrolling.
**Findings:** Dashboard JavaScript marker executed for both payloads. Wrong and missing org both received devices and flytbase/drone-1/telemetry/battery. Final reproducibility counts pending stable rerun.
**Risks / flakes:** Dashboard rebuilds rows on every telemetry event; avoid actionability stabilization on these transient nodes. S11 has no genuine baseline auth contract and must be dropped from write-up per D9. S17 is advisory: no auth is by design.
**Need from master:** T05 M10 should run S09 cockpit subset; dashboard is already vulnerable. M11 is baseline-only, confirmed by runtime probes. M12 synthetic settings route is not a valid real baseline guard; recommend dropping S11/M12 rather than claiming coverage without auth requirement.
**Next:** Complete stable repeats and canonical videos; scenario cards.

## 2026-09-26T06:44:54.030545+00:00 | status: IN_PROGRESS
**Did:** Read required context and claimed BOARD entry.
**Evidence:** Pending.
**Findings:** None verified yet.
**Risks / flakes:** Shared runtime; use app lock for global mutations.
**Need from master:** Nothing.
**Next:** Implement security checks and record baseline evidence.
