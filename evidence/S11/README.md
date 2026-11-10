# S11 auth fixture — prepared, proof pending

Owned sources: qa/scenarios/S11-auth-contract.spec.ts and qa/contracts/routes.json.
The real baseline intentionally has no authentication, so the spec is skipped unless AUTH_FIXTURE=1.
T05 must apply F-auth while holding app.lock, then run the clean fixture 3x, M12 (guard removed), and M16 (Sign in removed).

Required overlay interface:
- /settings redirects a fresh signed-out context to /login; protected settings root has data-testid="auth-settings".
- /login has controls labelled exactly Email and OTP, plus a button named Sign in.
- Filling operator@example.test and 123456 enables Sign in; submitting navigates to /settings.

Clean fixture command (only inside T05's applied-overlay, token-validated lock window):
AUTH_FIXTURE=1 RUN_ID=t04-auth-clean ./tools/run.sh clean --grep S11 --project desktop --repeat-each=3

The mutation runner must set AUTH_FIXTURE=1 for both --base F-auth stacked mutant runs.
No clean or mutant auth videos exist yet. Do not claim proof or ship S11 as validated before these runs finish.
