import { COMPANY_FIELD_LABELS } from '../companies/dto/company.constants.js';
import type { CompanyField } from '../companies/dto/company.types.js';
import { ValidateStandard } from '../efactura/dto/efactura.enums.js';

import {
  formatAmount,
  invoiceNumber,
  stornoReference,
} from '../invoices/helpers/invoice-format.js';

import type { ActivityEntry } from './dto/api-log.types.js';
import { UPLOAD_STATUS_LABELS } from './dto/api-log.constants.js';
import { ActivityAction } from './dto/api-log.enums.js';
import type {
  CompanyRef,
  InvoiceRef,
  UploadRef,
  ConnectionRef,
} from './dto/api-log.types.js';

function firm(company: CompanyRef): string {
  return `${company.name} (CUI ${company.cui})`;
}

function companyDetails(company: CompanyRef) {
  return { companyName: company.name, cui: company.cui };
}

function invoiceDetails(invoice: InvoiceRef) {
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoiceNumber(invoice.series, invoice.number),
    buyerName: invoice.buyer.name,
    buyerCui: invoice.buyer.cui,
    total: invoice.totalGross,
    currency: invoice.currency,
  };
}

function amount(invoice: InvoiceRef): string {
  return `${formatAmount(invoice.totalGross)} ${invoice.currency}`;
}

function plural(count: number, one: string, many: string): string {
  if (count === 1) return `1 ${one}`;
  const mod = count % 100;
  return `${count}${count >= 20 && (mod === 0 || mod >= 20) ? ' de' : ''} ${many}`;
}

export function loggedIn(): ActivityEntry {
  return {
    action: ActivityAction.LoggedIn,
    description: 'Autentificare în cont',
  };
}

export function profileUpdated(fields: string[]): ActivityEntry {
  return {
    action: ActivityAction.ProfileUpdated,
    description: 'Datele profilului au fost actualizate',
    details: { fields },
  };
}

export function passwordChanged(): ActivityEntry {
  return {
    action: ActivityAction.PasswordChanged,
    description: 'Parola contului a fost schimbată',
  };
}

export function accountExported(): ActivityEntry {
  return {
    action: ActivityAction.AccountExported,
    description: 'Exportul complet al contului a fost descărcat (ZIP)',
  };
}

export function companyCreated(company: CompanyRef): ActivityEntry {
  return {
    action: ActivityAction.CompanyCreated,
    companyId: company.id,
    description: `Firma ${firm(company)} a fost adăugată`,
    details: companyDetails(company),
  };
}

export function companyUpdated(
  company: CompanyRef,
  fields: CompanyField[],
): ActivityEntry {
  const labels = fields.map((f) => COMPANY_FIELD_LABELS[f]);
  return {
    action: ActivityAction.CompanyUpdated,
    companyId: company.id,
    description: `Datele firmei ${firm(company)} au fost modificate: ${labels.join(', ')}`,
    details: { ...companyDetails(company), fields },
  };
}

export function companyAnafRefreshed(company: CompanyRef): ActivityEntry {
  return {
    action: ActivityAction.CompanyAnafRefreshed,
    companyId: company.id,
    description: `Datele firmei ${firm(company)} au fost reîncărcate de la ANAF`,
    details: companyDetails(company),
  };
}

export function companyLogoChanged(
  company: CompanyRef,
  removed: boolean,
): ActivityEntry {
  return {
    action: ActivityAction.CompanyLogoChanged,
    companyId: company.id,
    description: removed
      ? `Logo-ul firmei ${firm(company)} a fost șters`
      : `Logo-ul firmei ${firm(company)} a fost încărcat`,
    details: { ...companyDetails(company), removed },
  };
}

export function companyExported(company: CompanyRef): ActivityEntry {
  return {
    action: ActivityAction.CompanyExported,
    companyId: company.id,
    description: `Exportul datelor firmei ${firm(company)} a fost descărcat (ZIP)`,
    details: companyDetails(company),
  };
}

