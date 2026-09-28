export interface CaenInfo {
  code: string;
  name: string;
  revision: 2 | 3;
  rev2Name: string | null;
}

export interface CaenTable {
  rev2: ReadonlyMap<string, string>;
  rev3: ReadonlyMap<string, string>;
}

export function normalizeCaenCode(
  code: string | null | undefined,
): string | null {
  const trimmed = code?.trim() ?? '';
  if (/^\d{3}$/.test(trimmed)) return `0${trimmed}`;
  return /^\d{4}$/.test(trimmed) ? trimmed : null;
}

export function parseCaenCsv(text: string): CaenTable {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const header = (lines.shift() ?? '').split('^').map((h) => h.trim());
  const code = header.indexOf('CLASA');
  const name = header.indexOf('DENUMIRE');
  const version = header.indexOf('VERSIUNE_CAEN');
  if (code === -1 || name === -1 || version === -1) {
    throw new Error('Unexpected N_CAEN.CSV header');
  }
  const rev2 = new Map<string, string>();
  const rev3 = new Map<string, string>();
  for (const line of lines) {
    const cells = line.split('^');
    const c = cells[code]?.trim() ?? '';
    const n = cells[name]?.replace(/\s+/g, ' ').trim();
    if (!/^\d{4}$/.test(c) || !n) continue;
    const v = cells[version]?.trim();
    if (v === '2') rev2.set(c, n);
    else if (v === '3') rev3.set(c, n);
  }
  if (!rev2.size || !rev3.size) {
    throw new Error('N_CAEN.CSV has no Rev. 2 or Rev. 3 classes');
  }
  return { rev2, rev3 };
}

export function describeCaen(
  table: CaenTable,
  code: string | null | undefined,
): CaenInfo | null {
  const c = normalizeCaenCode(code);
  if (!c) return null;
  const rev3 = table.rev3.get(c);
  const rev2 = table.rev2.get(c);
  if (rev3) {
    return {
      code: c,
      name: rev3,
      revision: 3,
      rev2Name: rev2 && rev2 !== rev3 ? rev2 : null,
    };
  }
  if (rev2) return { code: c, name: rev2, revision: 2, rev2Name: null };
  return null;
}
