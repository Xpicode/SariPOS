-- Up Migration
CREATE TABLE cash_sessions (
  id                BIGSERIAL PRIMARY KEY,
  opened_by         BIGINT      NOT NULL REFERENCES users(id),
  opening_cash      BIGINT      NOT NULL CHECK (opening_cash >= 0),
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ,
  expected_cash     BIGINT,                                 -- computed on close
  actual_cash       BIGINT      CHECK (actual_cash >= 0),   -- counted by cashier
  -- Computed by the database itself, so nobody can type in a fake "no shortage".
  over_short        BIGINT      GENERATED ALWAYS AS (actual_cash - expected_cash) STORED,
  notes             VARCHAR(255),
  CHECK (closed_at >= opened_at),
  -- Open shift: no count yet. Closed shift: must have both expected and actual cash.
  CHECK ((closed_at IS NULL) = (expected_cash IS NULL)),
  CHECK ((closed_at IS NULL) = (actual_cash IS NULL))
);
-- Only ONE open session at a time:
CREATE UNIQUE INDEX one_open_session ON cash_sessions ((closed_at IS NULL)) WHERE closed_at IS NULL;

CREATE TABLE customers (
  id                   BIGSERIAL PRIMARY KEY,
  name                 VARCHAR(100) NOT NULL,
  phone                VARCHAR(20),
  address              VARCHAR(255),
  credit_limit         BIGINT  NOT NULL DEFAULT 50000 CHECK (credit_limit >= 0), -- ₱500
  is_blocked           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  amount_tendered   BIGINT       CHECK (amount_tendered >= 0),
  change_given      BIGINT       CHECK (change_given >= 0),
  gcash_ref_no      VARCHAR(40),
  status            sale_status  NOT NULL DEFAULT 'COMPLETED',
  voided_by         BIGINT       REFERENCES users(id),
  void_reason       VARCHAR(255),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (total = subtotal - discount),                            -- the math must add up
  CHECK (payment_type <> 'UTANG' OR customer_id IS NOT NULL),     -- utang needs a customer
  CHECK (payment_type <> 'GCASH' OR gcash_ref_no IS NOT NULL),    -- GCash needs proof
  -- VOIDED <=> who voided it AND why. No silent voids, no "voided_by" on a live sale.
  CHECK ((status = 'VOIDED') = (voided_by IS NOT NULL AND void_reason IS NOT NULL))
);

CREATE TABLE sale_items (
  id                BIGSERIAL PRIMARY KEY,
  sale_id           BIGINT NOT NULL REFERENCES sales(id),
  product_id        BIGINT NOT NULL REFERENCES products(id),
  product_unit_id   BIGINT NOT NULL REFERENCES product_units(id),
  qty               INT    NOT NULL CHECK (qty > 0),               -- in selling unit
  base_qty          INT    NOT NULL CHECK (base_qty > 0),          -- qty * factor
  unit_price        BIGINT NOT NULL CHECK (unit_price >= 0),       -- SNAPSHOT of price at time of sale
  unit_cost         BIGINT NOT NULL CHECK (unit_cost >= 0),        -- SNAPSHOT of cost at time of sale
  line_total        BIGINT NOT NULL,
  CHECK (line_total = unit_price * qty)
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
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (
    (type = 'CHARGE'     AND amount > 0) OR
    (type = 'PAYMENT'    AND amount < 0) OR
    (type = 'ADJUSTMENT' AND amount <> 0)
  ),
  -- Every charge traces back to a real sale: nobody can invent debt for a customer.
  CHECK (type <> 'CHARGE' OR sale_id IS NOT NULL)
);

-- Down Migration
DROP TABLE credit_ledger;
DROP TYPE credit_entry;
DROP TABLE sale_items;
DROP TABLE sales;
DROP TYPE payment_type;
DROP TYPE sale_status;
DROP TABLE customers;
DROP TABLE cash_sessions;
