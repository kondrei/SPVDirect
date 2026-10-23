import type { Method, ResponseType } from 'axios';
import type { AnafConnection } from '../anaf-connection.entity.js';
import type { Company } from '../../companies/company.entity.js';
import type { AuthorizationLink } from '../authorization-links/authorization-link.entity.js';
import type { LinkFailure, AuthorizationOutcomeKind } from './anaf.enums.js';

export type LinkLookup =
  | { ok: true; link: AuthorizationLink; company: Company }
  | { ok: false; reason: LinkFailure };

export type AuthorizationOutcome =
  | { kind: AuthorizationOutcomeKind.Self; accountantId: number }
  | { kind: AuthorizationOutcomeKind.Link; companyName: string }
  | { kind: AuthorizationOutcomeKind.LinkInvalid; reason: LinkFailure };

export interface ConnectionTestResult {
  status: number;
  body: string;
}

export type AnafConnectionChanges = Partial<
  Omit<AnafConnection, 'id' | 'accountantId' | 'createdAt' | 'updatedAt'>
>;

export interface AnafRequest {
  accountantId: number;
  connectionId: number;
  path: string;
  service: string;
  method?: Method;
  params?: Record<string, string | number>;
  data?: unknown;
  headers?: Record<string, string>;
  responseType?: ResponseType;
  companyId?: number;
  baseUrl?: string;
  allowStatuses?: number[];
}
