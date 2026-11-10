# T06 exploration evidence

Qualified baseline coverage so far:

- `operator-final/results.json`: operator workflow PASS 2/2. Each pass adds two isolated drones, switches selection 20 times, verifies telemetry/video title consistency, takes off and removes the selected drone, verifies fallback selection, and checks reachable phone content plus no horizontal overflow.
- `faults/artifacts/operator-T06-fault-exploration-socket-kick/`: socket kick PASS 1.
- `faults-remaining/results.json`: other eight fault kinds PASS 8/8. Each test acquires the app mutex, starts isolated video, records visible states and playback counters through a fault window, clears the fault, and verifies socket connected/video live without reload. Per-test `observations.json` gives the observed states and dimensions. This is recovery exploration; it does not assert a new staleness requirement or replace S05/F1.
- `coverage.json`: machine-readable fault paths and outcome index.
- `soak-locked/results.json`: locked soak PASS 2 completed segments (150858 ms + 150156 ms = 301014 ms). Segment 3 interrupted while waiting for another worker’s mutex and segment 4 not run, per coordinator’s latest-user stop instruction. Both completed segment contexts closed before releasing their locks; each has video and log.

Each completed test directory has `video.webm`, `trace.zip`, and a screenshot. The source zip should exclude this directory: trace resources and long videos exceed 150 MB.

Informational / superseded runs:

- `artifacts/soak-T06-10-minute-cockpit-soak/`: initial unlocked ten-minute soak started before D16. Passed with 33 samples across approximately 605 seconds and no browser errors. It overlapped other workers and is not clean qualification. One transient fleet-count mismatch occurred during non-atomic reads across concurrent drone deletion and is not a claimed bug.
- First `faults/` operator workflow failed because a mutation removed the video region during an unlocked run; not a baseline bug.
- One `faults/` socket-refuse attempt and one `operator-clean/` attempt were interrupted while waiting for the mutex; replaced by completed qualified runs.

No new reproducible T06 baseline finding. Dashboard string rendering was escalated to T04 for its security reproductions. Existing stale telemetry is owned by T03/S05/F1. Optional judge was not used.
