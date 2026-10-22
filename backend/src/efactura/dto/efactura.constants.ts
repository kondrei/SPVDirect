import { AnafMessageType, EfacturaDirection } from './efactura.enums.js';

export const MAX_MESSAGE_DAYS = 60;
export const MAX_XML_BYTES = 10 * 1024 * 1024;
export const MAX_LATEST_UPLOAD_IDS = 100;

export const NO_CERTIFICATE =
  'Firma nu are un certificat ANAF asociat. Legați un certificat din pagina firmei.';
export const STALE_SENDING_MS = 5 * 60 * 1000;
export const UPLOAD_INTERRUPTED =
  'Trimiterea a fost întreruptă înainte de răspunsul ANAF';
export const ZIP_MAGIC = [0x50, 0x4b] as const;
export const NO_MESSAGES_PATTERN = /nu exist[aă] mesaje/i;

export const INVOICE_MESSAGE_TYPES: readonly AnafMessageType[] = [
  AnafMessageType.InvoiceReceived,
  AnafMessageType.InvoiceSent,
];

export const MAX_IMPORT_IDS = 50;
export const IMPORT_PERIOD_BATCH = 50;
export const MAX_MESSAGE_PAGES = 20;
export const PERIOD_MARGIN_MS = 60_000;
export const DAY_MS = 24 * 3600 * 1000;

export const MAX_ZIP_ENTRIES = 10;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
export const SIGNATURE_ENTRY_PREFIX = 'semnatura_';
export const MAX_STORED_LINES = 1000;

export const ARCHIVE_PAGE_SIZE = 25;
export const MAX_ARCHIVE_PAGE_SIZE = 100;
export const MAX_ARCHIVE_SEARCH = 100;
export const MAX_EMAIL_MESSAGE = 2000;

export const ARCHIVE_SYNC_BATCH = 100;

export const NOT_AN_INVOICE = 'Mesajul nu conține o factură';
export const NOT_A_PARTY =
  'Firma nu apare în factură nici ca furnizor, nici ca cumpărător';
export const ARCHIVE_NOT_FOUND = 'Factura nu a fost găsită în arhivă';
export const ARCHIVE_FILE_MISSING =
  'Fișierul facturii nu mai este disponibil în arhivă';
export const PDF_ONLY_UBL =
  'Conversia în PDF la ANAF este disponibilă doar pentru facturi UBL';
export const IMPORT_FAILED = 'Factura nu a putut fi importată';

export const DIRECTION_LABELS: Record<EfacturaDirection, string> = {
  [EfacturaDirection.Received]: 'primită',
  [EfacturaDirection.Sent]: 'trimisă',
};

export function archiveFilename(
  row: { number: string | null; anafMessageId: string },
  extension: string,
): string {
  const number = row.number?.replaceAll(/[^\w-]+/g, '-').slice(0, 40);
  const prefix = number ? 'factura-' + number + '-' : 'factura-';
  return `${prefix}${row.anafMessageId}.${extension}`;
}

export const ANAF_ID_PATTERN = /^\d{1,20}$/;
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const STORAGE_NOT_CONFIGURED =
  'Fișierul este în Supabase Storage, dar stocarea nu este configurată (SUPABASE_URL, SUPABASE_SERVICE_KEY).';

export const ARCHIVE_LIST_COLUMNS = [
  'id',
  'accountantId',
  'companyId',
  'anafMessageId',
  'uploadIndex',
  'environment',
  'direction',
  'standard',
  'typeCode',
  'number',
  'issueDate',
  'dueDate',
  'currency',
  'supplierCui',
  'supplierName',
  'customerCui',
  'customerName',
  'totalNet',
  'totalVat',
  'totalGross',
  'invoiceId',
  'parseError',
  'messageCreatedAt',
  'createdAt',
] as const;

export const BYTE_ORDER_MARK = 0xfeff;
