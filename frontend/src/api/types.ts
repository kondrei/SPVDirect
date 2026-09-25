/** Shapes returned by the NestJS API (dates arrive as ISO strings). */

export interface Accountant {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface Company {
  id: string;
  accountantId: string;
  /** Digits only, without the RO prefix. */
  cui: string;
  name: string;
  anafConnectionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AnafConnectionStatus = 'active' | 'expired' | 'revoked';

export interface AnafConnection {
  id: string;
  accountantId: string;
  label: string;
  certSerial: string;
  /** e.g. ['HELLO', 'EFACTURA', 'ETRANSPORT'] */
  roles: string[];
  source: 'self' | 'link';
  accessExpiresAt: string;
  refreshExpiresAt: string;
  lastRefreshedAt: string | null;
  status: AnafConnectionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorizationLink {
  id: string;
  url: string;
  expiresAt: string;
}

export interface ConnectionTestResult {
  status: number;
  body: string;
}
