# CLAUDE.md

SPVDirect is an accountant portal for ANAF SPV services (e-Factura, e-Transport). The UI is in Romanian, and user-facing error messages in the backend are in Romanian too. See README.md for the product overview and the API table.

## Layout
- `backend/`: NestJS 12 API. Phase 1 is done: accounts, ANAF OAuth, schema.
- `frontend/`: React 19 + Vite app (Phase 3 in progress): landing with login/register, dashboard, companies, ANAF certificates, SPV archive and document requests (no sync), invoices, e-Factura, profile; e-Transport is a placeholder. See `frontend/README.md`. Plain folders, no npm workspaces.
- `postman/`: the SPVDirect API collection (happy paths plus 400/401/403/404 cases). Update it when you add or change a route.
- `.github/workflows/`: CI (`ci.yml`, the same checks as below plus migrations on an empty Postgres) and Claude review on pull requests (`claude-review.yml`).

### Module notes
Each backend module keeps its own `CLAUDE.md`, loaded when you work in that folder. Read the one for a module before changing code that calls into it from elsewhere:
- `backend/src/auth/`: session internals, two-step verification (MFA), registration and admin approval.
- `backend/src/anaf/`: ANAF OAuth rules, the api.anaf.ro gateway, certificates, authorization links, the SPV inbox.
- `backend/src/companies/`: CUIs, soft delete, export, `PurgeJob`.
- `backend/src/accountants/`: profile, account export and deletion.
- `backend/src/invoices/`, `backend/src/efactura/`: fiscal invoices and storno; e-Factura upload, status and archive.
- `backend/src/api-logs/`: activity log, scheduled-job logging, slow SQL.
- `backend/src/common/`: mail, Supabase Storage, the Winston logger and redaction, shared helpers.
- `backend/src/database/`: migrations and repositories. Also `public-stats/`, `open-data/`.

## Commands (run in `backend/`)
- `npm run dev`: dev server on :3000. Needs `backend/.env` (copy from `.env.example`).
- `npm test`: unit tests (Vitest). `npm run test:e2e`: HTTP smoke test that needs no DB.
- `npm run lint` (oxlint, type-aware) · `npm run lint:sonar` (ESLint with SonarJS, the rules SonarQube for IDE reports) · `npm run format` (prettier) · `npm run build`
- `npm run migration:run | migration:revert | migration:show | migration:generate -- src/database/migrations/<Name>`
  - These build first, then run the TypeORM CLI against `dist/database/data-source.js`.

## Commands (run in `frontend/`)
- `npm run dev`: http://localhost:5173. It proxies `/api/*` to the backend at https://localhost:3000, so start the backend first.
- `npm test` (Vitest + Testing Library, no backend needed) · `npm run typecheck` · `npm run lint` · `npm run lint:sonar` · `npm run build`
- `npm run screenshots` regenerates the landing gallery and README images (`public/screenshots/*.webp`) from the real app with the sample data in `src/screenshots/fixtures.ts`. Run it after changing the menu or a page listed in `src/pages/landing/screenshots.ts`.
- Frontend conventions: design-system tokens only (`src/styles/tokens.css`), `StatusBadge` for every status, Romanian copy. Details in `frontend/README.md`.

## MANDATORY workflow after every code change
This rule always applies. Follow `.claude/skills/review-and-test/SKILL.md`:
1. **Self-review, then independent review.** Review the whole diff for correctness, security, ANAF rules and conventions and fix the findings. Then dispatch the independent reviewers in `.claude/agents/` in parallel, each with fresh context: `spv-reviewer` always, and the specialists (`test-gap-hunter`, `data-lifecycle-auditor`, `migration-auditor`, `route-auditor`, `anaf-integration-reviewer`, `ui-reviewer`) when the diff matches their trigger in the skill. Fix or answer each finding they report.
2. **Then unit tests.** Add or update `*.spec.ts` for every changed behaviour, then run `npm test`, `npm run lint`, `npm run lint:sonar` and `npm run build` in `backend/` until all of them pass. When `frontend/` changed, add or update its `*.test.ts(x)` and run `npm test`, `npm run typecheck`, `npm run lint` and `npm run lint:sonar` there too.
3. **Only then** report the work as done or commit. Include the reviews' findings and the test results in the report.

A Stop hook (`.claude/settings.json` → `.claude/hooks/verify-changes.sh`) blocks finishing while checks fail on uncommitted changes: backend tests and `npm run lint`, frontend tests, `npm run typecheck` and `npm run lint`, and the SonarJS lint on the changed files of both. CI runs the full set on every push and pull request.

