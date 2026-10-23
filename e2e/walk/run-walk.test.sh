#!/bin/bash
# Tests run-walk.sh's slot and stack rules with fake npx and docker on PATH (no browser runs).
# Usage: bash e2e/walk/run-walk.test.sh [path of the runner to test]
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
RUNNER=${1:-$HERE/run-walk.sh}
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/out"
pass=0 fail=0
ok() { pass=$((pass + 1)); }
no() { fail=$((fail + 1)); echo "FAIL: $*"; }

# The fake npx records its arguments and the slot as it saw it, then exits with FAKE_CODE; with
# FAKE_STEAL set it overwrites the slot as another session would.
cat > "$T/bin/npx" <<'EOF'
#!/bin/bash
printf '%s\n' "$*" > "$FAKE_DIR/npx.args"
cat "$KIOSK_WALK_SLOT_FILE" > "$FAKE_DIR/slot.during"
env | grep -E '^KIOSK_WALK_(TARGET|OUT|COMMIT|LIVE_ALLOW)=' | sort > "$FAKE_DIR/npx.env"
[ -n "${FAKE_STEAL:-}" ] && printf 'other-session took it\n' > "$KIOSK_WALK_SLOT_FILE"
exit "${FAKE_CODE:-0}"
EOF
# The fake caffeinate records that the walk ran under it, then runs the walk.
cat > "$T/bin/caffeinate" <<'EOF'
#!/bin/bash
printf '%s\n' "$1" > "$FAKE_DIR/caffeinate.flag"
shift
exec "$@"
EOF
cat > "$T/bin/docker" <<'EOF'
#!/bin/bash
echo "chora-kiosk-static-1 chora-kiosk/static:abc Up"
EOF
chmod +x "$T/bin/npx" "$T/bin/docker" "$T/bin/caffeinate"

run() {
  rm -f "$T/npx.args" "$T/slot.during" "$T/npx.env" "$T/caffeinate.flag"
  env -u KIOSK_WALK_STACK_GO -u KIOSK_WALK_EDGE PATH="$T/bin:$PATH" FAKE_DIR="$T" KIOSK_WALK_SLOT_FILE="$T/slot" KIOSK_WALK_WHO=tester "$@" > "$T/stdout" 2> "$T/stderr"
}
slot() { cat "$T/slot"; }

# 1. A free slot is taken for the run and written back free after it.
printf 'free\n' > "$T/slot"
run bash "$RUNNER" fixtures en "$T/out" probe
code=$?
[ $code -eq 0 ] && ok || no "1 exit $code, want 0: $(cat "$T/stderr")"
grep -q '^tester .* probe (fixtures, en)$' "$T/slot.during" 2>/dev/null && ok || no "1 the slot did not hold the claim during the run: $(cat "$T/slot.during" 2>/dev/null)"
[ "$(slot)" = free ] && ok || no "1 the slot was not freed: $(slot)"
grep -q -- '--project=en' "$T/npx.args" && grep -q 'walk.config.ts' "$T/npx.args" && ok || no "1 playwright args: $(cat "$T/npx.args")"
grep -q '^KIOSK_WALK_TARGET=fixtures$' "$T/npx.env" && grep -q "^KIOSK_WALK_OUT=$T/out$" "$T/npx.env" && ok || no "1 env: $(cat "$T/npx.env")"
# A sleeping Mac stops the walk but not the test clock (18 Oct): the walk runs under caffeinate -i.
[ "$(cat "$T/caffeinate.flag" 2>/dev/null)" = -i ] && ok || no "1 the walk did not run under caffeinate -i"

# 2. A busy slot is not touched and nothing runs.
printf 'chora-kiosk-da Sun 18 Oct K138 pass 2\n' > "$T/slot"
run bash "$RUNNER" fixtures all "$T/out"
code=$?
[ $code -eq 3 ] && ok || no "2 exit $code, want 3"
[ "$(slot)" = 'chora-kiosk-da Sun 18 Oct K138 pass 2' ] && ok || no "2 the busy slot was changed: $(slot)"
[ ! -f "$T/npx.args" ] && ok || no "2 playwright ran on a busy slot"

# 3. A failing walk still frees the slot, and its exit code is the runner's.
printf 'free\n' > "$T/slot"
run env FAKE_CODE=1 bash "$RUNNER" fixtures all "$T/out"
code=$?
[ $code -eq 1 ] && ok || no "3 exit $code, want 1"
[ "$(slot)" = free ] && ok || no "3 the slot was not freed after a failure: $(slot)"
grep -q -- '--project=en --project=zh' "$T/npx.args" && ok || no "3 all should run both projects: $(cat "$T/npx.args")"

# 4. A slot another session took meanwhile is left alone.
printf 'free\n' > "$T/slot"
run env FAKE_STEAL=1 bash "$RUNNER" fixtures en "$T/out"
[ "$(slot)" = 'other-session took it' ] && ok || no "4 another session's claim was overwritten: $(slot)"

# 5. The stack needs its go and its origin; refused before the slot is touched.
printf 'free\n' > "$T/slot"
run bash "$RUNNER" stack en "$T/out"
code=$?
[ $code -eq 2 ] && ok || no "5 stack without go: exit $code, want 2"
[ "$(slot)" = free ] && [ ! -f "$T/npx.args" ] && ok || no "5 stack without go touched the slot or ran"
run env KIOSK_WALK_STACK_GO=1 bash "$RUNNER" stack en "$T/out"
code=$?
[ $code -eq 2 ] && [ ! -f "$T/npx.args" ] && ok || no "5 stack without an origin: exit $code, want 2"
run env KIOSK_WALK_STACK_GO=1 KIOSK_WALK_EDGE=http://127.0.0.1:1 bash "$RUNNER" stack en "$T/out"
code=$?
[ $code -eq 0 ] && grep -q '^KIOSK_WALK_TARGET=stack$' "$T/npx.env" && ok || no "5 stack with go: exit $code: $(cat "$T/stderr")"
grep -q 'chora-kiosk/static:abc' "$T/out/stack-images.txt" && ok || no "5 the stack's images were not recorded"

# 6. Arguments are refused, never guessed.
run bash "$RUNNER" fixtures en relative/out
[ $? -eq 2 ] && ok || no "6 a relative out dir was accepted"
run env -u KIOSK_WALK_WHO bash "$RUNNER" fixtures en "$T/out"
[ $? -eq 2 ] && [ "$(slot)" = free ] && ok || no "6 a run with no session name was accepted"
run bash "$RUNNER" cloud en "$T/out"
[ $? -eq 2 ] && ok || no "6 an unknown target was accepted"

# 7. A fixture walk needs the fixture pictures (gitignored, drawn by make-fixtures.mjs pictures).
printf 'free\n' > "$T/slot"
run env KIOSK_WALK_FIXTURE_PICTURES="$T/no-pictures" bash "$RUNNER" fixtures en "$T/out"
code=$?
[ $code -eq 2 ] && grep -q 'make-fixtures.mjs pictures' "$T/stderr" && [ "$(slot)" = free ] && [ ! -f "$T/npx.args" ] && ok || no "7 a fixture walk without pictures: exit $code, $(cat "$T/stderr")"

echo "run-walk.test: $pass passed, $fail failed"
[ $fail -eq 0 ]
