import type { Accountant } from '../../accountants/accountant.entity.js';
import type { AccountantMfa } from '../accountant-mfa.entity.js';
import type { MfaMethod } from './auth.enums.js';

export type PendingRegistration = Pick<
  Accountant,
  'id' | 'email' | 'name' | 'createdAt'
>;

export type MfaFactorDates = Pick<
  AccountantMfa,
  'appEnabledAt' | 'emailEnabledAt'
>;

export type MfaState = Pick<
  AccountantMfa,
  | 'accountantId'
  | 'secret'
  | 'appEnabledAt'
  | 'emailEnabledAt'
  | 'lastUsedStep'
  | 'failedAttempts'
  | 'lockedUntil'
  | 'recoveryHash'
  | 'recoveryFailures'
  | 'emailCodeHash'
  | 'emailCodeExpiresAt'
> & { email: string };

export type MfaTrustState = Pick<
  Accountant,
  'id' | 'mfaChangedAt' | 'passwordChangedAt'
>;

export type MfaSessionState = Pick<
  Accountant,
  'status' | 'passwordChangedAt' | 'mfaChangedAt'
>;

export type MfaFactor = MfaMethod.App | MfaMethod.Email;

export interface MfaStatus {
  enabled: boolean;
  appEnabledAt: Date | null;
  emailEnabledAt: Date | null;
  recoveryCodeAvailable: boolean;
}

export interface MfaSetup {
  secret: string;
  otpauthUri: string;
}

export interface MfaEmailCodeSent {
  sentTo: string;
}

export interface MfaEmailCode {
  hash: string;
  expiresAt: Date;
  sentAt: Date;
  resendBefore: Date;
}

export interface MfaRecoveryCode {
  recoveryCode: string;
}

export interface MfaEnabled {
  recoveryCode: string | null;
}

export interface MfaVerification {
  method: MfaMethod;
}

export interface MfaRequired {
  mfaRequired: true;
  methods: MfaFactor[];
}

export interface MfaAttemptLimits {
  recovery: boolean;
  now: Date;
  maxAttempts: number;
  lockedUntil: Date;
  maxRecoveryFailures: number;
}

export interface SignedCookieClaims {
  accountantId: number;
  issuedAt: number | undefined;
}

export interface AdminApprovalRequest {
  accountantId: number;
  email: string;
  name: string | null;
  approvalToken: string;
}
