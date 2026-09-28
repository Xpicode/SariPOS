-- A second, throwaway database for `npm test`. The integration tests wipe and re-seed it,
-- so they never touch your real (dev) data in `saripos`.
CREATE DATABASE saripos_test OWNER saripos_app;
REVOKE ALL ON DATABASE saripos_test FROM PUBLIC;
