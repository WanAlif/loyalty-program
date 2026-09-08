# Loyalty Program

A full-stack Loyalty Program app: users upload purchase receipts, admins
validate them, and approved receipts automatically generate vouchers.

**Stack:** React (client) · Node.js + Express + TypeScript (server) · PostgreSQL via Supabase · Prisma ORM · JWT auth (httpOnly cookie)

## Project status

This repo currently has the **backend scaffold + authentication** wired up
(register/login/logout, role-based middleware, Prisma schema). Receipt
upload, voucher logic, admin routes, and the React frontend are still to be
built.

## Prerequisites

- Node.js 18+ and npm
- A Supabase project (free tier) for PostgreSQL — https://supabase.com

## Backend setup (`server/`)

1. Install dependencies:
   ```bash
   cd server
   npm install
   ```

2. Create your local env file:
   ```bash
   cp .env.example .env
   ```
   Then fill in:
   - `DATABASE_URL` — from your Supabase project: Project Settings → Database → Connection string → URI
   - `JWT_SECRET` — any long random string (e.g. generate with `openssl rand -base64 32`)

3. Run the initial Prisma migration (creates the tables in your Supabase DB):
   ```bash
   npm run prisma:migrate -- --name init
   ```

4. Seed an admin + demo user:
   ```bash
   npm run prisma:seed
   ```
   This prints the seeded login credentials to the console — keep them, you'll need them to log in as admin.

5. Start the dev server:
   ```bash
   npm run dev
   ```
   The API runs at `http://localhost:5000`. Check `http://localhost:5000/api/health` to confirm it's up.

## Frontend setup (`client/`)

Not yet scaffolded — coming in the next phase (React + Vite).

## Pushing to GitHub

From the project root:
```bash
git init
git add .
git commit -m "Initial backend scaffold: Prisma schema, auth (JWT + httpOnly cookie), middleware"
git branch -M main
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

The `.gitignore` already excludes `node_modules/`, `.env`, and uploaded files, so nothing sensitive or heavy gets committed.

## Architecture notes / decisions

- **Auth:** JWT stored in an httpOnly, `SameSite=Lax` cookie rather than
  `localStorage` — avoids XSS token theft. CORS is configured with
  `credentials: true` and an explicit origin (required for cookies to
  work cross-origin between the Vite dev server and this API).
- **Admin access:** a `role` field on the same `User` table (not a
  separate admin table/login flow) — one login path, gated by
  `requireAdmin` middleware on admin-only routes. There's no
  "become admin" signup flow; the admin account is created by the
  Prisma seed script and its credentials are documented above.
- **Receipt/voucher integrity:** `Voucher.receiptId` is a unique column,
  so the database itself prevents a receipt from ever generating more
  than one voucher — even if an approve action is retried or double-clicked.
- **File storage:** local disk (`server/uploads/`), acceptable per the
  assessment brief. Not deployed publicly, so this has no persistence
  concerns for grading purposes.
- **Money fields:** stored as Prisma `Decimal`, not `Float`, to avoid
  floating-point rounding errors on currency amounts.
