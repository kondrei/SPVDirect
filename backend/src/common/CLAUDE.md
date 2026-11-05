# common: mail, storage, logging and shared helpers

## Mail (`mail/`)
- `MailService` (nodemailer, SMTP) is the only sender: `send(message, { kind, accountantId, companyId })` writes every attempt to `api_logs` (`service` `SMTP`, `method` `SEND`, the `MailKind` from `common/dto/common.enums.ts` in `endpoint`, `status_code` = SMTP reply code, the error on failure, and `details` with `to`, `subject`, `replyTo` and the attachment file names).
- The body is never logged, since it can carry approval links; keep tokens out of subjects.
- `PurgeJob` deletes a purged company's `SMTP` rows with its activity rows.

## Storage (`storage/supabase-storage.ts`)
The one Supabase Storage client. `SpvFileStore` (`SUPABASE_SPV_BUCKET`) and `InvoiceFileStore` (`SUPABASE_INVOICE_BUCKET`) wrap it with their own path layout.

## Logging (`logging/`)
- The app logger is Winston (`app-logger.ts`, through `nest-winston`; level from `LOG_LEVEL`): JSON lines on stdout in production, which AWS forwards to CloudWatch Logs, and Nest-style lines with inline JSON fields in development. Keep using `new Logger(X.name)`.
- `configureApp` adds `requestLog` (`request-log.ts`), which logs every HTTP request once it closes, success or error, under the context `Http`: method, the route **pattern** (never the raw URL or query, so link tokens and the OAuth `code` stay out), status, time, the accountant from `/accountants/:id`, and the error message captured by `ErrorCaptureFilter` (a global filter that only records it and lets Nest answer). 5xx is `error`, 4xx and aborted are `warn`, `/health` is `debug`.
- In production the `redact` format (`redact.ts`) runs on every line: it drops `description`, replaces the `REDACTED_LOG_KEYS` (email fields, subject, attachment names, company, buyer and certificate names) with `[redacted]` at any depth, and masks emails, CNPs and JWTs in every remaining string (`LOG_TEXT_MASKS` in `common/constants.ts`). It copies nested objects, so the row saved to `api_logs` is never changed. CUIs and ids stay so a line can be traced to its row.

## Shared helpers
`html.ts` (`renderPage`, `sendHtmlPage`), `download-file.ts` (`attachment()` for every file response), `environment.ts` (`isProduction`), and `src/api-logs/track-api-call.ts` (`trackApiCall()` for every logged outbound call).
