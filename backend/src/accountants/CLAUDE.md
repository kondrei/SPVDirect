# accountants: profile, account export and deletion

- The accountant's own profile (`GET|PATCH profile`), their firm looked up from ANAF by CUI (`profile/firm-lookup/:cui`), and `POST password` (re-issues the session cookie through `SessionCookieService`).

## Export and deletion (`deletion/`)
- `AccountDeletionModule` imports `CompanyDeletionModule` and reuses `CompanyExportService.writeCompany`/`writeSpv`/`stream`.
- `GET export` streams the whole account as a ZIP (certificates without tokens).
- `DELETE /accountants/:accountantId` needs the password (`DeleteAccountDto`, `PASSWORD_THROTTLE`), soft-deletes the account, companies, invoices, uploads and SPV messages in one transaction, deletes authorization links, then revokes and removes every ANAF connection (best-effort), and clears the cookie.
- The account also gets `status = 'deleted'` (allowed by `accountants_status_check`), so the row never looks active; `validateLogin` answers a `deleted` status like an unknown email.
- `accountants` has a `@DeleteDateColumn`, so login, `JwtAuthGuard` and registration no longer see the account; the email unique (`accountants_email_key`) is a partial index over live rows, so the email can register again.
- Deleted accounts are purged after 30 days by `PurgeJob` (see `src/companies/CLAUDE.md`).
