#!/usr/bin/env bash
# Stop hook: when backend code has uncommitted changes, require unit tests + lint
# to pass before Claude finishes. Exit 2 sends stderr back to Claude to fix.
set -u

input="$(cat)"
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$root" || exit 0

# Nothing to verify if backend code (or its package.json) is untouched.
if [ -z "$(git status --porcelain -- backend/src backend/test backend/package.json 2>/dev/null)" ]; then
  exit 0
fi

cd backend || exit 0
test_out="$(npm test --silent 2>&1)"; test_rc=$?
lint_out="$(npm run lint --silent 2>&1)"; lint_rc=$?

if [ $test_rc -eq 0 ] && [ $lint_rc -eq 0 ]; then
  exit 0
fi

# Already blocked once this turn: don't loop forever, just warn the user.
if printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  echo '{"systemMessage": "verify-backend: unit tests or lint are still failing in backend/. Run npm test / npm run lint."}'
  exit 0
fi

{
  echo "Backend verification failed. Per CLAUDE.md, code review + unit tests must pass before finishing."
  [ $test_rc -ne 0 ] && { echo "--- npm test (exit $test_rc) ---"; printf '%s\n' "$test_out" | tail -40; }
  [ $lint_rc -ne 0 ] && { echo "--- npm run lint (exit $lint_rc) ---"; printf '%s\n' "$lint_out" | tail -40; }
} >&2
exit 2
