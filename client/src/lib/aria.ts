// Spread onto an input: marks it invalid and links it to its message.
export const fieldAria = (id: string, error?: string, hasHint = false) => ({
  'aria-invalid': error ? (true as const) : undefined,
  'aria-describedby': error || hasHint ? `${id}-msg` : undefined,
});
