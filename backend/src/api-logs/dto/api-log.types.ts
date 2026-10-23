import type { ActivityAction, JobActivityAction } from './api-log.enums.js';
import type { AnafConnection } from '../../anaf/anaf-connection.entity.js';
import type { ApiLog } from '../api-log.entity.js';
import type { Company } from '../../companies/company.entity.js';
import type { EfacturaInvoice } from '../../efactura/efactura-invoice.entity.js';
import type { EfacturaUpload } from '../../efactura/efactura-upload.entity.js';
import type { Invoice } from '../../invoices/invoice.entity.js';

export type ActivityDetails = Record<
  string,
  string | number | boolean | null | string[]
>;

export type ApiLogRow = Omit<
  ApiLog,
  'id' | 'createdAt' | 'description' | 'details'
> &
  Partial<Pick<ApiLog, 'description' | 'details'>>;

export type ApiLogEntry = Pick<
  ApiLog,
  | 'accountantId'
  | 'anafConnectionId'
  | 'companyId'
  | 'service'
  | 'method'
  | 'endpoint'
  | 'statusCode'
  | 'responseTimeMs'
  | 'error'
> &
  Partial<Pick<ApiLog, 'details'>>;

export type ApiCallTarget = Omit<
  ApiLogEntry,
  'statusCode' | 'responseTimeMs' | 'error'
>;

export interface ApiCallOutcome {
  statusCode: number | null;
  error: string | null;
}

export interface ActivityEntry {
  action: ActivityAction;
  description: string;
  companyId?: number | null;
  details?: ActivityDetails;
}

export interface JobEntry {
  action: JobActivityAction;
  description: string;
  details: ActivityDetails;
  error?: string;
}

export interface PurgeCounts {
  companies: number;
  accountants: number;
  failed: number;
}

export interface AdminApprovalRetryCounts {
  sent: number;
  skipped: number;
  failed: number;
}

export interface EfacturaArchiveSyncCounts {
  companies: number;
  imported: number;
  failed: number;
}

export interface SpvSyncCounts {
  connections: number;
  moved: number;
  failed: number;
}

export interface ActivityFilter {
  companyId?: number;
  action?: ActivityAction;
  page: number;
  pageSize: number;
}

export interface ActivityItem {
  id: number;
  action: ActivityAction;
  companyId: number | null;
  description: string;
  details: ActivityDetails;
  accountantName: string;
  createdAt: Date;
}

export interface ActivityPage {
  items: ActivityItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ActivityRow {
  id: number;
  action: ActivityAction;
  companyId: number | null;
  description: string | null;
  details: ActivityDetails | null;
  accountantName: string | null;
  createdAt: Date;
}

export type CompanyRef = Pick<Company, 'id' | 'name' | 'cui'>;

export type ArchiveRef = Pick<
  EfacturaInvoice,
  | 'id'
  | 'companyId'
  | 'anafMessageId'
  | 'direction'
  | 'number'
  | 'issueDate'
  | 'supplierName'
  | 'customerName'
>;

export type InvoiceRef = Pick<
  Invoice,
  | 'id'
  | 'companyId'
  | 'series'
  | 'number'
  | 'buyer'
  | 'totalGross'
  | 'currency'
  | 'stornoOfSeries'
  | 'stornoOfNumber'
  | 'stornoOfIssueDate'
>;

export type UploadRef = Pick<
  EfacturaUpload,
  | 'id'
  | 'companyId'
  | 'invoiceId'
  | 'uploadIndex'
  | 'status'
  | 'environment'
  | 'errorMessage'
>;

export type ConnectionRef = Pick<AnafConnection, 'id' | 'label' | 'certSerial'>;
