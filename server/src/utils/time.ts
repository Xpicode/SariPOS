// "2026-09-28" in the store's time zone (the server may run in UTC).
export const todayInManila = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
