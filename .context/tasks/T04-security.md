# T04 — Basic security scenarios: S09, S10, S11, S17

**Owns:** `qa/scenarios/S09-*`, `S10-*`, `S11-*`, `S17-*`, `qa/contracts/routes.json`, `qa/lib/ext/t04.ts`
- S09 XSS: add a drone via the API with payloads (`<img src=x onerror=window.__xss=1>`, `"><svg onload=window.__xss=2>`), open the cockpit AND the control panel (dashboard.html is vanilla JS, so check for innerHTML there!). Assert: literal text is shown, `window.__xss` is undefined, no injected nodes. The dashboard may be REALLY vulnerable → a real finding, so verify 2x.
- S10: raw socket.io clients with org-id `flytbase` / `evil` / missing. Expected: only flytbase receives `devices` + telemetry. Also try subscribing to a topic for another org.
- S11: generic auth-guard checker: `routes.json` lists routes + `requiresAuth` + `loginRoute`. The spec visits each as signed-out (fresh context, no storage) and asserts a redirect to login or a 401 screen, never protected content. The baseline app has no auth → mark it as ready-for-evaluator; build the login-form contract checker (email field, OTP field, submit button visible + enabled, labels) so a mutant or an evaluator login page is covered.
- S17: response headers of :4010 and :4000 (CSP, X-Frame-Options/frame-ancestors, CORS on POST /api/control/*), and whether the control panel can be framed (clickjacking). Report findings neutrally ("no auth by design" caveat).
Check the protocol before any destructive probe: stay on localhost, no DoS.

## Master update (see D17, D18)
- F2 org isolation confirmed by master. Make S10 a clear finding video: a raw client with org-id "evil" receives devices + telemetry, with the narrate() banner showing what's wrong and the expected behaviour.
- Dashboard XSS = F3 candidate: reproduce 2x with video (the payload executes or injects nodes in :4000/dashboard). Keep M10 for the cockpit mutant proof.
- S11: build against the F-auth overlay (D18): a login contract (email, OTP, Sign in visible + enabled) + a signed-out guard check on /settings. Coordinate the routes with T05.

## FLAG 2026-09-26T07:49Z
You stopped at 07:26Z saying "Awaiting T05's F-auth runs; no browser runs performed." T05's BOARD line has said **18/18 runnable mutants caught incl strengthened variants/auth** since 07:35Z (13+ min ago) — the F-auth overlay and M12/M16 auth mutants are done. Your dependency is cleared: please resume now and run the final locked S11 auth-overlay evidence collection (`AUTH_FIXTURE=1 --base F-auth`) + package the S11/S17 scenario cards, then flip BOARD to DONE.
