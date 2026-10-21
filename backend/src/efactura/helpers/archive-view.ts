import {
  AnafMessageType,
  EfacturaDirection,
  EfacturaStandard,
  EinvoiceTypeCode,
} from '../dto/efactura.enums.js';
import { INVOICE_MESSAGE_TYPES } from '../dto/efactura.constants.js';
import type {
  ArchiveDetail,
  ArchiveItem,
  EfacturaMessage,
  ParsedEinvoice,
} from '../dto/efactura.types.js';
import type { EfacturaInvoice } from '../efactura-invoice.entity.js';

export function isCreditNote(row: {
  standard: EfacturaStandard;
  typeCode: string | null;
}): boolean {
  return (
    row.standard === EfacturaStandard.CN ||
    row.typeCode === EinvoiceTypeCode.CreditNote
  );
}

export function toArchiveItem(row: EfacturaInvoice): ArchiveItem {
  return {
    id: row.id,
    companyId: row.companyId,
    anafMessageId: row.anafMessageId,
    uploadIndex: row.uploadIndex,
    environment: row.environment,
    direction: row.direction,
    standard: row.standard,
    typeCode: row.typeCode,
    creditNote: isCreditNote(row),
    number: row.number,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    currency: row.currency,
    supplierCui: row.supplierCui,
    supplierName: row.supplierName,
    customerCui: row.customerCui,
    customerName: row.customerName,
    totalNet: row.totalNet,
    totalVat: row.totalVat,
    totalGross: row.totalGross,
    invoiceId: row.invoiceId,
    parseError: row.parseError,
    messageCreatedAt: row.messageCreatedAt,
    createdAt: row.createdAt,
  };
}

export function toArchiveDetail(row: EfacturaInvoice): ArchiveDetail {
  return { ...toArchiveItem(row), lines: row.lines ?? [] };
}

function messageType(type: string | null): AnafMessageType | null {
  const normalized = type?.trim().toUpperCase();
  return (
    Object.values(AnafMessageType).find((value) => value === normalized) ?? null
  );
}

export function isInvoiceMessage(message: EfacturaMessage): boolean {
  const type = messageType(message.type);
  return type !== null && INVOICE_MESSAGE_TYPES.includes(type);
}

export function directionOf(
  invoice: ParsedEinvoice,
  cui: string,
  type: string | null,
): EfacturaDirection | null {
  if (invoice.supplier.cui === cui) return EfacturaDirection.Sent;
  if (invoice.customer.cui === cui) return EfacturaDirection.Received;
  const known = messageType(type);
  if (known === AnafMessageType.InvoiceSent) return EfacturaDirection.Sent;
  if (known === AnafMessageType.InvoiceReceived) {
    return EfacturaDirection.Received;
  }
  return null;
}

export function likePattern(value: string): string {
  const escaped = value.replaceAll(/[\\%_]/g, String.raw`\$&`);
  return `%${escaped}%`;
}
