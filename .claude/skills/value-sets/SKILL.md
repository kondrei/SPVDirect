---
name: value-sets
description: SPVDirect rule for value sets (statuses, kinds, sources, modes, categories, currencies, environments, ANAF codes) as TS enums in each module's dto/ folder. Use when adding or comparing such a value, writing a DTO, entity, union type or fixture, or reviewing a diff for raw string literals.
---

# Value sets are enums

A **value set** is a closed list of strings or numbers that is stored in a column, crosses the API, comes from ANAF, or is compared in logic: account and upload statuses, connection source, VAT category, currency, e-Factura standard, ANAF `stare` and OAuth error codes, Postgres error codes. Every value set is a TypeScript string enum, and code names its members, never the raw string.

## Where the enum lives

- Backend: `src/<module>/dto/<module>.enums.ts`, one file per module (`accountants/dto/accountant.enums.ts`, `anaf/dto/anaf.enums.ts`, `efactura/dto/efactura.enums.ts`, `invoices/dto/invoice.enums.ts`, ...). Cross-cutting sets go in `common/dto/`, env sets in `config/dto/env.enums.ts`. Add a member to the existing file before creating a new enum; one value set has one enum in the backend.
- Frontend: `frontend/src/api/enums.ts`, a mirror of the backend enums the API exposes. Same enum name, same member names, same values.
- Entities, services and DTOs import the enum; `types.ts`/entity files hold interfaces and classes only.

## Writing one

```ts
export enum UploadStatus {
  Sending = 'sending',
  Ok = 'ok',
}
```

- PascalCase members, values exactly as stored or sent (the DB and API never change because of a rename).
- A subset is a typed array or `Exclude`: `ACTIVE_UPLOAD_STATUSES: readonly UploadStatus[]`, `Exclude<VatCategory, VatCategory.NotSubject>`.
- A label table is `Record<Enum, string>` with computed keys: `[LinkFailure.Used]: '...'`.
- Discriminated unions use members as tags: `{ kind: AuthorizationOutcomeKind.Link; companyName: string }`.

## Using one

- Validation: `@IsEnum(Enum, { message })`; a subset uses `@IsIn(SUBSET)`. Messages that list values use `Object.values(Enum).join(', ')`.
- Columns stay `text`/`varchar` with their CHECK constraint; `default: Enum.Member`.
- Joi: `.valid(...Object.values(Enum)).default(Enum.Member)`.
- Raw SQL fragments take the value as a parameter: `.andWhere('status = :active', { active: AnafConnectionStatus.Active })`.
- Tests and fixtures typed as an entity or DTO use members too (`currency: Currency.RON`). Assertions on a wire payload sent to ANAF may keep the literal it expects.

## What stays a literal

- Migrations: frozen snapshots, they keep their SQL strings and import nothing from `src/`.
- Catalogs: long Romanian lists used only for validation (`SPV_REQUEST_TYPES`, `SPV_INCOME_REASONS`, the `UNITS` code map) stay `as const` in a `dto/` file.
- Language and library values: `typeof x === 'string'`, `Promise.allSettled` `'fulfilled'`, TypeORM `lock.mode`, axios `responseType`, TanStack `'pending'`.
- Text: user-facing Romanian messages, CSV headers, SQL aliases, input parsing (`'true'`, `'DA'`).
- Frontend view state: theme, open panel, reducer action types, component variants, the `StatusBadge` vocabulary. These are string-literal unions; an API enum member is assignable to them.
- A single standalone value gets a named `const` in its file (`BUCHAREST_COUNTY_CODE`), not an enum.

## Done when

`grep -rnE "(===|!==) *'[^']+'|case '"` over the changed files shows only the literals listed above, and `npx tsc --noEmit -p tsconfig.json` in `backend/` (specs included) and `npm run typecheck` in `frontend/` pass.
