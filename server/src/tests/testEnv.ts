// Imported FIRST by the integration tests (before anything reads src/config/env.ts): points the
// API at the throwaway test database, because the tests wipe it.
import { existsSync } from 'node:fs';

// Locally from .env; in CI the variables are set by the workflow (and there is no .env).
// loadEnvFile never overrides variables that are already set.
if (existsSync('.env')) process.loadEnvFile('.env');

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error('Set TEST_DATABASE_URL in server/.env (see .env.example) to run the API tests');
}
// Guard against wiping real data by a copy-paste mistake: the name must end in _test.
if (!/\/\w+_test(\?|$)/.test(testUrl) || testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be a separate database whose name ends in _test');
}
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
