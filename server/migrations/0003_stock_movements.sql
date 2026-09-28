-- Up Migration
CREATE TYPE movement_type AS ENUM ('STOCK_IN', 'SALE', 'VOID_RETURN', 'ADJUSTMENT', 'SPOILAGE');

CREATE TABLE stock_movements (
  id            BIGSERIAL PRIMARY KEY,
  product_id    BIGINT        NOT NULL REFERENCES products(id),
  type          movement_type NOT NULL,
  qty_change    INT           NOT NULL CHECK (qty_change <> 0),  -- + in, - out (base units)
  unit_cost     BIGINT        CHECK (unit_cost >= 0),            -- for STOCK_IN
  expiry_date   DATE,
  reference_id  BIGINT,                                          -- sale_id etc.
  note          VARCHAR(255),
  created_by    BIGINT        NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  -- The sign must match the type: a "SALE" can never secretly ADD stock, spoilage can't add either.
  CHECK (
    (type IN ('STOCK_IN', 'VOID_RETURN') AND qty_change > 0) OR
    (type IN ('SALE', 'SPOILAGE')        AND qty_change < 0) OR
    type = 'ADJUSTMENT'
  )
);

-- Down Migration
DROP TABLE stock_movements;
DROP TYPE movement_type;
