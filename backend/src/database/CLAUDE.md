# database: migrations and repositories

- `synchronize: false`. Every schema change needs a migration (`npm run migration:generate -- src/database/migrations/<Name>`).
- Migrations are listed explicitly in `migrations/index.ts`, not globbed. **Add each new migration class there.**
- Every migration has a `<timestamp>-<Name>.spec.ts` beside it that runs `up` and `down` against a mocked `QueryRunner` and checks the tables, columns and indexes it touches.
- CI runs every migration on an empty Postgres (plain image, not Supabase), so a migration must not depend on Supabase-only schemas, roles or extensions.
- FK constraints live in the migrations (entities have plain FK id columns).
- The global `RepositoriesModule` (`repositories.module.ts`) registers the entities with `forFeature` and provides every repository; add new ones there. Postgres advisory locks go through `AdvisoryLockRepository.runExclusive()`.
