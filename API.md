# API Reference — Loyalty Program

Full technical spec for every endpoint: auth requirements, request
shape (with validation rules), response shape, and every status code
each one can return. For a one-line-per-endpoint summary and the
overall request flow, see the main [README](./README.md).

## Conventions

- **Base URL:** all routes below are relative to `/api` (e.g.
  `POST /auth/register` means `POST http://localhost:5000/api/auth/register`),
  **except** the file route at the very end, which is not under `/api`.
- **Auth:** a JWT in an httpOnly, `SameSite=Lax` cookie (name configurable
  via `COOKIE_NAME`, default `loyalty_token`), set on register/login and
  cleared on logout. Expires after 30 minutes (`JWT_EXPIRES_IN`). Routes
  marked **Auth: required** reject with `401` if the cookie is
  missing/invalid; routes marked **Auth: admin** additionally reject
  with `403` if the account's role isn't `ADMIN`.
- **Errors:** every non-2xx response is `{ "error": "<message>" }`.
  Zod validation failures return the first validation error's message.
- **Pagination:** every list endpoint takes `page` (default `1`) and
  `limit` (default `5`, max `100`) as query params, and responds with
  `pagination: { page, limit, total, totalPages }` alongside the items.
  A `status` filter, where supported, narrows both the list and its
  `total` — use the matching `/stats` endpoint for always-unfiltered
  counts (e.g. for tab labels).
- **Rate limits:** `login` and `admin-login` allow 10 requests per 15
  minutes per IP; `register` allows 20 per hour per IP. Both respond
  `429` with `{ "error": "..." }` once exceeded. Disabled when
  `NODE_ENV=test`.

---

## Auth

### `POST /auth/register`
Auth: none · Rate limited (register)

| Field    | Type   | Rules |
| -------- | ------ | ----- |
| name     | string | required, non-empty |
| email    | string | valid email format; optional, but at least one of `email`/`phone` is required |
| phone    | string | digits only, starts with `0` or `60`, 9–13 digits total (regex `^(?:60|0)[0-9]{7,11}$`); optional under the same either/or rule |
| password | string | min 8 characters |

- `201` → `{ user: { id, name, email, phone, role } }`, sets the session cookie
- `400` → validation failure (missing name/password, bad email/phone format, or neither email nor phone given)
- `409` → an account already exists with this email or phone

### `POST /auth/login`
Auth: none · Rate limited (login)

| Field      | Type   | Rules |
| ---------- | ------ | ----- |
| identifier | string | required — the account's email or phone |
| password   | string | required |

- `200` → `{ user }`, sets the session cookie
- `400` → missing identifier/password
- `401` → `Invalid credentials` — wrong password, unknown identifier, **or** the identifier belongs to an `ADMIN` account (indistinguishable on purpose)

### `POST /auth/admin-login`
Same request/response shape as `/auth/login`, but only matches accounts
with role `ADMIN` — a `USER` account gets the same generic `401` a
wrong password would.

### `POST /auth/logout`
Auth: none required · Clears the session cookie regardless of whether one was present.

- `204` → No Content

### `GET /auth/me`
Auth: required

- `200` → `{ user: { id, name, email, phone, role, createdAt } }`
- `404` → the user record no longer exists (e.g. deleted after the token was issued)

### `PATCH /auth/me`
Auth: required

| Field | Type   | Rules |
| ----- | ------ | ----- |
| name  | string | required, non-empty |
| email | string | valid email, or empty string to clear; at least one of email/phone must remain set afterward |
| phone | string | same phone regex as registration, or empty string to clear |

- `200` → `{ user }`
- `400` → validation failure, or the update would leave both email and phone empty
- `409` → the new email/phone is already used by a different account

### `POST /auth/change-password`
Auth: required

| Field           | Type   | Rules |
| --------------- | ------ | ----- |
| currentPassword | string | required |
| newPassword     | string | min 8 characters |

