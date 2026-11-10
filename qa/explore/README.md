# T06 operator exploration

These are exploratory baseline checks, separate from numbered submission scenarios. Run from `qa/` against the existing localhost stack:

```sh
EXPLORE_RUN=operator-clean npx playwright test -c explore/playwright.config.ts operator.spec.ts -g 'add remove rapid' --repeat-each=2
EXPLORE_RUN=faults npx playwright test -c explore/playwright.config.ts operator.spec.ts -g 'fault exploration'
EXPLORE_RUN=soak-locked npx playwright test -c explore/playwright.config.ts soak.spec.ts
```

Each operator/fault test uses the shared app lock and isolated drones; cleanup clears its faults and removes its drone. The initial ten-minute soak began before D16 and ran read-only without the lock. It is informational endurance coverage, not clean qualification: concurrent mutation work can affect its samples, so it does not claim status symptoms as baseline bugs. The coordinator-approved replacement runs four 150-second segments, closes the browser context before each lock release, and yields between segments (D16 limits holds to five minutes). All runs record video. Per-fault `observations.json` documents visible socket/video states and stream progress; `soak.json` records runtime errors and periodic fleet comparisons.

Evidence is under `evidence/explore/<EXPLORE_RUN>/`. The initial soak began before this output isolation adjustment and is under `evidence/explore/artifacts/`. The first operator run was unlocked and encountered a missing video region while mutations were active; it is not a confirmed baseline bug. Locked repeats supersede that run.

Do not include exploratory trace/video artifacts in the optional 150 MB source zip. No new finding may be submitted without two independent baseline reproductions and videos. Stale telemetry under socket-drop/sim-offline belongs to T03's S05/F1 and is not duplicated here. The optional external vision judge is not required and was not used.
