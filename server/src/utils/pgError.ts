// node-postgres errors carry the SQLSTATE `code` and, for constraint errors, the constraint name.
// Codes: https://www.postgresql.org/docs/17/errcodes-appendix.html
export const pgError = (err: unknown) => (err ?? {}) as { code?: string; constraint?: string };

export const UNIQUE_VIOLATION = '23505';
export const FOREIGN_KEY_VIOLATION = '23503';
export const NUMERIC_OUT_OF_RANGE = '22003';
