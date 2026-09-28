import { isValidCui, normalizeCui } from './format';

export const MAX_BULK_CUIS = 500;
export const MAX_CUI_FILE_BYTES = 1024 * 1024;

const SEPARATORS = /[,;\t\r\n]+/;

function clean(cell: string): string {
  return cell.trim().replace(/^["']|["']$/g, '').trim();
}

export function parseCuiList(text: string): {
  cuis: string[];
  invalid: string[];
} {
  const cuis: string[] = [];
  const seen = new Set<number>();
  const invalid: string[] = [];
  for (const raw of text.split(SEPARATORS)) {
    const cell = clean(raw);
    if (!cell) continue;
    if (!isValidCui(cell)) {
      invalid.push(cell);
      continue;
    }
    const cui = normalizeCui(cell);
    if (seen.has(Number(cui))) continue;
    seen.add(Number(cui));
    cuis.push(cui);
  }
  return { cuis, invalid };
}

export function cuisFromFile(text: string): string[] {
  const found: string[] = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const cell = line.split(/[,;\t]/).map(clean).find(isValidCui);
    if (cell) found.push(normalizeCui(cell));
  }
  return parseCuiList(found.join('\n')).cuis;
}
