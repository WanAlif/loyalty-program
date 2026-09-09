# Loyalty Program

A full-stack Loyalty Program app: users register, upload purchase receipts,
admins review and approve/reject them, and approved receipts automatically
generate a redeemable voucher.

**Stack:** React + TypeScript + Vite (client) · Node.js + Express + TypeScript (server) · PostgreSQL · Prisma ORM · JWT auth (httpOnly cookie) · Jest + Supertest (tests) · GitHub Actions (CI)

## Project status

The full assessment scope is implemented and tested:

- ✅ Auth: register, login, logout, `/me`, role-based (`USER` / `ADMIN`) middleware
- ✅ Receipt upload (multipart file upload, validated with Zod + Multer)
- ✅ Admin review: list by status, approve, reject (with reason)
- ✅ Voucher auto-generation on approval, wrapped in a DB transaction
- ✅ Voucher redemption (user-initiated, with expiry/double-redeem guards)
- ✅ React frontend: auth pages, user dashboard (upload, history, voucher redemption), admin dashboard (review queue)
- ✅ Automated test suite (26 tests) covering the core business logic
- ✅ CI pipeline (GitHub Actions) — typecheck, build, and test on every push
- ✅ Security hardening: `helmet` headers, rate-limiting on login/register
- ✅ Fully containerized deployment (Docker Compose: Postgres + server + nginx-served client)

Not implemented (out of scope for the assessment / documented as a
deliberate cut, see below): email notifications, an actual public/live
deployment.

## Prerequisites

