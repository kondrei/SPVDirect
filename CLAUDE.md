# CLAUDE.md

SPVDirect is an accountant portal for ANAF SPV services (e-Factura, e-Transport). The UI is in Romanian, and user-facing error messages in the backend are in Romanian too. See README.md for the product overview and the API table.

## Layout
- `backend/`: NestJS 12 API. Phase 1 is done: accounts, ANAF OAuth, schema.
- `frontend/`: React app, not created yet (Phase 3). Plain folders, no npm workspaces.

## Commands (run in `backend/`)
- `npm run dev`: dev server on :3000. Needs `backend/.env` (copy from `.env.example`).
- `npm test`: unit tests (Vitest). `npm run test:e2e`: HTTP smoke test that needs no DB.
- `npm run lint` (oxlint, type-aware) · `npm run format` (prettier) · `npm run build`
- `npm run migration:run | migration:revert | migration:show | migration:generate -- src/database/migrations/<Name>`
  - These build first, then run the TypeORM CLI against `dist/database/data-source.js`.

## MANDATORY workflow after every code change
This rule always applies:
1. **Code review first.** Review the whole diff for correctness, security, ANAF rules and conventions, and fix the findings. Follow `.claude/skills/review-and-test/SKILL.md`.
2. **Then unit tests.** Add or update `*.spec.ts` for every changed behaviour, then run `npm test`, `npm run lint` and `npm run build` in `backend/` until all of them pass.
3. **Only then** report the work as done or commit. Include the review findings and the test results in the report.

A Stop hook (`.claude/settings.json` → `.claude/hooks/verify-backend.sh`) blocks finishing while tests or lint fail and backend code has uncommitted changes.

## Stack and conventions
- Node 24 LTS (`.nvmrc`). Don't move to Node 26 until it becomes LTS (late Oct 2026).
- **ESM project** (`"type": "module"`, `nodenext`): relative imports must end in `.js`, e.g. `import { X } from './x.js'`.
- TypeORM **1.x**, not 0.3. Check APIs against `node_modules/typeorm` if unsure.
  - `synchronize: false`. Every schema change needs a migration.
  - Migrations are listed explicitly in `src/database/migrations/index.ts`, not globbed. **Add each new migration class there.**
  - Entities are listed in `src/config/typeorm.config.ts`.
  - Entities use plain FK id columns (`accountantId`, `companyId`, …) instead of relation decorators. This avoids ESM circular-import problems. The FK constraints live in the migrations.
  - Columns are snake_case in the DB (`@Column({ name: 'created_at' })`) and camelCase in TS. Timestamps are `timestamptz`.
- The database is Supabase Postgres, reached through `DATABASE_URL` (Session pooler, SSL with `rejectUnauthorized: false`). Supabase Auth is **not** used.
- Env vars are validated with Joi in `src/config/env.validation.ts`. When you add a var, update the schema, the `Env` interface and `.env.example`.
- Test helpers go in `src/testing/`, which is excluded from the build. Spec files sit next to their sources (`*.spec.ts`).
- Package-manager scaffolding comes from `@nestjs/cli@12`. Keep the TypeScript version the scaffold picked (6.x). Don't force TS 7.

## Two separate auth systems (don't mix them)
1. **The SPVDirect session.** Email and password, hashed with scrypt (`common/crypto/password.ts`). A JWT signed with `JWT_SECRET` goes into the httpOnly cookie `spv_session`.
   - Protect routes with `@UseGuards(JwtAuthGuard)`.
   - Get the current accountant's id with `@CurrentAccountantId()`.
2. **ANAF connections.** These are OAuth 2.0 grants from ANAF. The access and refresh tokens ANAF issues are JWTs signed by ANAF, and we only decode them.
   - One `anaf_connections` row per certificate per accountant, unique on `cert_serial`.
   - Tokens are AES-256-GCM encrypted with `TOKEN_ENCRYPTION_KEY` (`TokenCipher`). The token columns are `select: false`.

## ANAF OAuth rules (source: ANAF PDF "Oauth_procedura_inregistrare_aplicatii_portal_ANAF")
- Authorize: `logincert.anaf.ro/anaf-oauth2/v1/authorize?response_type=code&client_id&redirect_uri&token_content_type=jwt&state`. Send **no scope**.
- Token and refresh: `POST .../v1/token`, x-www-form-urlencoded.
  - Client credentials go in an **HTTP Basic header**, never in the body.
  - Include `token_content_type=jwt` in the body.
- A refresh returns a new access token **and** a new refresh token. Save both.
- Revoke: `POST .../v1/revoke` (RFC 7009: `token`, `token_type_hint`, Basic auth). `DELETE /anaf/connections/:id` revokes both tokens (best-effort), then deletes the row.
- Read expiry from the JWT `exp` claim (docs say 90 days for access, 365 for refresh; don't hard-code).
- Use the JWT claims `serial` (certificate serial) and `role` (e.g. `HELLO,EFACTURA,ETRANSPORT`).
- The token endpoint has a 60 s cooldown. `AnafOAuthService` serializes refreshes per connection and remembers every token call (success or failure).
- api.anaf.ro: 1000 requests per minute, 403 when unauthorized, 429 when rate limited. A 200 response can still carry a business error in the body.
- Paths: e-Factura and e-Transport use `/{ANAF_ENV}/...` (`test` or `prod`); call `AnafApiService.envPath()`. TestOAuth is `/TestOauth/jaxrs/hello` with no prefix.
- The redirect URI must match the Callback URL registered at ANAF byte for byte (`https://localhost:3000/anaf/callback` in dev; `npm run cert:dev` makes the local certificate, and `HTTPS_KEY_FILE`/`HTTPS_CERT_FILE` turn on HTTPS).
- **Never log** authorization codes, tokens or Authorization headers.
- The USB token or cloud certificate is only used in the browser during logincert. After that, the stored tokens are enough.

## Key code paths
- `src/anaf/anaf-oauth.service.ts`: authorize URL, code exchange, refresh, `getAccessToken()`.
- `src/anaf/anaf-api.service.ts`: **the single gateway to api.anaf.ro**. It handles the ownership check, retry after a refresh on 401/403, and `api_logs` auditing. New ANAF features (e-Factura, e-Transport) must call `AnafApiService.request()`, never axios directly.
- `src/anaf/anaf-oauth.controller.ts`: `/anaf/connect` (self), `/anaf/authorize/:token[/start]` (public authorization-link pages), `/anaf/callback`.
  - A signed short-lived cookie `spv_anaf_oauth` carries the OAuth state and the mode (`self` or `link`).
- `src/anaf/authorization-links/`: one-time links (7 days) that let a company's certificate holder authorize for an accountant. Only the SHA-256 hash of the link token is stored.
- `src/companies/`: client CUIs, stored as digits without `RO`. `anafConnectionId` says which certificate to use for that company.

## Roadmap
- Phase 2: e-Factura (upload, stareMesaj, listaMesajeFactura, descarcare) and e-Transport modules, built on AnafApiService.
- Phase 3: React frontend in `frontend/`. The backend expects it at `FRONTEND_URL` (default `http://localhost:5173`) and redirects to `/connections?status=ok|error`.
- Phase 4: background token refresh and expiry notifications, plus rate limiting for ANAF calls.
- Phase 5: Azure deployment and CI/CD.

## Working notes
- Git identity is configured (Andrei). The Phase 1 backend is in the "Initial commit" on `main`.
- Work on feature branches. `main` is the base branch.
