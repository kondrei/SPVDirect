# api-logs: outbound-call audit, activity log, slow SQL, job runs

`api_logs` holds both the outbound calls (`trackApiCall()`) and the **activity log** shown on Panou. The two writers are `ApiLogsService.record()` and `ActivityLogsService`; anything else that inserts into `api_logs` must go through them. `ApiLogStream` writes every `api_logs` row (outbound calls, emails, activity, job runs) to the app log with the context `ApiLog`, before the insert, so a row still reaches the log when the database write fails (a row with an `error` is a `warn`).

## Activity log
- `ActivityLogsService.record()` writes a row with `service` `ACTIVITY`, `method` `LOG`, the `ActivityAction` in `endpoint`, a Romanian `description` and a `details` jsonb (no response time).
- The accountant name is never stored: `GET /accountants/:accountantId/activity` joins it from `accountants`.
- Each service records its own operation after it succeeds, with an entry built in `activity-entries.ts`; a failed write is only logged and never fails the operation.
- Page loads and plain reads are not logged; downloads of invoice PDF/XML and saved SPV PDFs are not either. Account deletion and `removeAll` record nothing.
- `PurgeJob` deletes a purged company's activity rows (their descriptions carry the name and CUI); the account's rows go with the `accountants` row (FK cascade). The account export adds `activitate.csv`.

## Scheduled jobs
- `PurgeJob`, `AdminApprovalRetryJob`, `EfacturaArchiveSyncJob`, `SpvSyncJob` log every run through `ActivityLogsService.recordJob()`: one `ACTIVITY` row with `accountant_id` NULL, `endpoint` `job.completed` (counts in `details`, item failures counted as `failed`) or `job.failed` (message, cut to `MAX_JOB_ERROR_LENGTH`, in `error`), and the `ScheduledJob` in `details.job`.
- A run skipped because the feature is off or another instance holds the advisory lock logs nothing.
- These rows never show on Panou or in an export (their counts and errors span every account).
- What a job did for one accountant goes in a separate row under that accountant, with `details.job` set, so `GET activity` names `SYSTEM_ACTOR_NAME` instead of the accountant: `EfacturaArchiveSyncJob` writes `efactura.archive_imported` (`automatic: true`) and `efactura.archive_sync_failed` (only an `HttpException` message, otherwise `UNEXPECTED_JOB_ERROR`), and `PurgeJob` writes `company.purged` per accountant with a count only (no name or CUI, since the purge erases those) before it purges accounts.
- Cron schedules, `CRON_OPTIONS` (Europe/Bucharest) and the advisory lock keys live in `src/common/constants.ts`.

## Slow SQL (`slow-query-logger.ts`)
- `SlowQueryLogger` is the app DataSource's TypeORM logger when `DB_SLOW_QUERY_MS` > 0 (default 1000; the migration CLI never gets it). It runs outside Nest DI, the one exception to "queries live in repositories".
- A query over the threshold is logged as `warn` (context `ApiLog`) and saved to `api_logs` with `service` `DB`, `method` `QUERY`, the query text (whitespace collapsed, cut to `MAX_SLOW_QUERY_LENGTH`) in `endpoint` and the time in `response_time_ms`.
- The parameters are **never** logged or saved (they can be password hashes or encrypted tokens), which is why its TypeORM options are only `['warn']`: `'error'` would turn on `logQueryError`, which prints them.
- The row is inserted through a fresh connection, fire-and-forget, never through the slow query's own runner (it may be inside a transaction that rolls back). A slow insert into `api_logs` is only logged, never saved (no feedback loop), and at most `SLOW_QUERY_SAVE_LIMIT` rows are saved per minute per instance.
