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
