#!/usr/bin/env bash
# reel.sh: turn Playwright evidence videos into submission-ready MP4s.
#
# Input layout (per scenario):
#   evidence/Sxx/clean/*.webm            clean run
#   evidence/Sxx/mutant-Mxx/*.webm       one dir per mutant (evidence/Sxx/mutant/ also accepted -> "mutant")
#   evidence/Sxx/<variant>/verdict.json  optional; its status/message is printed on the title card
#
# Output (submission/videos/):
#   L1_Sxx_<slug>_clean.mp4              plain transcode of the clean run
#   L1_Sxx_<slug>_mutant-Mxx.mp4         plain transcode of each mutant run
#   L1_Sxx_<slug>.mp4                    combined: [card] clean [card] mutant ... (skip with --no-combined)
#   L1_overview.mp4                      all combined reels behind an intro card (only with --overview)
#
# Usage:
#   qa/tools/reel.sh [options] [S01 S05 ...]      (no IDs = every evidence/S* dir)
# Options:
#   --evidence DIR     evidence root            (default: <repo>/evidence)
#   --out DIR          output dir               (default: <repo>/submission/videos)
#   --no-combined      don't build the per-scenario combined reel
#   --overview         also build L1_overview.mp4 from the combined reels
#   --card-seconds N   title card length        (default: 2.5)
#   --force            rebuild outputs that already exist and are newer than their inputs
#   -h | --help
# Env: FFMPEG=/path/to/ffmpeg (auto: ffmpeg-full keg if present, since it has drawtext; else ffmpeg on PATH)
#
# Title cards: ffmpeg drawtext if available; else a PNG rendered with macOS JXA (osascript); else a plain
# colour card without text. Missing/corrupt inputs are skipped with a warning; the script never aborts
# the whole batch because of one bad file. Exit code: 0 if at least one video was produced (or nothing to
# do), 1 if inputs existed but every one failed, 2 on usage/dependency errors.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EVIDENCE="$ROOT/evidence"
OUT="$ROOT/submission/videos"
COMBINED=1
OVERVIEW=0
CARD_SECONDS=2.5
FORCE=0
IDS=()

W=1280; H=720; FPS=25

while [ $# -gt 0 ]; do
  case "$1" in
    --evidence) EVIDENCE="${2:?--evidence needs a dir}"; shift 2 ;;
    --out) OUT="${2:?--out needs a dir}"; shift 2 ;;
    --no-combined) COMBINED=0; shift ;;
    --overview) OVERVIEW=1; shift ;;
    --card-seconds) CARD_SECONDS="${2:?}"; shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    S[0-9][0-9]*) IDS+=("$1"); shift ;;
    *) echo "reel: unknown argument: $1" >&2; exit 2 ;;
  esac
done

log()  { printf '[reel] %s\n' "$*"; }
warn() { printf '[reel] WARN: %s\n' "$*" >&2; }

# ---------- dependencies ----------
if [ -z "${FFMPEG:-}" ]; then
  if [ -x /opt/homebrew/opt/ffmpeg-full/bin/ffmpeg ]; then FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
  elif command -v ffmpeg >/dev/null 2>&1; then FFMPEG="$(command -v ffmpeg)"
  fi
fi
if [ -z "${FFMPEG:-}" ] || [ ! -x "$FFMPEG" ]; then
  echo "reel: ffmpeg not found. Install it: brew install ffmpeg" >&2; exit 2
fi
FFPROBE="$(dirname "$FFMPEG")/ffprobe"; [ -x "$FFPROBE" ] || FFPROBE="$(command -v ffprobe || true)"

HAS_DRAWTEXT=0
"$FFMPEG" -hide_banner -filters 2>/dev/null | grep -qE '^ *[T.][S.] drawtext ' && HAS_DRAWTEXT=1
HAS_JXA=0
command -v osascript >/dev/null 2>&1 && HAS_JXA=1
FONT=""
for f in /System/Library/Fonts/Supplemental/Arial\ Bold.ttf /System/Library/Fonts/Supplemental/Arial.ttf \
         /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf; do
  [ -f "$f" ] && { FONT="$f"; break; }
