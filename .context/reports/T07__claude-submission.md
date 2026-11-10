# T07 — Submission + evidence packaging | agent: claude-submission

## 2026-09-26T07:47Z | status: NEEDS_REVIEW
**Did:** Spoken narration for all 15 videos.
- Scripts in plain English, one section per title card + clip (clean, then each planted bug; findings explain why they matter): submission/narration/*.txt (with section start times, video length and speech length). Facts from writeup.final.md.
- Voice: macOS `say -v Samantha -r 175`, the same for all. Each section's speech starts 0.4 s after the section starts; if speech + 0.8 s tail is longer than the section, its last frame is frozen (tpad clone). Speech is never sped up or cut.
- Output: submission/videos-narrated/<same name>.mp4, H.264 1280x720 + AAC 128k. Originals in submission/videos/ untouched.
- Overview: a 26.5 s spoken intro over a frozen intro card, then one brief line per scenario at the start of each reel (511 s total).
- Burned-in subtitles skipped: this ffmpeg has no subtitles/ass/drawtext filter.
- Build script kept at submission/narration/build_narration.py (arg 1 = temp dir; optional list of names).
**Evidence:** ffprobe spot checks: overview video 511.08 s / audio 511.08 s; F2 video 31.40 s / audio 31.39 s, mean volume -19 dB, max -4.6 dB. Frames at F2 12 s and overview 20 s look intact. Section sums matched the source durations (no warnings).
**Findings:** none.
**Risks / flakes:** Long intro sentences on short clean clips cause long freezes (S01 clean ~19 s, S08 ~20 s). The overview intro card text says "each shows a clean PASS, then a mutant FAIL", which isn't true for F1–F3 (pre-existing card text). Narrated files are new, so the Drive links in writeup.final.md point to the silent versions.
**Need from master:** decide whether to re-upload the narrated versions to Drive (same names) or replace the files in place.

## 2026-09-26T07:26Z | status: NEEDS_REVIEW
**Did:** Submission v2.
- writeup.md + writeup.gdoc.md: 11 scenarios ordered static (S01, S12, S13) → live data (S02, S03, S04, S05, S06, S07) → responsive (S08) → security (S09 cockpit); findings F1 (S05b stale telemetry), F2 (S10), F3 (S09 dashboard). Cards written from the S03–S07 spec code. Real proof lines with failure messages; mutation table 15/16 caught, M03b MISSED stated as a known gap; S11/S14 marked in progress. Video lines = `VIDEO: <file>.mp4`, all 15 files exist.
- S05 confirmed from evidence/S05/clean/runs.json: S05(a) passed 3/3; only the S05(b) @finding test failed (2 recorded runs).
- reel.sh: added REEL_TITLE_Sxx / REEL_SLUG_Sxx overrides. Built from a scratchpad symlink evidence dir so each reel shows the right clip: S05 clean = t03-hard-0 (part a); S09 clean = cockpit r0 p1+p2; F1 = t03-finding-0 + real S05 verdict; F2 = both S10 webms; F3 = baseline dashboard webms. Finding reels renamed L1_F1/F2/F3_*.mp4. evidence/ untouched.
**Evidence:** submission/videos/ 46 files, 39 MB total; L1_overview.mp4 12 MB, 486 s.
**Findings:** none new. Post-build check: /api/devices = drone-1..4 only, /api/control/fault = [], product/ git clean, no locks.
**Risks / flakes:** M05b message is generic ("expect(locator).toContainText failed"); the master's verified list omitted M05b but the matrix says caught, so it's included with a note. S08 mutant videos are very short (2.2 s / 3.6 s). The overview is 8 min long. The S05 clean clip was picked by name (t03-hard-0, 8 s, the longest hard-check recording) and not visually verified.
**Need from master:** approval for Drive upload + Doc; confirm M05b inclusion.
**Next:** upload when approved.

## 2026-09-26T07:10Z | status: NEEDS_REVIEW
**Did:** Submission v1 (master-authorised pass).
- `submission/writeup.md` rewritten as v1 from the real specs/contracts + T01/T02/T04/T05 reports: tight System design, Scenarios 1–5 = S01, S02, S08, S12, S13; Baseline findings 6–7 = F2 (S10 org isolation), F3 (S09 dashboard stored XSS, dashboard.html L165/L227); mutation proof table (S01×M01 caught, others in progress); How to run. Video lines = `VIDEO: submission/videos/<file>.mp4` placeholders.
- `submission/writeup.gdoc.md`: same content, ASCII diagram replaced by a numbered flow for Docs import.
- Ran S09|S10 desktop clean myself via `RUN_ID=t07-s09s10 AGENT_NAME=claude-submission ./tools/run.sh clean --grep "S09|S10" --project=desktop` (runner took/released app.lock itself; first attempt with my own mkdir lock was aborted before running because T01's runner needs a token, so no double lock). Result: 4 failed (dashboard p1/p2, evil, missing) / 2 passed (cockpit p1/p2), as expected for F2/F3. evidence/S09/clean, evidence/S10/clean.
- reel.sh fixes: (a) combined concat now re-encodes via concat filter; stream-copy silently truncated after the first title card; (b) failed clean verdict gets an "UNMODIFIED app · real baseline finding" card instead of "expected: PASS".
- S09/S10 reels use ALL per-test webms (canonical S09 video.webm is only the passing cockpit case) via a scratchpad symlink evidence dir; evidence/ untouched.
**Evidence:** submission/videos/: L1_overview.mp4 (3.0M, 150s), L1_S01_shell-contract.mp4 (728K, 30s, clean+M01), L1_S02_live-fleet.mp4 (324K, 12s), L1_S08_responsive.mp4 (132K, 7s), L1_S12_dashboard-contract.mp4 (580K, 33s), L1_S13_accessibility-baseline.mp4 (448K, 17s), L1_S10_org-isolation.mp4 (324K, 15s), L1_S09_xss.mp4 (684K, 33s) + per-variant _clean/_mutant-M01 files.
**Findings:** none new (F2/F3 reproduced once more by my run).
**Risks / flakes:** S03–S07 had no clean verdict at build time: excluded. S08 canonical video is phone and short (4.6s). The Cesium map renders black in some headless frames (cosmetic, not asserted). Drive links/Google Doc not created (not authorised).
**Need from master:** approve Drive upload + Doc creation; confirm team name line.
**Next:** fold in S03–S07 and more mutant proofs when verdicts land; rerun `qa/tools/reel.sh --overview`.

## 2026-09-26T06:31Z | status: NEEDS_REVIEW
**Did:**
- `submission/writeup.md`: title block; System design (pitch, ASCII architecture diagram, C1–C10 component table, precision rules); S01–S10 P0 scenario cards (Categories, Description in operator language, Starting state, Steps, Approach, Catches, Result: TODO, Video: TODO); S11–S15 under "Additional scenarios (P1)"; placeholder sections for Mutation matrix (S01–S10 x clean/M01–M11 grid + mutant legend), Baseline findings (stale-telemetry candidate, marked unverified), How to run.
- `qa/tools/reel.sh` (bash 3.2 safe): `evidence/Sxx/{clean,mutant-Mxx,mutant}/*.webm` -> `submission/videos/L1_Sxx_<slug>_{clean,mutant-Mxx}.mp4` + combined `L1_Sxx_<slug>.mp4` (title card -> clean -> title card -> mutant...) + optional `L1_overview.mp4` (`--overview`). 1280x720 H.264, letterboxed, real-time speed. Prefers `video.webm`, else joins all webms in name order. Title card shows verdict.json status/message if present. Skips missing/empty/corrupt inputs with warnings; incremental (skips up-to-date outputs; `--force`). Slug from `qa/scenarios/Sxx-<slug>.spec.ts` if present, else built-in table.
- Installed ffmpeg 9.0.2 via brew. The stock formula has **no drawtext** (no freetype), so cards are rendered to PNG via macOS JXA/AppKit (no extra deps); drawtext is used automatically if keg-only `ffmpeg-full` is installed; plain colour card as a last resort.
- `submission/UPLOAD_CHECKLIST.md`: preconditions, reel build, Drive folder upload + "Anyone with link: Viewer" + incognito check, link table, TODO grep, Google Doc via Markdown import, secrets grep (pattern grep + secrets-file-derived grep that prints file names only), zip command with excludes + size/content check, hand-off.
**Evidence:** reel.sh tested on synthetic webms in scratchpad (not in evidence/): S05 clean+2 mutants w/ verdict.json, S08 two webms + corrupt mutant, S09 empty dir, S10 no variants, S01 mutant-only, S77 missing, odd 391x845 size, rerun (up to date), missing evidence root (exit 0). Outputs 1280x720 h264, durations add up; card frame visually checked. Nothing written to evidence/ or submission/videos/.
**Findings:** none (no product testing in this task). Secrets grep dry run: pattern grep clean; secrets-file grep matches `.context/tasks/T06-judge-explore.md` line 4 only on env-var names/path (not values) = false positive.
**Risks / flakes:**
- S05 vs S15 share one root cause (baseline has no staleness indicator; pill stays `in_flight` under sim-offline). If S05's oracle requires an offline/stale signal it FAILS on the clean app, so it can't be "clean PASS + mutant FAIL". Needs a master decision (see below).
- writeup Steps/tolerances are drafted from the backlog + product map, not from the actual specs; will be reconciled when T02–T04 cards land.
**Need from master:**
1. S05/S15: merge into one scenario presented as a baseline finding (+M03 as extra proof), or narrow S05's oracle so it passes on clean?
2. Evidence dir convention: please make T01 use `evidence/Sxx/mutant-Mxx/` (05 says `mutant/`); reel.sh accepts both but can only name the mutant from the dir name. Ask T01 to put `status` + `message` keys in verdict.json (reel prints them on cards).
3. Team name/members for the title line; whether to include P1 scenarios that lack proof (currently listed as "included if proven").
4. There's no top-level README.md for the zip; either T01 writes one or I drop it from the zip.
5. Approval to upload to Drive / create the Google Doc when videos exist.
**Next:** poll reports/ and fold DONE cards into writeup.md; run reel.sh on real evidence; fill the mutation matrix from evidence/mutation-matrix.md.

## 2026-09-26T06:25Z | status: IN_PROGRESS
**Did:** claimed T07; read README, 00–05, T07 brief, decisions.md
**Evidence:** n/a yet
**Findings:** none
**Risks / flakes:** none yet
**Need from master:** nothing
**Next:** draft submission/writeup.md, write qa/tools/reel.sh (install ffmpeg), write submission/UPLOAD_CHECKLIST.md
