# companies: client CUIs, soft delete, export and purge

- Client CUIs, stored as digits without `RO`. `anafConnectionId` says which certificate to use for that company.
- Company ids are integers (identity, from 1). Parse route ids with `ParseIdPipe`.
- Linking a different certificate (`PATCH :id`) first asks ANAF through `AnafCompanyAccessService` (`listaMesajeFactura?zile=1&cif=`): "Nu exista mesaje" or a message list means the certificate has the SPV right; an `eroare` about "drept" or a 403 means it doesn't (400, nothing saved); anything unreadable fails closed. It comes from `AnafGatewayModule`, so `CompaniesModule` never imports `AnafModule`.
- `POST companies/bulk` adds many CUIs at once (`ANAF_BULK_THROTTLE`); `POST :id/anaf-refresh` reloads the ANAF data (`AnafCompanyLookupService`, `ANAF_TVA_ENDPOINT`). The invoice logo is stored on the row (`PUT|GET|DELETE :id/logo`, multipart field `logo`, size cap in `company-logo.ts`).

## Soft delete (`deletion/`)
- Its own `CompanyDeletionModule`, because `InvoicesModule` and `AnafModule` import `CompaniesModule`.
- `DELETE :id` sets `deleted_at` on the company and all its rows in one transaction (SPV messages matched only by CIF get the `company_id` first), deletes its unused authorization links, and answers 409 while an upload is `sending`.
- The deletion, the e-Factura upload claim and invoice numbering all lock the live company row first (`company-lock.ts`), so none of them can slip in while the company is being deleted.
- The CUI and SPV message uniques are partial indexes over live rows.

## Export
`GET :id/export` (`EXPORT_THROTTLE`) streams a ZIP (fflate) of the company's data; the company page always shows a download button and offers the export again before deleting.

## PurgeJob (`deletion/purge.job.ts`)
- 1st of the month, 03:00 Europe/Bucharest. Erases companies deleted more than 30 days ago, then accounts deleted more than 30 days ago (each company purged the same way, then the remaining SPV files, then the `accountants` row, whose FKs cascade).
- Per company: Storage files first (an SPV path a live row still uses is kept), then uploads, storno invoices, invoices, messages and the company in one transaction. A Storage failure leaves the rows for next month.
- Before the `accountants` row goes, any ANAF connection still left is revoked (`AnafConnectionsService.removeAll`, also used by account deletion, in parallel).
- The job holds a Postgres advisory lock (`PURGE_LOCK_KEY`), so only one instance purges.
- Why data is purged at all: `docs/adr/0002-deleted-data-is-purged-after-30-days.md`.