done

TMP="$(mktemp -d "${TMPDIR:-/tmp}/reel.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT" || { echo "reel: cannot create $OUT" >&2; exit 2; }

ENC=(-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -r "$FPS" -an -movflags +faststart)
"$FFMPEG" -hide_banner -encoders 2>/dev/null | grep -q libx264 || ENC=(-c:v h264_videotoolbox -b:v 4M -pix_fmt yuv420p -r "$FPS" -an -movflags +faststart)
NORM="scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x11161e,setsar=1,fps=${FPS}"

# ---------- scenario metadata ----------
# Slug: taken from qa/scenarios/Sxx-<slug>.spec.ts if it exists, else this table.
default_slug() {
  case "$1" in
    S01) echo cockpit-shell ;;      S02) echo device-list-sync ;;  S03) echo telemetry-truth ;;
    S04) echo flight-workflow ;;    S05) echo offline-truth ;;     S06) echo socket-badge ;;
    S07) echo video-state ;;        S08) echo phone-width ;;       S09) echo xss-names ;;
    S10) echo org-isolation ;;      S11) echo auth-guard ;;        S12) echo control-panel ;;
    S13) echo a11y-baseline ;;      S14) echo map-position ;;      S15) echo stale-telemetry ;;
    S16) echo llm-judge ;;          S17) echo security-headers ;;  *) echo scenario ;;
  esac
}
title_of() {
  # override: REEL_TITLE_Sxx="..." (e.g. for baseline-finding reels)
  local ov="REEL_TITLE_$1"; if [ -n "${!ov:-}" ]; then echo "${!ov}"; return; fi
  case "$1" in
    S01) echo "Cockpit shell: required regions present and usable" ;;
    S02) echo "Device list matches the fleet, live" ;;
    S03) echo "Telemetry shows the selected drone's real values" ;;
    S04) echo "Flight workflow: take off, fly, land" ;;
    S05) echo "Offline truth: drones must not look live" ;;
    S06) echo "Socket badge tells the truth and recovers" ;;
    S07) echo "Video label matches the stream" ;;
    S08) echo "Phone width: content and actions reachable" ;;
    S09) echo "XSS-safe rendering of drone names" ;;
    S10) echo "Org isolation on the live data socket" ;;
    S11) echo "Sign-in guard on protected pages" ;;
    S12) echo "Control panel: every drone can be commanded" ;;
    S13) echo "Accessibility baseline" ;;
    S14) echo "Map position matches telemetry" ;;
    S15) echo "Frozen telemetry is flagged as stale" ;;
    S16) echo "LLM judge sweep" ;;
    S17) echo "Security headers and CORS" ;;
    *) echo "Scenario $1" ;;
  esac
}
slug_of() {
  local id="$1" spec ov="REEL_SLUG_$1"
  if [ -n "${!ov:-}" ]; then echo "${!ov}"; return; fi
  spec="$(ls "$ROOT"/qa/scenarios/"$id"-*.spec.ts 2>/dev/null | head -1)"
  if [ -n "$spec" ]; then basename "$spec" .spec.ts | sed "s/^$id-//"; else default_slug "$id"; fi
}

# One-line verdict summary from verdict.json (keys tried: status/result/outcome + message/error/failure/reason).
verdict_line() {
  local vj="$1/verdict.json"
  [ -f "$vj" ] || return 0
  command -v python3 >/dev/null 2>&1 || return 0
  python3 - "$vj" <<'PY' 2>/dev/null || true
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
def pick(*keys):
    for k in keys:
        v = d.get(k) if isinstance(d, dict) else None
        if isinstance(v, (str, int, float, bool)) and str(v).strip():
            return str(v).strip()
    return ""
s = pick("status", "result", "outcome", "verdict")
m = pick("message", "error", "failure", "reason", "summary").splitlines()[0] if pick("message", "error", "failure", "reason", "summary") else ""
line = (s.upper() + (": " if s and m else "") + m)[:110]
print(line)
PY
}

