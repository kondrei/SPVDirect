import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { isUniqueViolation } from '../../common/db-errors.js';
import { lockLiveCompany } from '../../companies/company-lock.js';
import { CompanyRepository } from '../../companies/repositories/company.repository.js';
import type { Invoice } from '../invoice.entity.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';

export const NUMBER_RETRIES = 3;

@Injectable()
export class InvoiceNumbering {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly companyRepository: CompanyRepository,
  ) {}

  async next(companyId: number, series: string): Promise<number> {
    return (await this.invoiceRepository.highestNumber(companyId, series)) + 1;
  }

  async insert(
    build: (manager: EntityManager) => Promise<Invoice>,
    requestedNumber?: number,
  ): Promise<Invoice> {
    for (let attempt = 1; ; attempt++) {
      let taken = '';
      try {
        return await this.dataSource.transaction(async (manager) => {
          const invoice = await build(manager);
          await lockLiveCompany(
            this.companyRepository,
            manager,
            invoice.accountantId,
            invoice.companyId,
          );
          invoice.number =
            requestedNumber ??
            (await this.invoiceRepository.highestNumber(
              invoice.companyId,
              invoice.series,
              manager,
            )) + 1;
          taken = `${invoice.series} ${invoice.number}`;
          if (
            requestedNumber !== undefined &&
            (await this.invoiceRepository.numberUsedEarlier(
              manager,
              invoice.companyId,
              invoice.series,
              requestedNumber,
            ))
          ) {
            throw takenError(taken);
          }
          return this.invoiceRepository.save(manager, invoice);
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        if (requestedNumber !== undefined || attempt >= NUMBER_RETRIES) {
          throw takenError(taken);
        }
      }
    }
  }
}

function takenError(taken: string): ConflictException {
  return new ConflictException(
    `Factura ${taken} există deja pentru această firmă`,
  );
}
