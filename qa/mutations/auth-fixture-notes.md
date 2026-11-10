# F-auth fixture and stacked mutants

F-auth is an evaluator-style authentication fixture, not a claim that the upstream cockpit implements authentication. It changes only existing `frontend/src/App.tsx`; the `/` cockpit route and wildcard redirect remain intact. All components are inline, so reverting the patch removes the complete fixture without orphan files in the container.

- `/login`: accessible exact labels `Email` and `OTP`, with a `Sign in` submit button. Enter `operator@example.test` and `123456` to enable submission. These are fixture values, with no external verification.
- Successful submission stores `mutation-lab-auth-session=signed-in` in sessionStorage and navigates to `/settings`.
- `/settings`: a fresh signed-out browser context redirects to `/login`; a signed-in context sees `main[data-testid=auth-settings]`.
- Served executable readiness marker: `mutation-lab:F-auth` assigned to `globalThis.__authFixtureLab`.
- M12 removes only the signed-out route guard and adds executable marker `mutation-lab:M12`.
- M16 removes only the Sign in button and adds executable marker `mutation-lab:M16`. Form fields remain usable.

Both mutant headers declare `AUTH_FIXTURE`, target S11, and are patches against F-auth rather than upstream HEAD. The old standalone `M12-unguarded-settings.patch` was replaced to avoid ambiguous M12 selection.

## Interface and validation

Read `qa/scenarios/S11-auth-contract.spec.ts` and `qa/contracts/routes.json`; the fixture matches their exact labels, route paths and protected-content selector. S11 requires `AUTH_FIXTURE=1`; targeted runs should use `--base F-auth` and that environment value. Fixture clean qualification must run with F-auth applied, then each mutant must be stacked separately. Do not count upstream baseline skips as clean authentication qualification.

Validated in a fresh `/private/tmp/t05-auth-*` directory using App.tsx obtained with `git -C product show HEAD:frontend/src/App.tsx`. Each sequence F-auth apply → mutant apply → mutant reverse → F-auth reverse restored byte-identical upstream content. TypeScript transpile diagnostics reported no syntax errors for fixture, M12, or M16. This is syntax/patch validation only; browser behavior and clean3/mutant proof are pending the parent runner.

No product edits, stack changes, browser runs, report/BOARD edits, or commits were performed by this helper. Every live browser run must hold app.lock under D16; parent owns actual apply/run/revert execution.