# ---------- building blocks ----------
# make_card OUT.mp4 "Title" "Subtitle" green|red|blue
make_card() {
  local out="$1" title="$2" sub="$3" color="${4:-blue}" hex
  case "$color" in red) hex=0xe54040 ;; green) hex=0x33cc73 ;; *) hex=0x4a90e2 ;; esac
  if [ "$HAS_DRAWTEXT" = 1 ] && [ -n "$FONT" ]; then
    local tf="$TMP/t.$$.txt" sf="$TMP/s.$$.txt"
    printf '%s' "$title" >"$tf"; printf '%s' "$sub" >"$sf"
    "$FFMPEG" -nostdin -loglevel error -y -f lavfi -i "color=c=0x11161e:s=${W}x${H}:d=${CARD_SECONDS}:r=${FPS}" \
      -vf "drawbox=x=0:y=ih*0.52:w=iw:h=6:color=${hex}:t=fill,drawtext=fontfile='${FONT}':textfile='${tf}':fontcolor=white:fontsize=h/14:x=(w-tw)/2:y=h*0.34,drawtext=fontfile='${FONT}':textfile='${sf}':fontcolor=${hex}:fontsize=h/26:x=(w-tw)/2:y=h*0.62" \
      "${ENC[@]}" "$out" && return 0
    warn "drawtext card failed, falling back"
  fi
  if [ "$HAS_JXA" = 1 ]; then
    local png="$TMP/card.$$.png"
    if osascript -l JavaScript "$TMP/card.js" "$png" "$W" "$H" "$title" "$sub" "$color" >/dev/null 2>&1 && [ -s "$png" ]; then
      "$FFMPEG" -nostdin -loglevel error -y -loop 1 -framerate "$FPS" -t "$CARD_SECONDS" -i "$png" -vf "$NORM" "${ENC[@]}" "$out" && return 0
    fi
    warn "JXA card failed, falling back to a plain card"
  fi
  "$FFMPEG" -nostdin -loglevel error -y -f lavfi -i "color=c=${hex}:s=${W}x${H}:d=${CARD_SECONDS}:r=${FPS}" "${ENC[@]}" "$out"
}

# transcode OUT.mp4 IN1.webm [IN2.webm ...]  (several inputs are joined in order)
transcode() {
  local out="$1"; shift
  local n=$# args=() fc="" i=0 f
  for f in "$@"; do args+=(-i "$f"); fc+="[$i:v]${NORM}[v$i];"; i=$((i+1)); done
  if [ "$n" -eq 1 ]; then
    "$FFMPEG" -nostdin -loglevel error -y "${args[@]}" -vf "$NORM" "${ENC[@]}" "$out"
  else
    for ((i=0; i<n; i++)); do fc+="[v$i]"; done
    "$FFMPEG" -nostdin -loglevel error -y "${args[@]}" -filter_complex "${fc}concat=n=${n}:v=1:a=0[out]" -map "[out]" "${ENC[@]}" "$out"
  fi
}

# concat_mp4 OUT.mp4 PART1.mp4 PART2.mp4 ...  (parts are all produced by us with identical settings)
concat_mp4() {
  local out="$1"; shift
  # Re-encode through the concat filter: stream-copy concat of parts with different time bases
  # (image-loop cards vs transcoded webm) silently truncates after the first part.
  local args=() fc="" i=0 p
  for p in "$@"; do args+=(-i "$p"); fc+="[$i:v]${NORM}[v$i];"; i=$((i+1)); done
  local n=$i
  for ((i=0; i<n; i++)); do fc+="[v$i]"; done
  "$FFMPEG" -nostdin -loglevel error -y "${args[@]}" -filter_complex "${fc}concat=n=${n}:v=1:a=0[out]" -map "[out]" "${ENC[@]}" "$out"
}

