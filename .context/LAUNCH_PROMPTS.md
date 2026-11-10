# Codex worker launch prompts: 5 agents. Paste one prompt per Codex session.
# Launch order: #1 now → #2, #3, #4 about 5 min later → #5 once BOARD.md shows T01 = NEEDS_REVIEW.
# T07 (submission) is already handled by a Claude subagent; don't launch it.

## #1: T01 harness (launch FIRST)
You are worker agent codex-t01 on task T01. Working dir: /Users/abhinavsden/orca/workspaces/hackathon_the_tireless_hand/numbfish
Read .context/README.md and follow it exactly: read 00–03, .context/decisions.md, then .context/tasks/T01-harness.md.
Claim your line in .context/BOARD.md and keep .context/reports/T01__codex-t01.md updated per the protocol. The app is already running (localhost:4010 / :4000).
Your goal: a working Playwright+TS harness with shared helpers FAST (skeleton ≤30 min), then harden helpers others request in their reports.
You may spawn sub-agents (give them .context/03_AGENT_PROTOCOL.md). Respect file ownership and the app lock. Don't commit to git.

## #2: T02 static / visual / responsive (S01 S02 S08 S12 S13)
You are worker agent codex-t02 on task T02. Working dir: /Users/abhinavsden/orca/workspaces/hackathon_the_tireless_hand/numbfish
Read .context/README.md and follow it exactly: read 00–03, .context/decisions.md, then .context/tasks/T02-static-responsive.md.
Claim your BOARD line, keep .context/reports/T02__codex-t02.md updated. If T01's qa/lib isn't ready, code against the interfaces in 02_SYSTEM_DESIGN.md.
Each scenario is done only when it passes 3x on the clean app and fails on its mutant (request mutants from T05 in your report). Record video evidence.
You may spawn sub-agents (one per scenario is fine). Respect file ownership and the app lock. Don't commit to git.

## #3: T03 live-data truth (S03 S04 S05 S06 S07 S14)
You are worker agent codex-t03 on task T03. Working dir: /Users/abhinavsden/orca/workspaces/hackathon_the_tireless_hand/numbfish
Read .context/README.md and follow it exactly: read 00–03, .context/decisions.md (especially D6 on S05), then .context/tasks/T03-live-truth.md.
Claim your BOARD line, keep .context/reports/T03__codex-t03.md updated. Fault injection is global: take .context/locks/app.lock and always clear faults.
Each scenario is done only when it passes 3x clean and fails on its mutant, or reproduces a real baseline bug 2x. Record video evidence.
You may spawn sub-agents. Respect file ownership and the app lock. Don't commit to git.

## #4: T04 security (S09 S10 S11 S17) + T06 bug hunt
You are worker agent codex-t04 on tasks T04 and T06. Working dir: /Users/abhinavsden/orca/workspaces/hackathon_the_tireless_hand/numbfish
Read .context/README.md and follow it exactly: read 00–03, .context/decisions.md, then .context/tasks/T04-security.md and .context/tasks/T06-judge-explore.md.
Claim both BOARD lines; keep .context/reports/T04__codex-t04.md and T06__codex-t04.md updated. Do T04 first; spawn a sub-agent for the T06 exploratory bug hunt in parallel.
Localhost only, no DoS. Real bugs must be reproduced 2x with video. You may spawn sub-agents. Respect file ownership and the app lock. Don't commit to git.

## #5: T05 mutation lab (launch after T01 shows NEEDS_REVIEW)
You are worker agent codex-t05 on task T05. Working dir: /Users/abhinavsden/orca/workspaces/hackathon_the_tireless_hand/numbfish
Read .context/README.md and follow it exactly: read 00–03, .context/decisions.md, then .context/tasks/T05-mutation-lab.md.
Claim your BOARD line, keep .context/reports/T05__codex-t05.md updated. You are the ONLY agent allowed to edit product/, always under .context/locks/app.lock, and always revert.
Build mutants M01–M15 plus requests found in the other reports; produce evidence/mutation-matrix.md. You may spawn sub-agents, but only one may touch product/ at a time.
Don't commit to git.
