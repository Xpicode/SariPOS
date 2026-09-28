# SariPOS: Sari-Sari Store POS System

**Stack:** PERN (PostgreSQL · Express · React · Node.js) + TypeScript
**Type:** Portfolio / learning project, built phase by phase
**Author:** Kian Cedrick P. Antones
**Plan version:** 1.0

> **How to use this file:** Work through the phases in order. Each phase has a **Goal**, **What you'll learn**, **Tasks** (checklist), **Key code** (only the important patterns; you write the rest), and **Done when** (the finish line). Don't start the next phase until every "Done when" item passes.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Folder Structure](#4-folder-structure)
5. [Database Design](#5-database-design)
6. [Business Logic Rules](#6-business-logic-rules)
7. [API Endpoints](#7-api-endpoints)
8. [Security Plan](#8-security-plan)
9. [Phase-by-Phase Build Plan](#9-phase-by-phase-build-plan)
10. [Coding Conventions](#10-coding-conventions)
11. [Definition of Done (whole project)](#11-definition-of-done-whole-project)

---

## 1. Project Overview

### Problem
Sari-sari store owners track sales, utang, GCash and load in notebooks. That leads to:
- Unknown real profit (sales ≠ profit)
- Cash drawer shortages nobody can explain
- Forgotten or disputed utang
- GCash/load float mixed with store cash

### Solution
A web-based POS that handles:

| Module | What it does |
|---|---|
| **POS / Checkout** | Fast selling with barcode or search, tingi (per-piece) selling |
| **Inventory** | Stock in/out, low-stock alerts, expiry, tingi conversion |
| **Utang (Credit)** | Customer ledger, credit limits, partial payments, aging |
| **GCash** | Cash-in / cash-out logging with auto fee computation |
| **E-load** | Load sales with wallet balance and commission tracking |
| **Cash Session** | Opening cash → expected vs. actual → over/short |
| **Reports** | Profit by source, best sellers, peak hours |
| **Users & Roles** | Owner vs. Bantay (cashier) permissions, audit log |

### Users (Roles)

| Role | Can do | Cannot do |
|---|---|---|
| **OWNER** | Everything: prices, users, reports, voids, stock adjustments | n/a |
| **CASHIER** (bantay) | Sell, record GCash/load, add utang, receive payments, open/close own shift | Edit prices, delete/void sales without owner PIN, see profit reports, manage users |

### Scope
- **MVP:** single store, web app (works on phone/tablet/PC browser), online only.
- **Later:** offline mode (PWA), multi-store, thermal printer, SMS reminders.

---

## 2. Tech Stack

### Frontend
| Tool | Why |
|---|---|
| **React 19 + Vite** | Fast dev server, the "R" in PERN |
| **TypeScript** | Catches bugs early; recruiters look for it |
| **React Router** | Page routing + protected routes |
| **TanStack Query** | Server state (fetching, caching, refetch) so you don't hand-write `useEffect` fetches |
| **React Hook Form + Zod** | Forms + validation (same Zod schemas style as backend) |
| **Tailwind CSS + shadcn/ui** | Fast, clean UI components |
| **barcode-detector** | Barcode scanning with phone camera (standard BarcodeDetector API; decoder self-hosted, not from a CDN) |
| **Recharts** | Dashboard charts |

### Backend
| Tool | Why |
|---|---|
| **Node.js 24 LTS** | Runtime |
| **Express 5** | The "E" in PERN; v5 handles async errors natively |
| **TypeScript + tsx** | Type safety; `tsx` runs TS directly in dev |
| **pg (node-postgres)** | Raw SQL; you *learn SQL* and transactions properly (no ORM magic) |
| **node-pg-migrate** | Versioned database migrations |
| **Zod** | Validate every request body/query/params |
| **argon2** | Password + PIN hashing (stronger than bcrypt) |
| **jsonwebtoken** | Access tokens (JWT) |
| **helmet** | Secure HTTP headers |
| **cors** | Restrict which frontend can call the API |
| **express-rate-limit** | Brute-force protection on login |
| **cookie-parser** | Read the httpOnly refresh-token cookie |
| **pino** | Structured logging |

### Database
| Tool | Why |
|---|---|
| **PostgreSQL 17** | The "P" in PERN; transactions, constraints, strong SQL |
| **Docker Compose** | Run Postgres locally with one command |

### Testing & Quality
| Tool | Why |
|---|---|
| **Vitest** | Unit tests (fee computation, tingi conversion) |
| **Supertest** | API integration tests |
| **ESLint + Prettier** | Consistent code |
| **npm audit / Dependabot** | Dependency vulnerability scanning |

### Deployment
| Part | Option |
|---|---|
| Database | **Neon** or **Supabase** (managed Postgres) |
| Backend | **Render** or **Railway** |
| Frontend | **Vercel** or **Netlify** |

### Tools to install first
- Node.js 24 LTS: https://nodejs.org
- Docker Desktop: https://www.docker.com
- Git + GitHub account
- VS Code (extensions: ESLint, Prettier, Tailwind CSS IntelliSense, PostgreSQL)
- A DB GUI: **DBeaver** or **pgAdmin** (to view your tables)
- **Bruno** or **Postman** (to test the API)

---

## 3. Architecture

```
┌─────────────────────────┐        HTTPS / JSON        ┌──────────────────────────┐
│  React (Vite) Frontend  │  ───────────────────────▶  │  Express API (Node.js)   │
│                         │  Authorization: Bearer JWT │                          │
│  - Pages & components   │  ◀───────────────────────  │  routes → controllers    │
│  - TanStack Query       │   httpOnly refresh cookie  │        → services        │
│  - Access token in      │                            │        → repositories    │
│    memory (not storage) │                            │  middleware: auth, RBAC, │
└─────────────────────────┘                            │  validate, rate-limit,   │
                                                       │  error handler, audit    │
                                                       └────────────┬─────────────┘
                                                                    │ pg (parameterized SQL)
                                                                    ▼
                                                       ┌──────────────────────────┐
                                                       │      PostgreSQL 17       │
                                                       │  constraints, FKs,       │
                                                       │  transactions, indexes   │
                                                       └──────────────────────────┘
```

### Backend layers (keep them separate)

| Layer | Job | Example |
|---|---|---|
| **routes** | URL + middleware wiring | `router.post('/sales', auth, validate(schema), createSale)` |
| **controllers** | Read request, call service, send response | No SQL here |
| **services** | Business rules | "Check stock, compute total, deduct stock" |
| **repositories** | SQL queries only | `INSERT INTO sales ...` |

Why: easy to test services, and easy to find where the logic lives.

---

## 4. Folder Structure

```
saripos/
├── docker-compose.yml
├── README.md
├── SariPOS-Project-Plan.md
│
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── migrations/                 # node-pg-migrate files
│   ├── seeds/                      # sample data
│   └── src/
│       ├── app.ts                  # express app (middleware, routes)
│       ├── server.ts               # starts the server
│       ├── config/
│       │   └── env.ts              # validated env vars (Zod)
│       ├── db/
│       │   ├── pool.ts             # pg Pool
│       │   └── transaction.ts      # withTransaction() helper
│       ├── middleware/
│       │   ├── auth.ts             # verify JWT
│       │   ├── requireRole.ts      # RBAC
│       │   ├── validate.ts         # Zod validation
│       │   ├── rateLimit.ts
│       │   └── errorHandler.ts
│       ├── utils/
│       │   ├── AppError.ts
│       │   ├── money.ts            # centavos helpers
│       │   └── audit.ts            # writeAudit()
│       ├── modules/
│       │   ├── auth/               # auth.routes.ts, auth.controller.ts, auth.service.ts, auth.schema.ts
│       │   ├── users/
│       │   ├── products/
│       │   ├── inventory/
│       │   ├── sales/
│       │   ├── customers/          # utang
│       │   ├── ewallet/            # gcash + eload
│       │   ├── cash-sessions/
│       │   ├── expenses/
│       │   └── reports/
│       └── tests/
│
└── client/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/                    # axios/fetch client + endpoint functions
        ├── auth/                   # AuthContext, ProtectedRoute, RoleGate
        ├── components/             # shared UI (shadcn)
        ├── features/
        │   ├── pos/                # cart, checkout
        │   ├── products/
        │   ├── inventory/
        │   ├── customers/
        │   ├── ewallet/
        │   ├── cash-session/
        │   └── reports/
        ├── hooks/
        ├── lib/                    # formatPeso(), utils
        └── pages/
```

---

## 5. Database Design

### 5.1 Golden rules
1. **Money is stored as `BIGINT` centavos.** ₱12.50 → `1250`. Never use `FLOAT` for money (0.1 + 0.2 ≠ 0.3).
2. **Stock is stored in the base unit** (pieces/grams). Packs and boxes convert to the base unit.
3. **Nothing important is hard-deleted.** Sales are *voided*, products are *deactivated* (`is_active = false`).
4. **Every stock change is a row in `stock_movements`** (a ledger). `products.stock_qty` is a cached total, updated in the same transaction.
5. **Every utang change is a row in `credit_ledger`.** Balance = sum of the ledger.
6. **Use `CHECK` constraints** so the database itself refuses bad data.

### 5.2 Entity Relationship (summary)

```
users ──< cash_sessions ──< sales ──< sale_items >── products ──< product_units
  │                           │                        │
  │                           └──< credit_ledger >── customers
  │                                                    
  ├──< ewallet_transactions >── ewallet_accounts
  ├──< stock_movements >── products
  ├──< expenses
  └──< audit_logs
products >── categories
products >── suppliers (optional)
fee_rules >── ewallet_accounts
```

### 5.3 Core tables (DDL starter)

> This is the design. Write it yourself as migrations in Phase 1 (one migration per group of tables).

```sql
-- ============ USERS ============
CREATE TYPE user_role AS ENUM ('OWNER', 'CASHIER');

CREATE TABLE users (
  id              BIGSERIAL PRIMARY KEY,
  username        VARCHAR(50)  NOT NULL UNIQUE,
  full_name       VARCHAR(100) NOT NULL,
  password_hash   TEXT         NOT NULL,
  pin_hash        TEXT,                        -- owner PIN for voids/overrides
  role            user_role    NOT NULL DEFAULT 'CASHIER',
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  failed_logins   INT          NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT      NOT NULL REFERENCES users(id),
  token_hash   TEXT        NOT NULL UNIQUE,     -- store a HASH, never the raw token
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ PRODUCTS ============
CREATE TABLE categories (
  id    BIGSERIAL PRIMARY KEY,
  name  VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE products (
  id              BIGSERIAL PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  category_id     BIGINT REFERENCES categories(id),
  base_unit       VARCHAR(20)  NOT NULL DEFAULT 'pc',   -- pc, g, ml
  stock_qty       INT          NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  reorder_level   INT          NOT NULL DEFAULT 5  CHECK (reorder_level >= 0),
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Tingi: one product, many selling units.
-- e.g. Marlboro: "stick" (factor 1, ₱10), "pack" (factor 20, ₱180)
CREATE TABLE product_units (
  id               BIGSERIAL PRIMARY KEY,
  product_id       BIGINT       NOT NULL REFERENCES products(id),
  unit_name        VARCHAR(30)  NOT NULL,                 -- stick, pack, ream
  factor           INT          NOT NULL CHECK (factor > 0), -- how many base units
  barcode          VARCHAR(50)  UNIQUE,
  cost_centavos    BIGINT       NOT NULL CHECK (cost_centavos >= 0),
  price_centavos   BIGINT       NOT NULL CHECK (price_centavos >= 0),
  is_default       BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  UNIQUE (product_id, unit_name)
);

CREATE TABLE price_history (
  id               BIGSERIAL PRIMARY KEY,
  product_unit_id  BIGINT NOT NULL REFERENCES product_units(id),
  old_price        BIGINT NOT NULL,
  new_price        BIGINT NOT NULL,
  old_cost         BIGINT NOT NULL,
  new_cost         BIGINT NOT NULL,
  changed_by       BIGINT NOT NULL REFERENCES users(id),
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ INVENTORY LEDGER ============
CREATE TYPE movement_type AS ENUM ('STOCK_IN', 'SALE', 'VOID_RETURN', 'ADJUSTMENT', 'SPOILAGE');

CREATE TABLE stock_movements (
  id            BIGSERIAL PRIMARY KEY,
  product_id    BIGINT        NOT NULL REFERENCES products(id),
  type          movement_type NOT NULL,
  qty_change    INT           NOT NULL,        -- + in, - out (base units)
  unit_cost     BIGINT,                        -- for STOCK_IN
  expiry_date   DATE,
  reference_id  BIGINT,                        -- sale_id etc.
  note          VARCHAR(255),
  created_by    BIGINT        NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ============ CASH SESSIONS (shifts) ============
CREATE TABLE cash_sessions (
  id                BIGSERIAL PRIMARY KEY,
  opened_by         BIGINT      NOT NULL REFERENCES users(id),
  opening_cash      BIGINT      NOT NULL CHECK (opening_cash >= 0),
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ,
  expected_cash     BIGINT,      -- computed on close
  actual_cash       BIGINT,      -- counted by cashier
  over_short        BIGINT,      -- actual - expected
  notes             VARCHAR(255)
);
-- Only ONE open session at a time:
CREATE UNIQUE INDEX one_open_session ON cash_sessions ((closed_at IS NULL)) WHERE closed_at IS NULL;

-- ============ CUSTOMERS / UTANG ============
CREATE TABLE customers (
  id                   BIGSERIAL PRIMARY KEY,
  name                 VARCHAR(100) NOT NULL,
  phone                VARCHAR(20),
  address              VARCHAR(255),
  credit_limit         BIGINT  NOT NULL DEFAULT 50000 CHECK (credit_limit >= 0), -- ₱500
  is_blocked           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ SALES ============
CREATE TYPE sale_status AS ENUM ('COMPLETED', 'VOIDED');
CREATE TYPE payment_type AS ENUM ('CASH', 'UTANG', 'GCASH');

CREATE TABLE sales (
  id                BIGSERIAL PRIMARY KEY,
  sale_no           VARCHAR(30)  NOT NULL UNIQUE,     -- e.g. S-20261001-0001
  idempotency_key   UUID         NOT NULL UNIQUE,     -- prevents double submit
  cash_session_id   BIGINT       NOT NULL REFERENCES cash_sessions(id),
  cashier_id        BIGINT       NOT NULL REFERENCES users(id),
  customer_id       BIGINT       REFERENCES customers(id),  -- required if UTANG
  payment_type      payment_type NOT NULL,
  subtotal          BIGINT       NOT NULL CHECK (subtotal >= 0),
  discount          BIGINT       NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total             BIGINT       NOT NULL CHECK (total >= 0),
  total_cost        BIGINT       NOT NULL CHECK (total_cost >= 0),  -- for profit
  amount_tendered   BIGINT,
  change_given      BIGINT,
  gcash_ref_no      VARCHAR(40),
  status            sale_status  NOT NULL DEFAULT 'COMPLETED',
  voided_by         BIGINT       REFERENCES users(id),
  void_reason       VARCHAR(255),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (payment_type <> 'UTANG' OR customer_id IS NOT NULL)
);

CREATE TABLE sale_items (
  id                BIGSERIAL PRIMARY KEY,
  sale_id           BIGINT NOT NULL REFERENCES sales(id),
  product_id        BIGINT NOT NULL REFERENCES products(id),
  product_unit_id   BIGINT NOT NULL REFERENCES product_units(id),
  qty               INT    NOT NULL CHECK (qty > 0),       -- in selling unit
  base_qty          INT    NOT NULL CHECK (base_qty > 0),  -- qty * factor
  unit_price        BIGINT NOT NULL,   -- SNAPSHOT of price at time of sale
  unit_cost         BIGINT NOT NULL,   -- SNAPSHOT of cost at time of sale
  line_total        BIGINT NOT NULL
);

CREATE TYPE credit_entry AS ENUM ('CHARGE', 'PAYMENT', 'ADJUSTMENT');

CREATE TABLE credit_ledger (
  id            BIGSERIAL PRIMARY KEY,
  customer_id   BIGINT       NOT NULL REFERENCES customers(id),
  type          credit_entry NOT NULL,
  amount        BIGINT       NOT NULL,   -- CHARGE = +, PAYMENT = -
  sale_id       BIGINT       REFERENCES sales(id),
  note          VARCHAR(255),
  created_by    BIGINT       NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ============ GCASH / E-LOAD ============
CREATE TYPE wallet_kind AS ENUM ('GCASH', 'MAYA', 'ELOAD');

CREATE TABLE ewallet_accounts (
  id               BIGSERIAL PRIMARY KEY,
  name             VARCHAR(60) NOT NULL,        -- "GCash (09xx...)", "Load Wallet"
  kind             wallet_kind NOT NULL,
  balance          BIGINT      NOT NULL DEFAULT 0 CHECK (balance >= 0),
  low_balance_alert BIGINT     NOT NULL DEFAULT 100000,  -- ₱1,000
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE
);

-- Tiered fees. e.g. 1–500 = ₱10, 501–1000 = ₱20
CREATE TABLE fee_rules (
  id               BIGSERIAL PRIMARY KEY,
  wallet_kind      wallet_kind NOT NULL,
  txn_type         VARCHAR(20) NOT NULL,       -- CASH_IN, CASH_OUT
  min_amount       BIGINT NOT NULL,
  max_amount       BIGINT NOT NULL,
  fee              BIGINT NOT NULL CHECK (fee >= 0),
  CHECK (max_amount >= min_amount)
);

CREATE TYPE ewallet_txn_type AS ENUM ('CASH_IN', 'CASH_OUT', 'ELOAD', 'TOP_UP', 'WITHDRAW');

CREATE TABLE ewallet_transactions (
  id                 BIGSERIAL PRIMARY KEY,
  idempotency_key    UUID             NOT NULL UNIQUE,
  cash_session_id    BIGINT           REFERENCES cash_sessions(id),
  account_id         BIGINT           NOT NULL REFERENCES ewallet_accounts(id),
  type               ewallet_txn_type NOT NULL,
  amount             BIGINT           NOT NULL CHECK (amount > 0),
  fee                BIGINT           NOT NULL DEFAULT 0,    -- store income
  wallet_change      BIGINT           NOT NULL,              -- effect on e-wallet balance
  cash_change        BIGINT           NOT NULL,              -- effect on cash drawer
  customer_number    VARCHAR(20),     -- mobile no. (mask in UI)
  reference_no       VARCHAR(40),
  telco              VARCHAR(20),     -- GLOBE, SMART, DITO, TNT, TM (eload)
  status             sale_status      NOT NULL DEFAULT 'COMPLETED',
  created_by         BIGINT           NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- ============ EXPENSES ============
CREATE TABLE expenses (
  id               BIGSERIAL PRIMARY KEY,
  cash_session_id  BIGINT REFERENCES cash_sessions(id),
  category         VARCHAR(40) NOT NULL,  -- ELECTRIC, RENT, SUPPLIES, OWNER_WITHDRAWAL
  amount           BIGINT NOT NULL CHECK (amount > 0),
  paid_from_drawer BOOLEAN NOT NULL DEFAULT TRUE,
  note             VARCHAR(255),
  created_by       BIGINT NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ AUDIT LOG (append-only) ============
CREATE TABLE audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT REFERENCES users(id),
  action       VARCHAR(60) NOT NULL,     -- SALE_VOID, PRICE_CHANGE, LOGIN_FAILED ...
  entity       VARCHAR(40),
  entity_id    BIGINT,
  before_data  JSONB,
  after_data   JSONB,
  ip_address   INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ INDEXES ============
CREATE INDEX idx_sales_created_at       ON sales (created_at);
CREATE INDEX idx_sales_session          ON sales (cash_session_id);
CREATE INDEX idx_sale_items_sale        ON sale_items (sale_id);
CREATE INDEX idx_stock_mov_product      ON stock_movements (product_id, created_at);
CREATE INDEX idx_credit_ledger_customer ON credit_ledger (customer_id, created_at);
CREATE INDEX idx_ewallet_txn_created    ON ewallet_transactions (created_at);
CREATE INDEX idx_products_name          ON products (lower(name));
```

---

## 6. Business Logic Rules

### 6.1 Tingi conversion
- `base_qty = qty × factor`
- Selling 2 packs of cigarettes (factor 20) deducts **40 sticks** from stock.
- Stock-in of 1 box of noodles (factor 72) adds **72 pcs**.
- Display stock nicely: `130 sticks → 6 packs + 10 sticks`.

### 6.2 Sale (checkout)
1. Frontend sends **only** `product_unit_id` + `qty` (+ payment info + idempotency key).
2. Backend **loads prices from the DB**. Never trust prices from the client.
3. In **one DB transaction**: insert sale → insert items (price/cost snapshots) → deduct stock (`WHERE stock_qty >= needed`) → insert stock movements → if UTANG, insert credit ledger CHARGE.
4. If any step fails → `ROLLBACK`. Nothing is half-saved.

### 6.3 Utang
- `balance = SUM(credit_ledger.amount)` for the customer.
- Block new UTANG if `customer.is_blocked` **or** `balance + new_total > credit_limit`.
- Payment = ledger row with a **negative** amount (cash drawer +).
- Aging buckets: 0–7, 8–15, 16–30, 30+ days (based on oldest unpaid charge).

### 6.4 GCash / Maya / E-load money flow

Think of **two pockets**: the **cash drawer** and the **e-wallet**.

| Transaction | What happens | E-wallet | Cash drawer | Store earns |
|---|---|---|---|---|
| **Cash-In** ₱500 (fee ₱10) | Customer gives ₱510 cash, store sends ₱500 via GCash | **−500** | **+510** | 10 |
| **Cash-Out** ₱500 (fee ₱10) | Customer sends ₱500 to store GCash, store gives ₱490 cash* | **+500** | **−490** | 10 |
| **E-load** ₱100 (cost ₱97) | Customer pays ₱100 cash, load wallet deducted ₱97 | **−97** | **+100** | 3 |
| **Top-up** wallet ₱2,000 | Owner loads the wallet from the drawer/bank | +2000 | −2000 (if from drawer) | 0 |

\* Some stores charge the fee separately (give ₱500, collect ₱10). Make this a **setting**.

Rules:
- Cash-in is **blocked** if the wallet balance < amount.
- Cash-out is **blocked** if expected cash in drawer < payout.
- Fee comes from `fee_rules` (auto), and the owner can override it with a reason (audited).
- Save `reference_no` for disputes.

> Note: GCash/Maya have no public API for small sari-sari stores, so this module **logs** transactions done in the real app. That's expected and fine.

### 6.5 Cash session (end-of-day)
```
expected_cash = opening_cash
              + cash sales                 (payment_type = CASH, not voided)
              + utang payments received in cash
              + e-wallet cash_change total (cash-in, cash-out, eload)
              − expenses paid from drawer
over_short    = actual_cash − expected_cash
```
- Cashier counts the drawer and enters `actual_cash`. The system shows **over/short**.
- Sales require an **open session**.

### 6.6 Voids
- Only OWNER, or CASHIER **with owner PIN**.
- Void = set status `VOIDED` + return stock (`VOID_RETURN` movement) + reverse utang charge. Never delete.
- Always write an `audit_logs` row.

### 6.7 Profit
```
product profit = SUM(sale_items.line_total − unit_cost × qty)   (completed sales)
gcash profit   = SUM(fee) on CASH_IN / CASH_OUT
eload profit   = SUM(cash_change + wallet_change) on ELOAD
net profit     = product + gcash + eload − business expenses (excl. OWNER_WITHDRAWAL)
```

---

## 7. API Endpoints

Base URL: `/api/v1`  ·  🔓 public  ·  🔐 any logged-in user  ·  👑 OWNER only

### Auth
| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/auth/login` | 🔓 | Login → access token + refresh cookie |
| POST | `/auth/refresh` | 🔓 (cookie) | New access token (rotates refresh token) |
| POST | `/auth/logout` | 🔐 | Revoke refresh token |
| GET | `/auth/me` | 🔐 | Current user |
| POST | `/auth/verify-pin` | 🔐 | Owner PIN check for overrides |

### Users
| GET/POST | `/users` | 👑 | List / create users |
| PATCH | `/users/:id` | 👑 | Edit, deactivate, reset password |

### Products & Inventory
| GET | `/products?search=&category=&lowStock=` | 🔐 | List/search |
| GET | `/products/barcode/:code` | 🔐 | Scan lookup |
| POST | `/products` | 👑 | Create (with units) |
| PATCH | `/products/:id` | 👑 | Edit (price change → price_history) |
| POST | `/inventory/stock-in` | 👑 | Add stock |
| POST | `/inventory/adjust` | 👑 | Adjustment / spoilage (reason required) |
| GET | `/inventory/movements?productId=` | 👑 | Stock history |
| GET | `/inventory/expiring?days=7` | 🔐 | Near-expiry items |

### Sales
| POST | `/sales` | 🔐 | Checkout |
| GET | `/sales?from=&to=` | 🔐 | List (cashier: own session only) |
| GET | `/sales/:id` | 🔐 | Receipt detail |
| POST | `/sales/:id/void` | 🔐 + PIN | Void |

### Customers (Utang)
| GET/POST | `/customers` | 🔐 | List (with balance) / create |
| GET | `/customers/:id/ledger` | 🔐 | Statement |
| POST | `/customers/:id/payments` | 🔐 | Receive payment |
| PATCH | `/customers/:id` | 👑 | Limit, block |
| GET | `/customers/aging` | 👑 | Aging report |

### E-wallet
| GET | `/ewallet/accounts` | 🔐 | Balances |
| POST | `/ewallet/fee-preview` | 🔐 | Compute fee before confirming |
| POST | `/ewallet/transactions` | 🔐 | Cash-in / cash-out / eload |
| POST | `/ewallet/accounts/:id/top-up` | 👑 | Add float |
| GET/PUT | `/ewallet/fee-rules` | 👑 | Manage fees |

### Cash Sessions & Expenses
| GET | `/cash-sessions/current` | 🔐 | Current open session + running expected cash |
| POST | `/cash-sessions/open` | 🔐 | Open with opening cash |
| POST | `/cash-sessions/:id/close` | 🔐 | Close with actual cash |
| POST/GET | `/expenses` | 🔐 / 👑 | Record / list |

### Reports
| GET | `/reports/dashboard` | 👑 | Today's sales, profit, low stock, wallet balances |
| GET | `/reports/profit?from=&to=` | 👑 | Profit by source |
| GET | `/reports/best-sellers?from=&to=` | 👑 | Top/slow items |
| GET | `/reports/peak-hours` | 👑 | Sales by hour |
| GET | `/audit-logs` | 👑 | Audit trail |

### Standard response format
```json
// success
{ "data": { ... } }
// error
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "Not enough stock for Coke 1L" } }
```

---

## 8. Security Plan

> Think like an attacker: **"Who can abuse this, and how?"** In a sari-sari POS the biggest real threats are **a dishonest user inside the store** (voiding sales, editing prices, deleting utang) and **account takeover** of the deployed web app.

### 8.1 Threat model (simple)

| Threat | Example | Control |
|---|---|---|
| Insider fraud | Bantay voids a cash sale and pockets the money | Void needs owner PIN, audit log, over/short report |
| Price tampering | Request is edited to set price ₱0 | Server loads prices from DB; client prices ignored |
| Brute-force login | Bot tries 10,000 passwords | Rate limit + account lockout + argon2 |
| Stolen token | XSS steals token from localStorage | Access token in memory only; refresh token in httpOnly cookie |
| SQL injection | `name = "'; DROP TABLE sales; --"` | Parameterized queries only (`$1, $2`) |
| Broken access control | Cashier calls `/reports/profit` directly | `requireRole('OWNER')` on the server, not just hidden buttons |
| IDOR | Cashier changes `/sales/15` → `/sales/16` from another shift | Check ownership/session in the query |
| Double submit | Slow network, cashier taps "Pay" twice | `idempotency_key` UNIQUE |
| Race condition | Two cashiers sell the last item at once | `UPDATE ... WHERE stock_qty >= $1` inside a transaction |
| Data leak | Stack trace / DB error shown to user | Global error handler returns generic messages |
| Customer privacy | Utang list with names + phones exposed | Auth on all routes, mask phone numbers, Data Privacy Act (RA 10173) |

### 8.2 OWASP Top 10 checklist

- [ ] **A01 Broken Access Control:** RBAC middleware on every route; server-side ownership checks; deny by default.
- [ ] **A02 Cryptographic Failures:** HTTPS in production; argon2id for passwords/PINs; refresh tokens stored **hashed**; secrets only in env.
- [ ] **A03 Injection:** 100% parameterized SQL; Zod validates all input; no string-concatenated SQL.
- [ ] **A04 Insecure Design:** Ledgers (stock, credit), voids instead of deletes, DB `CHECK` constraints.
- [ ] **A05 Security Misconfiguration:** `helmet()`, strict CORS origin, `x-powered-by` disabled, no default passwords, prod error handler hides stack traces.
- [ ] **A06 Vulnerable Components:** `npm audit` on every phase; enable GitHub Dependabot.
- [ ] **A07 Auth Failures:** Rate-limit login (5 per 15 min per IP+username); lock account after 5 failed attempts; short-lived access token (15 min); refresh token rotation.
- [ ] **A08 Data Integrity:** Idempotency keys; DB transactions; price/cost snapshots on sale items.
- [ ] **A09 Logging & Monitoring:** `audit_logs` for voids, price changes, stock adjustments, failed logins, user changes. Never log passwords or tokens.
- [ ] **A10 SSRF:** No user-supplied URLs are fetched by the server (keep it that way).

### 8.3 Auth design

```
Login ──▶ verify argon2 hash ──▶ issue:
   • accessToken  (JWT, 15 min, in JSON body → kept in React memory)
   • refreshToken (random 64 bytes, 7 days, httpOnly + Secure + SameSite=Strict cookie,
                   stored as SHA-256 hash in refresh_tokens table)

Every request ──▶ Authorization: Bearer <accessToken>
Access expired ──▶ POST /auth/refresh (cookie) ──▶ revoke old refresh, issue new pair (rotation)
Refresh token reused after revoke ──▶ revoke ALL tokens of that user (possible theft)
Logout ──▶ revoke refresh token + clear cookie
```

JWT payload stays minimal: `{ sub: userId, role }`. No names, no phone numbers.

### 8.4 Password & PIN policy
- Password: minimum 8 characters, argon2id.
- Owner PIN: 4–6 digits, argon2id, **rate-limited** (5 tries, then 15-min lock).
- The owner can force a password reset for a cashier.

### 8.5 Environment & secrets
```bash
# server/.env.example   (commit this; never commit .env)
NODE_ENV=development
PORT=4000
DATABASE_URL=postgres://saripos_app:change_me@localhost:5432/saripos
JWT_ACCESS_SECRET=generate_with_openssl_rand_base64_48
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=7
CLIENT_ORIGIN=http://localhost:5173
```
- Generate secrets: `openssl rand -base64 48`
- Validate env at startup with Zod; the app **refuses to start** if a variable is missing.
- The DB app user is **not a superuser** (least privilege).

### 8.6 Backup
- Daily `pg_dump` (managed DBs like Neon/Supabase have point-in-time restore; turn it on).
- Test a restore at least once. A backup you never restored is only a hope.

---

## 9. Phase-by-Phase Build Plan

**Estimated timeline:** ~10–12 weeks part-time (1–2 hrs/day). Adjust freely.

| Phase | Name | Est. |
|---|---|---|
| 0 | Setup & Foundations | 3–4 days |
| 1 | Database & Migrations | 4–5 days |
| 2 | Authentication & Roles | 1 week |
| 3 | Products & Inventory | 1.5 weeks |
| 4 | POS Checkout | 1.5 weeks |
| 5 | Cash Sessions & Expenses | 4–5 days |
| 6 | Utang (Credit) | 1 week |
| 7 | GCash & E-load | 1 week |
| 8 | Reports & Dashboard | 1 week |
| 9 | Security Hardening & Testing | 1 week |
| 10 | Deployment & Portfolio | 3–4 days |
| 11 | Future Upgrades | optional |

---

### Phase 0: Setup & Foundations

**Goal:** Empty but running backend + frontend + database, connected.

**You'll learn:** Monorepo structure, Docker, TypeScript config, env validation.

**Tasks**
- [ ] Create GitHub repo `saripos`, add `.gitignore` (node_modules, .env, dist)
- [ ] `docker-compose.yml` with Postgres 17
- [ ] `server/`: `npm init`, install Express 5, TypeScript, tsx, pg, zod, dotenv, helmet, cors, pino
- [ ] `client/`: `npm create vite@latest client -- --template react-ts`, add Tailwind + shadcn/ui
- [ ] `config/env.ts` validates env with Zod
- [ ] `GET /api/v1/health` returns `{ status: "ok", db: "ok" }` (runs `SELECT 1`)
- [ ] Global error handler + `AppError` class
- [ ] ESLint + Prettier on both apps
- [ ] Frontend calls `/health` and shows "Connected ✅"

**Key code**

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: saripos_app
      POSTGRES_PASSWORD: change_me
      POSTGRES_DB: saripos
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
volumes:
  pgdata:
```
→ Runs Postgres in a container. `volumes` keeps your data when the container restarts.

```ts
// src/config/env.ts
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  CLIENT_ORIGIN: z.string().url(),
});

export const env = schema.parse(process.env); // crashes on startup if invalid, which is good
```
→ One place for config. Bad or missing secrets fail fast instead of breaking later.

```ts
// src/utils/AppError.ts
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// src/middleware/errorHandler.ts
import type { ErrorRequestHandler } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  logger.error(err);                                   // full detail in server logs only
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
};
```
→ Known errors return clean messages. Unknown errors are logged, and the user only sees a generic message (no stack trace leak).

**Done when**
- [ ] `docker compose up -d` starts the DB
- [ ] `npm run dev` in both folders works
- [ ] Browser shows "Connected ✅" from the real API + DB
- [ ] Missing `.env` value → server refuses to start with a clear error

---

### Phase 1: Database & Migrations

**Goal:** All tables from Section 5 created through migrations, with seed data.

**You'll learn:** Relational design, constraints, enums, indexes, migrations.

**Tasks**
- [x] Install `node-pg-migrate`, add scripts `migrate:up`, `migrate:down`, `migrate:create`
- [x] Migration 001: users, refresh_tokens
- [x] Migration 002: categories, products, product_units, price_history
- [x] Migration 003: stock_movements
- [x] Migration 004: cash_sessions, customers, sales, sale_items, credit_ledger
- [x] Migration 005: ewallet_accounts, fee_rules, ewallet_transactions
- [x] Migration 006: expenses, audit_logs, indexes
- [x] Seed script: 1 owner, 1 cashier, 5 categories, ~30 real sari-sari products (with tingi units), GCash + Load wallets, default fee rules
- [x] `db/pool.ts` and `db/transaction.ts`
- [x] Try breaking constraints manually in DBeaver (negative stock, UTANG without customer) and confirm the DB rejects them (automated: `npm run db:check`, 24 cases)

**Key code**

```ts
// src/db/pool.ts
import { Pool } from 'pg';
import { env } from '../config/env';
export const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
```

```ts
// src/db/transaction.ts
import type { PoolClient } from 'pg';
import { pool } from './pool';

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');   // undo everything if any step fails
    throw err;
  } finally {
    client.release();                 // always return the connection to the pool
  }
}
```
→ You reuse this helper for sales, voids, stock-in, and anything else that must be all-or-nothing.

**Done when**
- [x] `migrate:up` builds the full schema on an empty DB; `migrate:down` removes it cleanly
- [x] Seed runs and data shows in DBeaver
- [ ] You can explain every table and FK in your own words (interview practice!)

---

### Phase 2: Authentication & Roles

**Goal:** Secure login for OWNER and CASHIER, with protected routes on both backend and frontend.

**You'll learn:** Password hashing, JWT, httpOnly cookies, refresh rotation, RBAC, rate limiting.

**Tasks — Backend**
- [x] `POST /auth/login` with argon2 verify, lockout after 5 fails, rate limit
- [x] Issue access token (JWT 15m) + refresh cookie (hashed in DB)
- [x] `POST /auth/refresh` with rotation + reuse detection
- [x] `POST /auth/logout`, `GET /auth/me`
- [x] `auth` middleware + `requireRole()` middleware
- [x] `validate()` Zod middleware
- [x] Users CRUD (OWNER only), set/reset owner PIN
- [x] Audit: LOGIN_SUCCESS, LOGIN_FAILED, USER_CREATED

**Tasks — Frontend**
- [x] Login page (React Hook Form + Zod)
- [x] `AuthContext` keeps access token **in memory** (not localStorage)
- [x] API client: on 401 → call `/auth/refresh` once → retry request
- [x] `ProtectedRoute` + `RoleGate` components
- [x] Layout with sidebar; OWNER-only menu items hidden for cashier

**Key code**

```ts
// src/middleware/auth.ts
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

export const auth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHORIZED', 'Login required');
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as { sub: string; role: 'OWNER' | 'CASHIER' };
    req.user = { id: Number(payload.sub), role: payload.role };
    next();
  } catch {
    throw new AppError(401, 'TOKEN_INVALID', 'Session expired');
  }
};

// src/middleware/requireRole.ts
export const requireRole = (...roles: Array<'OWNER' | 'CASHIER'>): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', 'Not allowed');
    next();
  };
```
→ `auth` answers "who are you?" and `requireRole` answers "are you allowed?". Both run on the **server**, because hiding a button in React is not security.

```ts
// src/middleware/validate.ts
import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../utils/AppError';

export const validate = (schema: ZodType): RequestHandler => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', result.error.issues[0].message);
  req.body = result.data;     // only validated, typed data continues
  next();
};
```

```ts
// Refresh cookie settings
res.cookie('refresh_token', rawToken, {
  httpOnly: true,                        // JS can't read it → XSS can't steal it
  secure: env.NODE_ENV === 'production', // HTTPS only in prod
  sameSite: 'strict',                    // blocks CSRF from other sites
  path: '/api/v1/auth',                  // only sent to auth routes
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
```

**Done when**
- [x] Wrong password 5× → account locked, audit rows exist
- [ ] Cashier calling `GET /reports/profit` with Postman → **403**
- [x] Refreshing the browser keeps you logged in (via refresh cookie)
- [x] No token anywhere in localStorage/sessionStorage (check DevTools)

---

### Phase 3: Products & Inventory

**Goal:** Manage products with tingi units, barcode, stock-in, adjustments, and low-stock/expiry alerts.

**You'll learn:** One-to-many forms, ledger pattern, JOIN queries, search.

**Tasks — Backend**
- [x] Products CRUD (create product + units in **one transaction**)
- [x] Price change → insert `price_history` + audit log
- [x] Barcode lookup endpoint
- [x] Stock-in (by selected unit → converts to base qty), with cost + optional expiry
- [x] Adjustment / spoilage (reason required, OWNER only)
- [x] Movement history per product
- [x] Low-stock list (`stock_qty <= reorder_level`) and expiring list

**Tasks — Frontend**
- [x] Product list: search, category filter, low-stock badge
- [x] Product form with **dynamic unit rows** (stick / pack / box)
- [x] Stock-in form + camera barcode scanner (used `barcode-detector` instead of `html5-qrcode`, which is unmaintained since 2023)
- [x] Stock display helper: `130 → "6 packs + 10 sticks"`
- [x] `formatPeso(centavos)` helper, e.g. `1250 → ₱12.50`

**Key code**

```ts
// src/utils/money.ts
export const toCentavos = (pesos: number) => Math.round(pesos * 100);
export const formatPeso = (centavos: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100);
```
→ Convert **once** at the edge (form input). Everything inside the system is integer centavos.

```sql
-- Stock-in inside a transaction
UPDATE products SET stock_qty = stock_qty + $1, updated_at = now() WHERE id = $2;
INSERT INTO stock_movements (product_id, type, qty_change, unit_cost, expiry_date, created_by)
VALUES ($2, 'STOCK_IN', $1, $3, $4, $5);
```

**Done when**
- [x] Create "Marlboro Red" with `stick ×1 ₱10` and `pack ×20 ₱180`
- [x] Stock-in 1 ream (10 packs) → stock shows 200 sticks
- [x] Every stock change has a matching `stock_movements` row
- [x] Cashier cannot edit prices (403)

---

### Phase 4: POS Checkout ⭐ (the heart of the system)

**Goal:** Fast, safe checkout with cart, cash/GCash payment, change computation, and a receipt.

**You'll learn:** DB transactions, race conditions, idempotency, snapshot data, UX for speed.

**Tasks — Backend**
- [x] `POST /sales`: validate → require open cash session → load prices from DB → transaction (sale, items, stock deduct, movements)
- [x] Idempotency key check (return the existing sale if the same key is sent again)
- [x] Generate `sale_no` (e.g. `S-20261001-0001`)
- [x] Void endpoint (OWNER or owner PIN) → return stock + audit
- [x] Sales list (cashier sees only their session)

**Tasks — Frontend**
- [x] POS screen: search/scan box on top, product grid, cart on the right
- [x] Unit selector per item (stick/pack)
- [x] Qty +/- , remove item, clear cart
- [x] Payment modal: CASH (tendered → change), GCASH (ref no.)
- [x] Generate `crypto.randomUUID()` idempotency key **when the payment modal opens**
- [x] Disable "Pay" button while submitting
- [x] Receipt view (printable with `window.print()` CSS)
- [x] Keyboard shortcuts (F2 search, F9 pay) for speed

**Key code**

```ts
// src/modules/sales/sales.service.ts (core idea)
export async function createSale(input: CreateSaleInput, user: AuthUser) {
  return withTransaction(async (db) => {
    // 1. Idempotency: same key = same sale, no duplicate
    const existing = await db.query('SELECT id FROM sales WHERE idempotency_key = $1', [input.idempotencyKey]);
    if (existing.rowCount) return getSaleById(db, existing.rows[0].id);

    const session = await getOpenSession(db);
    if (!session) throw new AppError(409, 'NO_OPEN_SESSION', 'Open a cash session first');

    // 2. Load REAL prices from DB (ignore any price from client)
    const units = await loadUnits(db, input.items.map(i => i.productUnitId));

    let subtotal = 0, totalCost = 0;
    const lines = input.items.map(i => {
      const u = units.get(i.productUnitId);
      if (!u) throw new AppError(400, 'INVALID_ITEM', 'Item not found');
      const lineTotal = u.price_centavos * i.qty;
      subtotal += lineTotal;
      totalCost += u.cost_centavos * i.qty;
      return { ...i, productId: u.product_id, baseQty: i.qty * u.factor,
               unitPrice: u.price_centavos, unitCost: u.cost_centavos, lineTotal };
    });

    const sale = await insertSale(db, { ...input, subtotal, totalCost, sessionId: session.id, cashierId: user.id });

    // 3. Deduct stock safely (atomic check + update)
    for (const l of lines) {
      const r = await db.query(
        `UPDATE products SET stock_qty = stock_qty - $1
         WHERE id = $2 AND stock_qty >= $1 RETURNING id`,
        [l.baseQty, l.productId]
      );
      if (r.rowCount === 0) throw new AppError(409, 'INSUFFICIENT_STOCK', `Not enough stock`);
      await insertSaleItem(db, sale.id, l);
      await insertMovement(db, l.productId, 'SALE', -l.baseQty, sale.id, user.id);
    }

    // 4. Utang charge (Phase 6)
    return sale;
  });
}
```
→ **Why this is interview gold:**
- `WHERE stock_qty >= $1` makes check-and-deduct **one atomic step**, so two cashiers can't both sell the last item.
- Any error causes a **ROLLBACK**: no sale without stock deduction, and no stock deduction without a sale.
- Prices come from the DB, so a tampered request can't sell items for ₱0.
- The idempotency key means a double tap on "Pay" still creates only one sale.

**Done when**
- [x] Selling 1 pack deducts 20 sticks
- [x] Selling more than stock returns 409, and nothing is saved (check the tables)
- [x] Sending the same request twice (same key) creates only 1 sale
- [x] Sending `price: 0` in the body has no effect
- [x] Void restores stock and creates an audit row

---

### Phase 5: Cash Sessions & Expenses

**Goal:** Open/close shift with an accurate **expected vs. actual cash** (over/short).

**You'll learn:** SQL aggregation (`SUM`, `COALESCE`, `FILTER`), reconciliation logic.

**Tasks**
- [x] Open session (opening cash); block if one is already open  _(built early in Phase 4: selling needs an open drawer)_
- [x] `GET /cash-sessions/current` shows a live breakdown  _(blind for cashiers until their count is saved)_
- [x] Expenses: record (from drawer or not), categories incl. OWNER_WITHDRAWAL
- [x] Close session: compute expected (formula in 6.5), save actual + over/short
- [x] Frontend: "Start of Day" screen + "End of Day" screen with a **denomination counter** (₱1000 × _, ₱500 × _, … ₱1 × _)
- [x] Z-report (session summary), printable

**Key code**

```sql
SELECT
  COALESCE(SUM(total) FILTER (WHERE payment_type = 'CASH' AND status = 'COMPLETED'), 0) AS cash_sales,
  COALESCE(SUM(total) FILTER (WHERE payment_type = 'GCASH' AND status = 'COMPLETED'), 0) AS gcash_sales,
  COALESCE(SUM(total) FILTER (WHERE payment_type = 'UTANG' AND status = 'COMPLETED'), 0) AS utang_sales
FROM sales
WHERE cash_session_id = $1;
```
→ `FILTER` lets one query compute several totals. `COALESCE(..., 0)` turns "no rows" (NULL) into 0.

**Done when**
- [x] Hand-calculate a test day on paper, and the system gives the same expected cash  _(₱1,713.50, tested)_
- [x] Cannot sell without an open session  _(Phase 4: 409 NO_OPEN_SESSION, tested)_
- [x] Over/short is saved and visible to OWNER

---

### Phase 6: Utang (Credit)

**Goal:** Customer credit with limits, partial payments, statements and aging.

**You'll learn:** Ledger balances, business-rule validation, date math in SQL.

**Tasks**
- [x] Customers CRUD, list with **computed balance**
- [x] In checkout: payment type UTANG → pick customer → check limit/blocked → insert CHARGE in the same sale transaction
- [x] Receive payment (full/partial) → PAYMENT row (+ counts as cash for the session)
- [x] Customer statement page (ledger with running balance)
- [x] Aging report (0–7 / 8–15 / 16–30 / 30+)
- [x] "Copy reminder message" button (text the owner can paste to Messenger/SMS)
- [x] Mask phone numbers for cashier view (`0917****567`)

**Key code**

```sql
-- Running balance with a window function
SELECT id, type, amount, created_at,
       SUM(amount) OVER (ORDER BY created_at, id) AS running_balance
FROM credit_ledger
WHERE customer_id = $1
ORDER BY created_at, id;
```
→ The window function (`OVER`) adds up the rows step by step, like a bank passbook.

**Done when**
- [x] Utang over the limit → blocked with a clear message
- [x] Partial payment lowers the balance correctly
- [x] Voiding an utang sale reverses the charge
- [x] Payments show up in the cash session expected cash

---

### Phase 7: GCash & E-load

**Goal:** Log cash-in, cash-out and e-load with auto fees and separate wallet balances.

**You'll learn:** Double-entry thinking (two pockets), configurable rules, pure-function testing.

**Tasks**
- [ ] Wallet accounts page (balances + low-balance warning)
- [ ] Fee rules editor (OWNER)
- [ ] `computeFee()` as a **pure function** + unit tests
- [ ] `POST /ewallet/fee-preview` so the cashier sees the fee before confirming
- [ ] Transaction form: type → amount → auto fee → customer number → ref no. → confirm
- [ ] Transaction updates wallet balance + records `cash_change` in **one transaction** (with row lock)
- [ ] Block if the wallet has insufficient balance (cash-in/eload) or the drawer has insufficient cash (cash-out)
- [ ] Top-up / withdraw wallet (OWNER)
- [ ] E-load: telco select + load cost vs. price (commission)

**Key code**

```ts
// src/modules/ewallet/fee.ts  — pure function = easy to test
export type FeeRule = { minAmount: number; maxAmount: number; fee: number };

export function computeFee(amount: number, rules: FeeRule[]): number {
  const rule = rules.find(r => amount >= r.minAmount && amount <= r.maxAmount);
  if (!rule) throw new AppError(400, 'NO_FEE_RULE', 'Amount not covered by fee rules');
  return rule.fee;
}

// fee.test.ts
it('charges ₱10 for ₱500 cash-in', () => {
  expect(computeFee(50000, rules)).toBe(1000);
});
```

```sql
-- Lock the wallet row so two cashiers can't overspend the same balance
SELECT balance FROM ewallet_accounts WHERE id = $1 FOR UPDATE;
```
→ `FOR UPDATE` makes other transactions **wait** until this one finishes. That prevents race conditions on balances.

**Done when**
- [ ] The Section 6.4 money-flow table matches your system for each case
- [ ] Fee tests pass (edge amounts: ₱1, ₱500, ₱501, max)
- [ ] Wallet can never go negative
- [ ] GCash/e-load cash appears in the cash session

---

### Phase 8: Reports & Dashboard

**Goal:** Help the owner see the real profit and what to restock.

**You'll learn:** Reporting SQL (`GROUP BY`, `date_trunc`, `EXTRACT`), charts.

**Tasks**
- [ ] Dashboard: today's sales, profit, # transactions, wallet balances, low stock, top utang
- [ ] Profit report by source (products / GCash / e-load − expenses), with date range
- [ ] Best sellers & slow movers
- [ ] Peak hours chart
- [ ] Sales trend (daily for 30 days)
- [ ] Export to CSV
- [ ] Audit log viewer (filter by user/action)

**Key code**

```sql
-- Peak hours (Philippine time)
SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Manila') AS hour,
       COUNT(*) AS txns, SUM(total) AS sales
FROM sales
WHERE status = 'COMPLETED' AND created_at >= now() - interval '30 days'
GROUP BY hour ORDER BY hour;
```
→ Store timestamps as `TIMESTAMPTZ` (UTC) and convert to `Asia/Manila` only when reporting.

**Done when**
- [ ] Profit report matches a manual computation for a test day
- [ ] Charts render on mobile width
- [ ] Cashier cannot open any report (403)

---

### Phase 9: Security Hardening & Testing

**Goal:** Prove the system is safe and correct.

**Tasks — Security**
- [ ] Go through the Section 8.2 OWASP checklist item by item
- [ ] `helmet()` with a Content-Security-Policy
- [ ] CORS: only `CLIENT_ORIGIN`
- [ ] `app.disable('x-powered-by')`, JSON body size limit (`express.json({ limit: '100kb' })`)
- [ ] Rate limit: login, PIN verify, and a general API limit
- [ ] Grep the codebase for string-concatenated SQL: must be **zero**
- [ ] `npm audit` → fix highs/criticals; enable Dependabot
- [ ] Try attacking your own app (next table)

**Self-pentest checklist**

| Attack | How to test | Expected |
|---|---|---|
| SQLi | Search product: `' OR 1=1 --` | Treated as text, no error |
| XSS | Product name: `<img src=x onerror=alert(1)>` | Shown as plain text |
| Role bypass | Cashier token → `PATCH /products/1` price | 403 |
| IDOR | Cashier → `GET /sales/<other session id>` | 403/404 |
| Price tamper | Add `unitPrice: 0` to sale body | Ignored |
| Brute force | 20 fast logins | 429 + lockout |
| Token theft | Check storage in DevTools | No tokens stored |
| Double submit | Replay the same sale request | One sale only |

**Tasks — Testing**
- [ ] Unit tests: `computeFee`, tingi conversion, expected-cash formula, money helpers
- [ ] Integration tests (Supertest + test DB): login, checkout, insufficient stock, void, utang limit, cash-out
- [ ] Target: all business-critical paths covered

**Done when**
- [ ] All self-pentest rows pass
- [ ] `npm test` is green
- [ ] `npm audit` shows no high/critical issues

---

### Phase 10: Deployment & Portfolio

**Goal:** A live demo link + a README that impresses recruiters.

**Tasks**
- [ ] DB on Neon/Supabase; run migrations + demo seed
- [ ] Backend on Render/Railway (env vars set there, `NODE_ENV=production`)
- [ ] Frontend on Vercel/Netlify (`VITE_API_URL`)
- [ ] HTTPS everywhere; cookie `secure: true`; `app.set('trust proxy', 1)` behind the host's proxy
- [ ] Demo accounts: `owner_demo` / `cashier_demo` (demo data only, reset daily if possible)
- [ ] README: screenshots/GIF, features, tech stack, ERD image, security features, how to run locally
- [ ] Short Loom/YouTube demo video (2–3 min)
- [ ] Add to resume: *"Built a PERN POS for sari-sari stores with tingi inventory, utang ledger, GCash/e-load reconciliation, RBAC, and OWASP-aligned security."*

**Done when**
- [ ] A stranger can open the link, log in as demo, and make a sale
- [ ] README has run instructions that work on a fresh clone

---

### Phase 11: Future Upgrades (optional)

- **Offline mode (PWA):** IndexedDB queue + sync when online (idempotency keys already make this safe)
- **Bluetooth thermal printer** (58mm receipts)
- **Multi-store / SaaS:** add `store_id` to every table + row-level security
- **SMS reminders** for utang (via an SMS provider API)
- **Supplier module:** auto-generated restock list from low stock
- **Suki loyalty points**
- **Mobile app** (React Native) reusing the same API

---

## 10. Coding Conventions

| Topic | Rule |
|---|---|
| Naming | DB: `snake_case`; TS: `camelCase`; components: `PascalCase` |
| Money | Always integer centavos; format only in the UI |
| Time | `TIMESTAMPTZ` in DB; show in `Asia/Manila` |
| SQL | Parameterized only (`$1`); SQL lives in repositories |
| Validation | Every route body/query/params goes through Zod |
| Errors | Throw `AppError`; never `res.status(500).send(err)` |
| Deletes | Soft delete / void, never hard delete business records |
| Git | Branch per phase (`phase-4-checkout`); small commits: `feat(sales): atomic stock deduction` |
| Secrets | Never in code or Git; `.env.example` shows keys only |

---

## 11. Definition of Done (whole project)

- [ ] All 10 phases' "Done when" items pass
- [ ] OWASP checklist complete
- [ ] Tests green, `npm audit` clean (no high/critical)
- [ ] Live demo + README + video
- [ ] You can explain in an interview: **the sale transaction, tingi conversion, GCash money flow, cash reconciliation, and how you prevented insider fraud & race conditions**

---

*Build it yourself, phase by phase. When stuck, bring the error message + your code for that part, and we'll debug it together.* 💪
