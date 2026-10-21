# Deleted companies and accounts are purged after 30 days; the accountant keeps the fiscal archive

Invoices in SPVDirect are never edited or deleted one by one (corrections are storno invoices), but a company or a whole account can be deleted. Deleting is a soft delete: the company or account and all its invoices, e-Factura uploads and SPV messages get `deleted_at` at once, and `PurgeJob` (1st of the month, 03:00 Europe/Bucharest) erases rows and Storage files deleted more than 30 days ago. After that SPVDirect holds no copy. Romanian law requires invoices and other supporting documents to be kept for 10 years (Legea contabilității nr. 82/1991, art. 25), and that duty stays with the accountant and their client, not with SPVDirect. So the delete dialogs say so, and both the company page and the profile offer a ZIP export (`GET companies/:id/export`, `GET export`) with every invoice as PDF and UBL XML, the e-Factura uploads, the SPV messages and their PDFs. The e-Factura copies also stay at ANAF in SPV.

## Considered Options

- **Never delete fiscal data:** rejected. An accountant who loses a client, or leaves SPVDirect, must be able to take the data out and have it erased (GDPR art. 17), and keeping invoices for 10 years for an account that no longer exists would make SPVDirect the archive holder, which it is not meant to be.
- **Block deleting a company that has invoices (the old behaviour, a 409 from the FK):** rejected. The accountant could never remove a client.
- **Soft delete, export, purge after 30 days (chosen):** the 30 days cover a mistaken deletion (the rows can still be restored by hand) and the export covers the legal archive.

## Consequences

- A deleted company that is added again gets a new id. Its invoice numbering continues after the highest number the deleted companies with the same CUI used in that series (`InvoiceNumbering`), and a number they used cannot be requested again, as long as those invoices have not been purged.
- Deleting is refused (409) while an invoice is `sending` to ANAF. The deletion and the upload claim both lock the company row (`company-lock.ts`), so an upload cannot start while the company is being deleted, and issuing an invoice locks it too.
- ANAF certificates of a deleted account are revoked right after the deletion. Any connection left (for example when the process stopped) is revoked again by the purge before the account row is removed.
- `PurgeJob` takes a Postgres advisory lock, so only one instance purges at a time.
