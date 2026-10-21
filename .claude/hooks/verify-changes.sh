#!/usr/bin/env bash
# Stop hook: when backend or frontend code has uncommitted changes, require the
# checks to pass before Claude finishes. Exit 2 sends stderr back to Claude to fix.
# Backend: unit tests, oxlint, SonarJS lint. Frontend: oxlint, SonarJS lint.
# The SonarJS lint (eslint.config.mjs) only runs on the changed files.
set -u

input="$(cat)"
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$root" || exit 0

failures=""

fail() {
  failures="${failures}--- $1 (exit $2) ---
$(printf '%s\n' "$3" | grep -v '^npm notice' | tail -40)
"
}

changed_sources() {
  git status --porcelain --untracked-files=all -- "$1/src" "$1/test" 2>/dev/null \
    | sed -E 's/^.{3}//; s/^.* -> //; s/^"(.*)"$/\1/' \
    | grep -E '\.(ts|tsx)$' \
    | while read -r path; do
        [ -f "$path" ] && printf '%s\n' "${path#"$1"/}"
      done
}

sonar_lint() {
  local files
  files="$(changed_sources "$1")"
  [ -z "$files" ] && return 0
  local out rc
  out="$(cd "$1" && printf '%s\n' "$files" | xargs npx --no-install eslint --max-warnings 0 2>&1)"; rc=$?
  [ $rc -ne 0 ] && fail "$1: eslint (SonarJS) on changed files" "$rc" "$out"
}

if [ -n "$(git status --porcelain -- backend/src backend/test backend/package.json 2>/dev/null)" ]; then
  out="$(cd backend && npm test --silent 2>&1)"; rc=$?
  [ $rc -ne 0 ] && fail "backend: npm test" "$rc" "$out"
  out="$(cd backend && npm run lint --silent 2>&1)"; rc=$?
  [ $rc -ne 0 ] && fail "backend: npm run lint" "$rc" "$out"
  sonar_lint backend
fi

if [ -n "$(git status --porcelain -- frontend/src frontend/package.json 2>/dev/null)" ]; then
  out="$(cd frontend && npm run lint --silent 2>&1)"; rc=$?
  [ $rc -ne 0 ] && fail "frontend: npm run lint" "$rc" "$out"
  sonar_lint frontend
fi

[ -z "$failures" ] && exit 0

# Already blocked once this turn: don't loop forever, just warn the user.
if printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  echo '{"systemMessage": "verify-changes: tests, lint or the SonarJS lint are still failing. Run npm test / npm run lint / npm run lint:sonar."}'
  exit 0
fi

{
  echo "Verification failed. Per CLAUDE.md, code review, unit tests and lint (including npm run lint:sonar) must pass before finishing."
  printf '%s' "$failures"
} >&2
exit 2