- Node.js 18+ and npm
- Docker (for a local PostgreSQL instance) — or any PostgreSQL 14+ instance you already have (e.g. Supabase's free tier); the app only needs a `DATABASE_URL` connection string, it doesn't care where Postgres runs

## Backend setup (`server/`)

1. Install dependencies:
   ```bash
   cd server
   npm install
   ```

2. Start a local Postgres (skip this if you're pointing at an existing instance, e.g. Supabase):
   ```bash
   docker run --name loyalty-postgres -e POSTGRES_PASSWORD=localdevpass -e POSTGRES_DB=loyalty -p 5432:5432 -v loyalty-postgres-data:/var/lib/postgresql/data -d postgres:16
   ```
   (Pinned to Postgres 16 — the `postgres:18` image changed its data directory layout and isn't compatible with this simple volume mount.)

3. Create your local env file:
   ```bash
   cp .env.example .env
   ```
   Then fill in:
   - `DATABASE_URL` — if you used the Docker command above: `postgresql://postgres:localdevpass@localhost:5432/loyalty`. If using Supabase instead: Project Settings → Database → Connection string → URI.
   - `JWT_SECRET` — any long random string (e.g. generate with `openssl rand -hex 32`)

4. Run the initial Prisma migration (creates the tables):
   ```bash
   npx prisma migrate dev
   ```

5. Seed an admin + demo user:
   ```bash
   npm run prisma:seed
   ```
   Prints the seeded login credentials to the console:
   - Admin — `admin@loyalty.local` / `Admin@12345`
   - Demo user — `user@loyalty.local` / `User@12345`

6. Start the dev server:
   ```bash
   npm run dev
   ```
   The API runs at `http://localhost:5000`. Check `http://localhost:5000/api/health` to confirm it's up.

## Frontend setup (`client/`)

1. Install dependencies:
   ```bash
   cd client
   npm install
   ```

2. Env file (defaults are already correct for local dev against the backend above):
   ```bash
   cp .env.example .env
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173`. Log in with either seeded account above — regular users land on the upload/history dashboard, the admin account lands on the review queue.

## Running with Docker (containerized deployment)

The whole stack — Postgres, the API server, and the client — can also run
fully containerized with one command, which is how this would actually
get deployed (as opposed to the `npm run dev` setup above, which is
for local development):

```bash
docker compose up --build
```

This builds the server image (multi-stage: compiles TypeScript, then a
slim production image that runs `prisma migrate deploy` automatically
on boot via `entrypoint.sh` before starting the server — so the database
schema is always up to date with no manual step) and the client image
(multi-stage: Vite production build, served by nginx). nginx proxies
`/api` and `/uploads` through to the server container, so the browser
only ever talks to one origin — no CORS involved in this setup, unlike
local dev where the Vite dev server and the API run on different ports.

Once it's up:
- App: http://localhost:5173
- API directly: http://localhost:5000/api/health

Note: Postgres inside compose is mapped to host port `5433` (not `5432`)
to avoid clashing with the separate `loyalty-postgres` container used for
local dev — they're independent databases.

Seed demo accounts inside the running container:
```bash
docker compose exec server npm run prisma:seed
```

The `JWT_SECRET` and Postgres password in `docker-compose.yml` are
placeholder values for local/demo use — a real deployment would supply
these as real secrets (e.g. via a secrets manager or CI/CD environment
variables), never committed as-is.

## Running tests

The backend has an automated test suite (Jest + Supertest) covering auth,
receipt upload validation, and the admin approve/reject + voucher
generation flow — run against a **separate** database so it never touches
your dev data.

1. One-time setup — create the test database on the same Postgres container:
   ```bash
   docker exec -it loyalty-postgres psql -U postgres -c "CREATE DATABASE loyalty_test;"
   ```

2. Create the test env file:
   ```bash
   cd server
   cp .env.test.example .env.test
   ```

3. Run the suite (applies migrations to the test DB automatically, then runs Jest):
   ```bash
   npm test
   ```

## Continuous integration

`.github/workflows/ci.yml` runs on every push/PR to `main`: it spins up a
throwaway Postgres service, typechecks and builds both the server and
client, applies Prisma migrations against it (catching migration bugs
before they'd hit a real deploy), and runs the full test suite.

## API overview

All routes are prefixed `/api`. Endpoints under `/receipts`, `/admin`,
and `/vouchers` require a valid session cookie (`requireAuth`); `/admin`
additionally requires the `ADMIN` role (`requireAdmin`).

| Method | Path                          | Description                                      |
| ------ | ----------------------------- | ------------------------------------------------- |
| POST   | `/auth/register`              | Create an account, sets session cookie             |
| POST   | `/auth/login`                 | Log in with email/phone + password                 |
| POST   | `/auth/logout`                | Clear session cookie                                |
| GET    | `/auth/me`                    | Current logged-in user                              |
| POST   | `/receipts`                   | Upload a receipt (multipart: orderId, purchaseDate, amount, file) |
| GET    | `/receipts/me`                | Current user's receipt history                      |
| GET    | `/receipts/:id`                | A single receipt (must belong to the current user) |
| GET    | `/vouchers/me`                 | Current user's earned vouchers                       |
| POST   | `/vouchers/:id/redeem`         | Redeem an active voucher (must be owned, unredeemed, unexpired) |
| GET    | `/admin/receipts?status=`      | List receipts, optionally filtered by status         |
| POST   | `/admin/receipts/:id/approve`  | Approve a pending receipt → generates a voucher       |
| POST   | `/admin/receipts/:id/reject`   | Reject a pending receipt (optional `reason` in body) |

## Pushing to GitHub

From the project root:
```bash
git init
git add .
git commit -m "Loyalty Program: full-stack app with auth, receipts, admin review, voucher generation, tests, CI"
git branch -M main
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

The `.gitignore` excludes `node_modules/`, `.env`, `.env.test`, and uploaded
files, so nothing sensitive or heavy gets committed.

## Architecture notes / decisions

- **Auth:** JWT stored in an httpOnly, `SameSite=Lax` cookie rather than
  `localStorage` — avoids XSS token theft. CORS is configured with
  `credentials: true` and an explicit origin (required for cookies to
  work cross-origin between the Vite dev server and this API). Sessions
  expire after 30 minutes (`JWT_EXPIRES_IN`); on the frontend, an axios
  response interceptor detects an expired/invalid session on any
  authenticated request and cleanly redirects to the login page with an
  explanatory message, instead of leaving the UI stuck on a raw error.
- **Admin access:** a `role` field on the same `User` table (not a
  separate admin table/login flow) — one login path, gated by
  `requireAdmin` middleware on admin-only routes. There's no
  "become admin" signup flow; the admin account is created by the
  Prisma seed script and its credentials are documented above.
- **Receipt/voucher integrity:** `Voucher.receiptId` is a unique column,
  so the database itself prevents a receipt from ever generating more
  than one voucher — even if an approve action is retried or double-clicked.
  The approve endpoint also explicitly guards against re-approving or
  re-rejecting an already-reviewed receipt (`409 Conflict`), and the
  status update + voucher creation happen inside a single Prisma
  `$transaction` so they can never happen partially.
- **Voucher reward rule:** not specified by the assessment brief, so
  it's a documented assumption (`server/src/lib/voucher.ts`): a voucher
  is worth **10% of the approved receipt amount** and expires **90 days**
  after issuance. Easy to change in one place if a different rule was
  intended.
- **File storage:** local disk (`server/uploads/`), acceptable per the
  assessment brief. Not deployed publicly, so this has no persistence
  concerns for grading purposes.
- **Money fields:** stored as Prisma `Decimal`, not `Float`, to avoid
  floating-point rounding errors on currency amounts.
- **Testability:** Express app construction (`server/src/app.ts`) is
  separated from the `app.listen()` call (`server/src/index.ts`)
  specifically so tests can exercise the app directly via Supertest
  without binding a real port.
- **Voucher redemption:** implemented as user-initiated (the logged-in
  user redeems their own voucher from their dashboard), rather than
  admin/staff-initiated at a point of sale — a reasonable assumption
  given there's no real checkout integration in this assessment.
  Redemption is a one-way stamp (`Voucher.redeemedAt`): blocked if
  already redeemed (`409`) or past `expiresAt` (`410`), and scoped so a
  user can only redeem their own voucher (`404` otherwise, matching the
  same not-found-rather-than-403 pattern used for receipts).
- **Deliberately out of scope, given more time:** email notifications
  on approval/rejection, and an actual live/public deployment (the app
  runs either locally via npm or fully containerized via Docker Compose
  — see above — but isn't deployed to a public host, per the
  assessment brief).
- **Containerization:** `server/Dockerfile` and `client/Dockerfile` are
  multi-stage builds (compile/build stage, then a minimal production
  image) tied together by the root `docker-compose.yml`. Migrations run
  automatically on server container boot via `entrypoint.sh` rather than
  as a manual step, and the client is served by nginx which proxies API
  calls through to the server — meaning the containerized deployment has
  no cross-origin requests at all, unlike local dev.
