import type { Status } from '../components/ui';
import type { AnafConnection } from '../api/types';

const DAY_MS = 24 * 60 * 60 * 1000;
export const EXPIRING_DAYS = 30;

export function normalizeCui(value: string): string {
  return value.replace(/\s+/g, '').replace(/^RO/i, '');
}

export function isValidCui(value: string): boolean {
  return /^\d{2,10}$/.test(normalizeCui(value));
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

export function formatAnafDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
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
  if (c.status === 'revoked') return 'revoked';
  const days = daysUntil(c.refreshExpiresAt, now);
  if (
    c.status === 'expired' ||
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
  return serial.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ');
}
