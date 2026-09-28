// CSV the owner can open in Excel / Google Sheets. Built in the browser from data already on
// screen: nothing new is fetched, and the server needs no file endpoint.

type Cell = string | number | null | undefined;

// A cell starting with = + - @ (or tab / carriage return) is run as a FORMULA by spreadsheets
// ("CSV injection": a product named =HYPERLINK(...) could phone home when the file is opened).
// Text like that gets a leading ' so it stays text. Real numbers are left alone (−₱252 stays a number).
function cell(v: Cell) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const toCsv = (rows: Cell[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n');

// Centavos -> a plain number of pesos (1234.5), which spreadsheets can add up. Not "₱1,234.50".
export const pesos = (centavos: number) => centavos / 100;

export function downloadCsv(filename: string, rows: Cell[][]) {
  // The BOM (byte order mark, U+FEFF) makes Excel read the file as UTF-8, so "₱" and "ñ" survive.
  const blob = new Blob(['\uFEFF', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