Sonar rules live in two places: the SonarJS rules that need type information in each package's `eslint.config.mjs`, and the ones oxlint has natively (unicorn, `import/no-duplicates`) in `.oxlintrc.json`. Don't silence a Sonar finding by making intentionally sequential code parallel: an `await` inside a loop is often deliberate here (ANAF rate limits, one `QueryRunner` per migration, ZIP streaming), so `no-await-in-loop` stays off.

## Stack and conventions
- Node 24 LTS (`.nvmrc`). Don't move to Node 26 until it becomes LTS (late Oct 2026).
- **ESM project** (`"type": "module"`, `nodenext`): relative imports must end in `.js`, e.g. `import { X } from './x.js'`.
- **Injected dependencies are named after their type** in lowerCamelCase: `private readonly companiesService: CompaniesService`, `companyRepository: CompanyRepository`, `configService: ConfigService`, `tokenCipher: TokenCipher`, `commandBus: CommandBus`. Inside a repository class the TypeORM repository follows the same rule: `Repository<Company>` is `companyRepository`. Never shorten to `companies`, `config`, `repo` or `activity`.
- **Value sets are enums** in each module's `dto/<module>.enums.ts` (frontend mirror: `frontend/src/api/enums.ts`); code names members, never raw strings. Follow `.claude/skills/value-sets/SKILL.md`.
- **Declarations live in `dto/`**: interfaces and types in `dto/<module>.types.ts`, constants (CSV headers, label tables, field lists, page sizes) in `dto/<module>.constants.ts`, file names as enums. Follow `.claude/skills/module-dto/SKILL.md`.
- TypeORM **1.x**, not 0.3. Check APIs against `node_modules/typeorm` if unsure.
  - `synchronize: false`. Every schema change needs a migration, registered in `src/database/migrations/index.ts` with a spec beside it (details in `backend/src/database/CLAUDE.md`).
  - Entities are listed in `src/config/typeorm.config.ts`.
  - **Queries live in repositories**, never in services, jobs or handlers: each entity has an `@Injectable()` `<Entity>Repository` in `<module>/repositories/` that wraps the TypeORM `Repository<T>` and exposes named methods (`findOwned`, `page`, `softDeleteOfCompany`, ...). The global `RepositoriesModule` (`src/database/repositories.module.ts`) registers the entities with `forFeature` and provides every repository, so add new ones there. Postgres advisory locks go through `AdvisoryLockRepository.runExclusive()`. A service that needs a transaction opens it with `DataSource.transaction()` and passes the `EntityManager` to repository methods (`softDeleteOfCompany(manager, id)`).
  - Entities use plain FK id columns (`accountantId`, `companyId`, …) instead of relation decorators. This avoids ESM circular-import problems.
  - Columns are snake_case in the DB (`@Column({ name: 'created_at' })`) and camelCase in TS. Timestamps are `timestamptz`.
  - **Soft delete:** `accountants`, `companies`, `invoices`, `efactura_uploads`, `efactura_invoices` and `spv_messages` have a `@DeleteDateColumn` (`deleted_at`), so `find*` and query builders skip deleted rows by themselves; raw SQL on these tables must add `deleted_at IS NULL`.
- The database is Supabase Postgres, reached through `DATABASE_URL` (Session pooler, SSL with `rejectUnauthorized: false`). Supabase Auth is **not** used.
- Env vars are validated with Joi in `src/config/env.validation.ts`. When you add a var, update the schema, the `Env` interface and `.env.example`.
- Test helpers go in `src/testing/`, which is excluded from the build. Spec files sit next to their sources (`*.spec.ts`). Existing helpers: `fake-anaf-jwt.ts` (ANAF-shaped tokens), `paramPipes()` (asserts a route param carries its `Parse*Pipe`), `buildInvoiceServices()` and `invoice-fixtures.ts`, `anaf-tva-record.ts`, `caen-csv.ts`.
- Package-manager scaffolding comes from `@nestjs/cli@12`. Keep the TypeScript version the scaffold picked (6.x). Don't force TS 7.

