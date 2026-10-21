import type { Unit } from './invoice.types.js';

export const UNITS = {
  buc: 'H87',
  ore: 'HUR',
  zile: 'DAY',
  luni: 'MON',
  kg: 'KGM',
  m: 'MTR',
  mp: 'MTK',
  l: 'LTR',
  set: 'SET',
  serviciu: 'C62',
} as const;
export const UNIT_NAMES = Object.keys(UNITS) as Unit[];
