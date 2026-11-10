# 03 — Agent protocol (mandatory for every worker: Codex, Claude, or any sub-agent)

## 1. Your role
- The master agent owns the plan, the scenario list, the final verdicts and the submission. You own **one task** (`tasks/Txx-*.md`).
- **Sub-agents are allowed and encouraged.** Spawn your own helpers to parallelise (e.g. one per scenario). You're responsible for
  them: give them this protocol, keep them inside your task's file ownership, and merge their output into YOUR report.
- Move fast. Do the work instead of asking questions. Ask the master (via your report, `status: BLOCKED`) only when truly blocked.

## 2. Start of work
1. Read `.context/README.md` → 00 → 01 → 02 → this file → your task brief.
2. Claim your line in `.context/BOARD.md`: `| Txx | <agent-name> | CLAIMED | <time> | note |`
3. Create your report `.context/reports/Txx__<agent-name>.md` from the template below.

## 3. File ownership (avoid collisions)
- Only write the paths your task brief lists under **Owns**. Shared files (`qa/lib/*`, `qa/playwright.config.ts`, `qa/package.json`) are
  owned by **T01**. If you need a helper added, either put it in your own `qa/lib/ext/<task>.ts` or request it in your report.
- Never edit `.context/*.md` except your BOARD line and your own report. Never edit `decisions.md`.
- Never edit `product/` unless you're T05 (mutation lab) holding the lock. Found a bug in product? **Report it; don't fix it.**
- git: don't commit, push, rebase, stash or reset. The master commits. (`git stash` is shared across worktrees; don't touch it.)

## 4. Quality bar for a scenario to count as DONE
- [ ] Passes on the clean app **3 runs in a row** (`--repeat-each=3`); give the flake count if it isn't 0
- [ ] Fails on its targeted mutant (or on the real baseline bug) with a **human-readable, user-impact message**
- [ ] Starts from a known state set via the API; cleans up after itself
- [ ] Video recorded (Playwright `video:'on'`) and the artefacts copied to `evidence/Sxx/{clean,mutant-Mxx}/`
- [ ] Scenario card filled in (§7) inside your report, ready to paste into the write-up
- [ ] No false positives: for every assertion, ask "would a real operator agree this is broken?"

## 5. Shared runtime: ONE app instance, so use the locks
- The stack (ports 4000/4010/8889) is shared by everyone. Read-only UI specs can run concurrently.
- **Anything global** (faults, `sim reset/stop`, video stop-all, editing `product/`, restarting docker) → take the lock first:
  ```bash
  # acquire (atomic): mkdir fails if held
  until mkdir .context/locks/app.lock 2>/dev/null; do sleep 5; done; echo "<agent> Txx $(date)" > .context/locks/app.lock/owner
  # ... do global stuff, keep it short (< 5 min) ...
  rm -rf .context/locks/app.lock   # release, ALWAYS, even on failure (use trap)
  ```
- Prefer the **isolated drone** fixture (add your own drone, remove it after) over touching drone-1..4.
- Use `workers: 1` for any spec that injects faults.

## 6. Reporting: `.context/reports/Txx__<agent-name>.md` (append-only, newest entry at the top)
```markdown
## <ISO time> | status: IN_PROGRESS | DONE | BLOCKED | NEEDS_REVIEW
**Did:** bullet list of concrete results (file paths)
**Evidence:** evidence/Sxx/... paths, test command, pass/fail counts (3x clean, mutant)
**Findings:** real product bugs seen (steps, expected vs actual, screenshot path), or "none"
**Risks / flakes:** anything that could produce a false positive
**Need from master:** decisions, or helpers in shared lib, or "nothing"
**Next:** what you do next
```
Update it at least every major milestone (≈ every 30–45 min of work) and when you finish. Update your BOARD line too.
The master reads `reports/` and `BOARD.md` to steer; direction comes back via `decisions.md` and edits to your task brief. **Re-read both before each new step.**

## 7. Scenario card (paste into your report for every scenario; the submission is built from these)
```markdown
### Sxx — <Title>
- Categories: Visual / Responsive / Functional / Security / Telemetry / …
- Description: what's tested and what the operator expects (1–3 sentences, user language)
- Starting state: exact API calls / viewport / user
- Steps: 1. … 2. … 3. …
- Approach: how our system checks it (the oracle, the ground truth it compares against, why it isn't brittle)
- Catches: the mutations / bug classes this detects (e.g. M03 online-when-offline)
- Result: clean PASS x3 | mutant FAIL with message "<…>"
- Evidence: evidence/Sxx/clean/video.webm, evidence/Sxx/mutant-Mxx/video.webm, trace.zip
- Spec: qa/scenarios/Sxx-*.spec.ts
```

## 8. Don'ts
- Don't write screenshot-diff-only tests (brittle with Cesium/video). Mask the map/video when you do visual diffs.
- Don't claim a bug you haven't reproduced twice. Don't report cosmetic wording changes as bugs.
- Don't put secrets (`.context/local/*`, API keys, the SSH password) in any report, code, video or zip.
- Don't leave faults active, extra drones behind, or `product/` modified.
