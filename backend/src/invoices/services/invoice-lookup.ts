import { NotFoundException } from '@nestjs/common';
import type { Invoice } from '../invoice.entity.js';
import type { InvoiceRepository } from '../repositories/invoice.repository.js';

export const INVOICE_NOT_FOUND = 'Factura nu a fost găsită';

export async function findOwnedInvoice(
  invoices: InvoiceRepository,
  accountantId: number,
  id: number,
): Promise<Invoice> {
  const invoice = await invoices.findOwned(accountantId, id);
  if (!invoice) throw new NotFoundException(INVOICE_NOT_FOUND);
  return invoice;
}