export function companyDeleted(company: CompanyRef): ActivityEntry {
  return {
    action: ActivityAction.CompanyDeleted,
    companyId: company.id,
    description: `Firma ${firm(company)} a fost ștearsă`,
    details: companyDetails(company),
  };
}

export function invoiceIssued(
  invoice: InvoiceRef,
  delivery: { emailedTo: string | null; stored: boolean },
): ActivityEntry {
  const storno = stornoReference(invoice);
  const number = invoiceNumber(invoice.series, invoice.number);
  return {
    action: storno
      ? ActivityAction.InvoiceStorno
      : ActivityAction.InvoiceIssued,
    companyId: invoice.companyId,
    description: storno
      ? `Factura de stornare ${number} a fost emisă pentru factura ${storno}, către ${invoice.buyer.name}: ${amount(invoice)}`
      : `Factura ${number} a fost emisă către ${invoice.buyer.name}: ${amount(invoice)}`,
    details: {
      ...invoiceDetails(invoice),
      stornoOf: storno,
      emailedTo: delivery.emailedTo,
      stored: delivery.stored,
    },
  };
}

export function invoiceSent(invoice: InvoiceRef, to: string): ActivityEntry {
  return {
    action: ActivityAction.InvoiceSent,
    companyId: invoice.companyId,
    description: `Factura ${invoiceNumber(invoice.series, invoice.number)} a fost trimisă pe email la ${to}`,
    details: { ...invoiceDetails(invoice), emailedTo: to },
  };
}

export function invoiceStored(invoice: InvoiceRef): ActivityEntry {
  return {
    action: ActivityAction.InvoiceStored,
    companyId: invoice.companyId,
    description: `Factura ${invoiceNumber(invoice.series, invoice.number)} a fost salvată în Storage`,
    details: invoiceDetails(invoice),
  };
}

function uploadDetails(upload: UploadRef) {
  return {
    uploadId: upload.id,
    uploadIndex: upload.uploadIndex,
    status: upload.status,
    environment: upload.environment,
  };
}

export function efacturaUploaded(
  upload: UploadRef,
  invoice: InvoiceRef | null,
): ActivityEntry {
  const what = invoice
    ? `Factura ${invoiceNumber(invoice.series, invoice.number)} a fost trimisă`
    : 'Un fișier XML a fost trimis';
  const index = upload.uploadIndex ? `, index ${upload.uploadIndex}` : '';
  const error = upload.errorMessage ? ` (${upload.errorMessage})` : '';
  return {
    action: ActivityAction.EfacturaUploaded,
    companyId: upload.companyId,
    description: `${what} la e-Factura${index}: ${UPLOAD_STATUS_LABELS[upload.status]}${error}`,
    details: {
      ...uploadDetails(upload),
      ...(invoice ? invoiceDetails(invoice) : { invoiceId: null }),
    },
  };
}

export function efacturaStatusChecked(upload: UploadRef): ActivityEntry {
  return {
    action: ActivityAction.EfacturaStatusChecked,
    companyId: upload.companyId,
    description: `Starea încărcării e-Factura ${upload.uploadIndex ?? upload.id} a fost verificată: ${UPLOAD_STATUS_LABELS[upload.status]}`,
    details: uploadDetails(upload),
  };
}

export function efacturaDownloaded(
  companyId: number,
  downloadId: string,
): ActivityEntry {
  return {
    action: ActivityAction.EfacturaDownloaded,
    companyId,
    description: `Arhiva e-Factura ${downloadId} a fost descărcată de la ANAF`,
    details: { downloadId },
  };
}

export function efacturaMessagesLoaded(
  company: CompanyRef,
  count: number,
  query: { zile?: number; filtru?: string; pagina?: number },
): ActivityEntry {
  return {
    action: ActivityAction.EfacturaMessagesLoaded,
    companyId: company.id,
    description: `Mesajele e-Factura ale firmei ${firm(company)} au fost încărcate de la ANAF: ${plural(count, 'mesaj', 'mesaje')}`,
    details: {
      ...companyDetails(company),
      count,
      days: query.zile ?? null,
      filter: query.filtru ?? null,
      page: query.pagina ?? null,
    },
  };
}

