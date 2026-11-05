# efactura: RO e-Factura web services and the e-Factura archive

## ANAF calls
- `/{ANAF_ENV}/FCTEL/rest/...` on api.anaf.ro, OAuth through `AnafApiService`: `upload` / `uploadb2c` (body is the raw XML as `text/plain`, query `standard` UBL|CN|CII|RASP, `cif`), `stareMesaj`, `listaMesajeFactura`, `listaMesajePaginatieFactura`, `descarcare` (a zip).
- Validation (`validare/FACT1|FCN`) and XML to PDF (`transformare/...`) are public (`ANAF_EFACTURA_VALIDATE_ENDPOINT`, prod only, no OAuth) and are logged in `api_logs` without a connection. `EfacturaValidator` is that client; `EfacturaService` covers the calls that go through `AnafApiService`.
- ANAF answers business results with HTTP 200 and an XML `<header>` (`ExecutionStatus`, `index_incarcare`, `Errors`; `stare` ok|nok|in prelucrare|XML cu erori...) or JSON `{eroare}`; 400 carries `{message}`. `AnafRequest.allowStatuses` lets a service read a 400 body instead of the gateway throwing. Parsers: `efactura-xml.ts`.

## Uploads (`efactura_uploads`)
- Every upload is a row (index, environment, status, `download_id`). The index belongs to the environment it was sent to, so refresh and download use the stored `environment`, not the current `ANAF_ENV`.
- A final status is never re-queried (ANAF limits: 100 status checks per message per day, 10 downloads per message per day).
- An invoice is validated with ANAF's validator before upload (400 with `errors`; skipped when the validator is down) and cannot be sent twice while `sending`, `processing` or `ok`: `uploadInvoice` first inserts a `sending` row, guarded by the partial unique index `uq_efactura_uploads_invoice_active`, and deletes it if nothing reached ANAF. A `sending` row older than 5 minutes is marked `rejected` and taken over.
- Never put the bank name in the UBL (UBL-CR-429).
- `GET efactura/invoices/latest-uploads?ids=` gives the newest upload per invoice for the invoice list.

## Archive (`efactura_invoices`, `EfacturaArchiveService`)
- Routes `efactura/companies/:companyId/messages/import[-period]` and `efactura/archive[/:id[/zip|xml|pdf|email]]`. Keeps invoices after ANAF drops them (60 days).
- Imported invoices never go into `invoices` and are never uploaded again; "send" means email.
- Each message is downloaded once (`descarcare`, 10 per day), the ZIP is unpacked with entry and size limits (`efactura-zip.ts`), the invoice XML is read with fast-xml-parser (`einvoice-parser.ts`: UBL, CreditNote, CII; a DOCTYPE is refused) and the signed ZIP is stored as is (bytea or `EFACTURA_STORAGE=supabase`).
- The direction comes from the XML (company CUI as supplier or buyer), then the message type; anything else is skipped. A sent invoice whose upload index matches one of our `efactura_uploads` gets its `invoice_id`.
- The PDF is made by ANAF's `transformare` (no validation) on first request and cached. The insert locks the live company.
- `EfacturaArchiveSyncJob` (07:00 Europe/Bucharest on Mon, Wed, Fri, `EFACTURA_ARCHIVE_SYNC=true`, advisory lock `EFACTURA_ARCHIVE_SYNC_LOCK_KEY`) imports the last 60 days for every company with a certificate.
- Company/account deletion soft-delete the rows; `PurgeJob` removes their Storage files; the company export adds `efactura-arhiva.csv` and the ZIPs.

## Not done
ANAF's signature validation service.
