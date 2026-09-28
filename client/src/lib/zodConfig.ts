import { z } from 'zod';

// Zod speeds up validation by compiling code with new Function(), which our CSP forbids
// (it's what eval-based XSS relies on). jitless = no compiling and no probe, so the CSP stays
// strict and the browser logs no violations. Imported first in main.tsx, before any schema runs.
z.config({ jitless: true });
