# Local environment and deployment direction

Today the repository defines a local Next.js process and a Docker PostgreSQL database. A production deployment, CI/CD pipeline and monitoring platform are not established by this repository.

## Local setup

Use NVM's repository version without changing its global default:

```sh
nvm use
npm ci
cp .env.example .env # only if it does not already exist
```

Edit `.env` privately. Set matching random local POSTGRES_PASSWORD and URL-encoded DATABASE_URL credentials, with POSTGRES_DB/USER/PORT matching Compose. Never print environment values or share interpolated `docker compose config` output. Existing environment exports may override dotenv settings; avoid conflicting URLs across env files.

```sh
docker compose up -d --wait postgres
docker compose ps
npm run db:generate
npm run db:status
npm run db:deploy
npm run dev
```

For a new empty local database, db:deploy applies committed reviewed migrations. Review pending SQL before applying to an existing database. No migration runs automatically on startup or install. For schema development use `npm run db:migrate -- --name <name> --create-only`, inspect SQL, then deliberately apply. The local bootstrap database role can create temporary Prisma shadow databases; this setup needs no separately configured persistent shadow database.

Compose runs `postgres:18-bookworm` only, binds 127.0.0.1:${POSTGRES_PORT:-5432}, uses named `opspilot-dev_postgres_data` at `/var/lib/postgresql`, and checks pg_isready. The major image tag receives patch updates. `docker compose stop`/`down` retain data; `down --volumes` destroys it. Editing initialized-volume credentials in .env does not rotate PostgreSQL credentials.

## Google development setup

Configure Google's consent screen/audience and test users as required, then create an OAuth Web application client. Add redirect URI `http://localhost:3000/api/auth/callback/google`. This is BETTER_AUTH_URL plus `/api/auth/callback/google`. Use localhost consistently; if configuring JavaScript origins, use `http://localhost:3000`. Request identity access only, not offline Google API access.

Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in ignored `.env`, along with a randomly generated BETTER_AUTH_SECRET of at least 32 characters and BETTER_AUTH_URL=http://localhost:3000. Never paste secrets into chat/logs. Visit `/sign-in` and verify real consent/callback/session behavior manually. Restart the development runtime after relevant environment or generated-client changes.

## Explicit workspace bootstrap

This is local administration, not production onboarding; login never runs it. Supply every argument explicitly:

```sh
NODE_ENV=development npm run dev:bootstrap-workspace -- \
  --user-id <USER_UUID> \
  --name "OpsPilot Development" \
  --slug opspilot-development \
  --role MEMBER
```

Requires an existing active User, development mode and loopback PostgreSQL with no routing query parameters except schema. Names trim to 1–100 characters; slugs must be 1–100 lowercase alphanumeric segments separated by single hyphens, rejected rather than normalized. Role is explicit, never inferred/defaulted to OWNER. Existing slugs reject without reuse/upsert; Organization plus ACTIVE membership commit transactionally. Never infer User from email, first row or current session. Production/staging/remote targets are prohibited; loopback tunnels cannot be reliably detected.

## Future production work

Choose hosting and database topology, verified database TLS, restricted runtime/migration roles, pool limits, backups/restores, secret injection, HTTPS origin/Google callback, observability and release checks before deployment. Runtime Prisma pool is max five per process (5-second connect/30-second idle timeout), not a global capacity limit. Use controlled `db:deploy` for reviewed production migrations; never migrate dev there. RLS, queues, containerized Next.js, Vercel/AWS setup and CI/CD are not implemented.
