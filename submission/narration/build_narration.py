#!/usr/bin/env python3
"""Add spoken narration (macOS say, Samantha) to submission videos, section by section.
Section = title card (2.5 s) + the clip after it. If speech is longer than a section, the
section's last frame is frozen (tpad clone) so the voice is never cut off."""
import json, os, subprocess, sys, concurrent.futures as cf

ROOT = "/Users/abhinavsden/orca/workspaces/hackathon_the_tireless_hand/numbfish/submission"
SRC, PARTS = f"{ROOT}/videos", f"{ROOT}/video-parts"
OUT, TXT = f"{ROOT}/videos-narrated", f"{ROOT}/narration"
TMP = sys.argv[1]
VOICE, RATE, CARD, LEAD, TAIL = "Samantha", "175", 2.5, 0.4, 0.8
os.makedirs(OUT, exist_ok=True); os.makedirs(TXT, exist_ok=True); os.makedirs(TMP, exist_ok=True)

def dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).decode().strip())

caught = "We planted a bug that {bug}. The test caught it and failed with the message: {msg}."

S = {
 "L1_S01_shell-contract": [
  ("clean", "Scenario one: the cockpit shell. When operators open the cockpit, they need every key part of the screen: the connection badge, the drone list, the telemetry panel, the map, the video, and the link to the control panel. The test adds its own drone, opens the cockpit, and checks that each part is on screen, not hidden, and not covered by anything else. On the normal app, it passes on phone, tablet and desktop."),
  ("mutant-M01", caught.format(bug="removes the video tile", msg="Cockpit: operator cannot reach Video tile")),
  ("mutant-M02", caught.format(bug="removes the link to the control panel", msg="Cockpit: operator cannot reach Control panel action")),
 ],
 "L1_S02_live-fleet": [
  ("clean", "Scenario: the drone list must match the real fleet. The test compares every row with the server's list of drones and their docks. Then it adds a new drone and checks that it appears within five seconds, without reloading the page, and removes it again. The normal app passes."),
  ("mutant-M04", caught.format(bug="silently hides the last drone in the list", msg="operators must see every drone with its correct name and dock")),
 ],
 "L1_S03_selected-telemetry": [
  ("clean", "Scenario: the telemetry panel must show the drone you selected. The test flies one drone and keeps a second drone on the ground. It compares battery, altitude and speed on screen with the true values from the server and from the live data feed. When it switches drones, the numbers must switch too. The normal app passes."),
  ("mutant-M05", caught.format(bug="shows the battery as zero", msg="operator sees 0, but the API says 98.2")),
  ("mutant-M05b", "We planted a subtler bug that takes the battery value from the previously selected drone. The test caught this one too, because the numbers on screen no longer matched the selected drone."),
 ],
 "L1_S04_flight-workflow": [
  ("clean", "Scenario: a full flight. The test takes a drone off, lets it climb to about thirty metres, and lands it. At every step, the status in the drone list, the status in the telemetry panel, the server, and the live data feed must all agree. The altitude on screen must follow the real climb. The normal app passes."),
  ("mutant-M03c", caught.format(bug="shows a grounded drone as airborne in the list", msg="Flight phase standby: device list and selected telemetry must agree")),
  ("mutant-M06", caught.format(bug="freezes the flight status in the telemetry panel", msg="Flight phase standby: device list and selected telemetry must agree")),
 ],
 "L1_S05_offline-truth": [
  ("clean", "Scenario: offline truth. The test disconnects the drone simulator. The screen must keep showing the drone's last real status and must never invent a flying or online drone. The browser's own connection badge must still be correct. The normal app passes this check."),
  ("mutant-M03", caught.format(bug="shows a drone as online while the simulator is offline", msg="Offline drone list must preserve the last truthful grounded status, never invent in flight or online")),
  ("mutant-M03b", "Here is an honest gap. This planted bug changes what the screen shows when the status is missing completely. Our test never reaches that state, so the bug was not caught. We report this as a known miss."),
  ("mutant-M03c", "Another planted bug shows a grounded drone as airborne. The test caught it with the same message: never invent in flight or online."),
 ],
 "L1_S06_socket-recovery": [
  ("clean", "Scenario: the connection badge must tell the truth. The test makes the server refuse connections. The badge must stop saying connected within five seconds. When the connection comes back, the badge must recover, and fresh flight data must arrive, all without reloading the page. The normal app passes."),
  ("mutant-M07", caught.format(bug="makes the badge always say connected", msg="Socket is disconnected but operator is falsely told connected")),
 ],
 "L1_S07_video-truth": [
  ("clean", "Scenario: the video label must match the real video. With the camera stopped, the label must say off. When the camera starts, the label must say live, and the video must really be playing. Switching to another drone must show that drone's own camera. The normal app passes."),
  ("mutant-M08", caught.format(bug="labels a stopped video as live", msg="Stopped stream must be labelled off; a live label would mislead the operator")),
 ],
 "L1_S08_responsive": [
  ("clean", "Scenario: phone and tablet screens. The test opens the cockpit at phone size. It checks that nothing scrolls sideways, that the operator can reach and tap a drone, and that telemetry, video and the connection badge are all reachable and not covered. The normal app passes at every size."),
  ("mutant-M09", caught.format(bug="pushes the content off a narrow screen", msg="Operator must scroll horizontally: content 1040 pixels exceeds viewport 390 pixels")),
  ("mutant-M09b", caught.format(bug="collapses the drone list on small phones", msg="Operator cannot reach the drone row: it is clipped and covered")),
 ],
 "L1_S09_xss": [
  ("clean", "Scenario: safe drone names. Drone names are typed in by users, so they could contain hidden code. The test adds a drone whose name is a piece of code. The cockpit must show it as plain text and never run it. The normal cockpit passes."),
  ("mutant-M10", caught.format(bug="makes the cockpit treat the name as code", msg="Stored XSS: a drone name executes JavaScript in the cockpit")),
 ],
 "L1_S12_dashboard-contract": [
  ("clean", "Scenario: the control panel. The operator must find every drone with Take off and Land buttons, plus the fault controls. The test clicks Take off, checks that the drone really launches, and then checks that the cockpit shows it flying. The normal app passes."),
  ("mutant-M13", caught.format(bug="removes the Land button", msg="Operator cannot land Drone 1: Land control missing")),
 ],
 "L1_S13_accessibility-baseline": [
  ("clean", "Scenario: accessibility. Every button must say what it does, so everyone, including people using screen readers, can act. The test runs an accessibility scan on the cockpit and the control panel, and allows only two known, reviewed colour issues. The normal app passes."),
  ("mutant-M14", caught.format(bug="removes the name from a control panel button", msg="Operators face new serious accessibility barriers; unnamed buttons cannot communicate their action")),
 ],
 "L1_F1_stale-telemetry": [
  ("clean", "Finding one. This is a real bug in the unmodified app. The test flies a drone, then stops all telemetry from reaching the screen. Five seconds later, the panel still shows the old numbers and the status in flight, with no warning that the data is stale. The test fails with the message: telemetry delivery stopped, but the operator still sees numeric values and in flight, without a stale or offline warning. Why it matters: a drone that is out of contact looks healthy and flying normally."),
 ],
 "L1_F2_org-isolation": [
  ("clean", "Finding two. This is a real bug in the unmodified app. Live drone data should only go to the right organisation. First, a client with the right organisation gets data, which proves the test works. Then a client claiming to be a different organisation, called evil, connects, and so does a client with no organisation at all. Both receive the full drone list and telemetry. The panel on screen shows exactly what they received. Why it matters: anyone who can reach the server can watch every drone without permission."),
 ],
 "L1_F3_dashboard-xss": [
  ("clean", "Finding three. This is a real bug in the unmodified app. The cockpit shows code-like drone names safely, but the control panel does not. It inserts the name straight into the page, so the hidden code runs in the operator's browser. The test fails for both test names with the message: Stored XSS, a drone name executes JavaScript in the dashboard. Why it matters: anyone who can add a drone could take over an operator's control panel session and send take off or land commands."),
 ],
}

