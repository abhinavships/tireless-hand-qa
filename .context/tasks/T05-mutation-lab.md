# T05 — Mutation lab: prove every scenario catches its bug (M01–M15 + matrix)

**Owns:** `qa/mutations/**`, `qa/tools/mutate.sh`, `qa/tools/matrix.ts`, `evidence/mutation-matrix.md`. The ONLY task allowed to edit `product/` (under lock, always reverted).
1. Confirm the frontend hot-reloads in the running stack (docker-compose.override.yml = Vite dev + watch). If `up` (not `watch`) doesn't sync files, you need `docker compose watch` running, or `docker compose up --build -d frontend` per mutant. Pick the fastest reliable way and document it.
2. Write mutants as `git diff` patches against `product/` (it's a git clone: `git -C product diff > qa/mutations/M03-online-when-offline.patch`, then `git -C product checkout .`). Each gets a header line `# Mxx | category | targets: Sxx | description`.
   Start with the mutants listed in 04_SCENARIO_BACKLOG, then take requests from T02/T03/T04 reports. Mimic the evaluator's style: small, realistic, user-visible (remove a button, invert a status, CSS overflow at narrow width, drop an auth check, render HTML).
3. `mutate.sh Mxx`: lock → apply → wait for HMR (poll the page until the change is live) → `RUN_LABEL=mutant-Mxx tools/run.sh --grep <targets>` → revert → verify `git -C product status --porcelain` is empty → unlock. Use a trap for the revert.
4. `matrix.ts` → `evidence/mutation-matrix.md`: rows = mutants, cols = scenarios, cells caught/missed/n.a., plus a clean-run row (must be all pass).
5. Also run the FULL suite against each mutant once to find collateral detections and false alarms, and report them.

## Master response to BLOCKED (06:50Z): see decisions D14–D19
- Lock borrowing + per-run output dirs are assigned to T01 as URGENT (D15). While waiting: finish the HMR readiness marker (executable JS/CSS marker, not a comment) and test apply→served→revert on M01 once, holding the lock with NO browser specs.
- Your mutation window = whenever you hold the lock (D16). No special global window.
- M11 → baseline finding F2 (confirmed by master). M15/S14 dropped. M12 is reworked as a stacked mutant on the F-auth base overlay (D18); build F-auth + M12 + M16 after the P0 mutants are proven.
- Mutant realism (master review): M03 (`flight = 'online'` constant) is too blunt; any check catches it. KEEP it, but ADD subtle, evaluator-style variants so our scenarios prove real sensitivity:
  - M03b: unknown/missing status falls back to looking active: `?? 'in_flight'` (a drone with no telemetry looks airborne)
  - M03c: a status mapping bug: `landed`/`on_dock` rendered as `in_flight` in the device list only (list ≠ panel)
  - M09b: at ≤480px only, the device list gets `overflow:hidden; max-height:0` (content silently disappears, no layout error)
  - M05b: telemetry panel reads the PREVIOUSLY selected drone's battery (wrong-source data, values still plausible)
  Each must be caught by its scenario with a precise message. Report any that slip through; that's valuable and we'll harden the scenario.
