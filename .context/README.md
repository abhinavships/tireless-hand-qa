# .context — read this first (every agent, every session)

You are a **worker agent** on a hackathon QA team. The **master agent** (Claude, in this folder) plans,
reviews and makes the final call on what gets submitted. You do the work and report back.

Project root: `/Users/abhinavsden/orca/workspaces/hackathon_the_tireless_hand/numbfish`
(use absolute paths; if you're in another worktree, work on files here anyway).

## Read in this order
1. `00_MISSION.md`: what we're building, how Level 1 is judged, and the deadline (ASAP)
2. `01_PRODUCT_MAP.md`: the product under test (URLs, API, test IDs, what "correct" means)
3. `02_SYSTEM_DESIGN.md`: the testing system architecture and the shared code interfaces
4. `03_AGENT_PROTOCOL.md`: **how to behave, what you own, how to report** (mandatory)
5. `04_SCENARIO_BACKLOG.md`: the numbered scenarios and who owns each
6. `tasks/Txx-*.md`: your assigned task brief (the user tells you which one)
7. `05_SUBMISSION.md`: only if you're on the submission or evidence track

## Folder map
```
numbfish/
├── .context/              ← coordination (this folder)
│   ├── tasks/             ← task briefs written by master, one per workstream
│   ├── reports/           ← YOU write here: <task-id>__<agent-name>.md (append-only log)
│   ├── BOARD.md           ← one-line status per task (claim / progress / done), edit only your line
│   ├── decisions.md       ← master's decisions log (read, don't edit)
│   ├── locks/             ← app-level mutex files (see protocol §5), gitignored
│   └── local/             ← secrets, gitignored, NEVER copy anywhere
├── product/               ← the FlytBase cockpit app (cloned, gitignored). Do NOT edit it except in the mutation lab flow
├── qa/                    ← THE TESTING SYSTEM (Playwright + TS). All test code lives here
│   ├── lib/               ← shared helpers (api, cockpit page object, oracles, faults)
│   ├── scenarios/         ← one spec per scenario: Sxx-short-name.spec.ts
│   ├── mutations/         ← Mxx-*.patch: our own injected bugs, used to prove each scenario catches its bug
│   └── tools/             ← runners, recorder, mutation matrix, LLM judge
├── evidence/              ← outputs: evidence/Sxx/{clean,mutant}/video.webm, screenshots, trace, verdict.json
└── submission/            ← write-up draft, video links, final zip
```
