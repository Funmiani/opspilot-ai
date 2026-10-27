# Testing strategy

Different tests answer different questions. A mocked transport can prove policy decisions; only a real browser can demonstrate Google's redirect, consent and cookie flow.

## Existing layers

- Unit tests use Node's test runner through tsx, with the react-server condition for server-only imports. They cover strict inputs/DTOs, permissions, pagination, error classification, auth configuration, workspace guards, UI helpers and transport limits/headers.
- Integration tests use real PostgreSQL/Prisma for constraints, current authorization, attribution, pagination and transaction rollback. They require explicit local INTEGRATION_DATABASE_URL; without it tests skip. Fixtures use generated IDs and cleanup scoped to those IDs; foundation constraints also use rollback/savepoints. They must not reset real development data.
- Manual browser acceptance verifies real Google login/logout, workspace access and same-session permission changes. Mock tests do not prove these flows.

Run with Node 24 after generation:

```sh
npm test
npm run typecheck
npm run lint
npm run build -- --webpack
```

To opt into the migrated local database without printing its URL:

```sh
node --env-file=.env --input-type=module -e 'import { spawnSync } from "node:child_process"; const r=spawnSync("npm",["run","test:integration"],{stdio:"inherit",env:{...process.env,INTEGRATION_DATABASE_URL:process.env.DATABASE_URL}}); process.exit(r.status ?? 1);'
```

This command writes isolated test fixtures: use only the intended local development database. Passing a suite with skipped integration tests is not database verification. There is no dedicated disposable test-database infrastructure yet.

## Milestone 5B case study

Automated tests cover role/status/tenant denial, no network fetch for evidence URLs, exact activity details, injected activity-write rollback, UTF-16 bounds, pagination ties, actual absent Origin, and transport acceptance at 196,608 bytes/rejection at 196,609. A semantically valid escaped investigation request >64 KiB reaches the application under the 192 KiB limit. Body-limit constants are trusted server configuration; NaN/Infinity runtime checks are deferred.

Real browser acceptance used the same authenticated session: MEMBER read 200/write 201; VIEWER read 200/write 403; SUSPENDED read/write generic 404; restored MEMBER read 200. PostgreSQL audits confirmed exactly two accepted Comments, one Evidence and three corresponding new activities, with no rejected writes. Real accepted records were intentionally retained, not cleaned up as automated fixtures. No private identifiers are needed in these docs.

The first real NOTE POST returned HTTP 500 and persisted nothing. Restarting the long-running development runtime resolved the problem and the controlled retry succeeded. This supports the stale Prisma/runtime diagnosis but does not conclusively prove the original exception, which was not captured. Session counts also changed by natural expiration while rows remained; report total and unexpired counts separately.

This documentation baseline does not rerun database-writing suites or claim a fresh test-count certification. Test counts are execution snapshots, not permanent architecture facts.
