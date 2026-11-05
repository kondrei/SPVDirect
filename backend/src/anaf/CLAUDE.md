# anaf: ANAF OAuth, the api.anaf.ro gateway, certificates and SPV

## ANAF connections
- These are OAuth 2.0 grants from ANAF. The access and refresh tokens ANAF issues are JWTs signed by ANAF, and we only decode them.
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
- The USB token or cloud certificate is only used in the browser during logincert. After that, the stored tokens are enough.

## Code paths
- `services/anaf-oauth.service.ts`: authorize URL, code exchange, refresh, `getAccessToken()`.
- `services/anaf-api.service.ts`: **the single gateway to api.anaf.ro**. It handles the ownership check, retry after a refresh on 401/403, and `api_logs` auditing.
- The gateway services (`AnafTokenClient`, `AnafOAuthService`, `AnafApiService`, `AnafCompanyAccessService`) live in `AnafGatewayModule`, so `CompaniesModule` can use them without importing `AnafModule`.
- `controllers/anaf-oauth.controller.ts`: `/accountants/:accountantId/anaf/connect` (self), `/anaf/authorize/:token[/start]` (public authorization-link pages), `/anaf/callback`. It only renders; `AnafAuthorizationService.complete()` exchanges the code and stores the connection.
  - A signed short-lived cookie `spv_anaf_oauth` carries the OAuth state and the mode (`self` or `link`). The callback rejects a missing or different `state`.
  - For a link, the link is claimed (`usedAt` set where it is null) before any token is stored, so a second holder racing on the same link stores nothing.
- `services/anaf-connections.service.ts`: list, rename, remove (revoke at ANAF) and test certificates; the controller holds no repository.
- `authorization-links/`: one-time links (7 days) that let a company's certificate holder authorize for an accountant. Only the SHA-256 hash of the link token is stored.

## SPV inbox (`spv/`)
- `SpvService`, `webserviced.anaf.ro/SPVWS2/rest`, base URL `ANAF_SPV_ENDPOINT`, still through `AnafApiService.request()` with `baseUrl`: `listaMesaje`, `descarcare`, `cerere` (document requests).
- **SPVWS2 does not accept ANAF OAuth tokens** (F5 APM answers 200 with a logout HTML page; see `docs/adr/0001-no-spv-inbox-over-oauth.md`), so the UI shows the archive and the document-request form (kept on purpose, though `cerere` is expected to 502) but no sync, and `SpvSyncJob` is not registered in `AnafModule`.
- Messages come in through the browser instead: the accountant opens `listaMesaje` at ANAF with their certificate, pastes or uploads the JSON (`POST spv/archive/import`, parsed by `spv-import.ts`, saved with no `anaf_connection_id`; the reply also carries the list's certificate serial, ANAF's "Nu exista mesaje" notice and the CUIs from its `cui` field that are not companies yet, which the page links to `companies?add=1&cuis=`), opens each PDF at `descarcare?id=` and uploads it (`PUT spv/archive/:id/document`). CORS blocks reading SPVWS2 from our pages, so the browser can't fetch it for us.
- The code and routes stay for when ANAF exposes SPVWS2 on api.anaf.ro; an HTML reply becomes a 502 "ANAF a returnat o pagină HTML în loc de răspunsul SPV".
- Messages already saved stay in `spv_messages` with the PDF in the database or in Supabase Storage (`SPV_STORAGE`).
- Routes: `/accountants/:accountantId/anaf/connections/:connectionId/spv/{messages,messages/:id/download,sync,requests}` and `/accountants/:accountantId/spv/archive`.