- `204` → No Content
- `400` → validation failure
- `401` → `currentPassword` doesn't match
- `404` → user record not found (edge case)

---

## Receipts

### `POST /receipts`
Auth: required (USER only — an `ADMIN` account gets `403`, see Segregation of duties below) · `multipart/form-data`

| Field         | Type   | Rules |
| ------------- | ------ | ----- |
| orderId       | string | required, no whitespace |
| receiptNumber | string | exactly 4 digits |
| purchaseDate  | string | a parseable date, not in the future |
| amount        | string | a number, between 10 and 2000 inclusive |
| file          | file   | JPEG/PNG/WEBP/PDF only, max 5MB |

- `201` → `{ receipt }` (`status: "PENDING"`)
- `400` → any field validation failure, or no file attached
- `401` → not authenticated
- `403` → authenticated as an `ADMIN` account (`requireUser` — receipt/voucher endpoints are USER-only)
- `409` → this user already has a receipt with this exact `orderId` **and** `receiptNumber` pair together (the uploaded file is deleted from disk in this case)

Note: uniqueness is a single composite constraint —
`@@unique([userId, orderId, receiptNumber])` — not two separate ones. A
duplicate is only flagged when **both** fields match an existing receipt
for that user; matching just one (e.g. the same `receiptNumber` from two
different shops) is allowed. Two different users can always share either
value, or both.

### `GET /receipts/me`
Auth: required · Paginated

Query: `status` (`PENDING`/`APPROVED`/`REJECTED`, optional), `page`, `limit`.

- `200` → `{ receipts: Receipt[], pagination }` — only the current user's own receipts, each including its `voucher` if one has been issued
- `400` → invalid query params

### `GET /receipts/me/stats`
Auth: required

- `200` → `{ stats: { pendingReceipts, approvedReceipts, rejectedReceipts, totalReceipts } }` for the current user only

### `GET /receipts/:id`
Auth: required

- `200` → `{ receipt }`
- `404` → doesn't exist, or belongs to a different user (same response either way — no `403`, to avoid confirming a receipt ID exists)

---

## Vouchers

Voucher "status" (`AVAILABLE` / `REDEEMED` / `EXPIRED`) is derived, not
a stored column: `REDEEMED` = `redeemedAt` is set; `EXPIRED` =
`redeemedAt` is null and `expiresAt` is in the past; `AVAILABLE` =
neither of those.

### `GET /vouchers/me`
Auth: required · Paginated

Query: `status` (`AVAILABLE`/`REDEEMED`/`EXPIRED`, optional), `page`, `limit`.

- `200` → `{ vouchers: Voucher[], pagination }` — only the current user's own vouchers, each including a summary of the receipt it was issued for
- `400` → invalid query params

Note: `code` is `null` in this response for any voucher where
`redeemedAt` isn't set yet — stripped server-side, not just hidden by
the frontend. This is what actually makes "redeem to reveal" a
guarantee rather than a UI convention; reading the raw response before
redeeming doesn't leak the code.

### `GET /vouchers/me/stats`
Auth: required

- `200` → `{ stats: { availableVouchers, redeemedVouchers, expiredVouchers, totalVouchers } }` for the current user only

### `POST /vouchers/:id/redeem`
Auth: required

- `200` → `{ voucher }` with `redeemedAt` now set and `code` included — **this is the first response where the code is actually present**, since `GET /vouchers/me` strips it until redemption
- `404` → doesn't exist, or belongs to a different user
- `409` → already redeemed
- `410` → past `expiresAt`

---

## Admin

Every route below requires **Auth: admin** (`requireAuth` + `requireAdmin` — `401` if not logged in, `403` if logged in but not an `ADMIN`).

### `GET /admin/stats`

- `200` → `{ stats: { pendingReceipts, approvedReceipts, rejectedReceipts, totalReceipts, vouchersIssued } }` — across **all** users