## Two separate auth systems (don't mix them)
1. **The SPVDirect session**: email and password, a JWT in the httpOnly cookie `spv_session`, optional two-step verification. Internals in `backend/src/auth/CLAUDE.md`.
   - Accountant-scoped routes live under `/accountants/:accountantId/...` so the accountant shows up in URLs and logs. Protect them with `@UseGuards(JwtAuthGuard, AccountantParamGuard)` and read the id with `@Param('accountantId', ParseIdPipe)`. `AccountantParamGuard` returns 403 unless the URL accountant is the session accountant.
   - Only `/auth/me` reads the id from the session (`@CurrentAccountantId()`); the frontend needs it to build URLs.
   - `SessionCookieService` is the only place that sets or clears the session cookies.
2. **ANAF connections**: OAuth 2.0 grants from ANAF, one per certificate per accountant, tokens encrypted with `TokenCipher`. Rules in `backend/src/anaf/CLAUDE.md`.
   - Every call to api.anaf.ro (e-Factura, e-Transport, anything new) goes through `AnafApiService.request()`, never axios directly.
   - **Never log** authorization codes, tokens or Authorization headers.

## API hardening
- `src/app.setup.ts` (`configureApp`) holds the HTTP security setup shared by `main.ts` and the e2e tests: Helmet, `Cache-Control: no-store` by default, the global `ValidationPipe` (whitelist, forbid unknown fields), CORS limited to `FRONTEND_URL` with credentials.
- `ThrottlerGuard` is global (120/min per IP). Every route gets a tighter `@Throttle(...)` from `common/constants.ts` when it calls ANAF, sends email, takes credentials or accepts a guessable token (`PUBLIC_LINK_THROTTLE` on registration and authorization links and the OAuth callback).
- Public routes are `/health`, `/public/stats`, `/auth/register|login|login/mfa|login/mfa/email|logout`, `/auth/registrations/:token/*`, `/anaf/authorize/:token[/start]` and `/anaf/callback`. Everything else needs `JwtAuthGuard` (+ `AccountantParamGuard` under `/accountants/:accountantId`). Link tokens in public paths go through `ParseLinkTokenPipe` (32-byte base64url).
- Queries use TypeORM parameters only. Never build SQL from request input.
- Request input is validated before the handler runs, never by hand in a controller: query strings and bodies with DTOs (class-validator), path params with a `Parse*Pipe` (`ParseIdPipe`, `ParseCuiPipe`, `ParseAnafIdPipe`, ...) kept next to the DTOs. A DTO does not fit a single path param: `@Param()` validates the whole params object, and `forbidNonWhitelisted` would reject `accountantId`.
- Every file response goes through `attachment()` (`common/download-file.ts`) and every HTML page through `renderPage`/`sendHtmlPage` (`common/html.ts`).

## Logging and privacy
- Use `new Logger(X.name)` (Winston underneath). In production every line is redacted; when you add a log field or activity detail that holds a person's name or contact, add its key to `REDACTED_LOG_KEYS`.
- Every outbound call is logged with `trackApiCall()`, every email goes through `MailService`, and every user operation that changes data records an activity entry after it succeeds (`ActivityLogsService.record()`; a failed write never fails the operation). Reads, page loads, file downloads, account deletion and `removeAll` record nothing. Scheduled jobs log their runs with `ActivityLogsService.recordJob()`. Details in `backend/src/api-logs/CLAUDE.md`.
- Tokens, codes and approval links never go into logs or email subjects.

## Roadmap
- Phase 2: e-Factura is done (upload, state, messages, download, validator); e-Transport is next, built on AnafApiService.
- Frontend data: hooks live in `frontend/src/api/hooks/<feature>.ts`; logging in and any 401 drop the cached account data (`removeAccountData`).
- Phase 3: React frontend in `frontend/` (built: landing/auth, dashboard, companies, certificates, SPV, invoices, e-Factura, profile; e-Transport waits for its Phase 2 backend). The backend expects it at `FRONTEND_URL` (default `http://localhost:5173`) and redirects to `/accountants/:accountantId/connections?status=ok|error`. Every app page lives under `/accountants/:accountantId/`; other paths redirect there for the signed-in accountant.
- Phase 4: background token refresh and expiry notifications, plus rate limiting for ANAF calls.
- Phase 5: Azure deployment and CI/CD (CI is in `.github/workflows/`; deployment is next).

## Working notes
- Work on feature branches (`feat/...`, `fix/...`) and merge into `main` through GitHub PRs.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for kondrei/SPVDirect (via `gh`).

### Triage labels

Default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix.

### Domain docs

Single-context: one root `CONTEXT.md` plus `docs/adr/` (ADRs 0001–0003 so far). `CONTEXT.md` does not exist yet; create it (with the `domain-modeling` skill) the first time a term needs recording; record each new decision as the next ADR in `docs/adr/`.
