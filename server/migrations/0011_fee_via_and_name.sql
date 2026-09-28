-- Up Migration
-- GCash form v2: the customer may pay the service fee by GCash instead of cash, and the cashier
-- may note the customer's name.
ALTER TABLE ewallet_transactions
  -- CASH = the fee goes into the drawer (the only option before). GCASH = the customer sends the
  -- fee to the store's wallet. Only cash-in and cash-out have a customer-paid fee.
  ADD COLUMN fee_via VARCHAR(10) NOT NULL DEFAULT 'CASH' CHECK (fee_via IN ('CASH', 'GCASH')),
  ADD COLUMN customer_name VARCHAR(100) CHECK (length(trim(customer_name)) BETWEEN 1 AND 100),
  ADD CONSTRAINT fee_via_only_with_a_fee CHECK (fee_via = 'CASH' OR type IN ('CASH_IN', 'CASH_OUT'));

-- The two pockets again, now for both ways of paying the fee (same formulas as fee.ts moneyFlow).
-- Every existing row has fee_via = 'CASH', so it passes exactly as before.
ALTER TABLE ewallet_transactions
  DROP CONSTRAINT money_flow,
  ADD CONSTRAINT money_flow CHECK (
    CASE
      WHEN type = 'CASH_IN'  AND fee_via = 'CASH'  THEN wallet_change = -amount AND cash_change = amount + fee
      WHEN type = 'CASH_IN'  AND fee_via = 'GCASH' THEN wallet_change = fee - amount AND cash_change = amount
      WHEN type = 'CASH_OUT' AND fee_via = 'CASH'  THEN wallet_change = amount AND cash_change = fee - amount AND fee < amount
      WHEN type = 'CASH_OUT' AND fee_via = 'GCASH' THEN wallet_change = amount + fee AND cash_change = -amount
      WHEN type = 'ELOAD'    THEN cash_change = amount AND wallet_change = fee - amount AND fee < amount
      WHEN type = 'TOP_UP'   THEN fee = 0 AND wallet_change = amount AND cash_change IN (0, -amount)
      WHEN type = 'WITHDRAW' THEN fee = 0 AND wallet_change = -amount AND cash_change IN (0, amount)
      ELSE FALSE
    END
  );

-- Down Migration
-- (Refuses to run once any fee-by-GCash row exists: the old rule can't describe it, and the
-- ledger is append-only, so there's nothing safe to rewrite it into.)
ALTER TABLE ewallet_transactions
  DROP CONSTRAINT money_flow,
  ADD CONSTRAINT money_flow CHECK (
    CASE type
      WHEN 'CASH_IN'  THEN wallet_change = -amount AND cash_change = amount + fee
      WHEN 'CASH_OUT' THEN wallet_change = amount AND cash_change = fee - amount AND fee < amount
      WHEN 'ELOAD'    THEN cash_change = amount AND wallet_change = fee - amount AND fee < amount
      WHEN 'TOP_UP'   THEN fee = 0 AND wallet_change = amount AND cash_change IN (0, -amount)
      WHEN 'WITHDRAW' THEN fee = 0 AND wallet_change = -amount AND cash_change IN (0, amount)
      ELSE FALSE
    END
  );
ALTER TABLE ewallet_transactions
  DROP CONSTRAINT fee_via_only_with_a_fee,
  DROP COLUMN customer_name,
  DROP COLUMN fee_via;
