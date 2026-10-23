import {
  ActivityAction,
  AnafConnectionSource,
  AnafConnectionStatus,
  AnafEnvironment,
  EfacturaDirection,
  EfacturaStandard,
  ProfessionalTitle,
  UploadStatus,
} from '../api/enums';
import type {
  Accountant,
  AccountantProfile,
  ActivityPage,
  AnafConnection,
  ArchivedInvoice,
  ArchivePage,
  ArchivedSpvMessage,
  Company,
  EfacturaUpload,
  EfacturaUploadPage,
  InvoicePage,
  InvoiceStats,
  InvoiceSummary,
  SpvArchivePage,
} from '../api/types';

const ACCOUNTANT_ID = 1;
const STAMP = '2026-10-12T08:30:00Z';

export const ME: Accountant = {
  id: ACCOUNTANT_ID,
  email: 'maria@cabinet-exemplu.ro',
  name: 'Maria Popescu',
  createdAt: '2026-03-02T09:00:00Z',
};

const COMPANY_ROWS: [string, string, string, number | null, boolean, string][] = [
  ['14399840', 'AGRO VEST SRL', 'Timișoara, Str. Gării 12', 1, true, '0111'],
  ['21875632', 'CONSTRUCT NORD SA', 'Baia Mare, Bd. București 4', 1, true, '4120'],
  ['30552147', 'LACTA BANAT SRL', 'Lugoj, Str. Fabricii 8', 2, true, '1051'],
  ['18264590', 'DELTA LOGISTIC SRL', 'Constanța, Str. Portului 21', 2, true, '4941'],
  ['42117806', 'MEDIFARM PLUS SRL', 'Cluj-Napoca, Str. Observatorului 3', 3, true, '4773'],
  ['39028411', 'ATELIER DESIGN STUDIO SRL', 'Iași, Str. Lăpușneanu 17', 3, false, '7410'],
  ['27760953', 'TRANSILVANIA TOUR SRL', 'Brașov, Str. Lungă 90', null, true, '7911'],
  ['45512078', 'CODEFORGE SOFTWARE SRL', 'București, Calea Victoriei 155', null, true, '6201'],
];

const CAEN_NAMES: Record<string, string> = {
  '0111': 'Cultivarea cerealelor (exclusiv orez), plantelor leguminoase și a plantelor producătoare de semințe oleaginoase',
  '4120': 'Lucrări de construcții a clădirilor rezidențiale și nerezidențiale',
  '1051': 'Fabricarea produselor lactate și a brânzeturilor',
  '4941': 'Transporturi rutiere de mărfuri',
  '4773': 'Comerț cu amănuntul al produselor farmaceutice, în magazine specializate',
  '7410': 'Activități de design specializat',
  '7911': 'Activități ale agențiilor turistice',
  '6201': 'Activități de realizare a soft-ului la comandă',
};

export const COMPANIES: Company[] = COMPANY_ROWS.map(
  ([cui, name, address, anafConnectionId, vatPayer, caenCode], i) => ({
    id: i + 1,
    accountantId: ACCOUNTANT_ID,
    cui,
    name,
    anafConnectionId,
    regCom: `J${String(35 + i).padStart(2, '0')}/${1200 + i * 37}/20${String(10 + i).padStart(2, '0')}`,
    address,
    caenCode,
    registrationStatus: 'INREGISTRAT din data 12.04.2014',
    vatPayer,
    vatOnCollection: i === 5,
    splitVat: false,
    eFactura: true,
    inactive: false,
    iban: `RO${String(49 + i)}BTRL0${String(1301202 + i)}XX`,
    bankName: 'Banca Transilvania',
    email: `office@${name.split(' ')[0].toLowerCase()}.ro`,
    phone: null,
    hasLogo: false,
    anafData: null,
    anafSyncedAt: STAMP,
    caen: { code: caenCode, name: CAEN_NAMES[caenCode], revision: 3, rev2Name: null },
    createdAt: STAMP,
    updatedAt: STAMP,
  }),
);

const connection = (
  id: number,
  label: string,
  certSerial: string,
  source: AnafConnectionSource,
  accessExpiresAt: string,
): AnafConnection => ({
  id,
  accountantId: ACCOUNTANT_ID,
  label,
  certSerial,
  roles: ['HELLO', 'EFACTURA', 'ETRANSPORT'],
  source,
  accessExpiresAt,
  refreshExpiresAt: '2027-09-30T10:00:00Z',
  lastRefreshedAt: '2026-10-20T07:00:00Z',
  status: AnafConnectionStatus.Active,
  createdAt: '2026-04-01T10:00:00Z',
  updatedAt: '2026-10-20T07:00:00Z',
});