export function efacturaValidated(
  result: { valid: boolean; messages: string[] },
  standard: ValidateStandard,
  invoice: InvoiceRef | null,
): ActivityEntry {
  const what = invoice
    ? `Factura ${invoiceNumber(invoice.series, invoice.number)} a fost validată`
    : `Un fișier XML (${standard}) a fost validat`;
  const outcome = result.valid
    ? 'valid'
    : `invalid, ${plural(result.messages.length, 'eroare', 'erori')}`;
  return {
    action: ActivityAction.EfacturaValidated,
    companyId: invoice?.companyId ?? null,
    description: `${what} la ANAF: ${outcome}`,
    details: {
      valid: result.valid,
      errors: result.messages.length,
      standard,
      ...(invoice ? invoiceDetails(invoice) : {}),
    },
  };
}

export function efacturaTransformed(standard: ValidateStandard): ActivityEntry {
  return {
    action: ActivityAction.EfacturaTransformed,
    description: `Un fișier XML (${standard}) a fost transformat în PDF la ANAF`,
    details: { standard },
  };
}

export function spvImported(summary: {
  fetched: number;
  added: number;
  certSerial: string | null;
}): ActivityEntry {
  return {
    action: ActivityAction.SpvImported,
    description: `Lista de mesaje SPV a fost importată: ${plural(summary.added, 'mesaj nou', 'mesaje noi')} din ${summary.fetched}`,
    details: { ...summary },
  };
}

export function spvDocumentSaved(message: {
  id: number;
  anafMessageId: string;
  companyId: number | null;
  cif: string | null;
}): ActivityEntry {
  return {
    action: ActivityAction.SpvDocumentSaved,
    companyId: message.companyId,
    description: `PDF-ul mesajului SPV ${message.anafMessageId} a fost încărcat`,
    details: {
      messageId: message.id,
      anafMessageId: message.anafMessageId,
      cif: message.cif,
    },
  };
}

function connectionDetails(connection: ConnectionRef) {
  return {
    connectionId: connection.id,
    label: connection.label,
    certSerial: connection.certSerial,
  };
}

export function certificateConnected(
  connection: ConnectionRef,
  company: CompanyRef | null,
): ActivityEntry {
  return {
    action: ActivityAction.CertificateConnected,
    companyId: company?.id ?? null,
    description: company
      ? `Certificatul ANAF ${connection.certSerial} a fost conectat prin linkul de autorizare al firmei ${firm(company)}`
      : `Certificatul ANAF ${connection.certSerial} a fost conectat`,
    details: {
      ...connectionDetails(connection),
      ...(company ? companyDetails(company) : {}),
    },
  };
}

export function certificateRenamed(connection: ConnectionRef): ActivityEntry {
  return {
    action: ActivityAction.CertificateRenamed,
    description: `Certificatul ANAF ${connection.certSerial} a fost redenumit „${connection.label}”`,
    details: connectionDetails(connection),
  };
}

export function certificateRemoved(connection: ConnectionRef): ActivityEntry {
  return {
    action: ActivityAction.CertificateRemoved,
    description: `Certificatul ANAF „${connection.label}” (${connection.certSerial}) a fost deconectat și revocat`,
    details: connectionDetails(connection),
  };
}

export function certificateTested(
  connection: ConnectionRef,
  status: number,
): ActivityEntry {
  return {
    action: ActivityAction.CertificateTested,
    description: `Certificatul ANAF „${connection.label}” a fost testat: răspuns HTTP ${status}`,
    details: { ...connectionDetails(connection), status },
  };
}

export function authorizationLinkCreated(
  company: CompanyRef,
  expiresAt: Date,
): ActivityEntry {
  return {
    action: ActivityAction.AuthorizationLinkCreated,
    companyId: company.id,
    description: `Un link de autorizare ANAF a fost creat pentru firma ${firm(company)}`,
    details: { ...companyDetails(company), expiresAt: expiresAt.toISOString() },
  };
}
