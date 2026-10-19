# The general SPV inbox is not used: SPVWS2 does not accept ANAF OAuth tokens

SPVDirect reaches ANAF only through OAuth tokens issued by logincert.anaf.ro, which work on api.anaf.ro (e-Factura, e-Transport). The general SPV inbox (`listaMesaje`, `descarcare`, `cerere` on `webserviced.anaf.ro/SPVWS2/rest`) sits behind an F5 BIG-IP APM gateway that only admits a browser session opened with the qualified certificate itself: a call with `Authorization: Bearer` gets HTTP 200 with the APM "Pagina logout" HTML page (confirmed on 2026-10-16), and ANAF's own client (MfpAnaf/ClientSPV) authenticates with the certificate. A server cannot hold the certificate's private key (it lives on the accountant's USB token or cloud signature), so we turned off SPV sync in the UI and the nightly `SpvSyncJob`, and kept the archive of messages already saved. The document-request form (`cerere`) stays in the UI by choice (2026-10-17), even though it calls the same SPVWS2 and is expected to answer 502 until ANAF accepts OAuth there.

## Considered Options

- **Server proxy:** rejected. The proxy has no access to the certificate's private key, so ANAF answers it with the same logout page.
- **Fetch from our page in the browser:** blocked by CORS. SPVWS2 sends no `Access-Control-Allow-Origin` (checked 2026-10-17), and only ANAF could add it.
- **Import (chosen):** the accountant opens `listaMesaje` at ANAF in a new tab (the browser presents the certificate), pastes or uploads the JSON into SPVDirect, and uploads each PDF downloaded from `descarcare?id=`.
- **Browser extension (possible later):** extensions with `host_permissions` for webserviced.anaf.ro are not bound by CORS and could fetch the list and PDFs automatically, posting them to the same import and upload endpoints.

## Consequences

- The backend SPV code (`src/anaf/spv/`) stays, unused by the UI, so it can come back if ANAF exposes SPVWS2 on api.anaf.ro. Its routes still exist and answer 502 "ANAF a returnat o pagină HTML în loc de răspunsul SPV" when called.
- e-Factura messages (`listaMesajeFactura` on api.anaf.ro) do work over OAuth and are the supported way to read invoice-related messages; they also back the check that a certificate has SPV rights for a company.
