import type { EfacturaUpload } from '../efactura-upload.entity.js';
import type { AnafEnvironment } from '../../anaf/dto/anaf.enums.js';
import type {
  UploadStatus,
  EfacturaStandard,
  EfacturaDirection,
  ImportStatus,
  MessageFilter,
} from './efactura.enums.js';

export interface UploadInput {
  companyId: number;
  xml: string;
  standard: EfacturaStandard;
  extern?: boolean;
  autofactura?: boolean;
  executare?: boolean;
  b2c?: boolean;
}

export interface UploadPage {
  items: EfacturaUpload[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EfacturaMessage {
  id: string;
  requestId: string | null;
  type: string | null;
  details: string | null;
  cif: string | null;
  createdAt: string | null;
  createdAtRaw: string | null;
  archivedId: number | null;
}

export interface MessageList {
  title: string | null;
  messages: EfacturaMessage[];
  total: number | null;
  page: number | null;
  pages: number | null;
}

export interface CertifiedCompany {
  id: number;
  cui: string;
  connectionId: number;
}

export interface AnafTarget {
  accountantId: number;
  connectionId: number;
  companyId: number;
}

export interface SendOutcome {
  uploadIndex: string | null;
  status: UploadStatus;
  errorMessage: string | null;
}

export interface RawMessage {
  id?: string | number;
  id_solicitare?: string | number | null;
  tip?: string;
  detalii?: string;
  cif?: string | number;
  data_creare?: string;
}

export interface RawMessageList {
  titlu?: string;
  eroare?: string;
  mesaje?: RawMessage[];
  numar_total_inregistrari?: number;
  numar_total_pagini?: number;
  index_pagina_curenta?: number;
}

export interface MessageQuery {
  zile?: number;
  filtru?: MessageFilter;
  startTime?: number;
  endTime?: number;
  pagina?: number;
}

export interface EinvoiceParty {
  cui: string | null;
  name: string | null;
}

export interface EinvoiceLine {
  name: string | null;
  quantity: number | null;
  unitCode: string | null;
  unitPrice: number | null;
  vatCategory: string | null;
  vatPercent: number | null;
  net: number | null;
}

export interface ParsedEinvoice {
  standard: EfacturaStandard;
  typeCode: string | null;
  number: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  supplier: EinvoiceParty;
  customer: EinvoiceParty;
  totalNet: number | null;
  totalVat: number | null;
  totalGross: number | null;
  lines: EinvoiceLine[];
  incomplete: string | null;
}

export interface ExtractedInvoice {
  xml: string;
  uploadIndex: string | null;
}

export interface MessageHint {
  type: string | null;
  requestId: string | null;
  createdAt: string | null;
}

export interface ImportResult {
  messageId: string;
  status: ImportStatus;
  id?: number;
  reason?: string;
}

export interface ImportPeriodResult {
  found: number;
  remaining: number;
  results: ImportResult[];
}

export type ImportCounts = Record<ImportStatus, number>;

export interface ArchiveFilter {
  companyId?: number;
  direction?: EfacturaDirection;
  from?: string;
  to?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export interface ArchiveItem {
  id: number;
  companyId: number;
  anafMessageId: string;
  uploadIndex: string | null;
  environment: AnafEnvironment;
  direction: EfacturaDirection;
  standard: EfacturaStandard;
  typeCode: string | null;
  creditNote: boolean;
  number: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  supplierCui: string | null;
  supplierName: string | null;
  customerCui: string | null;
  customerName: string | null;
  totalNet: number | null;
  totalVat: number | null;
  totalGross: number | null;
  invoiceId: number | null;
  parseError: string | null;
  messageCreatedAt: Date | null;
  createdAt: Date;
}

export interface ArchiveDetail extends ArchiveItem {
  lines: EinvoiceLine[];
}

export interface ArchiveTotal {
  currency: string;
  count: number;
  total: number;
}

export interface ArchivePage {
  items: ArchiveItem[];
  total: number;
  page: number;
  pageSize: number;
  totals: ArchiveTotal[];
}

export interface ArchiveEmail {
  to: string;
  message?: string;
}

export interface ImportItem {
  id: string;
  hint: MessageHint | null;
}

export interface CompanySyncResult {
  imported: number;
  failed: boolean;
}
