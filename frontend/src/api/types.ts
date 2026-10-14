export interface Accountant {
  id: number;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface Company {
  id: number;
  accountantId: number;
  cui: string;
  name: string;
  anafConnectionId: string | null;
  regCom: string | null;
  address: string | null;
  caenCode: string | null;
  registrationStatus: string | null;
  vatPayer: boolean | null;
  vatOnCollection: boolean | null;
  splitVat: boolean | null;
  eFactura: boolean | null;
  inactive: boolean | null;
  iban: string | null;
  bankName: string | null;
  email: string | null;
  phone: string | null;
  hasLogo: boolean;
  anafData: AnafTvaRecord | null;
  anafSyncedAt: string | null;
  caen: CaenInfo | null;
  createdAt: string;
  updatedAt: string;
}

export type BulkCompanyResult =
  | { cui: string; status: 'created'; company: Company }
  | { cui: string; status: 'exists' | 'not_found' };

export interface AnafTvaRecord {
  date_generale: {
    cui: number;
    data: string;
    denumire: string;
    adresa: string;
    nrRegCom: string;
    telefon: string;
    fax: string;
    codPostal: string;
    act: string;
    stare_inregistrare: string;
    data_inregistrare: string;
    cod_CAEN: string;
    iban: string;
    statusRO_e_Factura: boolean;
    data_inreg_Reg_RO_e_Factura?: string;
    organFiscalCompetent: string;
    forma_de_proprietate: string;
    forma_organizare: string;
    forma_juridica: string;
  };
  inregistrare_scop_Tva: {
    scpTVA: boolean;
    perioade_TVA?: {
      data_inceput_ScpTVA: string;
      data_sfarsit_ScpTVA: string;
      data_anul_imp_ScpTVA: string;
      mesaj_ScpTVA: string;
    }[];
  };
  inregistrare_RTVAI: {
    dataInceputTvaInc: string;
    dataSfarsitTvaInc: string;
    dataActualizareTvaInc: string;
    dataPublicareTvaInc: string;
    tipActTvaInc: string;
    statusTvaIncasare: boolean;
  };
  stare_inactiv: {
    dataInactivare: string;
    dataReactivare: string;
    dataPublicare: string;
    dataRadiere: string;
    statusInactivi: boolean;
  };
  inregistrare_SplitTVA: {
    dataInceputSplitTVA: string;
    dataAnulareSplitTVA: string;
    statusSplitTVA: boolean;
  };
  adresa_sediu_social: Record<string, string>;
  adresa_domiciliu_fiscal: Record<string, string>;
}

export type AnafConnectionStatus = 'active' | 'expired' | 'revoked';

export interface AnafConnection {
  id: string;
  accountantId: number;
  label: string;
  certSerial: string;
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

export type ProfessionalTitle = 'expert_contabil' | 'contabil_autorizat';

export interface AccountantProfile {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  ceccarMember: boolean;
  professionalTitle: ProfessionalTitle | null;
  ceccarNumber: string | null;
  ceccarBranch: string | null;
  ccfNumber: string | null;
  firmName: string | null;
  firmCui: string | null;
  firmCaenCode: string | null;
  firmCaen: CaenInfo | null;
  createdAt: string;
  updatedAt: string;
}

export type ProfileUpdate = Partial<
  Omit<
    AccountantProfile,
    'id' | 'email' | 'firmCaen' | 'createdAt' | 'updatedAt'
  >
>;

export interface CaenInfo {
  code: string;
  name: string;
  revision: 2 | 3;
  rev2Name: string | null;
}

export interface FirmLookup {
  firmCui: string;
  firmName: string;
  firmCaenCode: string | null;
  firmCaen: CaenInfo | null;
}

export interface ArchivedSpvMessage {
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

export interface SpvArchivePage {
  items: ArchivedSpvMessage[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SpvSyncSummary {
  fetched: number;
  added: number;
  downloaded: number;
  failed: number;
  pending: number;
}

export interface SpvRequestInput {
  tip: string;
  cui: string;
  an?: number;
  luna?: number;
  motiv?: string;
  numarInregistrare?: string;
  cuiPunctDeLucru?: string;
}

export interface SpvRequestResult {
  requestId: string;
  parameters: string | null;
  certSerial: string | null;
  cnp: string | null;
  title: string | null;
}

export type VatCategory = 'S' | 'Z' | 'E' | 'AE' | 'O';
export type InvoiceUnit =
  | 'buc'
  | 'ore'
  | 'zile'
  | 'luni'
  | 'kg'
  | 'm'
  | 'mp'
  | 'l'
  | 'set'
  | 'serviciu';
export type InvoiceCurrency = 'RON' | 'EUR' | 'USD' | 'GBP' | 'CHF';
export type PaymentMethod = 'transfer' | 'numerar' | 'card';

export interface InvoiceParty {
  name: string;
  cui: string | null;
  regCom: string | null;
  address: string;
  street: string | null;
  city: string | null;
  county: string | null;
  postalCode: string | null;
  iban: string | null;
  bank: string | null;
  email: string | null;
  phone: string | null;
  vatPayer: boolean;
}

export interface LineSuggestion {
  description: string;
  quantity: number;
  unit: InvoiceUnit;
  unitPrice: number;
  vatRate: number;
  vatCategory: VatCategory;
  currency: InvoiceCurrency;
  issueDate: string;
}

export interface BuyerLookup extends InvoiceParty {
  inactive: boolean | null;
  eFactura: boolean | null;
}

export interface FoundBuyer extends BuyerLookup {
  anafChecked: boolean;
  source: 'invoice' | 'company' | 'anaf';
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unit: InvoiceUnit;
  unitPrice: number;
  vatRate: number;
  vatCategory: VatCategory;
  vatExemptionReason: string | null;
  stornoOfLine?: number;
  netAmount: number;
}

export interface InvoiceSummary {
  id: number;
  companyId: number;
  series: string;
  number: number;
  issueDate: string;
  dueDate: string | null;
  sellerName: string;
  buyerName: string;
  buyerCui: string | null;
  currency: string;
  totalGross: number;
  stored: boolean;
  stornoOfInvoiceId: number | null;
  stornoOfSeries: string | null;
  stornoOfNumber: number | null;
  stornoed: boolean;
  emailedTo: string | null;
  emailedAt: string | null;
}

export interface InvoicePage {
  items: InvoiceSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Invoice
  extends Omit<
    InvoiceSummary,
    'stored' | 'sellerName' | 'buyerName' | 'buyerCui' | 'stornoed'
  > {
  remainingQuantities?: number[] | null;
  accountantId: number;
  deliveryDate: string;
  exchangeRate: number | null;
  paymentMethod: PaymentMethod;
  vatOnCollection: boolean;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  lines: InvoiceLine[];
  totalNet: number;
  totalVat: number;
  totalVatRon: number;
  notes: string | null;
  storagePath: string | null;
  createdAt: string;
}

export interface CreatedInvoice {
  invoice: Invoice;
  storageError: string | null;
  emailError: string | null;
}

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unit: InvoiceUnit;
  unitPrice: number;
  vatRate: number;
  vatCategory?: Exclude<VatCategory, 'O'>;
}

export interface CreateInvoiceInput {
  companyId: number;
  series: string;
  number?: number;
  issueDate: string;
  deliveryDate: string;
  dueDate?: string | null;
  currency: InvoiceCurrency;
  exchangeRate?: number | null;
  paymentMethod: PaymentMethod;
  notes?: string | null;
  buyer: Partial<InvoiceParty> & { name: string; address: string };
  lines: InvoiceLineInput[];
  saveToStorage?: boolean;
  sendToEmail?: string | null;
}

export interface InvoiceStatsTotals {
  invoices: number;
  stornos: number;
  netRon: number;
  vatRon: number;
  grossRon: number;
}

export interface InvoiceStats {
  month: InvoiceStatsTotals;
  previousMonth: InvoiceStatsTotals;
  year: InvoiceStatsTotals;
  months: { month: string; invoices: number; grossRon: number }[];
}

export interface CreateStornoInput {
  issueDate?: string | null;
  series?: string;
  notes?: string | null;
  lines?: { lineIndex: number; quantity: number }[];
  saveToStorage?: boolean;
  sendToEmail?: string | null;
}

export type EfacturaStatus =
  | 'sending'
  | 'processing'
  | 'ok'
  | 'nok'
  | 'rejected';
export type EfacturaStandard = 'UBL' | 'CN' | 'CII' | 'RASP';
export type MessageFilter = 'E' | 'P' | 'T' | 'R';

export interface EfacturaUpload {
  id: number;
  accountantId: number;
  companyId: number;
  invoiceId: number | null;
  anafConnectionId: string | null;
  environment: 'test' | 'prod';
  standard: EfacturaStandard;
  uploadIndex: string | null;
  status: EfacturaStatus;
  downloadId: string | null;
  errorMessage: string | null;
  checkedAt: string | null;
  createdAt: string;
}

export interface EfacturaUploadPage {
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

export interface EfacturaMessageList {
  title: string | null;
  messages: EfacturaMessage[];
  total: number | null;
  page: number | null;
  pages: number | null;
}

export interface XmlValidation {
  valid: boolean;
  messages: string[];
  traceId: string | null;
}

export interface UploadXmlInput {
  companyId: number;
  standard: EfacturaStandard;
  file: File;
  extern?: boolean;
  autofactura?: boolean;
  executare?: boolean;
  b2c?: boolean;
}

export interface PublicStats {
  accountants: number;
  companies: number;
  invoices: number;
  efacturaUploads: number;
  spvMessages: number;
  anafConnections: number;
  updatedAt: string;
}
