-- Up Migration
CREATE TABLE categories (
  id    BIGSERIAL PRIMARY KEY,
  name  VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE products (
  id              BIGSERIAL PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  category_id     BIGINT REFERENCES categories(id),
  base_unit       VARCHAR(20)  NOT NULL DEFAULT 'pc',   -- pc, g, ml, stick
  stock_qty       INT          NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  reorder_level   INT          NOT NULL DEFAULT 5  CHECK (reorder_level >= 0),
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Tingi: one product, many selling units.
-- e.g. Marlboro: "stick" (factor 1, ₱10), "pack" (factor 20, ₱180)
CREATE TABLE product_units (
  id               BIGSERIAL PRIMARY KEY,
  product_id       BIGINT       NOT NULL REFERENCES products(id),
  unit_name        VARCHAR(30)  NOT NULL,                    -- stick, pack, ream
  factor           INT          NOT NULL CHECK (factor > 0), -- how many base units
  barcode          VARCHAR(50)  UNIQUE,
  cost_centavos    BIGINT       NOT NULL CHECK (cost_centavos >= 0),
  price_centavos   BIGINT       NOT NULL CHECK (price_centavos >= 0),
  is_default       BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  UNIQUE (product_id, unit_name)
);
-- At most ONE default selling unit per product (the POS picks it when you tap the item).
CREATE UNIQUE INDEX one_default_unit ON product_units (product_id) WHERE is_default;

CREATE TABLE price_history (
  id               BIGSERIAL PRIMARY KEY,
  product_unit_id  BIGINT NOT NULL REFERENCES product_units(id),
  old_price        BIGINT NOT NULL CHECK (old_price >= 0),
  new_price        BIGINT NOT NULL CHECK (new_price >= 0),
  old_cost         BIGINT NOT NULL CHECK (old_cost >= 0),
  new_cost         BIGINT NOT NULL CHECK (new_cost >= 0),
  changed_by       BIGINT NOT NULL REFERENCES users(id),
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE price_history;
DROP TABLE product_units;
DROP TABLE products;
DROP TABLE categories;
