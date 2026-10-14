import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { Invoice } from '../invoice.entity.js';

export const INVOICE_NOT_FOUND = 'Factura nu a fost găsită';

export async function findOwnedInvoice(
  invoices: Repository<Invoice>,
  accountantId: number,
  id: number,
): Promise<Invoice> {
  const invoice = await invoices.findOneBy({ id, accountantId });
  if (!invoice) throw new NotFoundException(INVOICE_NOT_FOUND);
  return invoice;
}
