import { describe, expect, it } from 'vitest';
import { connectionStatus, daysUntil, formatCui, formatDate, groupSerial, initials, isValidCui, normalizeCui, pluralFirme, pluralZile } from './format';
import { safeNext } from './safeNext';

const NOW = new Date('2026-09-23T12:00:00Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

describe('CUI', () => {
  it('normalizes like the backend DTO', () => {
    expect(normalizeCui('RO 14399840')).toBe('14399840');
    expect(normalizeCui('ro14399840')).toBe('14399840');
    expect(normalizeCui(' 1439 9840 ')).toBe('14399840');
  });
  it('accepts 2–10 digits only', () => {
    expect(isValidCui('RO 12')).toBe(true);
    expect(isValidCui('1234567890')).toBe(true);
    expect(isValidCui('1')).toBe(false);
    expect(isValidCui('12345678901')).toBe(false);
    expect(isValidCui('RO12A')).toBe(false);
    expect(isValidCui('')).toBe(false);
  });
  it('formats with the RO prefix', () => expect(formatCui('14399840')).toBe('RO 14399840'));
});

describe('connectionStatus', () => {
  it('keeps revoked regardless of dates', () => {
    expect(connectionStatus({ status: 'revoked', refreshExpiresAt: inDays(300) }, NOW)).toBe('revoked');
  });
  it('is active with more than 30 days left', () => {
    expect(connectionStatus({ status: 'active', refreshExpiresAt: inDays(31) }, NOW)).toBe('active');
  });
  it('is expiring under 30 days', () => {
    expect(connectionStatus({ status: 'active', refreshExpiresAt: inDays(29) }, NOW)).toBe('expiring');
    expect(connectionStatus({ status: 'active', refreshExpiresAt: inDays(0.5) }, NOW)).toBe('expiring');
  });
  it('is expired when the refresh token ended, even if the row still says active', () => {
    expect(connectionStatus({ status: 'active', refreshExpiresAt: inDays(-1) }, NOW)).toBe('expired');
    expect(connectionStatus({ status: 'expired', refreshExpiresAt: inDays(100) }, NOW)).toBe('expired');
  });
});

describe('Romanian formatting', () => {
  it('pluralizes zile', () => {
    expect(pluralZile(1)).toBe('1 zi');
    expect(pluralZile(12)).toBe('12 zile');
    expect(pluralZile(19)).toBe('19 zile');
    expect(pluralZile(20)).toBe('20 de zile');
    expect(pluralZile(101)).toBe('101 zile');
    expect(pluralZile(0)).toBe('0 zile');
    expect(pluralFirme(1)).toBe('1 firmă');
    expect(pluralFirme(3)).toBe('3 firme');
    expect(pluralFirme(24)).toBe('24 de firme');
  });
  it('formats dates as DD.MM.YYYY in Bucharest time', () => {
    expect(formatDate('2026-09-23T22:30:00Z')).toBe('24.09.2026');
  });
  it('counts days, rounding up', () => {
    expect(daysUntil(inDays(12), NOW)).toBe(12);
    expect(daysUntil(inDays(11.2), NOW)).toBe(12);
    expect(daysUntil(inDays(-0.1), NOW)).toBe(0);
    expect(daysUntil(inDays(-2), NOW)).toBe(-2);
  });
  it('groups serials in fours', () => expect(groupSerial('4C000012A9F3')).toBe('4C00 0012 A9F3'));
  it('makes initials', () => {
    expect(initials('Andrei Kondrei', 'x@y.ro')).toBe('AK');
    expect(initials(null, 'andrei@cabinet.ro')).toBe('AN');
  });
});

describe('safeNext', () => {
  it('allows app paths', () => expect(safeNext('/companies?add=1')).toBe('/companies?add=1'));
  it('blocks external and protocol-relative targets', () => {
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});