valid_video() {  # non-empty and ffprobe can read a positive duration
  [ -s "$1" ] || return 1
  [ -z "$FFPROBE" ] && return 0
  local d; d="$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$1" 2>/dev/null)"
  [ -n "$d" ] && [ "$d" != "N/A" ] && awk "BEGIN{exit !($d>0)}" && return 0
  # Playwright/MediaRecorder webm often lacks a duration header: accept it if it has a decodable video stream
  "$FFPROBE" -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$1" 2>/dev/null | grep -q .
}

up_to_date() {  # up_to_date OUT IN...
  [ "$FORCE" = 1 ] && return 1
  local out="$1" f; shift
  [ -s "$out" ] || return 1
  for f in "$@"; do [ "$f" -nt "$out" ] && return 1; done
  return 0
}

# JXA title-card renderer (macOS AppKit, no extra deps)
cat >"$TMP/card.js" <<'JXA'
ObjC.import('AppKit');
function run(argv) {
  var out = argv[0], w = parseInt(argv[1]), h = parseInt(argv[2]), title = argv[3], sub = argv[4] || '', color = argv[5] || 'blue';
  var rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(null, w, h, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
  $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.067, 0.086, 0.118, 1).setFill;
  $.NSRectFill($.NSMakeRect(0, 0, w, h));
  var rgb = color === 'red' ? [0.9, 0.25, 0.25] : color === 'green' ? [0.2, 0.8, 0.45] : [0.29, 0.56, 0.89];
  var accent = $.NSColor.colorWithSRGBRedGreenBlueAlpha(rgb[0], rgb[1], rgb[2], 1);
  accent.setFill; $.NSRectFill($.NSMakeRect(0, h * 0.47, w, 6));
  function draw(s, size, y, col) {
    var para = $.NSMutableParagraphStyle.alloc.init; para.alignment = 1;
    var attrs = $.NSDictionary.dictionaryWithObjectsForKeys(
      $([$.NSFont.boldSystemFontOfSize(size), col, para]),
      $([$.NSFontAttributeName, $.NSForegroundColorAttributeName, $.NSParagraphStyleAttributeName]));
    $(s).drawInRectWithAttributes($.NSMakeRect(40, y, w - 80, size * 2.6), attrs);
  }
  draw(title, Math.round(h / 16), h * 0.52, $.NSColor.whiteColor);
  draw(sub, Math.round(h / 28), h * 0.26, accent);
  $.NSGraphicsContext.restoreGraphicsState;
  rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $()).writeToFileAtomically(out, true);
  return out;
}
JXA

