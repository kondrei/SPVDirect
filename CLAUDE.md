# CLAUDE.md

SPVDirect is an accountant portal for ANAF SPV services (e-Factura, e-Transport). The UI is in Romanian, and user-facing error messages in the backend are in Romanian too. See README.md for the product overview and the API table.

## Layout
- `backend/`: NestJS 12 API. Phase 1 is done: accounts, ANAF OAuth, schema.
- `frontend/`: React 19 + Vite app (Phase 3 in progress): landing with login/register, dashboard, companies, ANAF certificates, SPV archive and document requests (no sync), invoices, e-Factura, profile; e-Transport is a placeholder. See `frontend/README.md`. Plain folders, no npm workspaces.
- `postman/`: the SPVDirect API collection (happy paths plus 400/401/403/404 cases). Update it when you add or change a route.

## Commands (run in `backend/`)
- `npm run dev`: dev server on :3000. Needs `backend/.env` (copy from `.env.example`).
- `npm test`: unit tests (Vitest). `npm run test:e2e`: HTTP smoke test that needs no DB.
- `npm run lint` (oxlint, type-aware) · `npm run lint:sonar` (ESLint with SonarJS, the rules SonarQube for IDE reports) · `npm run format` (prettier) · `npm run build`
- `npm run migration:run | migration:revert | migration:show | migration:generate -- src/database/migrations/<Name>`
  - These build first, then run the TypeORM CLI against `dist/database/data-source.js`.

## Commands (run in `frontend/`)
- `npm run dev`: http://localhost:5173. It proxies `/api/*` to the backend at https://localhost:3000, so start the backend first.
- `npm test` (Vitest + Testing Library, no backend needed) · `npm run typecheck` · `npm run lint` · `npm run lint:sonar` · `npm run build`
- Frontend conventions: design-system tokens only (`src/styles/tokens.css`), `StatusBadge` for every status, Romanian copy. Details in `frontend/README.md`.

## MANDATORY workflow after every code change
This rule always applies:
1. **Code review first.** Review the whole diff for correctness, security, ANAF rules and conventions, and fix the findings. Follow `.claude/skills/review-and-test/SKILL.md`.
2. **Then unit tests.** Add or update `*.spec.ts` for every changed behaviour, then run `npm test`, `npm run lint`, `npm run lint:sonar` and `npm run build` in `backend/` until all of them pass. When `frontend/` changed, add or update its `*.test.ts(x)` and run `npm test`, `npm run typecheck`, `npm run lint` and `npm run lint:sonar` there too.
3. **Only then** report the work as done or commit. Include the review findings and the test results in the report.

A Stop hook (`.claude/settings.json` → `.claude/hooks/verify-changes.sh`) blocks finishing while checks fail on uncommitted changes: backend tests, `npm run lint` in both packages, and the SonarJS lint on the changed files.

Sonar rules live in two places: the SonarJS rules that need type information in each package's `eslint.config.mjs`, and the ones oxlint has natively (unicorn, `import/no-duplicates`) in `.oxlintrc.json`. Don't silence a Sonar finding by making intentionally sequential code parallel: an `await` inside a loop is often deliberate here (ANAF rate limits, one `QueryRunner` per migration, ZIP streaming), so `no-await-in-loop` stays off.

## Stack and conventions
- Node 24 LTS (`.nvmrc`). Don't move to Node 26 until it becomes LTS (late Oct 2026).
- **ESM project** (`"type": "module"`, `nodenext`): relative imports must end in `.js`, e.g. `import { X } from './x.js'`.
- **Value sets are enums** in each module's `dto/<module>.enums.ts` (frontend mirror: `frontend/src/api/enums.ts`); code names members, never raw strings. Follow `.claude/skills/value-sets/SKILL.md`.
- **Declarations live in `dto/`**: interfaces and types in `dto/<module>.types.ts`, constants (CSV headers, label tables, field lists, page sizes) in `dto/<module>.constants.ts`, file names as enums. Follow `.claude/skills/module-dto/SKILL.md`.
- TypeORM **1.x**, not 0.3. Check APIs against `node_modules/typeorm` if unsure.
  - `synchronize: false`. Every schema change needs a migration.
  - Migrations are listed explicitly in `src/database/migrations/index.ts`, not globbed. **Add each new migration class there.**
  - Every migration has a `<timestamp>-<Name>.spec.ts` beside it that runs `up` and `down` against a mocked `QueryRunner` and checks the tables, columns and indexes it touches.
  - Entities are listed in `src/config/typeorm.config.ts`.
  - Entities use plain FK id columns (`accountantId`, `companyId`, …) instead of relation decorators. This avoids ESM circular-import problems. The FK constraints live in the migrations.
  - Columns are snake_case in the DB (`@Column({ name: 'created_at' })`) and camelCase in TS. Timestamps are `timestamptz`.
