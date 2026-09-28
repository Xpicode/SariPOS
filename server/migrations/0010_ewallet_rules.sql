-- Up Migration
-- GCash & E-load (Phase 7).

-- Load commission: the loading app deducts less than the customer pays (₱100 of load costs the
-- store ₱97 at 3%). Stored in basis points (300 = 3.00%). Only a load wallet earns it.
ALTER TABLE ewallet_accounts
  ADD COLUMN commission_bp INT NOT NULL DEFAULT 0 CHECK (commission_bp BETWEEN 0 AND 5000),
  ADD CONSTRAINT commission_only_for_load CHECK (kind = 'ELOAD' OR commission_bp = 0);

ALTER TABLE ewallet_transactions
  -- The two pockets (plan 6.4), enforced by the database. Each row's effect on the wallet and on
  -- the drawer must match its type, amount and fee, so no bug (or hand-typed UPDATE) can record a
  -- cash-in that sends ₱500 but puts ₱5,100 in the drawer. ELSE FALSE: a future type must be added
  -- here on purpose.
  ADD CONSTRAINT money_flow CHECK (
    CASE type
      WHEN 'CASH_IN'  THEN wallet_change = -amount AND cash_change = amount + fee
      WHEN 'CASH_OUT' THEN wallet_change = amount AND cash_change = fee - amount AND fee < amount
      WHEN 'ELOAD'    THEN cash_change = amount AND wallet_change = fee - amount AND fee < amount
      WHEN 'TOP_UP'   THEN fee = 0 AND wallet_change = amount AND cash_change IN (0, -amount)
      WHEN 'WITHDRAW' THEN fee = 0 AND wallet_change = -amount AND cash_change IN (0, amount)
      ELSE FALSE
    END
  ),
  -- Cash that went in or out of the drawer belongs to a shift, or closing can't count it.
  ADD CONSTRAINT cash_in_a_shift CHECK (cash_change = 0 OR cash_session_id IS NOT NULL),
  -- Load needs a network; nothing else has one.
  ADD CONSTRAINT eload_telco CHECK (
    (type = 'ELOAD') = (telco IS NOT NULL)
    AND (telco IS NULL OR telco IN ('GLOBE', 'TM', 'SMART', 'TNT', 'DITO'))
  ),
  -- Where the money or load went: required for cash-in and load, stored one way (09171234567).
  ADD CONSTRAINT customer_number CHECK (
    (customer_number IS NULL OR customer_number ~ '^09[0-9]{9}$')
    AND (type NOT IN ('CASH_IN', 'ELOAD') OR customer_number IS NOT NULL)
  );

-- A reference number is used once per wallet. The same one twice is a typo, or a fake cash-out
-- (cash handed over for a transfer that never arrived).
CREATE UNIQUE INDEX ewallet_reference_once ON ewallet_transactions (account_id, reference_no)
  WHERE reference_no IS NOT NULL;

CREATE INDEX idx_ewallet_txn_session ON ewallet_transactions (cash_session_id);

-- Like the utang ledger: rows are only added. Never edited, never deleted.
CREATE FUNCTION forbid_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER ewallet_transactions_append_only
  BEFORE UPDATE OR DELETE ON ewallet_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_row_change();

-- Down Migration
DROP TRIGGER ewallet_transactions_append_only ON ewallet_transactions;
DROP FUNCTION forbid_row_change();
DROP INDEX idx_ewallet_txn_session;
DROP INDEX ewallet_reference_once;
ALTER TABLE ewallet_transactions
  DROP CONSTRAINT customer_number,
  DROP CONSTRAINT eload_telco,
  DROP CONSTRAINT cash_in_a_shift,
  DROP CONSTRAINT money_flow;
ALTER TABLE ewallet_accounts
  DROP CONSTRAINT commission_only_for_load,
  DROP COLUMN commission_bp;
