-- Up Migration
-- Closing the drawer (Phase 5): who closed it, and the bill/coin count behind "actual cash",
-- so a disputed shortage can be checked against what was really counted.
ALTER TABLE cash_sessions
  ADD COLUMN closed_by  BIGINT REFERENCES users(id),
  ADD COLUMN cash_count JSONB;  -- { "100000": 3, "5000": 2, ... }  centavo value -> how many

UPDATE cash_sessions SET closed_by = opened_by WHERE closed_at IS NOT NULL; -- older closed rows

-- A closed shift always says who closed it; an open one never does.
ALTER TABLE cash_sessions
  ADD CONSTRAINT closed_by_when_closed CHECK ((closed_at IS NULL) = (closed_by IS NULL));

-- Only known categories, so reports can group them (and OWNER_WITHDRAWAL can be left out of
-- profit: it's the owner taking money home, not a business cost).
ALTER TABLE expenses
  ADD CONSTRAINT expense_category CHECK (category IN (
    'SUPPLIES', 'ELECTRIC', 'WATER', 'RENT', 'TRANSPORT', 'SALARY', 'OTHER', 'OWNER_WITHDRAWAL'
  ));

-- Down Migration
ALTER TABLE expenses DROP CONSTRAINT expense_category;
ALTER TABLE cash_sessions DROP CONSTRAINT closed_by_when_closed;
ALTER TABLE cash_sessions DROP COLUMN cash_count, DROP COLUMN closed_by;
