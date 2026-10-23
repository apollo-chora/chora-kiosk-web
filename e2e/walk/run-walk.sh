#!/bin/bash
# Runs the scripted walk (T4.1) inside the browser slot.
#
# Usage: e2e/walk/run-walk.sh <fixtures|stack> <en|zh|all> <absolute out dir> [what]
#   KIOSK_WALK_WHO      required: the session name written into the slot
#   KIOSK_WALK_EDGE     required for stack: the kiosk origin (the edge's published port)
#   KIOSK_WALK_STACK_GO required for stack: 1, only in a slot the orchestrator assigns
#   KIOSK_WALK_LIVE_ALLOW  optional: comma list of LIVE kinds a check may press (default none)
#   KIOSK_WALK_SLOT_FILE   optional: the slot file (default: the clone's
#                          .handoffs/kiosk-phase2/BROWSER-SLOT.txt, found from git)
#   KIOSK_WALK_FIXTURE_PICTURES  optional: the fixture pictures folder (default dev/fixtures/pictures;
#                          the tests point it elsewhere)
#
# The slot (kiosk rules, one browser run at a time): it is taken only when it reads "free", and
# written back "free" on exit only if this run took it and it still holds this run's claim. A
# busy slot exits 3 without touching it. The out dir gets the screenshots, report.json and, for
# the stack, the image of every kiosk container (a walk on mixed images is not evidence).
set -u

die() { echo "run-walk: $*" >&2; exit 2; }

[ $# -ge 3 ] || die "usage: run-walk.sh <fixtures|stack> <en|zh|all> <absolute out dir> [what]"
TARGET=$1 LANGS=$2 OUT=$3 WHAT=${4:-walk}
case "$TARGET" in fixtures|stack) ;; *) die "target must be fixtures or stack, not $TARGET" ;; esac
case "$LANGS" in en|zh) PROJECTS=(--project="$LANGS") ;; all) PROJECTS=(--project=en --project=zh) ;; *) die "language must be en, zh or all" ;; esac
case "$OUT" in /*) ;; *) die "the out dir must be absolute" ;; esac
[ -n "${KIOSK_WALK_WHO:-}" ] || die "KIOSK_WALK_WHO (the session name for the slot) is required"
if [ "$TARGET" = stack ]; then
  [ "${KIOSK_WALK_STACK_GO:-}" = 1 ] || die "a stack walk needs KIOSK_WALK_STACK_GO=1, given only in the orchestrator's slot"
  [ -n "${KIOSK_WALK_EDGE:-}" ] || die "a stack walk needs KIOSK_WALK_EDGE, the kiosk origin"
fi

HERE=$(cd "$(dirname "$0")" && pwd)
WEB=$(cd "$HERE/../.." && pwd)
if [ -z "${KIOSK_WALK_SLOT_FILE:-}" ]; then
  COMMON=$(git -C "$WEB" rev-parse --path-format=absolute --git-common-dir) || die "not in a git checkout"
  KIOSK_WALK_SLOT_FILE="$(dirname "$COMMON")/.handoffs/kiosk-phase2/BROWSER-SLOT.txt"
fi
[ -f "$KIOSK_WALK_SLOT_FILE" ] || die "no slot file at $KIOSK_WALK_SLOT_FILE"
if [ "$TARGET" = fixtures ]; then
  [ -f "$WEB/dist/kiosk-web/browser/index.html" ] || die "no production build: run npx ng build in $WEB first"
  PICTURES=${KIOSK_WALK_FIXTURE_PICTURES:-$WEB/dev/fixtures/pictures}
  [ -n "$(ls -A "$PICTURES" 2>/dev/null)" ] \
    || die "no fixture pictures in $PICTURES: run node dev/world/make-fixtures.mjs pictures in $WEB first"
fi

held=$(tr -d '\r' < "$KIOSK_WALK_SLOT_FILE" | sed -e 's/[[:space:]]*$//')
if [ "$held" != free ]; then
  echo "run-walk: the browser slot is busy, not started: $held" >&2
  exit 3
fi
CLAIM="$KIOSK_WALK_WHO $(date -u) $WHAT ($TARGET, $LANGS)"
printf '%s\n' "$CLAIM" > "$KIOSK_WALK_SLOT_FILE" || die "could not write the slot"
release() {
  now=$(tr -d '\r' < "$KIOSK_WALK_SLOT_FILE" | sed -e 's/[[:space:]]*$//')
  if [ "$now" = "$CLAIM" ]; then
    printf 'free\n' > "$KIOSK_WALK_SLOT_FILE"
  else
    echo "run-walk: the slot no longer holds this run's claim, left as is: $now" >&2
  fi
}
trap release EXIT
echo "run-walk: slot taken: $CLAIM"

mkdir -p "$OUT" || die "cannot create $OUT"
COMMIT=$(git -C "$WEB" rev-parse --short HEAD)
if [ "$TARGET" = stack ]; then
  docker ps --filter label=com.docker.compose.project=chora-kiosk --format '{{.Names}} {{.Image}} {{.Status}}' | sort > "$OUT/stack-images.txt" \
    || die "could not list the kiosk's containers"
  echo "run-walk: $(wc -l < "$OUT/stack-images.txt" | tr -d ' ') kiosk containers listed in $OUT/stack-images.txt"
fi

cd "$WEB" || die "cannot enter $WEB"
# caffeinate -i keeps the Mac from idle sleep while the walk runs: asleep on battery (18 Oct, 02:5x +08)
# the walk stood still while the test's clock ran on, so a green walk timed out and every gap lied.
KIOSK_WALK_TARGET=$TARGET KIOSK_WALK_OUT=$OUT KIOSK_WALK_COMMIT=$COMMIT \
  KIOSK_WALK_LIVE_ALLOW=${KIOSK_WALK_LIVE_ALLOW:-} \
  caffeinate -i npx playwright test -c e2e/walk/walk.config.ts "${PROJECTS[@]}"
code=$?
echo "run-walk: playwright exit $code; report(s) under $OUT"
exit $code
