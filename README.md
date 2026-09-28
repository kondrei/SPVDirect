# SPVDirect – ANAF SPV Accountant Portal

**Language:** Romanian UI · **Stack:** NestJS 12 + React (planned) + PostgreSQL (Supabase) + TypeORM 1.x · **Author:** Andrei
**Status:** Phase 1 backend scaffold done: accounts, ANAF OAuth, database schema

SPVDirect is an accountant portal for ANAF SPV services: **e-Factura**, **e-Transport** and related tax documents.

```
SPVDirect/
  backend/    NestJS API (this phase)
  frontend/   React app (Vite + React 19, see frontend/README.md)
```

---

## How authentication works

There are **two separate logins**. Don't confuse them:

| | What | Who issues it | Where it lives |
|---|---|---|---|
| **SPVDirect session** | Accountant logs in to *our* app with email + password | SPVDirect (JWT signed with `JWT_SECRET`) | httpOnly cookie `spv_session`, 7 days |
| **ANAF connection** | A qualified certificate authorizes SPVDirect to call api.anaf.ro | ANAF (OAuth 2.0, JWT tokens signed by ANAF) | `anaf_connections` table, AES-256-GCM encrypted |

ANAF only offers OAuth 2.0. The access and refresh tokens it issues are JWTs, per `Oauth_procedura_inregistrare_aplicatii_portal_ANAF.pdf`.

### The USB token / certificate is only used during authorization

```
Accountant (logged in to SPVDirect)
  → "Conectează certificat ANAF"  (GET /accountants/:accountantId/anaf/connect)
  → redirect to logincert.anaf.ro/anaf-oauth2/v1/authorize?...&token_content_type=jwt
  → browser: "Select a certificate" + token PIN   (USB token or cloud certificate)
  → ANAF checks the SPV PJ role (reprezentant legal / desemnat / împuternicit)
  → GET /anaf/callback?code=…
  → backend POST /token (Basic auth, token_content_type=jwt) → access + refresh JWT
  → tokens encrypted and stored, keyed by the certificate serial
  → the USB token is no longer needed until the refresh token expires (365 days)
```

An împuternicit certificate usually covers many CUIs, so one connection can serve many client companies.

### Authorization links (the company's own certificate)

When the certificate belongs to the client company's legal representative:

1. The accountant calls `POST /accountants/:accountantId/companies/:id/authorization-links` and sends the returned URL (valid for 7 days, single use).
2. The certificate holder opens it on their own PC. A Romanian explanation page appears, with the button **"Autorizează cu certificatul"**.
3. They go through logincert on their machine. The connection is created under the accountant's account and attached to that company.

### ANAF rules the code follows

- Client credentials go in an **HTTP Basic** header. Scope is empty.
- `token_content_type=jwt` goes on both the authorize query and the token body.
- A refresh returns a **new access AND refresh token**. Both are saved.
- Expiry is read from the JWT `exp` (documented as 90 days for access, 365 days for refresh).
- There is a 60-second cooldown between token-endpoint calls. Refreshes are serialized per connection.
- api.anaf.ro allows 1000 requests per minute and returns 403 when unauthorized and 429 when rate limited.
- e-Factura and e-Transport use `/test/…` and `/prod/…` paths (`ANAF_ENV`). TestOAuth has no prefix.
- Tokens, codes and Authorization headers are never logged. If tokens leak, ANAF must be told so it can block them.

---

## API (Phase 1)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Liveness |
| POST | `/auth/register` · `/auth/login` | none | Create account / log in (sets cookie) |
| POST | `/auth/logout` | none | Clear cookie |
| GET | `/auth/me` | session | Current accountant |
| GET/PATCH | `/accountants/:accountantId/profile` | session | Read / update name, phone, CECCAR membership (title, card number, branch), CCF card number, practice name, CUI and CAEN code (response includes the CAEN name) |
| GET | `/accountants/:accountantId/profile/firm-lookup/:cui` | session | Read the practice's name and CAEN code from ANAF's VAT registry (nothing is saved) |
| GET | `/caen/:code` | session | CAEN class name (Rev. 3 first, Rev. 2 fallback), 404 if unknown |
| POST | `/accountants/:accountantId/password` | session | Change password (needs the current one; 400 if it is wrong) |
| GET/POST | `/accountants/:accountantId/companies` | session | List / add client company by CUI (without RO); name and details come from ANAF's VAT registry, 400 if the CUI is unknown. Company responses include `caen` (the CAEN code's name) |
| POST | `/accountants/:accountantId/companies/bulk` | session | Add up to 500 companies at once: `{ "cuis": [...] }`. ANAF is queried in batches of 100; returns one `{ cui, status: created, exists or not_found, company? }` per unique CUI |
| POST | `/accountants/:accountantId/companies/:id/anaf-refresh` | session | Re-read the company's data from ANAF's VAT registry |
| GET/PATCH/DELETE | `/accountants/:accountantId/companies/:id` | session | Read / rename / attach connection / delete |
| POST | `/accountants/:accountantId/companies/:id/authorization-links` | session | One-time link for the certificate holder |
| GET | `/accountants/:accountantId/anaf/connect` | session | Start OAuth with your own certificate |
| GET | `/anaf/authorize/:token` | link | Landing page for authorization links |
| GET | `/anaf/callback` | state cookie | ANAF redirect target |
| GET | `/accountants/:accountantId/anaf/connections` | session | List certificates (no tokens returned) |
| PATCH/DELETE | `/accountants/:accountantId/anaf/connections/:id` | session | Rename / remove |
| GET | `/accountants/:accountantId/anaf/connections/:id/test` | session | Call ANAF TestOauth `hello` |

