# public-stats: `/public/stats`

- Returns aggregate counts only, never rows or names.
- Cached in memory for at most 5 minutes; `PublicStatsSubscriber` (a TypeORM subscriber) clears the cache after a committed insert or delete on a counted table, or an update to `accountants`/`efactura_uploads` (whose status is counted).
- Concurrent misses share one query batch, a load that started before an invalidation is never cached, and stale numbers are served if the database fails.
- Writes that bypass TypeORM (raw SQL, the Supabase console) show up when the 5 minutes run out.