- The database is Supabase Postgres, reached through `DATABASE_URL` (Session pooler, SSL with `rejectUnauthorized: false`). Supabase Auth is **not** used.
- Env vars are validated with Joi in `src/config/env.validation.ts`. When you add a var, update the schema, the `Env` interface and `.env.example`.
- Test helpers go in `src/testing/`, which is excluded from the build. Spec files sit next to their sources (`*.spec.ts`). Existing helpers: `fake-anaf-jwt.ts` (ANAF-shaped tokens), `paramPipes()` (asserts a route param carries its `Parse*Pipe`), `buildInvoiceServices()` and `invoice-fixtures.ts`, `anaf-tva-record.ts`, `caen-csv.ts`.
- Package-manager scaffolding comes from `@nestjs/cli@12`. Keep the TypeScript version the scaffold picked (6.x). Don't force TS 7.

## Two separate auth systems (don't mix them)
1. **The SPVDirect session.** Email and password, hashed with scrypt (`common/crypto/password.ts`). A JWT signed with `JWT_SECRET` goes into the httpOnly cookie `spv_session`.
   - Accountant ids are integers (identity, from 1). The JWT `sub` is the id as a string; `JwtAuthGuard` rejects anything else (old UUID sessions get 401).
   - Accountant-scoped routes live under `/accountants/:accountantId/...` so the accountant shows up in URLs and logs. Protect them with `@UseGuards(JwtAuthGuard, AccountantParamGuard)` and read the id with `@Param('accountantId', ParseIdPipe)`. `AccountantParamGuard` returns 403 unless the URL accountant is the session accountant.
   - Only `/auth/me` reads the id from the session (`@CurrentAccountantId()`); the frontend needs it to build URLs.
   - `JwtAuthGuard` also checks the database on every request: the accountant must still exist, be `active`, and the token's `iat` must not be older than `password_changed_at`. A password change re-issues the current cookie, so only other sessions end.
   - Registration needs a reCAPTCHA v3 token (`RecaptchaService`, action `register`) and creates a `pending` accountant with no session. It goes through `@nestjs/cqrs`: `RegisterAccountantCommand` inserts the accountant in one transaction, then publishes `AccountantRegisteredEvent`. `AdminApprovalMailHandler` emails `ADMIN_EMAIL` approve/reject links and sets `admin_notified_at`. A failed email never undoes the registration; the request stays pending with `admin_notified_at` null. `AdminApprovalRetryJob` (`@nestjs/schedule`, daily at 08:00 Europe/Bucharest) runs `ResendAdminApprovalCommand` for those requests. The command swaps in a new token, guarded by the old hash so concurrent resends can't both send, and emails the admin again. Every email attempt goes through `RegistrationMailer` and is written to `api_logs` (`service` `SMTP`, `method` `SEND`, `endpoint` `admin-approval` | `approval-notice`, `status_code` = SMTP reply code). Tokens never go into logs. The GET link shows a confirmation page and a POST acts, so mail scanners that prefetch links can't approve or ban anyone. Reject deletes the request and adds the email to `banned_emails`. Login answers 403 while pending. Mail goes through `MailService` (nodemailer, SMTP).
2. **ANAF connections.** These are OAuth 2.0 grants from ANAF. The access and refresh tokens ANAF issues are JWTs signed by ANAF, and we only decode them.
   - One `anaf_connections` row per certificate per accountant, unique on (`accountant_id`, `cert_serial`).
   - Tokens are AES-256-GCM encrypted with `TOKEN_ENCRYPTION_KEY` (`TokenCipher`). The token columns are `select: false`.