export const CONNECTIONS: AnafConnection[] = [
  connection(1, 'Popescu, token USB', '3A00F1C27B9E54D2', AnafConnectionSource.Self, '2027-01-12T10:00:00Z'),
  connection(2, 'Ionescu, certificat cloud', '7C11A0E58D2F33B4', AnafConnectionSource.Link, '2026-11-13T10:00:00Z'),
  connection(3, 'Marin, token USB', '1E8B4F0072CA9D61', AnafConnectionSource.Link, '2026-12-28T10:00:00Z'),
];

const INVOICE_ROWS: [number, string, number, string, string, number, string][] = [
  [1, 'SPV', 142, '2026-10-21', 'CONSTRUCT NORD SA', 1240000, '21875632'],
  [1, 'SPV', 141, '2026-10-20', 'LACTA BANAT SRL', 891550, '30552147'],
  [3, 'LCT', 87, '2026-10-17', 'DELTA LOGISTIC SRL', 321000, '18264590'],
  [5, 'MDF', 304, '2026-10-16', 'FARMACIA SALVIA SRL', 64075, '33018745'],
  [8, 'CFS', 58, '2026-10-14', 'MEDIFARM PLUS SRL', 2856000, '42117806'],
  [2, 'CNS', 211, '2026-10-10', 'AGRO VEST SRL', 4718230, '14399840'],
  [4, 'DLG', 1033, '2026-10-08', 'LACTA BANAT SRL', 1530000, '30552147'],
  [6, 'ADS', 19, '2026-10-06', 'TRANSILVANIA TOUR SRL', 595000, '27760953'],
  [7, 'TTR', 402, '2026-10-03', 'CODEFORGE SOFTWARE SRL', 1987400, '45512078'],
  [1, 'SPV', 140, '2026-10-01', 'MEDIFARM PLUS SRL', 77350, '42117806'],
];

export const INVOICES: InvoiceSummary[] = INVOICE_ROWS.map(
  ([companyId, series, number, issueDate, buyerName, totalGross, buyerCui], i) => ({
    id: 200 - i,
    companyId,
    series,
    number,
    issueDate,
    dueDate: null,
    sellerName: COMPANIES[companyId - 1].name,
    buyerName,
    buyerCui,
    currency: 'RON',
    totalGross: totalGross / 100,
    stored: i % 3 !== 2,
    stornoOfInvoiceId: null,
    stornoOfSeries: null,
    stornoOfNumber: null,
    stornoed: false,
    emailedTo: i % 2 === 0 ? `office@${buyerName.split(' ')[0].toLowerCase()}.ro` : null,
    emailedAt: i % 2 === 0 ? `${issueDate}T12:00:00Z` : null,
  }),
);

const UPLOAD_STATUSES: UploadStatus[] = [
  UploadStatus.Processing,
  UploadStatus.Ok,
  UploadStatus.Ok,
  UploadStatus.Nok,
  UploadStatus.Ok,
  UploadStatus.Ok,
  UploadStatus.Ok,
  UploadStatus.Ok,
  UploadStatus.Ok,
  UploadStatus.Ok,
];

export const UPLOADS: EfacturaUpload[] = INVOICES.map((inv, i) => ({
  id: 90 - i,
  accountantId: ACCOUNTANT_ID,
  companyId: inv.companyId,
  invoiceId: inv.id,
  anafConnectionId: COMPANIES[inv.companyId - 1].anafConnectionId,
  environment: AnafEnvironment.Prod,
  standard: EfacturaStandard.UBL,
  uploadIndex: String(5012345870 - i * 13),
  status: UPLOAD_STATUSES[i],
  downloadId: UPLOAD_STATUSES[i] === UploadStatus.Ok ? String(3301299 - i) : null,
  errorMessage:
    UPLOAD_STATUSES[i] === UploadStatus.Nok
      ? 'E: [BR-RO-100] Codul de înregistrare în scopuri de TVA al cumpărătorului nu este valid.'
      : null,
  checkedAt: `${inv.issueDate}T13:00:00Z`,
  createdAt: `${inv.issueDate}T12:30:00Z`,
}));

