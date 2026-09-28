-- Up Migration
CREATE TYPE user_role AS ENUM ('OWNER', 'CASHIER');

CREATE TABLE users (
  id              BIGSERIAL PRIMARY KEY,
  -- Lowercase letters, digits, _ and . only: "Owner" and "owner" can't both exist as look-alikes.
  username        VARCHAR(50)  NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_.]{3,50}$'),
  full_name       VARCHAR(100) NOT NULL,
  password_hash   TEXT         NOT NULL,       -- argon2id, never the raw password
  pin_hash        TEXT,                        -- owner PIN for voids/overrides
  role            user_role    NOT NULL DEFAULT 'CASHIER',
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  failed_logins   INT          NOT NULL DEFAULT 0 CHECK (failed_logins >= 0),
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT      NOT NULL REFERENCES users(id),
  token_hash   TEXT        NOT NULL UNIQUE,     -- store a HASH, never the raw token
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE refresh_tokens;
DROP TABLE users;
DROP TYPE user_role;
