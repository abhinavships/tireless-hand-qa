# Blind trial + wire-to-pixel ledger

```
npm run blind          # dashboard at http://localhost:4600, press Start
PACE=0.6 npm run blind # faster;  PACE=2 slower;  HEADLESS=1 hides the Chrome window
```

## Three isolated processes
| Process | File | Knows | Never sees |
|---|---|---|---|
| Saboteur | `saboteur.ts` | the bug pool; secretly plants one (or none) and strips all markers | anything about QA |
| Blind QA | `inspector.ts` + `ledger.ts` | only what the product must do | the bug pool, the sealed answer |
| Referee | `referee.ts` | runs the phases; opens the sealed answer only after QA's verdict | — |

The saboteur publishes `sha256(choice:salt)` before QA starts; the referee verifies it at the reveal.

## Three-way reconciliation (what makes this different)
```
 Backend truth ──(1)──► Wire: every message the browser received ──(2)──► Screen (DOM text)
   /api/control/state        tapped from the page's own websocket          read by Playwright
```
- **(2) exact:** each on-screen value must equal, character for character, the display contract applied to one of the
  last messages the UI actually received. No numeric tolerance, because the oracle knows exactly what the UI knew.
- **(1) classify:** when (2) fails, wire vs backend decides where the truth was corrupted:
  `backend→wire (transport/backend)` or `wire→screen (frontend rendering)`. One root cause = one finding.
- **Exhaustive:** every drone × every telemetry field × 2 rounds, plus the device-list pill (≈100 exact assertions per run).
- **Metamorphic:** selecting A → B → A must show only the selected drone's data (catches cross-talk bugs such as M05b,
  which a single-drone tolerance check misses).

## Verified
| Run | Planted (secret) | Blind QA result |
|---|---|---|
| control | none | 11/11 checks pass, 96/96 exact |
| blind | M13 Land button removed | C3 only |
| blind | M05 battery shown as 0 % | C5 only (+ C10 in the ledger build) |
| targeted | M05b battery from the previously selected drone | C10 + C11, located at wire→screen; the tolerance check C5 passed (missed it) |