## ANAF OAuth rules (source: ANAF PDF "Oauth_procedura_inregistrare_aplicatii_portal_ANAF")
- Authorize: `logincert.anaf.ro/anaf-oauth2/v1/authorize?response_type=code&client_id&redirect_uri&token_content_type=jwt&state`. Send **no scope**.
- Token and refresh: `POST .../v1/token`, x-www-form-urlencoded.
  - Client credentials go in an **HTTP Basic header**, never in the body.
  - Include `token_content_type=jwt` in the body.
- A refresh returns a new access token **and** a new refresh token. Save both.
- Revoke: `POST .../v1/revoke` (RFC 7009: `token`, `token_type_hint`, Basic auth). `DELETE /accountants/:accountantId/anaf/connections/:id` revokes both tokens (best-effort), then deletes the row.
- Read expiry from the JWT `exp` claim (docs say 90 days for access, 365 for refresh; don't hard-code). The refresh token ANAF actually issues is opaque (not a JWT), so it is the one exception: see `AnafTokenClient`.
- Use the JWT claims `serial` (certificate serial) and `role` (e.g. `HELLO,EFACTURA,ETRANSPORT`).
- The token endpoint has a 60 s cooldown. `AnafOAuthService` serializes refreshes per connection and remembers every token call (success or failure): refreshes, the code exchange (through `saveConnection`) and revokes.
- `AnafTokenClient` speaks the token protocol (authorize URL, code exchange, refresh, revoke) and reads expiry from the JWT `exp`. The access token may fall back to the response `expires_in` and is rejected without either. An opaque refresh token gets ANAF's documented 365 days from issue; when a refresh returns no new refresh token, the stored expiry is kept. Its `AnafTokenError` is a 503 with a Romanian message; the technical `detail` only goes to logs.
- `AnafApiService` refreshes the token once after a 401. After a 403 it refreshes too, unless a fresh token got a 403 on that connection within the last hour (then it is a missing SPV right, not a stale token).
- The cooldown, the refresh serialization and the 403 memory live on the `anaf_connections` row, so they hold across instances: `token_call_at` (last token call), `refresh_started_at` (a refresh lease, claimed with one conditional UPDATE that also checks the cooldown; it expires after 90 s if an instance dies) and `denied_with_fresh_token_at`. An instance that loses the claim waits for the lease holder and uses its new token. Only same-process callers share one in-memory promise.
- api.anaf.ro: 1000 requests per minute, 403 when unauthorized, 429 when rate limited. A 200 response can still carry a business error in the body.
- Paths: e-Factura and e-Transport use `/{ANAF_ENV}/...` (`test` or `prod`); call `AnafApiService.envPath()`. TestOAuth is `/TestOauth/jaxrs/hello` with no prefix.
- The redirect URI must match the Callback URL registered at ANAF byte for byte (`https://localhost:3000/anaf/callback` in dev; `npm run cert:dev` makes the local certificate, and `HTTPS_KEY_FILE`/`HTTPS_CERT_FILE` turn on HTTPS).
- **Never log** authorization codes, tokens or Authorization headers.
- The USB token or cloud certificate is only used in the browser during logincert. After that, the stored tokens are enough.

## API hardening
- `src/app.setup.ts` (`configureApp`) holds the HTTP security setup shared by `main.ts` and the e2e tests: Helmet, `Cache-Control: no-store` by default, the global `ValidationPipe` (whitelist, forbid unknown fields), CORS limited to `FRONTEND_URL` with credentials.
- `ThrottlerGuard` is global (120/min per IP). Every route gets a tighter `@Throttle(...)` from `common/constants.ts` when it calls ANAF, sends email, takes credentials or accepts a guessable token (`PUBLIC_LINK_THROTTLE` on registration and authorization links and the OAuth callback).
- Public routes are `/health`, `/public/stats`, `/auth/register|login|logout`, `/auth/registrations/:token/*`, `/anaf/authorize/:token[/start]` and `/anaf/callback`. Everything else needs `JwtAuthGuard` (+ `AccountantParamGuard` under `/accountants/:accountantId`). Link tokens in public paths go through `ParseLinkTokenPipe` (32-byte base64url).
- `SessionCookieService` is the only place that sets or clears `spv_session`. Shared helpers: `common/html.ts` (`renderPage`, `sendHtmlPage`), `common/download-file.ts` (`attachment()` for every file response), `api-logs/track-api-call.ts` (`trackApiCall()` for every logged outbound call), `common/environment.ts` (`isProduction`).
- Queries use TypeORM parameters only. Never build SQL from request input.
- Request input is validated before the handler runs, never by hand in a controller: query strings and bodies with DTOs (class-validator), path params with a `Parse*Pipe` (`ParseIdPipe`, `ParseCuiPipe`, `ParseAnafIdPipe`, ...) kept next to the DTOs. A DTO does not fit a single path param: `@Param()` validates the whole params object, and `forbidNonWhitelisted` would reject `accountantId`.
- `/public/stats` (`src/public-stats/`) returns aggregate counts only, never rows or names. It is cached in memory for at most 5 minutes; `PublicStatsSubscriber` (a TypeORM subscriber) clears the cache after a committed insert or delete on a counted table, or an update to `accountants`/`efactura_uploads` (whose status is counted). Concurrent misses share one query batch, a load that started before an invalidation is never cached, and stale numbers are served if the database fails. Writes that bypass TypeORM (raw SQL, the Supabase console) show up when the 5 minutes run out.

## Key code paths
- `src/anaf/services/anaf-oauth.service.ts`: authorize URL, code exchange, refresh, `getAccessToken()`.
- `src/anaf/services/anaf-api.service.ts`: **the single gateway to api.anaf.ro**. It handles the ownership check, retry after a refresh on 401/403, and `api_logs` auditing. New ANAF features (e-Factura, e-Transport) must call `AnafApiService.request()`, never axios directly.
- `src/anaf/controllers/anaf-oauth.controller.ts`: `/accountants/:accountantId/anaf/connect` (self), `/anaf/authorize/:token[/start]` (public authorization-link pages), `/anaf/callback`. It only renders; `AnafAuthorizationService.complete()` exchanges the code and stores the connection.
  - A signed short-lived cookie `spv_anaf_oauth` carries the OAuth state and the mode (`self` or `link`). The callback rejects a missing or different `state`.
  - For a link, the link is claimed (`usedAt` set where it is null) before any token is stored, so a second holder racing on the same link stores nothing.
- `src/anaf/services/anaf-connections.service.ts`: list, rename, remove (revoke at ANAF) and test certificates; the controller holds no repository.
- `src/anaf/authorization-links/`: one-time links (7 days) that let a company's certificate holder authorize for an accountant. Only the SHA-256 hash of the link token is stored.
- `src/anaf/spv/`: the SPV inbox (`SpvService`, `webserviced.anaf.ro/SPVWS2/rest`, base URL `ANAF_SPV_ENDPOINT`, still through `AnafApiService.request()` with `baseUrl`): `listaMesaje`, `descarcare`, `cerere` (document requests). **SPVWS2 does not accept ANAF OAuth tokens** (F5 APM answers 200 with a logout HTML page; see `docs/adr/0001-no-spv-inbox-over-oauth.md`), so the UI shows the archive and the document-request form (kept on purpose, though `cerere` is expected to 502) but no sync, and `SpvSyncJob` is not registered in `AnafModule`. Messages come in through the browser instead: the accountant opens `listaMesaje` at ANAF with their certificate, pastes or uploads the JSON (`POST spv/archive/import`, parsed by `spv-import.ts`, saved with no `anaf_connection_id`; the reply also carries the list's certificate serial, ANAF's "Nu exista mesaje" notice and the CUIs from its `cui` field that are not companies yet, which the page links to `companies?add=1&cuis=`), opens each PDF at `descarcare?id=` and uploads it (`PUT spv/archive/:id/document`). CORS blocks reading SPVWS2 from our pages, so the browser can't fetch it for us. The code and routes stay for when ANAF exposes SPVWS2 on api.anaf.ro; an HTML reply becomes a 502 "ANAF a returnat o pagină HTML în loc de răspunsul SPV". Messages already saved stay in `spv_messages` with the PDF in the database or in Supabase Storage (`SPV_STORAGE`). Routes: `/accountants/:accountantId/anaf/connections/:connectionId/spv/{messages,messages/:id/download,sync,requests}` and `/accountants/:accountantId/spv/archive`.
- `src/api-logs/`: `api_logs` holds both the outbound calls (`trackApiCall()`) and the **activity log** shown on Panou. `ActivityLogsService.record()` writes a row with `service` `ACTIVITY`, `method` `LOG`, the `ActivityAction` in `endpoint`, a Romanian `description` and a `details` jsonb (no response time). The accountant name is never stored: `GET /accountants/:accountantId/activity` joins it from `accountants`. Each service records its own operation after it succeeds, with an entry built in `activity-entries.ts`; a failed write is only logged and never fails the operation. Page loads and plain reads are not logged; downloads of invoice PDF/XML and saved SPV PDFs are not either. Account deletion and `removeAll` record nothing. `PurgeJob` deletes a purged company's activity rows (their descriptions carry the name and CUI); the account's rows go with the `accountants` row (FK cascade). The account export adds `activitate.csv`.
- `src/open-data/`: public data.gov.ro datasets through `DataGovRoService` (CKAN search). `CaenService` (ONRC CAEN names, cached 24 h). Never bundle these datasets in the repo.
- `src/accountants/`: the accountant's own profile (`GET|PATCH profile`), their firm looked up from ANAF by CUI (`profile/firm-lookup/:cui`), and `POST password` (re-issues the session cookie through `SessionCookieService`).
  - Account export and deletion live in `src/accountants/deletion/` (`AccountDeletionModule`, which imports `CompanyDeletionModule` and reuses `CompanyExportService.writeCompany`/`writeSpv`/`stream`). `GET export` streams the whole account as a ZIP (certificates without tokens). `DELETE /accountants/:accountantId` needs the password (`DeleteAccountDto`, `PASSWORD_THROTTLE`), soft-deletes the account, companies, invoices, uploads and SPV messages in one transaction, deletes authorization links, then revokes and removes every ANAF connection (best-effort), and clears the cookie. The account also gets `status = 'deleted'` (allowed by `accountants_status_check`), so the row never looks active; `validateLogin` answers a `deleted` status like an unknown email. `accountants` has a `@DeleteDateColumn`, so login, `JwtAuthGuard` and registration no longer see the account; the email unique (`accountants_email_key`) is a partial index over live rows, so the email can register again.
- `src/companies/`: client CUIs, stored as digits without `RO`. `anafConnectionId` says which certificate to use for that company.
  - Linking a different certificate (`PATCH :id`) first asks ANAF through `AnafCompanyAccessService` (`listaMesajeFactura?zile=1&cif=`): "Nu exista mesaje" or a message list means the certificate has the SPV right; an `eroare` about "drept" or a 403 means it doesn't (400, nothing saved); anything unreadable fails closed. The gateway services (`AnafTokenClient`, `AnafOAuthService`, `AnafApiService`, `AnafCompanyAccessService`) live in `AnafGatewayModule`, so `CompaniesModule` can use them without importing `AnafModule`.
  - Company ids are integers (identity, from 1). Parse route ids with `ParseIdPipe`.
  - Deleting is a soft delete (`src/companies/deletion/`, its own `CompanyDeletionModule` because `InvoicesModule` and `AnafModule` import `CompaniesModule`). `companies`, `invoices`, `efactura_uploads` and `spv_messages` have a `@DeleteDateColumn` (`deleted_at`), so `find*` and query builders skip deleted rows by themselves; raw SQL on these tables must add `deleted_at IS NULL`. `DELETE :id` sets `deleted_at` on the company and all its rows in one transaction (SPV messages matched only by CIF get the `company_id` first), deletes its unused authorization links, and answers 409 while an upload is `sending`. The deletion, the e-Factura upload claim and invoice numbering all lock the live company row first (`company-lock.ts`), so none of them can slip in while the company is being deleted. The CUI and SPV message uniques are partial indexes over live rows. `GET :id/export` (`EXPORT_THROTTLE`) streams a ZIP (fflate) of the company's data; the company page always shows a download button and offers the export again before deleting. `PurgeJob` (1st of the month, 03:00 Europe/Bucharest) erases companies deleted more than 30 days ago, then accounts deleted more than 30 days ago (each company purged the same way, then the remaining SPV files, then the `accountants` row, whose FKs cascade): Storage files first (an SPV path a live row still uses is kept), then uploads, storno invoices, invoices, messages and the company in one transaction. A Storage failure leaves the rows for next month. Before the `accountants` row goes, any ANAF connection still left is revoked (`AnafConnectionsService.removeAll`, also used by account deletion, in parallel). The job holds a Postgres advisory lock (`PURGE_LOCK_KEY`), so only one instance purges. Why data is purged at all: `docs/adr/0002-deleted-data-is-purged-after-30-days.md`.
  - `POST companies/bulk` adds many CUIs at once (`ANAF_BULK_THROTTLE`); `POST :id/anaf-refresh` reloads the ANAF data (`AnafCompanyLookupService`, `ANAF_TVA_ENDPOINT`). The invoice logo is stored on the row (`PUT|GET|DELETE :id/logo`, multipart field `logo`, size cap in `company-logo.ts`).
- `src/common/storage/supabase-storage.ts`: the one Supabase Storage client. `SpvFileStore` (`SUPABASE_SPV_BUCKET`) and `InvoiceFileStore` (`SUPABASE_INVOICE_BUCKET`) wrap it with their own path layout.

- `src/invoices/`: fiscal invoices (Facturi), art. 319 Cod fiscal. Services: `InvoicesService` (list, stats, detail, create, UBL text), `InvoiceBuyersService` (buyer lookup and line suggestions), `InvoiceStornoService`, `InvoiceDeliveryService` (PDF/XML files, Storage, email, the follow-up after issuing) and `InvoiceNumbering` (one transaction per insert: next number, retried on a unique violation; the series continues after the invoices of deleted companies with the same CUI, and their numbers cannot be requested again). Seller = the `companies` row (IBAN, bank, email, phone, logo live there); buyer data is looked up from ANAF's VAT registry through `AnafCompanyLookupService` and editable before issuing.
  - Seller and buyer are snapshotted as jsonb on the invoice. Money is computed in integer cents: VAT per rate group (`invoice-calc.ts`). VAT rates depend on the delivery date (`vat-rates.ts`: 21/11/0 from 2025-08-01). A seller that is not a VAT payer gets category `O` and no VAT; rate 0 needs a reason (`E`, `Z`, `AE`); `vatOnCollection` prints "TVA la încasare".
  - `invoice-pdf.ts` (pdfkit, DejaVu Sans for ș/ț) and `invoice-xml.ts` (UBL 2.1 CIUS-RO, an invoice and a storno both pass ANAF's validator). Invoices are never deleted or edited; corrections are storno invoices (`invoice-storno.ts`): the same lines with negative quantities, `storno_of_*` columns pointing to the original, UBL type 380 with a `BillingReference`. Partial stornos are tracked per line (`stornoOfLine`) so a line can never be reversed past its quantity. A storno locks the original row (`SELECT … FOR UPDATE`) and reads the earlier stornos inside the same transaction, so two concurrent stornos cannot over-reverse it. VAT rounding is half away from zero so a storno mirrors the original to the cent.
  - Leaving the buyer CUI field calls `GET /accountants/:accountantId/invoices/buyers/:cui` (`findBuyer`): the buyer snapshot of the accountant's latest non-storno invoice to that CUI (index `idx_invoices_accountant_buyer_cui`) with VAT payer, inactive and e-Factura status refreshed from ANAF (best-effort: when ANAF fails, inactive and e-Factura are null, VAT payer stays from the snapshot and `anafChecked` is false so the editor marks the status as unverified), else the accountant's own company with that CUI, else ANAF (`source` says which). "Caută la ANAF" (`buyer-lookup/:cui`) always asks ANAF.
  - Lines stay jsonb on the invoice (an invoice is a frozen snapshot, read and written whole). `GET /accountants/:accountantId/invoices/line-suggestions?companyId&buyerCui` (`invoice-line-suggestions.ts`) returns the distinct lines (latest wins, per currency) from the last 50 non-storno invoices of that company to that buyer, served by the partial index `idx_invoices_company_buyer_cui`. The editor offers them under "Denumire" and fills the line. The VAT rate is kept only if it is still valid on the new delivery date.
  - Saving to Supabase Storage is per invoice and independent of `SPV_STORAGE` (`SupabaseStorage`, bucket `SUPABASE_INVOICE_BUCKET`). Email goes through `InvoiceMailer` (`api_logs` endpoint `invoice`); a failed email or upload is reported in the response and never undoes the invoice.

- `src/efactura/`: RO e-Factura web services (`/{ANAF_ENV}/FCTEL/rest/...` on api.anaf.ro, OAuth through `AnafApiService`): `upload` / `uploadb2c` (body is the raw XML as `text/plain`, query `standard` UBL|CN|CII|RASP, `cif`), `stareMesaj`, `listaMesajeFactura`, `listaMesajePaginatieFactura`, `descarcare` (a zip). Validation (`validare/FACT1|FCN`) and XML to PDF (`transformare/...`) are public (`ANAF_EFACTURA_VALIDATE_ENDPOINT`, prod only, no OAuth) and are logged in `api_logs` without a connection.
  - ANAF answers business results with HTTP 200 and an XML `<header>` (`ExecutionStatus`, `index_incarcare`, `Errors`; `stare` ok|nok|in prelucrare|XML cu erori...) or JSON `{eroare}`; 400 carries `{message}`. `AnafRequest.allowStatuses` lets a service read a 400 body instead of the gateway throwing. Parsers: `efactura-xml.ts`.
  - Every upload is a row in `efactura_uploads` (index, environment, status, `download_id`). The index belongs to the environment it was sent to, so refresh and download use the stored `environment`, not the current `ANAF_ENV`. A final status is never re-queried (ANAF limits: 100 status checks per message per day, 10 downloads per message per day).
  - An invoice is validated with ANAF's validator before upload (400 with `errors`; skipped when the validator is down) and cannot be sent twice while `sending`, `processing` or `ok`: `uploadInvoice` first inserts a `sending` row, guarded by the partial unique index `uq_efactura_uploads_invoice_active`, and deletes it if nothing reached ANAF. A `sending` row older than 5 minutes is marked `rejected` and taken over. Never put the bank name in the UBL (UBL-CR-429).
  - `EfacturaValidator` is the public validator and XML-to-PDF client (no OAuth); `EfacturaService` covers the calls that go through `AnafApiService`. `GET efactura/invoices/latest-uploads?ids=` gives the newest upload per invoice for the invoice list.

## Roadmap
- Phase 2: e-Factura is done (upload, state, messages, download, validator); e-Transport is next, built on AnafApiService. Not done for e-Factura: ANAF's signature validation service.
- Frontend data: hooks live in `frontend/src/api/hooks/<feature>.ts`; logging in and any 401 drop the cached account data (`removeAccountData`).
- Phase 3: React frontend in `frontend/` (built: landing/auth, dashboard, companies, certificates, SPV, invoices, e-Factura, profile; e-Transport waits for its Phase 2 backend). The backend expects it at `FRONTEND_URL` (default `http://localhost:5173`) and redirects to `/accountants/:accountantId/connections?status=ok|error`. Every app page lives under `/accountants/:accountantId/`; other paths redirect there for the signed-in accountant.
- Phase 4: background token refresh and expiry notifications, plus rate limiting for ANAF calls.
- Phase 5: Azure deployment and CI/CD.

## Working notes
- Work on feature branches (`feat/...`, `fix/...`) and merge into `main` through GitHub PRs.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for kondrei/SPVDirect (via `gh`).

### Triage labels

Default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix.

### Domain docs

Single-context: one root `CONTEXT.md` plus `docs/adr/`. Neither exists yet; create them (with the `domain-modeling` skill) the first time a term or decision needs recording.
