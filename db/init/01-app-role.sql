-- Runs once, as the postgres superuser, the first time the Docker volume is created.
-- The app gets its own role that owns the saripos database (so migrations can create tables)
-- but is NOT a superuser: it can't read server files, run OS commands, or touch other databases.
CREATE ROLE saripos_app LOGIN PASSWORD 'change_me'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

CREATE DATABASE saripos OWNER saripos_app;

-- Nobody else may connect to it.
REVOKE ALL ON DATABASE saripos FROM PUBLIC;
