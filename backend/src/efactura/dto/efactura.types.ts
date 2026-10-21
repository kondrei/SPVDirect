import type { EfacturaUpload } from '../efactura-upload.entity.js';
import type { UploadStatus, EfacturaStandard } from './efactura.enums.js';

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
