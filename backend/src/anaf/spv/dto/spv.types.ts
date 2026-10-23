import type { Company } from '../../../companies/company.entity.js';
import type { SpvMessage } from '../spv-message.entity.js';
export interface ImportSummary {
  fetched: number;
  added: number;
  title: string | null;
  certSerial: string | null;
  notice: string | null;
  rights: number;
  unknownCuis: string[];
}

export interface SyncSummary {
  fetched: number;
  added: number;
  downloaded: number;
  failed: number;
  pending: number;
}

export interface ArchiveFilter {
  cif?: string;
  type?: string;
  companyId?: number;
  page: number;
  pageSize: number;
}

export interface ArchivedMessage {
  id: number;
  anafMessageId: string;
  cif: string | null;
  type: string | null;
  details: string | null;
  requestId: string | null;
  createdAt: string | null;
  createdAtRaw: string | null;
  companyId: number | null;
  stored: boolean;
  sizeBytes: number | null;
  downloadedAt: string | null;
}

export interface ArchivePage {
  items: ArchivedMessage[];
  total: number;
  page: number;
  pageSize: number;
}

export type CompanyMessagesRef = Pick<Company, 'id' | 'accountantId' | 'cui'>;

export type SpvMessageChanges = Partial<
  Omit<SpvMessage, 'id' | 'accountantId' | 'anafMessageId'>
>;

export type SpvMessageInsert = Pick<
  SpvMessage,
  | 'accountantId'
  | 'anafConnectionId'
  | 'companyId'
  | 'anafMessageId'
  | 'cif'
  | 'type'
  | 'details'
  | 'requestId'
  | 'anafCreatedAt'
  | 'anafCreatedRaw'
>;
