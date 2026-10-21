import type { Status } from '../components/ui';
import type { AnafConnection } from '../api/types';
import { DAY_MS, EXPIRING_DAYS } from '../common/constants';
import { AnafConnectionStatus } from '../api/enums';

export function normalizeCui(value: string): string {
  return value.replaceAll(/\s+/g, '').replace(/^RO/i, '');
}

export function isValidCui(value: string): boolean {
  return /^\d{2,10}$/.test(normalizeCui(value));
}

export function isEmailLike(value: string): boolean {
  const at = value.indexOf('@', 1);
  return at > 0 && !/\s/.test(value) && value.slice(at + 2, -1).includes('.');
}

export function formatCui(cui: string): string {
  return `RO ${cui}`;
}

const dateFmt = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Bucharest',
});
const dateTimeFmt = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Bucharest',
});

export function formatDate(iso: string | Date): string {
  return dateFmt.format(new Date(iso));
}

export function formatIsoDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
}

export function parseDecimal(value: string): number {
  const text = value.trim().replace(',', '.');
  return text === '' ? Number.NaN : Number(text);
}

export function formatDateTime(iso: string | Date): string {
  return dateTimeFmt.format(new Date(iso)).replace(/\s+/, ' ');
}

export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS) || 0;
}

export function plural(n: number, one: string, many: string): string {
  const abs = Math.abs(n);
  if (abs === 1) return `${n} ${one}`;
  const lastTwo = abs % 100;
  return abs !== 0 && (lastTwo === 0 || lastTwo >= 20)
    ? `${n} de ${many}`
    : `${n} ${many}`;
}

export const pluralZile = (n: number) => plural(n, 'zi', 'zile');
export const pluralFirme = (n: number) => plural(n, 'firmă', 'firme');

export function connectionStatus(
  c: Pick<AnafConnection, 'status' | 'refreshExpiresAt'>,
  now: Date = new Date(),
): Extract<Status, 'active' | 'expiring' | 'expired' | 'revoked'> {
  if (c.status === AnafConnectionStatus.Revoked) return 'revoked';
  const days = daysUntil(c.refreshExpiresAt, now);
  if (
    c.status === AnafConnectionStatus.Expired ||
    new Date(c.refreshExpiresAt).getTime() <= now.getTime()
  )
    return 'expired';
  return days < EXPIRING_DAYS ? 'expiring' : 'active';
}

export function initials(name: string | null, email: string): string {
  const src = (name ?? '').trim() || email.split('@')[0];
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0][0] + parts[1][0] : src.slice(0, 2);
  return letters.toUpperCase();
}

export function groupSerial(serial: string): string {
  return serial
    .replaceAll(/[\s:-]+/g, '')
    .toUpperCase()
    .replaceAll(/(.{4})(?=.)/g, '$1 ');
}

const amountFmt = new Intl.NumberFormat('ro-RO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
});

export function formatAmount(value: number): string {
  return amountFmt.format(value);
}

const monthFmt = new Intl.DateTimeFormat('ro-RO', {
  month: 'short',
  timeZone: 'UTC',
});

export function formatMonth(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return monthFmt.format(new Date(Date.UTC(year, number - 1, 1)));
}

export const pluralFacturi = (n: number) => plural(n, 'factură', 'facturi');
export const pluralStornari = (n: number) => plural(n, 'stornare', 'stornări');
export const pluralCertificate = (n: number) =>
  plural(n, 'certificat', 'certificate');

export function decimalText(value: number): string {
  return String(value).replace('.', ',');
}
