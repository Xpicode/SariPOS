import { useEffect, useState } from 'react';

// Returns `value` only after it stopped changing for `ms`: search waits until you pause typing
// instead of calling the API on every key.
export function useDebounced<T>(value: T, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
