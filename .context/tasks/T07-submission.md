# T07 — Submission + evidence packaging

**Owns:** `submission/**`, `qa/tools/reel.sh`
1. Now: draft `submission/writeup.md` per `05_SUBMISSION.md`: the system design section (from 02) written well, plus a scenario section with placeholders for every P0 scenario in 04 (Title/Description/Approach filled from the backlog; Video = TODO).
2. Continuously: poll `.context/reports/*.md` and fold every DONE scenario card into writeup.md (tighten the wording; keep the user-impact framing; group duplicate root causes).
3. Video pipeline: `brew install ffmpeg` if needed; `qa/tools/reel.sh` builds per-scenario videos (clean then mutant, with a title card) from `evidence/Sxx/**/video.webm` into `submission/videos/` with the naming convention, plus an overview reel.
4. Google Drive: prepare the upload (the Drive MCP tool, or tell the master which files to upload manually), share links "anyone with link", and fill them into writeup.md.
5. Google Doc: produce the final doc from writeup.md (Drive create_file with a Google Doc mimeType, or hand the markdown to the master). The master approves before anything is shared or submitted.
6. `submission/code.zip` per 05 (no secrets; grep for the values in .context/local/secrets.md plus "sk-", "nvapi", "AIza" before zipping).
Do NOT submit the form. The master or the user does.
