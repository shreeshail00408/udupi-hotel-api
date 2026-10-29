# MySQL migration note

- MySQL versions in this environment do not accept `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` or `ADD CONSTRAINT IF NOT EXISTS` syntax.
- Use `INFORMATION_SCHEMA` checks and prepared dynamic SQL when migrating an existing database.
- For an older installation without auth tables, review and apply `database/auth-migration.sql`.
- For an installation already running the previous authenticated schema, back it up, inspect the preview counts, then manually run `database/two-role-order-workflow-migration.sql`.
- That migration changes legacy `STAFF` accounts to `CUSTOMER`, not `ADMIN`; maps legacy cancellations to `cancelled_at`; and maps unfinished intermediate order statuses to `pending`.
- Do not run migrations on a fresh install, and do not run them automatically when the application starts.
