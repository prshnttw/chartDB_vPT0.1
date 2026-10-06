# ChartDB vPT0.1

A self-hosted, multi-user build of [ChartDB](https://github.com/chartdb/chartdb)
with signup/login, PostgreSQL-backed accounts and per-user saved diagrams.
The ChartDB editor itself is unchanged; this fork wraps it with an auth + API
layer. ChartDB is AGPL-3.0 (see [LICENSE](LICENSE)); keep this repository public
if you serve it to others.

```
Browser ──► Caddy (HTTPS) ──► chartdb (nginx + React UI) ──/api──► chartdb-api (Express)
                                                                        │
                                                          existing PostgreSQL container
                                                          database "chartdb": users, sessions, diagrams
```

## What was added

| Area | Where |
|---|---|
| Backend (Express + TypeScript) | [server/](server/) |
| SQL migrations (run automatically on API start) | [server/migrations/](server/migrations/) |
| Auth UI (`/login`, `/signup`), route guard, user menu | `src/pages/auth-page/`, `src/context/auth-context/` |
| Diagram sync (IndexedDB working copy ⇄ PostgreSQL) | `src/context/diagram-sync-context/` |
| Removed: Discord/Twitter/GitHub-star links, "star us" popup | editor sidebar, menus, navbars |

## How it works

**Authentication.** Passwords are hashed with Argon2id. Login creates a random
session token, sent as an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in
production); only its SHA-256 is stored in `sessions`. Nothing is kept in
`localStorage`. Logout deletes the session row and clears the cookie. Expired
sessions are purged hourly. Signup and login are rate limited, login returns the
same generic error for unknown email and wrong password, and state-changing
requests are rejected unless the `Origin` is one of `FRONTEND_URL` (CSRF defence
in addition to `SameSite`).

**Signup policy.** Only emails on `ALLOWED_EMAIL_DOMAINS` (default
`cbr-iisc.ac.in`) may sign up: the domain must equal it or be a subdomain
(`a@cbr-iisc.ac.in`, `a@lab.cbr-iisc.ac.in`). Set `ALLOW_SIGNUP=false` to close
signup entirely.

**Diagrams.** ChartDB keeps working against IndexedDB (fast, offline-tolerant).
A sync layer pushes the whole diagram as one JSONB document to
`PUT /api/diagrams/:id` ~1 s after edits (click the cloud icon in the top bar to
save immediately) and, when the editor opens, pulls anything newer from the
server. Each account gets its own IndexedDB (`ChartDB-<userId>`), so users
sharing a browser never see each other's cache. Conflicts are last-write-wins by
`updatedAt`; the server refuses to overwrite a newer copy with an older one.
Every diagram query is scoped by the session's `user_id`; a diagram that is not
yours returns `404`.

**Known limitations (v0.1).** Diagrams already stored in a browser under the old
unauthenticated ChartDB are not auto-imported (export them via *File → Export*
and re-import them after logging in). If you delete a diagram while offline, it
reappears on the next sync. No password reset, profile page or admin UI yet.

## Environment variables

See [.env.example](.env.example). Never commit `.env`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql://user:pass@<postgres-container>:5432/chartdb` |
| `POSTGRES_NETWORK` | Docker network of the existing Postgres container |
| `SESSION_SECRET` | Required in production (`openssl rand -hex 32`) |
| `FRONTEND_URL` | Exact browser origin(s), comma separated, no trailing slash |
| `COOKIE_SECURE` | `true` behind HTTPS; `false` only for plain-HTTP testing |
| `ALLOWED_EMAIL_DOMAINS` | Default `cbr-iisc.ac.in` |
| `ALLOW_SIGNUP` | `false` to disable signup |
| `TRUST_PROXY` | Proxy hops in front of the API (`2` with Caddy → nginx → api) |
| `WEB_PORT` | Host port for the UI (default `8080`) |
| `DISABLE_ANALYTICS` | Kept `true`; no analytics are added |

## Deploy with Docker (existing PostgreSQL)

