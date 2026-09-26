# SPVDirect frontend

The React app for SPVDirect (Phase 3). The UI is Romanian and follows the SPVDirect design system: petrol `brand`, IBM Plex Sans/Mono, light and dark themes.

**Stack:** Vite 8 · React 19 · TypeScript 6 · React Router 8 · TanStack Query 5 · Vitest + Testing Library · oxlint. No UI library: the components in `src/components/ui/` are the design system's, ported to TSX.

## Run it

```bash
cd backend && npm run dev        # https://localhost:3000 (needs npm run cert:dev once)
cd frontend
npm install
npm run dev                      # http://localhost:5173 (must match FRONTEND_URL)
```

Open http://localhost:5173, create an account, then **Conectează certificat**.

## How it talks to the API

The browser only talks to Vite. Vite proxies `/api/*` to `https://localhost:3000/*` (`vite.config.ts`, self-signed certificate accepted), so the `spv_session` cookie is first-party and every `fetch` uses `credentials: 'include'`.

ANAF OAuth works like this:

1. **Conectează certificat** is a plain link to `/api/accountants/:accountantId/anaf/connect`, a full-page navigation, because the backend answers with a redirect to logincert.anaf.ro.
2. The backend sets the `spv_anaf_oauth` state cookie through the proxy. Cookies ignore the port, so the browser sends it to `https://localhost:3000/anaf/callback` when ANAF redirects back.
3. The callback redirects to `/accountants/:accountantId/connections?status=ok|error&message=…`. The Connections page shows that result as a banner, rendering the message as text only.

Every page lives under `/accountants/:accountantId/` (e.g. `/accountants/1/companies/3`). Any other path redirects there for the signed-in accountant, and another accountant's URL shows "Nu aveți acces la acest cont."

Authorization links, including the page the certificate holder opens, are served by the backend (`GET /anaf/authorize/:token`) and don't touch this app.

**Production:** set `VITE_API_URL` to the API's URL and serve the app on the same site as the API. The session cookie is `SameSite=Lax`, so a different site would not receive it.

## Commands

| | |
|---|---|
| `npm run dev` | Dev server on :5173 with the API proxy |
| `npm test` | Unit and page tests (Vitest, jsdom; fetch is stubbed, no backend needed) |
| `npm run typecheck` · `npm run lint` | `tsc -b` · oxlint |
| `npm run build` | Typecheck + production build to `dist/` |

## Layout

```
src/
  api/          client.ts (fetch wrapper, ApiError, Romanian messages) · hooks.ts (TanStack Query) · types.ts
  components/ui design-system components: Button, Badge/StatusBadge, TextField, Card, Alert, DataTable, Stat, Icon, Wordmark
  components/   app pieces: PageHead, EmptyState, QueryError, ConfirmButton, CopyField
  layout/       AppLayout (sidebar, session guard) · AuthLayout
  pages/        Login, Register, Panou, Firme, Firmă, Certificate ANAF, e-Factura/e-Transport (placeholders)
  lib/format.ts CUI rules (mirror the backend DTO), dates in Europe/Bucharest, Romanian plurals, certificate status
  styles/       tokens.css (generated from the design system) · components.css · app.css
```

## Conventions

- **Styling:** use tokens only (`var(--brand)`, `var(--space-4)`). Never hard-code colours. Both themes must stay readable. The theme is `<html data-theme>`: it follows the OS until the user toggles it in the sidebar.
- **Status:** always show it through `StatusBadge` (tone, icon and word). A certificate is `expiring` when its refresh token ends within 30 days; this is derived in `lib/format.ts`, not stored.
- **Copy:** Romanian with ș/ț (comma below), and imperative button labels ("Adaugă firmă"). Say what happened, then why, then what to do. Backend error messages are already Romanian and are shown as they are.
- **Formats:** dates `DD.MM.YYYY` · CUI as `RO 12345678` in mono · amounts `12.480,00`.
- **e-Factura and e-Transport:** these pages are placeholders until the Phase 2 endpoints exist. Build them with `DataTable` + `StatusBadge` (`ok`, `nok`, `processing`), following the design system's InvoicesMock.
