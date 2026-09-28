-- Up Migration
-- Lets a GiST index compare plain columns with "=" (needed for the no-overlap rule on fee_rules).
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE wallet_kind AS ENUM ('GCASH', 'MAYA', 'ELOAD');

CREATE TABLE ewallet_accounts (
  id                BIGSERIAL PRIMARY KEY,
  name              VARCHAR(60) NOT NULL,        -- "GCash (09xx...)", "Load Wallet"
  kind              wallet_kind NOT NULL,
  balance           BIGINT      NOT NULL DEFAULT 0 CHECK (balance >= 0),
  low_balance_alert BIGINT      NOT NULL DEFAULT 100000 CHECK (low_balance_alert >= 0),  -- ₱1,000
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE
);

-- Tiered fees. e.g. 1–500 = ₱10, 501–1000 = ₱20
CREATE TABLE fee_rules (
  id               BIGSERIAL PRIMARY KEY,
  wallet_kind      wallet_kind NOT NULL,
  txn_type         VARCHAR(20) NOT NULL CHECK (txn_type IN ('CASH_IN', 'CASH_OUT')),
  min_amount       BIGINT NOT NULL CHECK (min_amount > 0),
  max_amount       BIGINT NOT NULL,
  fee              BIGINT NOT NULL CHECK (fee >= 0),
  CHECK (max_amount >= min_amount),
  -- Two brackets can't cover the same amount, so every amount has exactly one fee.
  EXCLUDE USING gist (
    wallet_kind WITH =,
    txn_type WITH =,
    int8range(min_amount, max_amount, '[]') WITH &&
  )
);

CREATE TYPE ewallet_txn_type AS ENUM ('CASH_IN', 'CASH_OUT', 'ELOAD', 'TOP_UP', 'WITHDRAW');

CREATE TABLE ewallet_transactions (
  id                 BIGSERIAL PRIMARY KEY,
  idempotency_key    UUID             NOT NULL UNIQUE,
  cash_session_id    BIGINT           REFERENCES cash_sessions(id),
  account_id         BIGINT           NOT NULL REFERENCES ewallet_accounts(id),
  type               ewallet_txn_type NOT NULL,
  amount             BIGINT           NOT NULL CHECK (amount > 0),
  fee                BIGINT           NOT NULL DEFAULT 0 CHECK (fee >= 0),  -- store income
  wallet_change      BIGINT           NOT NULL,              -- effect on e-wallet balance
  cash_change        BIGINT           NOT NULL,              -- effect on cash drawer
  customer_number    VARCHAR(20),     -- mobile no. (mask in UI)
  reference_no       VARCHAR(40),
  telco              VARCHAR(20),     -- GLOBE, SMART, DITO, TNT, TM (eload)
  status             sale_status      NOT NULL DEFAULT 'COMPLETED',
  created_by         BIGINT           NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ      NOT NULL DEFAULT now(),
  -- GCash reference number = proof the transfer really happened (disputes, fake cash-outs).
  CHECK (type NOT IN ('CASH_IN', 'CASH_OUT') OR reference_no IS NOT NULL)
);

-- Down Migration
DROP TABLE ewallet_transactions;
DROP TYPE ewallet_txn_type;
DROP TABLE fee_rules;
DROP TABLE ewallet_accounts;
DROP TYPE wallet_kind;
DROP EXTENSION IF EXISTS btree_gist;