1. **Find your Postgres container's network and name**

   ```bash
   docker ps
   docker inspect <postgres-container> --format '{{json .NetworkSettings.Networks}}'
   ```

   Use the container name as the host in `DATABASE_URL` (not `localhost`), and the
   network name as `POSTGRES_NETWORK`.

2. **Create the empty database and a dedicated user** (once). The API creates
   all tables itself.

   ```bash
   docker exec -it <postgres-container> psql -U postgres
   ```
   ```sql
   CREATE USER chartdb_user WITH PASSWORD 'a-long-random-password';
   CREATE DATABASE chartdb OWNER chartdb_user;
   ```

3. **Configure and start**

   ```bash
   git clone <your-repo-url> chartdb && cd chartdb
   cp .env.example .env        # edit it
   docker compose up -d --build
   ```

   The API applies the migrations on startup (log line `Applied migrations:
   001_init.sql`). Open `http://<vm-ip>:8080` (set `COOKIE_SECURE=false` and
   `FRONTEND_URL=http://<vm-ip>:8080` while testing without HTTPS).

PostgreSQL is never exposed by this stack; only the API container talks to it.

## Production: Caddy + HTTPS

Point your domain at the VM, set `FRONTEND_URL=https://chartdb.example.com`,
`COOKIE_SECURE=true`, then:

```caddyfile
chartdb.example.com {
    # Simplest: everything to the UI container (nginx forwards /api to the API)
    reverse_proxy chartdb:80
}
```

or route directly (then set `TRUST_PROXY=1`):

```caddyfile
chartdb.example.com {
    handle /api/* {
        reverse_proxy chartdb-api:3001
    }
    handle {
        reverse_proxy chartdb:80
    }
}
```

Caddy must share a Docker network with these containers (or use
`localhost:<WEB_PORT>`). It sets `X-Forwarded-For`/`-Proto`, which the API honours
via `TRUST_PROXY`.

## Local development

```bash
# 1. Backend (needs a reachable PostgreSQL with an empty "chartdb" database)
cd server && npm install
export DATABASE_URL=postgresql://user:pass@localhost:5432/chartdb
export FRONTEND_URL=http://localhost:5173
npm run dev            # http://localhost:3001, migrations run on start
npm run migrate        # run migrations only
npm test               # backend tests (in-memory Postgres, no DB needed)

# 2. Frontend (new terminal, repo root)
npm install
npm run dev            # http://localhost:5173, /api is proxied to :3001
npm run test:ci        # frontend tests
```

## API

| Method | Path | |
|---|---|---|
| POST | `/api/auth/signup` `{name,email,password}` | 201 + cookie |
| POST | `/api/auth/login` `{email,password}` | 200 + cookie |
| POST | `/api/auth/logout` | clears session |
| GET | `/api/auth/me` | `401` if not logged in |
| GET/POST | `/api/diagrams` | list / create |
| GET/PUT/DELETE | `/api/diagrams/:id` | own diagrams only |

Errors are `{ "error": { "code", "message" } }` with 400/401/403/404/409/422/429/500.
Passwords: 10–128 chars with a letter and a number.

## Troubleshooting

- **API can't reach Postgres** (`ENOTFOUND`/`ECONNREFUSED`): `DATABASE_URL` host must
  be the Postgres container name, and `POSTGRES_NETWORK` must be its network.
  `docker logs chartdb-api`.
- **Logged in but immediately logged out over HTTP**: `COOKIE_SECURE=true` cookies are
  dropped on plain HTTP; use HTTPS or set `COOKIE_SECURE=false` for testing.
- **`403 Origin not allowed`**: the URL in the browser must exactly match an entry in
  `FRONTEND_URL` (scheme, host, port).
- **`429`**: rate limit hit (10 signups / 20 logins per 15 min per IP). With a proxy,
  make sure `TRUST_PROXY` is right or everyone shares one IP.
- **`SESSION_SECRET must be set`**: set a real value in `.env`.
- **Diagram not syncing**: the cloud icon in the top bar turns red; click it to retry.
  Large diagrams are limited to 10 MB.