const pageOf = <T>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 25 });

export const INVOICE_PAGE: InvoicePage = pageOf(INVOICES);
export const UPLOAD_PAGE: EfacturaUploadPage = pageOf(UPLOADS);

export const STATS: InvoiceStats = {
  month: { invoices: 214, stornos: 3, netRon: 1079437.31, vatRon: 205093.09, grossRon: 1284530.4 },
  previousMonth: { invoices: 198, stornos: 1, netRon: 963812.0, vatRon: 183124.28, grossRon: 1146936.28 },
  year: { invoices: 1872, stornos: 17, netRon: 9211340.5, vatRon: 1750154.7, grossRon: 10961495.2 },
  months: [
    { month: '2026-05', invoices: 176, grossRon: 982310.5 },
    { month: '2026-06', invoices: 189, grossRon: 1043877.2 },
    { month: '2026-07', invoices: 171, grossRon: 921540.0 },
    { month: '2026-08', invoices: 162, grossRon: 880112.75 },
    { month: '2026-09', invoices: 198, grossRon: 1146936.28 },
    { month: '2026-10', invoices: 214, grossRon: 1284530.4 },
  ],
};

const ACTIVITY_ROWS: [ActivityAction, number | null, string, string][] = [
  [ActivityAction.EfacturaUploaded, 1, 'Factura SPV 142 a fost trimisă la ANAF (CONSTRUCT NORD SA).', '2026-10-21T12:30:00Z'],
  [ActivityAction.InvoiceIssued, 1, 'Factura SPV 142 emisă către CONSTRUCT NORD SA, 12.400,00 RON.', '2026-10-21T12:28:00Z'],
  [ActivityAction.EfacturaArchiveImported, 3, '12 facturi importate în arhiva e-Factura pentru LACTA BANAT SRL.', '2026-10-21T07:02:00Z'],
  [ActivityAction.CompanyCreated, 8, 'Firma CODEFORGE SOFTWARE SRL (CUI 45512078) a fost adăugată.', '2026-10-20T15:10:00Z'],
  [ActivityAction.CertificateConnected, null, 'Certificatul „Marin, token USB” a fost conectat.', '2026-10-20T09:45:00Z'],
  [ActivityAction.SpvImported, null, '37 de mesaje SPV importate în arhivă.', '2026-10-19T16:20:00Z'],
];

export const ACTIVITY: ActivityPage = pageOf(
  ACTIVITY_ROWS.map(([action, companyId, description, createdAt], i) => ({
    id: 500 - i,
    action,
    companyId,
    description,
    details: {},
    accountantName: ME.name ?? '',
    createdAt,
  })),
);

const ARCHIVE_ROWS: [number, string, string, string, string, number, number][] = [
  [3, 'MLK 20871', '2026-10-20', '15402288', 'FERMA DEALUL VERDE SRL', 18450, 3505.5],
  [1, 'AG-5512', '2026-10-18', '6859662', 'PETROM SA', 4210.5, 799.99],
  [4, 'F 0029381', '2026-10-17', '1590082', 'ORANGE ROMANIA SA', 389.12, 73.93],
  [2, 'BET 7710', '2026-10-15', '13348610', 'HOLCIM ROMANIA SA', 27900, 5301],
  [5, 'PHX 118204', '2026-10-14', '10231213', 'FARMEXPERT D.C.I. SRL', 12684.4, 1141.6],
  [3, 'ENG 44012', '2026-10-11', '13267221', 'ENEL ENERGIE SA', 6130.77, 1164.85],
  [1, 'KAU 99031', '2026-10-09', '15184880', 'KAUFLAND ROMANIA SCS', 1214.36, 230.73],
  [8, 'AWS-RO 2210', '2026-10-05', '42711215', 'CLOUDWAY SERVICES SRL', 2640, 501.6],
];

