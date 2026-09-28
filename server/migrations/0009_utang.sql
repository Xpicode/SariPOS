-- Up Migration
-- Utang (Phase 6).
ALTER TABLE credit_ledger
  -- A payment is cash into the drawer, so it belongs to a shift and counts at closing.
  ADD COLUMN cash_session_id BIGINT REFERENCES cash_sessions(id),
  -- Same key twice (double tap, retry after a network error) = one payment, not two.
  ADD COLUMN idempotency_key UUID UNIQUE;

ALTER TABLE credit_ledger
  ADD CONSTRAINT payment_in_a_shift CHECK (type <> 'PAYMENT' OR cash_session_id IS NOT NULL);

-- The ledger is a passbook: rows are only ever added. A mistake is fixed with a new ADJUSTMENT
-- row, so the history of every peso a customer owed stays visible. Enforced by the database.
CREATE FUNCTION forbid_ledger_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'credit_ledger is append-only';
END;
$$;

CREATE TRIGGER credit_ledger_append_only
  BEFORE UPDATE OR DELETE ON credit_ledger
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();

-- Philippine mobile numbers only, stored one way (09171234567), so masking and search work.
ALTER TABLE customers
  ADD CONSTRAINT customer_phone CHECK (phone IS NULL OR phone ~ '^09[0-9]{9}$'),
  ADD CONSTRAINT customer_name CHECK (length(trim(name)) >= 2);

CREATE INDEX idx_customers_name ON customers (lower(name));

-- Down Migration
DROP INDEX idx_customers_name;
ALTER TABLE customers DROP CONSTRAINT customer_name, DROP CONSTRAINT customer_phone;
DROP TRIGGER credit_ledger_append_only ON credit_ledger;
DROP FUNCTION forbid_ledger_change();
ALTER TABLE credit_ledger DROP CONSTRAINT payment_in_a_shift;
ALTER TABLE credit_ledger DROP COLUMN idempotency_key, DROP COLUMN cash_session_id;
