import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import { isUniqueViolation } from '../../common/db-errors.js';
import { lockLiveCompany } from '../../companies/company-lock.js';
import { Company } from '../../companies/company.entity.js';
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
          await lockLiveCompany(
            manager,
            invoice.accountantId,
            invoice.companyId,
          );
          invoice.number =
            requestedNumber ??
            (await this.nextIn(invoices, invoice.companyId, invoice.series));
          taken = `${invoice.series} ${invoice.number}`;
          if (
            requestedNumber !== undefined &&
            (await this.earlier(invoices, invoice.companyId, invoice.series)
              .andWhere('i.number = :number', { number: requestedNumber })
              .getExists())
          ) {
            throw takenError(taken);
          }
          return invoices.save(invoice);
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        if (requestedNumber !== undefined || attempt >= NUMBER_RETRIES) {
          throw takenError(taken);
        }
      }
    }
  }

  private async nextIn(
    invoices: Repository<Invoice>,
    companyId: number,
    series: string,
  ): Promise<number> {
    const [own, earlier] = await Promise.all([
      invoices.maximum('number', { companyId, series }),
      this.earlier(invoices, companyId, series)
        .select('MAX(i.number)', 'max')
        .getRawOne<{ max: number | string | null }>(),
    ]);
    return Math.max(own ?? 0, Number(earlier?.max ?? 0)) + 1;
  }

  private earlier(
    invoices: Repository<Invoice>,
    companyId: number,
    series: string,
  ): SelectQueryBuilder<Invoice> {
    return invoices.manager
      .createQueryBuilder(Invoice, 'i')
      .withDeleted()
      .innerJoin(Company, 'c', 'c.id = i.companyId')
      .innerJoin(
        Company,
        'self',
        'self.id = :companyId AND self.id <> c.id AND self.accountantId = c.accountantId AND self.cui = c.cui',
        { companyId },
      )
      .where('i.series = :series', { series });
  }
}

function takenError(taken: string): ConflictException {
  return new ConflictException(
    `Factura ${taken} există deja pentru această firmă`,
  );
}
