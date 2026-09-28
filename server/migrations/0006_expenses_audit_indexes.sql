-- Up Migration
CREATE TABLE expenses (
  id               BIGSERIAL PRIMARY KEY,
  cash_session_id  BIGINT REFERENCES cash_sessions(id),
  category         VARCHAR(40) NOT NULL,  -- ELECTRIC, RENT, SUPPLIES, OWNER_WITHDRAWAL
  amount           BIGINT NOT NULL CHECK (amount > 0),
  paid_from_drawer BOOLEAN NOT NULL DEFAULT TRUE,
  note             VARCHAR(255),
  created_by       BIGINT NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Money taken from the drawer must belong to a shift, or it vanishes from the over/short count.
  CHECK (NOT paid_from_drawer OR cash_session_id IS NOT NULL)
);

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

-- Append-only, enforced by the database: even a bug or injected SQL can't rewrite history.
CREATE FUNCTION forbid_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();

CREATE INDEX idx_sales_created_at       ON sales (created_at);
CREATE INDEX idx_sales_session          ON sales (cash_session_id);
CREATE INDEX idx_sale_items_sale        ON sale_items (sale_id);
CREATE INDEX idx_stock_mov_product      ON stock_movements (product_id, created_at);
CREATE INDEX idx_credit_ledger_customer ON credit_ledger (customer_id, created_at);
CREATE INDEX idx_ewallet_txn_created    ON ewallet_transactions (created_at);
CREATE INDEX idx_products_name          ON products (lower(name));

-- Down Migration
DROP INDEX idx_products_name;
DROP INDEX idx_ewallet_txn_created;
DROP INDEX idx_credit_ledger_customer;
DROP INDEX idx_stock_mov_product;
DROP INDEX idx_sale_items_sale;
DROP INDEX idx_sales_session;
DROP INDEX idx_sales_created_at;
DROP TABLE audit_logs;
DROP FUNCTION forbid_audit_change();
DROP TABLE expenses;
