---
name: review-and-test
description: Mandatory finish step for any code change in SPVDirect. First review the diff yourself and through the independent reviewer subagents (spv-reviewer always, specialists by trigger), fix findings, then write/update unit tests and run tests, lint and build. Use after every code change, before reporting work as done or committing.
---

# Review, then test

Run this after **every** code change in this repo, before saying the work is done or committing. Do the steps in order. Don't skip the review because the change "looks small".

## 1. Self-review (first)
1. Look at the full diff: `git status --short` and `git diff` (plus `git diff --cached` if files are staged). Include new untracked files.
2. Review each changed file for:
   - **Correctness:** logic errors, edge cases, null/undefined, async mistakes (missing `await`, unhandled promises), race conditions.
   - **Security:** secrets or ANAF tokens in logs or responses; ownership checks (`accountantId`) on every query; input validation with DTOs and class-validator; no injected HTML without `escapeHtml`.
   - **ANAF rules from CLAUDE.md:** Basic auth, `token_content_type=jwt`, save both tokens on refresh, 60 s cooldown, all api.anaf.ro calls go through `AnafApiService.request()`.
   - **Project conventions:** `.js` import suffixes, migrations for schema changes (registered in `migrations/index.ts`), env vars added to Joi + `Env` + `.env.example`, value sets as enums with no raw literals (`value-sets` skill).
   - **Simplicity:** dead code, duplication, anything that doesn't match the surrounding style.
3. Fix every real finding.

## 2. Independent reviews
1. Pick the reviewers from the diff. `spv-reviewer` always runs; each specialist runs only when its trigger matches:

   | Reviewer | Runs when the diff |
   |---|---|
   | `spv-reviewer` | every change |
   | `data-lifecycle-auditor` | adds or changes an entity, a column, a jsonb field, a Storage path, an activity `details` key or a log field; registers an entity in `typeorm.config.ts`; touches `companies/deletion/`, `accountants/deletion/`, `common/logging/redact.ts` or `REDACTED_LOG_KEYS`; or adds raw SQL on a table with `deleted_at` |
   | `migration-auditor` | touches `backend/src/database/migrations/`, an entity's columns or indexes, or the entity list in `typeorm.config.ts` |
   | `route-auditor` | adds or changes a controller, a route, a route's DTO, a guard, a `Parse*Pipe`, a throttle constant in `common/constants.ts`, `app.setup.ts` or `SessionCookieService` |
   | `anaf-integration-reviewer` | touches `backend/src/anaf/`, `backend/src/efactura/`, e-Transport, or code that calls an ANAF endpoint |
   | `ui-reviewer` | touches a `.tsx` or `.css` file under `frontend/src` (other than `*.test.tsx`), `frontend/src/api/hooks/` or `frontend/src/api/enums.ts` |
   | `test-gap-hunter` | changes logic in `backend/src` or `frontend/src` source files (not only specs, DTOs, enums, constants, copy, styles or docs) |

   A change only to files outside `backend/src` and `frontend/src` (docs, `CLAUDE.md`, `.claude/`, `.github/`, `*.json`, `.env.example`) runs `spv-reviewer` alone.
2. Dispatch the picked read-only reviewers (everyone except `test-gap-hunter`) **in parallel**, in one message (Agent tool, `subagent_type` = the reviewer's name). They start with fresh context and read the diff themselves, so each prompt says only what the change is for (one or two sentences: the intent, not your reasoning about why it is correct), the base to diff against when the work has commits, and, for `spv-reviewer`, which specialists run alongside it.
3. Only after all of them have returned, dispatch `test-gap-hunter` **alone**, with the session scratchpad directory in its prompt. It edits source files while it works, so nothing else may read or test the tree at the same time. When it returns, run `sha256sum -c <its dir>/files.sha` from the repo root yourself. If a line is not `OK`, copy that file back from `<its dir>/snap/` before going on.
4. Handle every finding: fix it, or answer it with the concrete reason it is wrong for this code. A finding is never dropped silently. A **test-gap** finding is fixed by adding the test it describes.
5. When you fixed **bug**, **security**, **privacy**, **data-loss**, **downtime** or **limit** findings, dispatch the reviewer that raised them once more on the new diff.
6. List the findings for the user, grouped by reviewer, marking each **fixed** or **not fixed** with the reason.

## 3. Unit tests (after the reviews)
1. Every new or changed behaviour needs a unit test in a `*.spec.ts` file next to the source. Put shared fixtures in `src/testing/`.
   - Test the behaviour and the edge cases the review found.
   - Mock HTTP (`HttpService.axiosRef`) and repositories. Unit tests never touch ANAF or the database.
2. Run these in `backend/`:
   ```bash
   npm test
   npm run lint
   npm run lint:sonar
   npm run build
   ```
   When `frontend/` changed, run `npm test`, `npm run typecheck`, `npm run lint` and `npm run lint:sonar` there.
   `lint:sonar` runs the SonarJS rules that SonarQube for IDE shows. Fix the code, don't disable the rule. When a finding is wrong for this code (for example a TypeORM `find(Entity, …)` read as `Array#find`), say why in the report instead of rewriting working code. When you wrap a callback to satisfy a rule, keep every argument it used: `.map(fn)` passes the index too.
3. If something fails, fix it and rerun until everything passes. Don't weaken or delete a test to make it pass unless the test itself is wrong, and say so if it is.

## 4. Report
End with a short summary:
- the findings of the self-review and of each reviewer that ran (and which ones did not run, by trigger), and what was fixed
- the tests added or changed
- the exact results of test, lint and build (pass counts, or the failures)

A Stop hook (`.claude/hooks/verify-changes.sh`) also runs, on uncommitted changes, the backend tests and `npm run lint`, the frontend tests, `npm run typecheck` and `npm run lint`, and the SonarJS lint on the changed files. CI (`.github/workflows/ci.yml`) runs every check, including the migrations on an empty Postgres, on each push and pull request.