const ARCHIVED: ArchivedInvoice[] = ARCHIVE_ROWS.map(
  ([companyId, number, issueDate, supplierCui, supplierName, totalNet, totalVat], i) => ({
    id: 700 - i,
    companyId,
    anafMessageId: String(4100221987 - i * 7),
    uploadIndex: String(5011902210 - i * 11),
    environment: AnafEnvironment.Prod,
    direction: EfacturaDirection.Received,
    standard: EfacturaStandard.UBL,
    typeCode: '380',
    creditNote: false,
    number,
    issueDate,
    dueDate: null,
    currency: 'RON',
    supplierCui,
    supplierName,
    customerCui: COMPANIES[companyId - 1].cui,
    customerName: COMPANIES[companyId - 1].name,
    totalNet,
    totalVat,
    totalGross: Math.round((totalNet + totalVat) * 100) / 100,
    invoiceId: null,
    parseError: null,
    messageCreatedAt: `${issueDate}T09:00:00Z`,
    createdAt: `${issueDate}T09:05:00Z`,
  }),
);

export const ARCHIVE_PAGE: ArchivePage = {
  ...pageOf(ARCHIVED),
  total: 1246,
  totals: [{ currency: 'RON', count: 1246, total: 3184220.57 }],
};

const SPV_ROWS: [number, string, string, string][] = [
  [1, 'RECIPISA', 'Recipisă depunere D300 pentru luna septembrie 2026', '2026-10-21T10:12:00Z'],
  [3, 'NOTIFICARE', 'Notificare privind obligațiile fiscale restante', '2026-10-20T08:40:00Z'],
  [2, 'RECIPISA', 'Recipisă depunere D112 pentru luna septembrie 2026', '2026-10-17T14:02:00Z'],
  [5, 'FISA PLATITOR', 'Fișa sintetică pe plătitor, 01.01.2026 – 30.09.2026', '2026-10-15T11:25:00Z'],
  [4, 'CERTIFICAT', 'Certificat de atestare fiscală', '2026-10-14T09:18:00Z'],
  [6, 'RECIPISA', 'Recipisă depunere D394 pentru luna septembrie 2026', '2026-10-10T16:50:00Z'],
  [7, 'DECIZIE', 'Decizie de impunere privind plățile anticipate', '2026-10-07T12:00:00Z'],
  [8, 'RECIPISA', 'Recipisă depunere D100 pentru trimestrul III 2026', '2026-10-03T10:30:00Z'],
];

const SPV_MESSAGES: ArchivedSpvMessage[] = SPV_ROWS.map(([companyId, type, details, createdAt], i) => ({
  id: 300 - i,
  anafMessageId: String(7712004410 - i * 9),
  cif: COMPANIES[companyId - 1].cui,
  type,
  details,
  requestId: null,
  createdAt,
  createdAtRaw: null,
  companyId,
  stored: i !== 1,
  sizeBytes: i === 1 ? null : 84211 + i * 1021,
  downloadedAt: i === 1 ? null : createdAt,
}));

export const SPV_PAGE: SpvArchivePage = { ...pageOf(SPV_MESSAGES), total: 412 };

export const PROFILE: AccountantProfile = {
  id: ACCOUNTANT_ID,
  email: ME.email,
  name: ME.name,
  phone: '0722 000 000',
  ceccarMember: true,
  professionalTitle: ProfessionalTitle.ExpertContabil,
  ceccarNumber: '12345',
  ceccarBranch: 'Timiș',
  ccfNumber: null,
  firmName: 'CABINET EXEMPLU SRL',
  firmCui: '40000001',
  firmCaenCode: '6920',
  firmCaen: { code: '6920', name: 'Activități de contabilitate și audit financiar; consultanță în domeniul fiscal', revision: 3, rev2Name: null },
  createdAt: ME.createdAt,
  updatedAt: STAMP,
};

const prefix = `/accountants/${ACCOUNTANT_ID}`;

export const SCREENSHOT_API: Record<string, unknown> = {
  '/auth/me': ME,
  [`${prefix}/companies`]: COMPANIES,
  [`${prefix}/anaf/connections`]: CONNECTIONS,
  [`${prefix}/invoices`]: INVOICE_PAGE,
  [`${prefix}/invoices/stats`]: STATS,
  [`${prefix}/efactura/uploads`]: UPLOAD_PAGE,
  [`${prefix}/efactura/invoices/latest-uploads`]: UPLOADS,
  [`${prefix}/activity`]: ACTIVITY,
  [`${prefix}/efactura/archive`]: ARCHIVE_PAGE,
  [`${prefix}/spv/archive`]: SPV_PAGE,
  [`${prefix}/profile`]: PROFILE,
  [`${prefix}/mfa`]: {
    enabled: false,
    appEnabledAt: null,
    emailEnabledAt: null,
    recoveryCodeAvailable: false,
  },
};
