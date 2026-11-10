# 00 — Mission

## The challenge (FlytBase AHC SWE hackathon: "Agentic Software Testing")
Build a **testing system** that tests a running drone-cockpit web app **from the user's point of view** and
returns **reproducible evidence**. Source-code analysis and unit tests are NOT what's judged. We judge the running UI.

## Level 1: "Static UI and basic security testing" (submit ASAP)
Evaluators will inject **mutations** (deliberate bugs) into the app, and our system must catch them. Their examples:
- Remove the sign-in button from a login page (email + OTP fields) so the user can't sign in
- Show a drone as **online when it's offline**
- Push the main action **off screen at phone width**
- Let a **signed-out user open a page that should need sign-in**

→ Our tests must **fail loudly and specifically** when a screen shows the wrong thing, and pass on the clean app.
**Zero false positives** matters: flaky or noisy tests lose points (see "Precision" below).

## Deliverable: one evaluation document (Google Doc) with
1. **System design**: short overview: the main parts, what each does, how they work together.
2. **Scenarios**: a numbered list. For each: **Title / Description** (what's tested, what the user expects) /
   **Approach** (how our system tests it and spots the issue) / **Video** (a Google Drive link to a real-time screen
   recording of the scenario running). **No video = not evaluated.**
Plus: a video link (Drive), and code as an optional .zip (≤150 MB).

## Judging criteria (optimize for these, in this order)
| Criterion | What it means for us |
|---|---|
| Validity | Only real user-facing wrong behaviour. Not wording or pixel nitpicks. Assert on meaning. |
| Reproducibility & evidence | Clear starting state + steps anyone can repeat, visible in the video. Every spec starts from a known state via API. |
| Product understanding | Tie checks to the operator's goal (is the drone safe? is the data current? can I act?). Cross-check related parts (list vs panel vs map vs API). |
| Breadth | Cover devices (phone/tablet/desktop), states (loading/offline/degraded), users (signed-in/out), live data, changing conditions (faults). |
| Depth & impact | Complete workflows (take off → fly → land), not just "element exists". |
| Precision | No false positives; group duplicate symptoms of one root cause into ONE scenario. |

## Categories from the brief (the breadth map; tag every scenario with one or more)
Visual UI · Responsive UI · Functional UI · API & data · Map & geospatial · Video & media · Telemetry ·
Real-time & multi-user · State & persistence · Network & recovery · Performance · Long-running · Security & permissions · Audit & history

L1 focus: **Visual, Responsive, Functional, Security & permissions**, plus live-data **status truth** (online/offline, live/stale).