INTRO = ("This is Tireless Hand, our testing system for the FlytBase drone cockpit, Level 1. "
 "It opens the real cockpit at phone, tablet and desktop sizes, and checks that what the operator sees matches the true state from the server. "
 "To prove the tests work, we planted bugs on purpose: fifteen of sixteen were caught. "
 "We also found three real bugs: stale data shown as live, no separation between organisations, and unsafe drone names.")

BRIEF = [
 ("L1_S01_shell-contract", "The cockpit shell: every key part of the screen must be visible and usable. Both planted bugs, a missing video tile and a missing control panel link, are caught."),
 ("L1_S02_live-fleet", "The drone list must match the real fleet, live. A planted bug that hides a drone is caught."),
 ("L1_S03_selected-telemetry", "The telemetry panel must show the selected drone's real numbers. Planted battery bugs are caught."),
 ("L1_S04_flight-workflow", "A full flight, take off to landing. Every status on screen must agree with the truth. Two planted status bugs are caught."),
 ("L1_S05_offline-truth", "When the simulator goes offline, the screen must not invent a flying drone. Two planted bugs are caught, and one subtle bug is honestly reported as missed."),
 ("L1_S06_socket-recovery", "The connection badge must say when the connection is lost, and recover on its own. A badge stuck on connected is caught."),
 ("L1_S07_video-truth", "The video label must match real playback. A video labelled live while it is off is caught."),
 ("L1_S08_responsive", "On phones and tablets, everything must stay reachable. Two planted layout bugs are caught."),
 ("L1_S12_dashboard-contract", "The control panel must offer Take off and Land for every drone, and they must work. A missing Land button is caught."),
 ("L1_S13_accessibility-baseline", "Every button must say what it does. An unnamed button is caught."),
 ("L1_S09_xss", "Drone names must be shown as text, never run as code. A planted cockpit bug is caught."),
 ("L1_F1_stale-telemetry", "Real bug one: when telemetry stops, the old numbers stay on screen as if they were live."),
 ("L1_F2_org-isolation", "Real bug two: another organisation, or none at all, can read all live drone data."),
 ("L1_F3_dashboard-xss", "Real bug three: the control panel runs code hidden in a drone name."),
]

