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
- ✅ Voucher redemption (user-initiated, with expiry/double-redeem guards, and the voucher code kept hidden in the UI until it's actually been redeemed)
- ✅ Server-side pagination and status filtering on every list endpoint (admin receipts, a user's own receipts, a user's own vouchers), each paired with a lightweight stats endpoint so tab counts don't require fetching every row
- ✅ React frontend: auth pages, user dashboard (stats + receipt history), a separate upload page, a dedicated voucher page (view + redeem), a settings page (update profile), admin dashboard (stats + review queue)
- ✅ Automated test suite (59 tests) covering the core business logic
- ✅ CI pipeline (GitHub Actions) — typecheck, build, and test on every push
- ✅ Security hardening: `helmet` headers, rate-limiting on login/register, uploaded receipt files served through an authenticated route (not a public `express.static` mount), async route handlers safely wrapped for Express 4
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
   Open `http://localhost:5173` and log in with the demo user account
   above. The admin account has its own separate login page at
   `http://localhost:5173/admin`.

## Running with Docker (containerized deployment)

The whole stack — Postgres, the API server, and the client — can also run
fully containerized with one command, which is how this would actually
get deployed (as opposed to the `npm run dev` setup above, which is
for local development):

```bash
docker compose up --build
```

This builds the server image (multi-stage: compiles TypeScript, then a
slim production image whose start command runs `prisma migrate deploy`
automatically before starting the server — so the database schema is
always up to date with no manual step) and the client image
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

All routes are prefixed `/api` (except file access, listed last) and
use an httpOnly session cookie for auth. This is just the endpoint
list — full request/response shapes, validation rules, and every
status code each one can return are in [`API.md`](./API.md).

| Method | Path                         | Auth  | Description |
| ------ | ---------------------------- | ----- | ----------- |
| POST   | `/auth/register`             | —     | Create an account |
| POST   | `/auth/login`                | —     | Log in (user) |
| POST   | `/auth/admin-login`          | —     | Log in (admin) |
| POST   | `/auth/logout`               | —     | Clear session |
| GET    | `/auth/me`                   | user  | Current user |
| PATCH  | `/auth/me`                   | user  | Update profile |
| POST   | `/auth/change-password`      | user  | Change password |
| POST   | `/receipts`                  | user  | Upload a receipt |
| GET    | `/receipts/me`               | user  | My receipts (paginated) |
| GET    | `/receipts/me/stats`         | user  | My receipt counts |
| GET    | `/receipts/:id`              | user  | One receipt |
| GET    | `/vouchers/me`               | user  | My vouchers (paginated) |
| GET    | `/vouchers/me/stats`         | user  | My voucher counts |
| POST   | `/vouchers/:id/redeem`       | user  | Redeem a voucher |
| GET    | `/admin/stats`               | admin | Global stats |
| GET    | `/admin/receipts`            | admin | All receipts (paginated) |
| POST   | `/admin/receipts/:id/approve`| admin | Approve → issue voucher |
| POST   | `/admin/receipts/:id/reject` | admin | Reject |
| GET    | `/uploads/:filename`         | user  | View a receipt file (owner or admin only) |

## Sequence diagram

The core loyalty program flow end to end — register, upload, admin
review, voucher issued, redeem — including the pagination/stats and
file-access calls each screen actually makes, not just the writes:

```mermaid
sequenceDiagram
    actor User
    actor Admin
    participant API as Express API
    participant DB as PostgreSQL (Prisma)
    participant FS as Local disk (uploads/)

    User->>API: POST /auth/register or /auth/login
    API->>DB: Verify / create user, hash password
    API-->>User: Set httpOnly JWT cookie

    User->>API: POST /receipts (orderId, receiptNumber, amount, file)
    API->>API: Validate with Zod, store file via Multer
    API->>DB: Create Receipt (status = PENDING)
    API-->>User: 201 Created

    Admin->>API: POST /auth/admin-login
    API->>DB: Verify admin credentials
    API-->>Admin: Set httpOnly JWT cookie

    Admin->>API: GET /admin/stats
    API->>DB: Count receipts by status (parallel)
    API-->>Admin: Stat tiles + tab counts

    Admin->>API: GET /admin/receipts?status=PENDING&page=1&limit=5
    API->>DB: Query receipts (skip/take) + count (parallel)
    API-->>Admin: Receipt list + pagination info

    Admin->>API: GET /uploads/:filename (view receipt image)
    API->>DB: Look up which receipt owns this file
    API->>API: Check requester is the owner or an admin
    API->>FS: Stream file
    API-->>Admin: 200 OK (image/PDF)

    Admin->>API: POST /admin/receipts/:id/approve
    API->>DB: Begin transaction
    API->>DB: Update Receipt (status = APPROVED) — conditional on still PENDING
    API->>DB: Create Voucher (code, amount, expiresAt)
    API->>DB: Commit transaction
    API-->>Admin: 200 OK (receipt + voucher)

    User->>API: GET /vouchers/me/stats
    API->>DB: Count vouchers by derived status (available/redeemed/expired)
    API-->>User: Tab counts

    User->>API: GET /vouchers/me?status=AVAILABLE&page=1&limit=5
    API->>DB: Query vouchers (skip/take) + count (parallel)
    API-->>User: Voucher list (code hidden in the UI until redeemedAt is set)

    User->>API: POST /vouchers/:id/redeem
    API->>DB: Check not already redeemed / not expired
    API->>DB: Update Voucher (redeemedAt = now)
    API-->>User: 200 OK (redeemed voucher, code now included)
    Note over User: Code shown in the redeem confirmation<br/>and revealed in the table row from here on
```

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

- **Auth:** JWT in an httpOnly, `SameSite=Lax` cookie (not `localStorage`, to avoid XSS token theft). Sessions expire after 30 minutes; an axios interceptor redirects to login on an expired/invalid session instead of leaving the UI stuck on a raw error.
- **Admin access:** a `role` field on `User`, not a separate table. Login is split into `/auth/login` (users only) and `/auth/admin-login` (admins only) — each rejects the wrong role with the same generic `401 Invalid credentials` used for a wrong password, so neither endpoint ever reveals whether an account of the other kind exists. `requireAdmin` middleware gates every `/api/admin/*` route as a second, independent layer.
- **Receipt/voucher integrity:** an approved receipt can never generate two vouchers — defended three ways: an early `409` if the receipt isn't `PENDING`; a conditional Prisma update (`where: { id, status: 'PENDING' }`) that safely loses a genuine concurrency race instead of double-approving; and a DB-level unique constraint on `Voucher.receiptId` as a last-resort backstop. Covered by a test that fires two concurrent approve requests and asserts exactly one success and one voucher row.
- **Voucher reward rule:** not specified by the brief, so it's a documented assumption (`server/src/lib/voucher.ts`) — 10% of the receipt amount, 90-day expiry. One place to change if a different rule was intended.
- **Money fields:** stored as Prisma `Decimal`, not `Float`, to avoid floating-point rounding on currency.
- **Testability:** Express app construction (`app.ts`) is separated from `app.listen()` (`index.ts`) so Supertest can exercise the app directly without binding a real port.
- **Voucher redemption:** user-initiated (no real point-of-sale integration in scope). A one-way stamp (`redeemedAt`) — blocked if already redeemed (`409`) or expired (`410`), scoped so a user can only redeem their own (`404` otherwise). The code itself stays hidden in the UI until redemption, to keep "redeem" a meaningful action rather than something skippable by just reading the table.
- **Duplicate protection:** `orderId` and `receiptNumber` are each unique **per user** (not globally) — resubmitting the same receipt to farm multiple vouchers is blocked with `409`, but two different users can share either value. An orphaned uploaded file is cleaned up if a duplicate is caught after Multer already wrote it to disk.
- **Field formats:** Order ID rejects whitespace; Receipt ID must be exactly 4 digits (numeric input mode + live digit-stripping + `maxLength` on the frontend); purchase date can't be in the future; amount is capped at RM 2000 (undocumented by the brief, an easily-changed assumption). All four are enforced both client-side (UX) and server-side (the real guarantee) — same defense-in-depth pattern throughout.
- **Async error handling:** Express 4 doesn't auto-catch a rejected promise from an `async` route handler (Express 5 does) — every route is wrapped in a small `asyncHandler` helper so an unexpected error reaches the centralized error handler instead of hanging the request forever.
- **File access:** uploaded receipts are served through an authenticated route (`GET /uploads/:filename`, owner-or-admin only, filename allowlisted against path traversal), not a public `express.static` mount, since they can contain personal information.
- **Pagination and stats:** every list endpoint shares one pattern — Zod-validated `page`/`limit`/`status`, Prisma `skip`/`take` with the total count fetched in parallel. Each list has a matching lightweight `/stats` endpoint so tab counts don't require fetching every row. Voucher "status" is derived (not stored) from `redeemedAt`/`expiresAt` via one shared helper used by both the list filter and the stats query, so they can't disagree. All three tables default to 5 rows/page, matched to a fixed 300px height.
- **Toast notifications:** a lightweight global toast system confirms successful actions (upload, redeem, approve/reject, profile/password changes); failures stay as inline `form-error` banners instead, since those need to stay visible until resolved.
- **Deliberately out of scope:** email notifications, and a live/public deployment (runs locally via npm or fully containerized via Docker Compose, but isn't deployed to a public host, per the brief).
- **Containerization:** multi-stage `Dockerfile`s for both server and client, tied together by `docker-compose.yml`. Migrations run automatically on server boot (`prisma migrate deploy` before start); nginx proxies the client to the API, so that setup has no cross-origin requests at all, unlike local dev.

## AI-assisted development

I used Claude (Claude Code / Cowork) throughout this project's
development, not just for isolated snippets — including:

- Implementing endpoints, Zod validation, and the Prisma schema against the assessment requirements
- Writing and iterating the Jest/Supertest suite (59 tests)
- Security hardening — rate limiting, the strict admin/user login boundary, the authenticated `/uploads/:filename` file route, wrapping async route handlers for Express 4
- Adding pagination and the `/stats` endpoints, and updating the React pages to match
- Writing this README and `API.md`, keeping both in sync as features were added

Business/functional decisions (the voucher reward percentage and expiry
period, the RM 2000 cap, field validation rules) were mine, made where
the brief didn't specify them and documented as assumptions above. All
generated code was reviewed before accepting it, and the app was run
and manually tested end to end throughout — AI sped up the mechanics of
turning a requirement into working, tested code; the requirements
themselves and verifying correctness stayed a human-in-the-loop process.
