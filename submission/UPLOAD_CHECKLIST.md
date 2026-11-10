# Upload checklist (Level 1 submission)

Nothing here is done until the **master approves**. Don't submit the form: the master or the user does that.
All commands run from the repo root: `/Users/abhinavsden/orca/workspaces/hackathon_the_tireless_hand/numbfish`.

## 0. Preconditions
- [ ] Every scenario in `submission/writeup.md` that we keep has: clean PASS x3 + mutant FAIL (or a reproduced baseline bug), per `decisions.md` D2.
      Drop or move to "not submitted" any scenario without proof. **No video = not evaluated.**
- [ ] `git -C product status --porcelain` is empty (no mutant left applied).
- [ ] Evidence exists: `ls evidence/S*/{clean,mutant-*}/*.webm`

## 1. Build the videos
```bash
qa/tools/reel.sh --overview              # all scenarios, per-variant + combined + overview reel
# or a subset:  qa/tools/reel.sh S01 S05 S08
ls -lh submission/videos/
```
- [ ] Watch each combined `L1_Sxx_<slug>.mp4` once: title card → clean PASS → title card → mutant FAIL with the failure message visible.
- [ ] Nothing secret is visible on screen (terminal windows, API keys, `.context/local`, the SSH password). Playwright only records the browser page, so this should be clean.
- [ ] `L1_overview.mp4` exists (it goes in the form's **Video link** field).

## 2. Upload to Google Drive
1. In Google Drive create a folder: **`Tireless Hand - FlytBase L1`**.
2. Upload into it: every `submission/videos/L1_*.mp4` (combined reels are the ones linked from the write-up; the per-variant
   `_clean` / `_mutant-Mxx` files are optional extras). Wait until Drive finishes processing (a thumbnail appears) before you test playback.
3. Share the **folder**: Share → General access → **Anyone with the link** → role **Viewer** → Done. Files inherit it.
   Check one file: right-click → Share → it must say "Anyone with the link".
4. For each video: right-click → Share → **Copy link**. Link form: `https://drive.google.com/file/d/<FILE_ID>/view?usp=sharing`.
5. **Test in a private/incognito window** (signed out): every link must play without a sign-in or access request.

Alternative (master-approved only): use the Google Drive connector (`create_file` to upload, `share_file` for anyone-with-link reader), then record the returned links.

## 3. Fill the links into the write-up
Record the links here first, then replace each `**Video:** TODO` line in the matching scenario of `submission/writeup.md`,
and the `**Overview video:** TODO` line at the top.

| Scenario | File | Drive link |
|---|---|---|
| Overview | `L1_overview.mp4` | |
| S01 | `L1_S01_cockpit-shell.mp4` | |
| S02 | `L1_S02_device-list-sync.mp4` | |
| S03 | `L1_S03_telemetry-truth.mp4` | |
| S04 | `L1_S04_flight-workflow.mp4` | |
| S05 | `L1_S05_offline-truth.mp4` | |
| S06 | `L1_S06_socket-badge.mp4` | |
| S07 | `L1_S07_video-state.mp4` | |
| S08 | `L1_S08_phone-width.mp4` | |
| S09 | `L1_S09_xss-names.mp4` | |
| S10 | `L1_S10_org-isolation.mp4` | |
| S11–S15 (if proven) | `L1_S1x_<slug>.mp4` | |

(File slugs come from `qa/scenarios/Sxx-<slug>.spec.ts` when a spec exists, so check `ls submission/videos` for the actual names.)

Then check nothing is left open:
```bash
grep -n 'TODO' submission/writeup.md        # must print nothing in the final version
```

## 4. Create the Google Doc
1. Google Drive → New → File upload → `submission/writeup.md` → right-click → Open with → **Google Docs** (Docs converts Markdown headings, lists, tables and code blocks).
   Alternative: in a new Doc, enable Tools → Preferences → "Enable Markdown", then Edit → **Paste from Markdown**.
2. Title the doc: **Tireless Hand — Agentic UI Testing for FlytBase Cockpit (Level 1)**. Move it into the same Drive folder.
3. Check formatting: the architecture diagram is in a monospace block (set the font to Courier/Roboto Mono and a smaller size if it wraps), tables render, all video links are clickable.
4. Share the doc: **Anyone with the link → Viewer** (or Commenter). Test the doc link in incognito.

## 5. Secrets check, then zip the code (optional attachment, ≤150 MB)
Run the secrets grep **before** zipping. It must print nothing (except the lines that *define* the patterns in this checklist and the T07 brief).
```bash
# a) known secret patterns (API keys, the GPU host name)
grep -rnIE '<gpu-user>|sk-[A-Za-z0-9_-]{16,}|nvapi-[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY' \
  qa submission .context README.md \
  --exclude-dir=node_modules --exclude-dir=local --exclude-dir=locks --exclude-dir=test-results --exclude-dir=playwright-report \
  | grep -v 'UPLOAD_CHECKLIST.md' | grep -v 'tasks/T07-submission.md'

# b) the literal values from the local secrets file (prints only FILE NAMES, never the values)
grep -oE '[^[:space:]`"'\'']{8,}' .context/local/secrets.md | sort -u > /tmp/.sec_patterns
grep -rlIFf /tmp/.sec_patterns qa submission .context README.md \
  --exclude-dir=node_modules --exclude-dir=local --exclude-dir=locks --exclude-dir=test-results --exclude-dir=playwright-report
rm -f /tmp/.sec_patterns
```
If (b) lists a file, open it and check whether it really contains a secret (generic words from the secrets file can match too).

Build the zip (excludes dependencies, the product clone, videos, secrets and locks):
```bash
rm -f submission/code.zip
zip -rq submission/code.zip qa .context submission README.md \
  -x 'qa/node_modules/*' 'qa/test-results/*' 'qa/playwright-report/*' \
     '.context/local/*' '.context/locks/*' \
     'submission/videos/*' 'submission/code.zip' '*.webm' '*.mp4' '*.zip' '.DS_Store'
ls -lh submission/code.zip                                   # must be ≤ 150 MB
unzip -l submission/code.zip | grep -E 'local/|locks/|node_modules|\.webm|\.mp4' && echo 'STOP: excluded content in zip'
```
(If there's no top-level `README.md` yet, drop it from the `zip` command or ask the master for one.)

## 6. Hand-off to the master (don't submit)
Give the master: the Google Doc link, the overview video link, the path `submission/code.zip`, and the output of the secrets grep.
Form fields: **Write-up link** = Google Doc · **Video link** = `L1_overview.mp4` on Drive · **Code** = `code.zip` (optional).
