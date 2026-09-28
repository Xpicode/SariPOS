-- Up Migration
-- Utang terms: when the customer promised to pay, and the interest if they're late.

-- A new kind of ledger row. (PostgreSQL won't let this migration compare against the new enum
-- value in the same transaction, so the rules below compare type::text instead.)
ALTER TYPE credit_entry ADD VALUE IF NOT EXISTS 'INTEREST';

ALTER TABLE customers
  ADD COLUMN due_date DATE, -- "babayaran sa ..." (NULL = no date agreed)
  -- Interest when late, in basis points like the load commission: 500 = 5.00% of what they owe.
  ADD COLUMN interest_bp INT NOT NULL DEFAULT 0 CHECK (interest_bp BETWEEN 0 AND 5000);

ALTER TABLE credit_ledger
  -- Which due date an INTEREST row is for. One interest per due date (index below), so a double
  -- tap or two owners at once can't charge it twice.
  ADD COLUMN interest_for DATE,
  DROP CONSTRAINT credit_ledger_check,
  ADD CONSTRAINT ledger_amount_sign CHECK (
    (type::text = 'CHARGE'     AND amount > 0) OR
    (type::text = 'PAYMENT'    AND amount < 0) OR
    (type::text = 'ADJUSTMENT' AND amount <> 0) OR
    (type::text = 'INTEREST'   AND amount > 0)
  ),
  ADD CONSTRAINT interest_has_due_date CHECK ((type::text = 'INTEREST') = (interest_for IS NOT NULL));

CREATE UNIQUE INDEX interest_once_per_due_date
  ON credit_ledger (customer_id, interest_for) WHERE interest_for IS NOT NULL;

-- Down Migration
-- (The 'INTEREST' enum value stays: PostgreSQL can't remove an enum value. Refuses to run once
-- interest rows exist, since the old sign rule doesn't know them.)
DROP INDEX interest_once_per_due_date;
ALTER TABLE credit_ledger
  DROP CONSTRAINT interest_has_due_date,
  DROP CONSTRAINT ledger_amount_sign,
  ADD CONSTRAINT credit_ledger_check CHECK (
    (type = 'CHARGE' AND amount > 0) OR
    (type = 'PAYMENT' AND amount < 0) OR
    (type = 'ADJUSTMENT' AND amount <> 0)
  ),
  DROP COLUMN interest_for;
ALTER TABLE customers DROP COLUMN interest_bp, DROP COLUMN due_date;