def tts(text, path):
    subprocess.run(["say", "-v", VOICE, "-r", RATE, "-o", path, text], check=True)
    return dur(path)

def render(src, sections, out):
    """sections: list of (start, length, text, aiff). One ffmpeg call: trim + freeze + delayed speech, concat."""
    args = ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", src]
    fc, labels = "", ""
    for i, (start, length, text, aiff) in enumerate(sections):
        args += ["-i", aiff]
        a = dur(aiff)
        need = LEAD + a + TAIL
        pad = max(0.0, need - length)
        total = length + pad
        fc += (f"[0:v]trim=start={start:.3f}:duration={length:.3f},setpts=PTS-STARTPTS,"
               f"tpad=stop_mode=clone:stop_duration={pad:.3f},fps=25,format=yuv420p[v{i}];")
        ms = int(LEAD * 1000)
        fc += (f"[{i+1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms},"
               f"apad=whole_dur={total:.3f},atrim=0:{total:.3f},asetpts=PTS-STARTPTS[a{i}];")
        labels += f"[v{i}][a{i}]"
    fc += f"{labels}concat=n={len(sections)}:v=1:a=1[v][a]"
    args += ["-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
             "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out]
    subprocess.run(args, check=True)

def build_one(name):
    src = f"{SRC}/{name}.mp4"
    segs, t, lines = [], 0.0, []
    for k, (variant, text) in enumerate(S[name]):
        part = f"{PARTS}/{name}_{variant}.mp4"
        length = CARD + dur(part)
        aiff = f"{TMP}/{name}_{k}.aiff"
        tts(text, aiff)
        segs.append((t, length, text, aiff))
        lines.append(f"[{t:6.1f}s  section {k+1}: title card + {variant}  ({length:.1f}s video, {dur(aiff):.1f}s speech)]\n{text}\n")
        t += length
    src_d = dur(src)
    if abs(src_d - t) > 0.3:
        print(f"WARN {name}: section sum {t:.2f}s != video {src_d:.2f}s", flush=True)
    open(f"{TXT}/{name}.txt", "w").write("\n".join(lines))
    out = f"{OUT}/{name}.mp4"
    render(src, segs, out)
    return name, dur(out), sum(dur(s[3]) for s in segs)

def build_overview():
    name = "L1_overview"
    src = f"{SRC}/{name}.mp4"
    segs, lines = [], []
    aiff = f"{TMP}/ov_intro.aiff"; tts(INTRO, aiff)
    segs.append((0.0, CARD, INTRO, aiff)); lines.append(f"[   0.0s  intro card (frozen to fit)]\n{INTRO}\n")
    t = CARD
    for k, (reel, text) in enumerate(BRIEF):
        length = dur(f"{SRC}/{reel}.mp4")
        a = f"{TMP}/ov_{k}.aiff"; tts(text, a)
        segs.append((t, length, text, a))
        lines.append(f"[{t:6.1f}s  {reel} ({length:.1f}s video)]\n{text}\n")
        t += length
    if abs(dur(src) - t) > 0.5:
        print(f"WARN overview: section sum {t:.2f}s != video {dur(src):.2f}s", flush=True)
    open(f"{TXT}/{name}.txt", "w").write("\n".join(lines))
    out = f"{OUT}/{name}.mp4"
    render(src, segs, out)
    return name, dur(out), sum(dur(s[3]) for s in segs)

if __name__ == "__main__":
    only = sys.argv[2:]
    jobs = [n for n in S if not only or n in only]
    with cf.ThreadPoolExecutor(max_workers=4) as ex:
        futs = [ex.submit(build_one, n) for n in jobs]
        if not only or "L1_overview" in only:
            futs.append(ex.submit(build_overview))
        for f in cf.as_completed(futs):
            try:
                n, d, sp = f.result(); print(f"OK {n}: {d:.1f}s (speech {sp:.1f}s)", flush=True)
            except Exception as e:
                print("FAIL", e, flush=True)
