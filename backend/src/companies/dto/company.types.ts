import type { Readable } from 'node:stream';
import type { Company } from '../company.entity.js';
import type { BulkCreateStatus } from './company.enums.js';
import type { COMPANY_FIELD_LABELS } from './company.constants.js';

export interface CompanyExport {
  content: Readable;
  contentType: string;
  filename: string;
}

export type BulkCreateResult =
  | { cui: string; status: BulkCreateStatus.Created; company: Company }
  | {
      cui: string;
      status: BulkCreateStatus.Exists | BulkCreateStatus.NotFound;
    };

export type CompanyField = keyof typeof COMPANY_FIELD_LABELS;

export interface PurgeTally {
  purged: number;
  failed: number;
}

export type CompanyChanges = Partial<
  Omit<Company, 'id' | 'accountantId' | 'createdAt' | 'updatedAt' | 'deletedAt'>
>;
