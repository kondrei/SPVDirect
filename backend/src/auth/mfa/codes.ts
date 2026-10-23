import { randomInt } from 'node:crypto';
import {
  EMAIL_CODE_DIGITS,
  RECOVERY_CODE_DIGITS,
} from '../dto/auth.constants.js';

function numericCode(digits: number): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, '0');
}

export function newRecoveryCode(): string {
  return numericCode(RECOVERY_CODE_DIGITS);
}

export function newEmailCode(): string {
  return numericCode(EMAIL_CODE_DIGITS);
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}
