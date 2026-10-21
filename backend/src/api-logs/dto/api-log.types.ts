import type { ActivityAction } from './api-log.enums.js';
import type { AnafConnection } from '../../anaf/anaf-connection.entity.js';
import type { Company } from '../../companies/company.entity.js';
import type { EfacturaUpload } from '../../efactura/efactura-upload.entity.js';
import type { Invoice } from '../../invoices/invoice.entity.js';

export type ActivityDetails = Record<
  string,
  string | number | boolean | null | string[]
>;

export interface ActivityEntry {
  action: ActivityAction;
  description: string;
  companyId?: number | null;
  details?: ActivityDetails;
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