### `GET /admin/receipts`
Paginated

Query: `status` (`PENDING`/`APPROVED`/`REJECTED`, optional), `page`, `limit`.

- `200` → `{ receipts: Receipt[], pagination }` — across all users, each including the submitting `user` (id/name/email/phone) and its `voucher` if issued
- `400` → invalid query params

### `POST /admin/receipts/:id/approve`

- `200` → `{ receipt, voucher }` — receipt flips to `APPROVED`, a voucher is created atomically in the same transaction (10% of the receipt amount, expires in 90 days)
- `403` → the receipt's `userId` matches the requesting admin's own id (see Segregation of duties below)
- `404` → receipt not found
- `409` → the receipt isn't `PENDING` (already approved/rejected — including the case where a concurrent request won the race)
- `500` → an internal voucher-code collision couldn't be resolved after 3 retries (extremely unlikely — codes are random from a 32-character alphabet)

### `POST /admin/receipts/:id/reject`

| Field  | Type   | Rules |
| ------ | ------ | ----- |
| reason | string | optional, non-empty if provided |

- `200` → `{ receipt }` (`status: "REJECTED"`, `rejectionReason` stored if given)
- `400` → invalid body
- `403` → the receipt's `userId` matches the requesting admin's own id (see Segregation of duties below)
- `404` → receipt not found
- `409` → the receipt isn't `PENDING`

**Segregation of duties:** an admin account can never approve or reject
a receipt it submitted itself. This is enforced twice — `requireUser`
on `receiptRoutes`/`voucherRoutes` means an admin can't submit a
receipt in the first place (`403` on `POST /receipts`), and
`approveReceipt`/`rejectReceipt` separately check `receipt.userId !==
req.user.userId` before doing anything else, so the guarantee doesn't
depend only on the first layer holding.

### `DELETE /admin/receipts/:id`

Deletes the receipt. If it has a voucher, the voucher is deleted in the
same transaction — unless it's already been redeemed, in which case the
whole request is refused instead. The uploaded file is best-effort
removed from disk afterward (a missing file doesn't fail the request).

- `204` → No Content
- `404` → receipt not found
- `409` → `Cannot delete — this receipt's voucher has already been redeemed`

---

## File access

### `GET /uploads/:filename`
**Not** under `/api` — matches where `Receipt.fileUrl` already points
(e.g. `/uploads/3b1e...-c9.jpg`). Replaces what would otherwise be a
public `express.static` mount, since receipt images can contain
personal information.

Auth: required · Ownership: the receipt's owner, or any admin

- `200` → the file, streamed from disk
- `400` → `filename` doesn't match the expected `<uuid>.<jpg|jpeg|png|webp|pdf>` shape (also blocks path traversal)
- `403` → authenticated, but neither the receipt's owner nor an admin
- `404` → no receipt references this filename

---

## Data model reference

See `server/prisma/schema.prisma` for the source of truth. Summary:

**User** — `id`, `name`, `email?` (unique), `phone?` (unique),
`password` (bcrypt hash), `role` (`USER`/`ADMIN`), `createdAt`,
`updatedAt`. At least one of `email`/`phone` is enforced at the
application layer, not the DB.

**Receipt** — `id`, `userId`, `orderId`, `receiptNumber` (4 digits) — the
pair unique together per user via `@@unique([userId, orderId,
receiptNumber])` — `purchaseDate`, `amount` (`Decimal(10,2)`),
`fileUrl`, `status` (`PENDING`/`APPROVED`/`REJECTED`), `submittedAt`,
`reviewedAt?`, `reviewedBy?`, `rejectionReason?`.

**Voucher** — `id`, `userId`, `receiptId` (unique — one voucher per
receipt, enforced at the DB level), `code` (unique), `amount`
(`Decimal(10,2)`), `issuedAt`, `expiresAt?`, `redeemedAt?`.
