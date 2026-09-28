# SariPOS

A point-of-sale system for sari-sari stores, built with PERN + TypeScript. The build plan is in [SariPOS-Project-Plan.md](SariPOS-Project-Plan.md).

## Run locally

You need Node.js 24 and Docker Desktop.

```bash
docker compose up -d                 # Postgres 17 on localhost:5433

cd server
cp .env.example .env                 # then fill in JWT_ACCESS_SECRET and the SEED_* values
npm install
npm run migrate:up
npm run seed                         # wipes the DB and loads sample data (dev only)
npm run db:check                     # proves the DB rejects bad data (changes nothing)
npm run dev                          # API on http://localhost:4000

cd ../client
cp .env.example .env
npm install
npm run dev                          # http://localhost:5173
```

Generate the secret with `openssl rand -base64 48`.

The database runs on port **5433**, not 5432, so it doesn't clash with a local PostgreSQL install. It only listens on `127.0.0.1`, and the API connects as `saripos_app`, a normal (non-superuser) role created by [db/init/01-app-role.sql](db/init/01-app-role.sql). That script runs only when the Docker volume is first created; to re-run it, `docker compose down -v` (deletes all DB data).

## Migrations

| Command | What it does |
|---|---|
| `npm run migrate:up` | Apply all pending migrations |
| `npm run migrate:down` | Roll back the last migration |
| `npm run migrate:down -- 99` | Roll back everything |
| `npm run migrate:create <name>` | New SQL migration in `server/migrations/` |
