# 05 — Submission spec (Level 1)

Form fields: **Write-up link** (Google Doc, required) · **Video link** (Google Drive, required) · Code .zip (optional, ≤150 MB).

## Write-up structure (`submission/writeup.md` → Google Doc)
1. **Title**: "Tireless Hand — Agentic UI Testing for FlytBase Cockpit (Level 1)". Team, date.
2. **System design** (≤1 page): the pitch + component table from `02_SYSTEM_DESIGN.md` + a simple diagram:
   `Control API (state + faults) → Spec (Arrange/Act) → Browser @ 3 viewports → Oracles vs ground truth → Verdict + video/trace` and a `Mutation lab` loop.
   Mention: meaning-based oracles, isolated fixtures, fault injection, mutation-proven detection, evidence per run.
3. **Scenarios**: numbered, the card format from `03_AGENT_PROTOCOL.md` §7, compressed to: Title · Description · Approach · Video link
   (+ Starting state/Steps, because reproducibility is judged). Add the "Catches" line to show product understanding.
4. **Mutation matrix**: table scenario × mutant (caught ✔ / not targeted –). Shows precision (a clean run is all green).
5. **Real findings on the baseline** (if any): short, with a video.
6. **How to run**: 3 commands.

## Videos
- One video **per scenario** (required), real time, showing: the starting state → the steps → the assertion outcome. Best: split screen or
  sequential **clean PASS** then **mutant FAIL** with the failure message visible.
- Source: Playwright `video:'on'` (`.webm`, real time). Add an on-page overlay banner (inject a fixed div: "S05 — step 2: injecting sim-offline")
  so the viewer can follow along → `qa/lib/overlay.ts` (T01).
- Convert/concatenate if needed (`ffmpeg` isn't installed; `brew install ffmpeg`, or use Playwright webm directly, since Drive plays webm).
- Upload to Google Drive, set "Anyone with the link: Viewer", and put the link in the card. Also make one **overview reel** for the form's Video field.
- Naming: `L1_S05_offline-truth_clean.webm`, `L1_S05_offline-truth_mutant-M03.webm`.

## Code zip
`qa/` + `.context/` (minus `local/` and `locks/`) + `submission/` + README. Exclude node_modules, product/, videos.
