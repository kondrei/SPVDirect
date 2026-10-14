import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../../common/db-errors.js';
import { Invoice } from '../invoice.entity.js';

export const NUMBER_RETRIES = 3;

@Injectable()
export class InvoiceNumbering {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
  ) {}

  next(companyId: number, series: string): Promise<number> {
    return this.nextIn(this.invoices, companyId, series);
  }

  async insert(
    build: (invoices: Repository<Invoice>) => Promise<Invoice>,
    requestedNumber?: number,
  ): Promise<Invoice> {
    for (let attempt = 1; ; attempt++) {
      let taken = '';
      try {
        return await this.invoices.manager.transaction(async (manager) => {
          const invoices = manager.getRepository(Invoice);
          const invoice = await build(invoices);
          invoice.number =
            requestedNumber ??
            (await this.nextIn(invoices, invoice.companyId, invoice.series));
          taken = `${invoice.series} ${invoice.number}`;
          return invoices.save(invoice);
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        if (requestedNumber !== undefined || attempt >= NUMBER_RETRIES) {
          throw new ConflictException(
            `Factura ${taken} există deja pentru această firmă`,
          );
        }
      }
    }
  }

  private async nextIn(
    invoices: Repository<Invoice>,
    companyId: number,
    series: string,
  ): Promise<number> {
    return ((await invoices.maximum('number', { companyId, series })) ?? 0) + 1;
  }
}
