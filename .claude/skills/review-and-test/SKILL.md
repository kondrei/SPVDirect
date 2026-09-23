---
name: review-and-test
description: Mandatory finish step for any code change in SPVDirect. First review the diff (correctness, security, ANAF rules), fix findings, then write/update unit tests and run tests, lint and build. Use after every code change, before reporting work as done or committing.
---

# Review, then test

Run this after **every** code change in this repo, before saying the work is done or committing. Do the steps in order. Don't skip the review because the change "looks small".

## 1. Code review (first)
1. Look at the full diff: `git status --short` and `git diff` (plus `git diff --cached` if files are staged). Include new untracked files.
2. Review each changed file for:
   - **Correctness:** logic errors, edge cases, null/undefined, async mistakes (missing `await`, unhandled promises), race conditions.
   - **Security:** secrets or ANAF tokens in logs or responses; ownership checks (`accountantId`) on every query; input validation with DTOs and class-validator; no injected HTML without `escapeHtml`.
   - **ANAF rules from CLAUDE.md:** Basic auth, `token_content_type=jwt`, save both tokens on refresh, 60 s cooldown, all api.anaf.ro calls go through `AnafApiService.request()`.
   - **Project conventions:** `.js` import suffixes, migrations for schema changes (registered in `migrations/index.ts`), env vars added to Joi + `Env` + `.env.example`.
   - **Simplicity:** dead code, duplication, anything that doesn't match the surrounding style.
3. Fix every real finding. Then list the findings for the user, marking each **fixed** or **not fixed** with the reason.

## 2. Unit tests (after the review)
1. Every new or changed behaviour needs a unit test in a `*.spec.ts` file next to the source. Put shared fixtures in `src/testing/`.
   - Test the behaviour and the edge cases the review found.
   - Mock HTTP (`HttpService.axiosRef`) and repositories. Unit tests never touch ANAF or the database.
2. Run these in `backend/`:
   ```bash
   npm test
   npm run lint
   npm run build
   ```
3. If something fails, fix it and rerun until everything passes. Don't weaken or delete a test to make it pass unless the test itself is wrong, and say so if it is.

## 3. Report
End with a short summary:
- the review findings and what was fixed
- the tests added or changed
- the exact results of test, lint and build (pass counts, or the failures)

A Stop hook (`.claude/hooks/verify-backend.sh`) also runs tests and lint automatically whenever backend code has uncommitted changes.
