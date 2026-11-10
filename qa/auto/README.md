# Autonomous scenario engine

```
npm run auto:learn   # 1. learn the product model on a known-good build   → auto/out/model.json
npm run auto:plan    # 2. see the generated scenarios (360 possible → 30 pairwise)
npm run auto:run     # 3. run them; report → auto/out/report.md   (HEADLESS=0 shows Chrome)
npm run auto:full    #    all 360 combinations (~1.5 h)
```

## Pipeline
```
LEARN ─► SYNTHESISE ─► EXECUTE ─► JUDGE ─► CLUSTER
```
1. **Learn (discover.ts):** explores the app on a known-good build: entities, elements usable at each screen size,
   the connection indicator, which elements echo the selected entity, and the **display bindings**, inferred by
   correlating on-screen text with the websocket messages the browser received while a probe drone flies.
   Result on the cockpit: 10 bindings at 100 % confidence (e.g. `telemetry-battery = battery.percent as "{0 dp} %"`),
   identical to the hand-written contract, with zero hand-written expectations.
2. **Synthesise (engine.ts plan):** scenario space = viewport(3) × drone state(4) × condition(6) × action(5) = 360.
   A greedy all-pairs planner picks 30 scenarios in which every pair of values occurs at least once.
3. **Execute:** each scenario arranges its own drone through the API, injects the condition (socket delay/drop/refuse,
   simulator offline, video freeze), performs the action (observe, switch A→B→A, reload, fleet change, sweep all),
   then clears the fault and watches the recovery.
4. **Judge with generic invariants** (derived from the model, not per-scenario code):
   BIND (exact wire-to-pixel), FLEET, USE, FIT, ECHO, HONEST (only during the outage window), RECOVER.
   Conditions that are true of the product itself (e.g. data going stale during an outage) are logged as
   **product findings**, not regressions.
5. **Cluster:** violations are grouped by invariant + element + layer; each cluster reports the simplest failing
   scenario as its reproducer, so twelve symptoms of one bug become one problem.

## Verified
| Build | Result |
|---|---|
| clean | 29/30 pass, 2225/2226 exact; 1 real inconsistency (a drone added during a simulator outage is accepted by the API but never reaches the UI), located at backend→wire; finding F1 (stale data shown as live) rediscovered automatically in 7 scenarios |
| blind: M02 (secret) | 12/12 scenarios flag one cluster: "control-panel link was usable on the known-good build, now missing"; nothing else |

## Limits
Learning must happen on a trusted build (the model is the baseline). The scenario space covers the cockpit;
control-panel buttons, the video label semantics and script injection are covered by the curated inspector checks
(`blind/inspector.ts`), which complement the generated scenarios.
