# invoices: fiscal invoices (Facturi), art. 319 Cod fiscal

## Services
`InvoicesService` (list, stats, detail, create, UBL text), `InvoiceBuyersService` (buyer lookup and line suggestions), `InvoiceStornoService`, `InvoiceDeliveryService` (PDF/XML files, Storage, email, the follow-up after issuing) and `InvoiceNumbering` (one transaction per insert: next number, retried on a unique violation; the series continues after the invoices of deleted companies with the same CUI, and their numbers cannot be requested again).

## Data and money
- Seller = the `companies` row (IBAN, bank, email, phone, logo live there); buyer data is looked up from ANAF's VAT registry through `AnafCompanyLookupService` and editable before issuing.
- Seller and buyer are snapshotted as jsonb on the invoice. Lines stay jsonb on the invoice too (an invoice is a frozen snapshot, read and written whole).
- Money is computed in integer cents: VAT per rate group (`invoice-calc.ts`). VAT rounding is half away from zero so a storno mirrors the original to the cent.
- VAT rates depend on the delivery date (`vat-rates.ts`: 21/11/0 from 2025-08-01). A seller that is not a VAT payer gets category `O` and no VAT; rate 0 needs a reason (`E`, `Z`, `AE`); `vatOnCollection` prints "TVA la încasare".

## Files
`invoice-pdf.ts` (pdfkit, DejaVu Sans for ș/ț) and `invoice-xml.ts` (UBL 2.1 CIUS-RO, an invoice and a storno both pass ANAF's validator).

## Storno
- Invoices are never deleted or edited; corrections are storno invoices (`invoice-storno.ts`): the same lines with negative quantities, `storno_of_*` columns pointing to the original, UBL type 380 with a `BillingReference`.
- Partial stornos are tracked per line (`stornoOfLine`) so a line can never be reversed past its quantity.
- A storno locks the original row (`SELECT … FOR UPDATE`) and reads the earlier stornos inside the same transaction, so two concurrent stornos cannot over-reverse it.

## Buyer lookup and line suggestions
- Leaving the buyer CUI field calls `GET /accountants/:accountantId/invoices/buyers/:cui` (`findBuyer`): the buyer snapshot of the accountant's latest non-storno invoice to that CUI (index `idx_invoices_accountant_buyer_cui`) with VAT payer, inactive and e-Factura status refreshed from ANAF (best-effort: when ANAF fails, inactive and e-Factura are null, VAT payer stays from the snapshot and `anafChecked` is false so the editor marks the status as unverified), else the accountant's own company with that CUI, else ANAF (`source` says which). "Caută la ANAF" (`buyer-lookup/:cui`) always asks ANAF.
- `GET /accountants/:accountantId/invoices/line-suggestions?companyId&buyerCui` (`invoice-line-suggestions.ts`) returns the distinct lines (latest wins, per currency) from the last 50 non-storno invoices of that company to that buyer, served by the partial index `idx_invoices_company_buyer_cui`. The editor offers them under "Denumire" and fills the line. The VAT rate is kept only if it is still valid on the new delivery date.

## Delivery
Saving to Supabase Storage is per invoice and independent of `SPV_STORAGE` (`SupabaseStorage`, bucket `SUPABASE_INVOICE_BUCKET`). Email goes through `InvoiceMailer` (`MailKind.Invoice`); a failed email or upload is reported in the response and never undoes the invoice.