# ---------- main ----------
if [ ! -d "$EVIDENCE" ]; then log "no evidence dir at $EVIDENCE; nothing to do"; exit 0; fi
if [ ${#IDS[@]} -eq 0 ]; then
  for d in "$EVIDENCE"/S[0-9][0-9]*; do [ -d "$d" ] && IDS+=("$(basename "$d")"); done
fi
if [ ${#IDS[@]} -eq 0 ]; then log "no evidence/Sxx dirs yet; nothing to do"; exit 0; fi

if [ "$HAS_DRAWTEXT" = 1 ] && [ -n "$FONT" ]; then cards="text via drawtext"
elif [ "$HAS_JXA" = 1 ]; then cards="text via macOS JXA"
else cards="plain colour (no text renderer)"; fi
log "ffmpeg: $FFMPEG | title cards: $cards | out: $OUT"

produced=0; failed=0; skipped=0
COMBINED_REELS=()

for id in "${IDS[@]}"; do
  sdir="$EVIDENCE/$id"
  if [ ! -d "$sdir" ]; then warn "$id: no evidence dir ($sdir), skipping"; skipped=$((skipped+1)); continue; fi
  slug="$(slug_of "$id")"; title="$(title_of "$id")"
  base="$OUT/L1_${id}_${slug}"
  parts=()   # for the combined reel: card, video, card, video, ...

  # variants: clean first, then mutants sorted
  variants=()
  [ -d "$sdir/clean" ] && variants+=(clean)
  for m in "$sdir"/mutant*; do [ -d "$m" ] && variants+=("$(basename "$m")"); done
  if [ ${#variants[@]} -eq 0 ]; then warn "$id: no clean/ or mutant*/ dirs, skipping"; skipped=$((skipped+1)); continue; fi

  for v in "${variants[@]}"; do
    vdir="$sdir/$v"
    # pick inputs: video.webm if present, else every *.webm in name order
    inputs=()
    if [ -f "$vdir/video.webm" ]; then inputs=("$vdir/video.webm")
    else for f in "$vdir"/*.webm; do [ -f "$f" ] && inputs+=("$f"); done
    fi
    if [ ${#inputs[@]} -eq 0 ]; then warn "$id/$v: no .webm found, skipping"; skipped=$((skipped+1)); continue; fi
    [ ${#inputs[@]} -gt 1 ] && warn "$id/$v: no video.webm; joining ${#inputs[@]} webm files in name order"
    good=()
    for f in "${inputs[@]}"; do
      if valid_video "$f"; then good+=("$f"); else warn "$id/$v: unreadable or empty video, ignoring: $f"; fi
    done
    if [ ${#good[@]} -eq 0 ]; then failed=$((failed+1)); continue; fi

    out="${base}_${v}.mp4"
    if up_to_date "$out" "${good[@]}"; then
      log "$id/$v: up to date -> $(basename "$out")"
    elif transcode "$out" "${good[@]}"; then
      log "$id/$v: -> $(basename "$out")"; produced=$((produced+1))
    else
      warn "$id/$v: ffmpeg transcode failed"; rm -f "$out"; failed=$((failed+1)); continue
    fi

    if [ "$COMBINED" = 1 ]; then
      verdict="$(verdict_line "$vdir")"
      if [ "$v" = clean ] && printf '%s' "$verdict" | grep -qiE '^(FAILED|TIMEDOUT)'; then
        sub="UNMODIFIED app · real baseline finding"; color=red
      elif [ "$v" = clean ]; then sub="CLEAN build · expected: PASS"; color=green
      else mid="${v#mutant}"; mid="${mid#-}"; sub="MUTANT ${mid:-(unnamed)} · expected: FAIL"; color=red
      fi
      [ -n "$verdict" ] && sub="$sub · got $verdict"
      card="$TMP/${id}_${v}_card.mp4"
      if make_card "$card" "$id · $title" "$sub" "$color"; then parts+=("$card"); else warn "$id/$v: title card failed; continuing without it"; fi
      parts+=("$out")
    fi
  done

  if [ "$COMBINED" = 1 ] && [ ${#parts[@]} -gt 0 ]; then
    if concat_mp4 "${base}.mp4" "${parts[@]}"; then
      log "$id: combined -> $(basename "${base}.mp4")"; produced=$((produced+1)); COMBINED_REELS+=("${base}.mp4")
    else
      warn "$id: combined reel failed"; rm -f "${base}.mp4"; failed=$((failed+1))
    fi
  fi
done

if [ "$OVERVIEW" = 1 ]; then
  if [ ${#COMBINED_REELS[@]} -eq 0 ]; then
    warn "overview: no combined reels were built in this run (needs combined mode), skipping"
  else
    intro="$TMP/intro.mp4"
    parts=()
    make_card "$intro" "Tireless Hand · FlytBase Cockpit QA (Level 1)" "${#COMBINED_REELS[@]} scenarios · each shows a clean PASS, then a mutant FAIL" blue && parts+=("$intro")
    parts+=("${COMBINED_REELS[@]}")
    if concat_mp4 "$OUT/L1_overview.mp4" "${parts[@]}"; then log "overview -> L1_overview.mp4"; produced=$((produced+1))
    else warn "overview reel failed"; failed=$((failed+1)); fi
  fi
fi

log "done: produced=$produced failed=$failed skipped=$skipped"
if [ "$produced" -eq 0 ] && [ "$failed" -gt 0 ]; then exit 1; fi
exit 0
