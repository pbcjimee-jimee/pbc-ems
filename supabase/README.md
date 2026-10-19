# Local EMS database

This is an isolated local Supabase project, not a linked remote project. Existing quote project databases are not modified. API `55321`, Postgres `55322`, local mail `55324`.

```powershell
$env:DOCKER_HOST='npipe:////./pipe/dockerDesktopLinuxEngine'
npx supabase --profile supabase/local-cli-profile.json start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor
npx supabase --profile supabase/local-cli-profile.json migration up --local
node scripts/local-db.mjs setup
npx supabase --profile supabase/local-cli-profile.json test db
npm run test:integration -- transaction
```

The explicit project-local CLI profile avoids the machine's unrelated legacy global profile. It contains public endpoint configuration only. No `supabase link`, remote project creation, remote SQL, or source environment copy is needed.

`setup` generates `.env.local` with a random restricted `ems_runtime` password, local API keys and test-only administrator DSN; the two DSNs must remain separate. It creates actual local Auth accounts and labelled sample organizations. Login emails are `admin@ems.local` and `supervisor@ems.local`; generated local password is in ignored `.superpowers/sdd/pbc-ems/local-login.txt`. Never use these accounts or local keys in production.

`node scripts/local-db.mjs seed` resets all local EMS business records to labelled samples. Integration tests call the same reset helper, so run database suites serially and finish them before interactive browser testing. Seed is guarded against remote URLs. The script never logs credential values.

All business tables are in the nonexposed `ems` schema. Server code uses `EMS_DATABASE_URL`, authenticates with fixed-project `getUser()`, and sets local claims and role on a single transaction connection. `EMS_TEST_DATABASE_URL`, `EMS_LOCAL_SERVICE_ROLE_KEY` and `EMS_LOCAL_TEST_PASSWORD` are local test tools only. They are not read by the application transaction adapter.

Remote deployment remains unconfigured. A production operator must provision a separate runtime password, verified TLS connection (optional private CA via `EMS_DATABASE_CA`), Auth users and memberships. Migrations contain no passwords or test identities.
