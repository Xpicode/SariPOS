-- Up Migration
-- Receipt numbers restart every store day: S-20261001-0001, -0002 ...
-- One row per day holds the last number used. The sale bumps it inside its own transaction, so
-- two cashiers can never get the same number (the row is locked until commit), and a failed
-- sale rolls its number back, leaving no gaps for an auditor to ask about.
CREATE TABLE sale_counters (
  day      DATE PRIMARY KEY,
  last_no  INT  NOT NULL CHECK (last_no > 0)
);

-- Down Migration
DROP TABLE sale_counters;
