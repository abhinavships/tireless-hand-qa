# T09 — Level 2 niche: SECURITY (source-aware security QA)

**Owner:** a Codex worker (may spawn sub-agents). Master reviews.
**Owns:** `qa/sec/**`, `qa/mutations/SEC*.patch`, `.context/reports/T09__<agent>.md`, one new hub stage (coordinate with master before editing `qa/hub/hub.ts`).
**Scope rule:** localhost only (`:4000`, `:4010`, `:8889`). No denial-of-service, no floods, no brute force, nothing outside this machine. Clean up every drone/fault you create.
**Re-use:** `qa/blind/saboteur.ts` (plant/revert + sha256 commitment), `qa/auto/lib.ts` (Tap, api, usable, withLock), `qa/map/anatomy.ts` pattern, T04's S09/S10/S17 specs, findings F2 (no org isolation) and F3 (dashboard XSS).

## Idea: read the source → map the attack surface → generate probes → prove with planted bugs
Level 1 tested security from the outside only. The niche version **reads the product source** (about 2,800 lines) to know every way data gets in and every place it comes out, then probes each pair at runtime.

### Layer A — Attack-surface mapper (static, `qa/sec/surface.ts`)
Parse, without running the app:
- **Entry points:** every Express route in `backend/src/control/router.ts` + `app.ts` (method, path, body fields read), every socket.io event handled in `backend/src/socket/server.ts` (`Subscribe`, `Unsubscribe`, handshake `auth`), every user-editable field in `backend/public/dashboard.html`.
- **Sinks:** `innerHTML` / template-string HTML in `dashboard.html`, `dangerouslySetInnerHTML` in `frontend/src`, values forwarded to the simulator or MediaMTX (`sim-client.ts`, `video.ts`), anything written into URLs.
- **Guards:** auth / org-id checks, input validation (types, lengths, enums), CORS config, security headers.
- **