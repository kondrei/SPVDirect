const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[";\n\r]/;
export const BOM = String.fromCodePoint(0xfeff);

export type CsvValue = string | number | boolean | Date | null | undefined;

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  let text = value instanceof Date ? value.toISOString() : value;
  if (FORMULA_START.test(text)) text = `'${text}`;
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((row) =>
    row.map((value) => cell(value)).join(';'),
  );
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
