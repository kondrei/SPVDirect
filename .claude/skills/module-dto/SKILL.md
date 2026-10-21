---
name: module-dto
description: SPVDirect rule for where a module's declarations live: interfaces and type aliases in dto/<module>.types.ts, constants (CSV headers, label tables, field lists, page sizes) in dto/<module>.constants.ts, file names as enums. Use when declaring an interface, type or constant, naming a file a service writes, or reviewing a diff for one declared in a service, controller, helper, entity or hook.
---

# Declarations live in the module's dto/ folder

Services, controllers, helpers, builders and entities hold behaviour. The shapes and fixed values they use each have a single home in the module's `dto/` folder, and code imports them from there.

## Where each kind goes

| Kind | File | Shape |
|---|---|---|
| Interface or type alias, exported or private (results, filters, pages, inputs, raw ANAF shapes, `Pick<>` refs, unions) | `src/<module>/dto/<module>.types.ts` (`api-logs/dto/api-log.types.ts`, `invoices/dto/invoice.types.ts`, `anaf/spv/dto/spv.types.ts`) | `export interface` / `export type`; it imports other modules with `import type` |
| Constant: header, label table, field list, page size, limit | `src/<module>/dto/<module>.constants.ts` | `export const UPPER_SNAKE = ...`, `as const` when a type is derived from it; the derived type itself goes in `<module>.types.ts` (`type Unit = keyof typeof UNITS`) |
| Closed set of names: files and folders inside an export ZIP, any fixed file name | `src/<module>/dto/<module>.enums.ts` | String enum (`AccountExportFile.Profile = 'cont.json'`), following the `value-sets` skill |
| Name built from data (a download name with a CUI or date) | `<module>.constants.ts` | Small exported function (`companyExportFilename(cui, now)`) |
| Cross-cutting constant: throttles, shared limits | `src/common/constants.ts` | `export const` |

- **Module** means the top folder under `src/` (`invoices/`, `api-logs/`); a nested feature with its own `dto/` keeps its own files (`anaf/spv/dto/`). Sub-folders such as `deletion/` or `builders/` use their module's `dto/`.
- Names in one types file are unique across the module: two files that each had a private `InvoiceData` become `InvoicePdfData` and `InvoiceXmlData`.
- A type derived from a function stays a type in the types file: `export type AccountantProfile = ReturnType<typeof toProfile>` with `import type { toProfile }`.
- Entities stay classes in their `*.entity.ts`; DTO classes stay in `<module>.dto.ts`. Both import their interfaces and types from `<module>.types.ts`.
- An inline object type on one parameter (`{ companies }: { companies: Company[] }`) or a generic argument stays where it is; any named `interface` or `type` moves.
- Frontend: API shapes, query inputs included, go in `frontend/src/api/types.ts`; constants and label tables in `frontend/src/common/constants.ts`; API enum mirrors in `frontend/src/api/enums.ts`.
- Specs, `src/testing/` helpers and migrations keep their local types and literals.

## Moving older code

Older files still declare interfaces, types and constants at the top. When a change touches such a file, move its declarations to the module's `dto/` files in the same change and update every importer; the TypeScript compiler (`npx tsc --noEmit -p tsconfig.json` in `backend/`, `npm run typecheck` in `frontend/`) lists the importers that broke. Leave files you don't touch for their own change.

## Done when

Every changed service, controller, helper, builder, entity and hook has no named `interface` or `type` and no top-level `const` holding data, each file name a changed service writes is an enum member or comes from a filename function in `dto/`, and the typecheck and lint pass with no unused imports.
