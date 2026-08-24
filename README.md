# SMV Holdings — Backend (NestJS + PostgreSQL + Prisma)

Backend API for the **SMV Holdings Microfinance & Fund Management Platform**.

## Tech Stack

| Layer    | Technology                                       |
| -------- | ------------------------------------------------ |
| Runtime  | NestJS (TypeScript)                              |
| Database | PostgreSQL 14+                                   |
| ORM      | Prisma (JSONB `data` columns store rich objects) |
| Auth     | JWT (7-day) + RBAC guards (`admin`, `manager`, `staff`) |
| SMS      | Text.lk gateway (simulated when key is unset)    |

## Folder Structure

```
Backend/
├── .env                     # local environment (ignored in git)
├── .env.example             # documented env template
├── package.json             # dependencies + scripts
├── tsconfig.json
├── nest-cli.json
├── prisma/
│   ├── schema.prisma        # 5-table PostgreSQL schema
│   └── seed.ts              # default users baseline
├── uploads/                 # runtime passbook uploads (git-ignored)
└── src/
    ├── main.ts              # bootstrap (/api prefix, validation, CORS)
    ├── app.module.ts        # root module wiring
    ├── config/              # env, prisma module/service
    ├── common/              # guards, decorators, response, utils
    │   └── utils/
    │       ├── financial.ts # EMI, schedule, waterfall, settlement
    │       ├── dates.ts / id.ts / phone.ts
    ├── shared/
    │   ├── types.ts         # full domain + API contracts
    │   └── default-users.ts # seed baseline
    └── modules/
        ├── auth/            # POST /api/auth/login, GET /api/auth/me
        ├── users/           # /api/users CRUD + reset-defaults
        ├── loan/            # /api/loans lifecycle
        ├── consultancy/     # /api/consultancy/agreements
        ├── sms/             # /api/sms/send, /api/sms/logs
        └── reports/         # /api/reports/summary
```

---

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure PostgreSQL** — set `DATABASE_URL` in `.env`:

   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/smv_holdings"
   ```

3. **Create tables + generate client, then seed**

   ```bash
   npx prisma migrate push
   npx prisma generate
   npm seed
   ```

4. **Run the server**

   ```bash
   npm start
   ```

   The API is served under `http://localhost:3000/api`.

---

## Default Users

| Username      | Password     | Role    |
| ------------- | ------------ | ------- |
| `sysadmin`    | `Admin@123`  | `admin` |
| `mgr_perera`  | `Manager@123`| `manager` |
| `staff_jay`   | `Staff@123`  | `staff` |
---

## Core Business Rules

- **Reducing-Balance EMI**: `EMI = P·r(1+r)^n / ((1+r)^n − 1)`; periodic rate
  uses frequency periods per year (Monthly 12, Bi-Weekly 26, Weekly 52).
- **Flat Rate**: interest on the full principal for the term, split evenly.
- **Payment waterfall**: Late Fee → Interest → Principal across installments;
  balances & status are recomputed after each payment.
- **Status recalc**: `outstanding ≤ 0` → Settled; any late unpaid installment →
  Overdue; otherwise Active.
- **Early settlement**: quote = outstanding principal + accrued interest +
  penalty; unearned future interest waived.
- **Consultancy**: fixed 6-month term, `maturityDate = startDate + 6 months`,
  auto statuses (Active Placed → Maturing Soon → Maturity Reached).

---

## Object Storage (bucket uploads)

Uploads go straight to an S3-compatible bucket (Cloudflare R2 / MinIO / AWS S3)
via **presigned URLs**. The API never proxies file bytes — only the object key
is stored in PostgreSQL.

**Two-step flow for every upload endpoint:**

1. `POST .../passbook` (or `POST .../documents/presign`) with `{ fileName, contentType }`
   → server returns `{ key, uploadUrl }`.
2. Client `PUT`s the file bytes to `uploadUrl`, then confirms:
   `PUT /api/consultancy/agreements/:id/passbook` (or `PUT /api/loans/:id/documents/attach`)
   with the `key` → server verifies the object exists with a `HeadObject` call,
   persists the key, and returns a fresh presigned **GET** URL.

Keys are stored in:

- `consultancy_agreements.passbook_key` column
- `loans.data` → `kyc.documents[]` (`fileKey` per document)

Presigned GET URLs are re-issued on every `GET` (list + detail) so clients
always get a fresh, non-expired link.

### Environment variables

| Variable                | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `STORAGE_BUCKET_NAME`   | Bucket name (e.g. `file-bucket-...`)       |
| `STORAGE_ACCESS_KEY`    | Access key id / client id                  |
| `STORAGE_SECRET_KEY`    | Secret access key                          |
| `STORAGE_ENDPOINT`      | S3-compatible endpoint URL                 |
| `STORAGE_REGION`        | Region (R2 uses `auto`)                    |
| `STORAGE_PRESIGN_DURATION` | Presigned URL lifetime seconds (default 900) |

---

## Environment Reference

| Variable            | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `PORT`              | HTTP listener (default 3000)              |
| `DATABASE_URL`      | PostgreSQL connection string              |
| `JWT_SECRET`        | Token signing secret                      |
| `JWT_EXPIRES_IN`    | `7d` default                              |
| `TEXT_LK_API_KEY`   | Empty ⇒ SMS logged without live dispatch  |
| `TEXT_LK_SENDER_ID` | Sender name on Text.lk                    |
| `CORS_ORIGINS`      | Comma-separated allowed origins           |
| `UPLOAD_DIR`        | Legacy local upload dir (unused w/ bucket) |

---

## API Surface

Authentication & RBAC guard all routes. Sample calls:

```bash
# login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"sysadmin","password":"Admin@123"}'

# create loan (Bearer token required)
curl -X POST http://localhost:3000/api/loans \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{ ... CreateLoanPayload ... }'

# receive payment (waterfall allocation + SMS alert)
curl -X POST http://localhost:3000/api/loans/LN-2026-0001/payment \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{"amount":25000,"paymentMethod":"Bank Transfer","referenceNumber":"TXN-984210","receivedBy":"Manager John"}'

# portfolio summary
curl -X GET http://localhost:3000/api/reports/summary \
  -H "Authorization: Bearer <JWT>"
```

**Modules overview:**

- `auth`: `POST /api/auth/login`, `GET /api/auth/me`
- `users`: `GET/POST /api/users`, `PUT/DELETE /api/users/:id`, `POST /api/users/reset-defaults`
- `loans`: `GET /api/loans`, `GET/POST /api/loans/:id`,
  `POST :id/approve`, `POST :id/reject`, `PUT :id/kyc`, `POST :id/disburse`,
  `POST :id/payment`, `POST :id/early-settle`, `DELETE :id`,
  `POST :id/documents/presign`, `PUT :id/documents/attach`
- `sms`: `POST /api/sms/send`, `GET /api/sms/logs`
- `consultancy`: `GET/POST /api/consultancy/agreements`,
  `POST :id/return-funds`,
  `POST :id/passbook` (presign PUT), `PUT :id/passbook` (confirm + store key)
- `reports`: `GET /api/reports/summary`

For a React + Vite frontend, configure `VITE_API_BASE_URL=http://localhost:3000/api`.
An end-to-end integration test (login → consultancy → bucket upload → loan KYC
doc) is available in `e2e-test.ps1`.