`AnafApiService.request()` is the single gateway to api.anaf.ro. It handles ownership checks, proactive refresh, retry after a refresh on 401/403, 429 mapping and `api_logs` auditing. The e-Factura and e-Transport modules will build on it.

---

## Database schema

The schema is managed by TypeORM migrations in `backend/src/database/migrations`. `synchronize` is off.

| Table | Purpose |
|---|---|
| `accountants` | SPVDirect users (integer id from 1, email is citext and unique, scrypt password hash) and their professional profile (CECCAR membership, CCF, practice) |
| `anaf_connections` | One per authorized certificate: encrypted tokens, `cert_serial`, `roles`, expiries, status |
| `companies` | Client CUIs per accountant (integer id from 1), the connection used for each, and ANAF VAT-registry data (typed columns + full record in `anaf_data` jsonb) |
| `authorization_links` | Delegated-authorization links (only the SHA-256 of the token is stored) |
| `api_logs` | Audit of every api.anaf.ro call and every VAT-registry lookup (service, endpoint, status, latency) |

---

## Getting started

### Prerequisites
- Node **24 LTS** (`.nvmrc`). Node 26 becomes LTS in Oct 2026, so there's no need to upgrade yet.
- A Supabase project (free tier is fine).
- An ANAF developer registration: anaf.ro → Servicii Online → Înregistrare utilizatori → **Dezvoltatori aplicații**. Then in SPV → **Editare profil Oauth**:
  - Add an application with the services E-Factura and E-Transport.
  - Set **Callback URL** to `https://localhost:3000/anaf/callback` (it must match `ANAF_REDIRECT_URI` exactly). Add the production URL later as Callback URL 2.
  - Copy the Client ID and Client Secret.

### Setup
```bash
cd backend
npm install
cp .env.example .env        # fill in DATABASE_URL, secrets, ANAF credentials
npm run migration:run       # creates the 5 tables in Supabase
npm run cert:dev            # self-signed cert for https://localhost (certs/, git-ignored)
npm run dev                 # https://localhost:3000
```

### Useful commands
```bash
npm test                    # unit tests (vitest)
npm run test:e2e            # HTTP smoke test
npm run lint                # oxlint (type-aware)
npm run migration:show      # applied/pending migrations
npm run migration:generate -- src/database/migrations/<Name>   # after entity changes
```
After generating or creating a migration, add its class to `src/database/migrations/index.ts`.

`src/open-data/` reads public datasets from data.gov.ro (licence OGL-ROU-1.0) through its CKAN API (`DATA_GOV_RO_API_URL`). Nothing is bundled:
- **CAEN names:** the first time one is needed, `CaenService` downloads the latest ONRC `N_CAEN.CSV` and keeps the Rev. 2 and Rev. 3 classes in memory for 24 hours. If data.gov.ro is unreachable, it keeps the last copy and retries after 5 minutes. Without any copy, company pages load without CAEN names, and `/caen/:code` and saving a profile CAEN code answer 503.

### Manual end-to-end check
```bash
curl -k -c jar -H "Content-Type: application/json" \
  -d '{"email":"andrei@example.com","password":"a-long-password","name":"Andrei"}' \
  https://localhost:3000/auth/register
curl -k -b jar https://localhost:3000/auth/me
```
Then open `https://localhost:3000/accountants/<your id>/anaf/connect` in the browser where you're logged in (the id is in the `/auth/me` response; accept the self-signed certificate warning once), pick the certificate, and call `GET /accountants/<your id>/anaf/connections/:id/test`. You should see a response starting with `Hello, SPVDirect`.

---

## Roadmap

- [x] Phase 1: backend scaffold, accounts, ANAF OAuth (self + authorization links), schema
- [ ] Phase 2: e-Factura (upload, stareMesaj, listaMesajeFactura, descarcare) and e-Transport modules
- [ ] Phase 3: React frontend. Done: Login, Dashboard, Companies, Connections. Still to do: Invoices and Transport, which wait for Phase 2.
- [ ] Phase 4: a background job for proactive token refresh and expiry notifications, plus rate limiting for ANAF calls (1000 per minute)
- [ ] Phase 5: Azure deployment, CI/CD

## References
- ANAF OAuth procedure: `Oauth_procedura_inregistrare_aplicatii_portal_ANAF.pdf` (anaf.ro → Dezvoltatori aplicații → Instrucțiuni de utilizare)
- e-Factura technical info: https://mfinante.gov.ro/ro/web/efactura/informatii-tehnice
- e-Transport technical info: https://mfinante.gov.ro/ro/web/etransport/informatii-tehnice
- ANAF support: Formular de contact → "Asistență tehnică servicii informatice" → "OAUTH"
