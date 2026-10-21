import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnafCompanyLookupService } from '../../companies/services/anaf-company-lookup.service.js';
import {
  CUI_NOT_FOUND,
  CompaniesService,
} from '../../companies/services/companies.service.js';
import {
  buyerFromAnaf,
  sellerFromCompany,
} from '../builders/invoice-builder.js';
import type { BuyerLookup, LineSuggestion } from '../dto/invoice.types.js';
import {
  distinctLineSuggestions,
  SUGGESTION_INVOICE_LIMIT,
} from '../helpers/invoice-line-suggestions.js';
import { Invoice } from '../invoice.entity.js';
import { BuyerSource } from '../dto/invoice.enums.js';

type BuyerStatus = Pick<BuyerLookup, 'vatPayer' | 'inactive' | 'eFactura'> & {
  anafChecked: boolean;
};

export type FoundBuyer = BuyerLookup &
  BuyerStatus & {
    source: BuyerSource;
  };

@Injectable()
export class InvoiceBuyersService {
  private readonly logger = new Logger(InvoiceBuyersService.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
    private readonly companies: CompaniesService,
    private readonly anaf: AnafCompanyLookupService,
  ) {}

  async lookupBuyer(accountantId: number, cui: string): Promise<BuyerLookup> {
    const record = await this.anaf.lookup(accountantId, cui);
    if (!record) throw new BadRequestException(CUI_NOT_FOUND);
    return buyerFromAnaf(record);
  }

  async findBuyer(accountantId: number, cui: string): Promise<FoundBuyer> {
    const last = await this.invoicesToBuyer(accountantId, cui)
      .select(['invoice.id', 'invoice.buyer'])
      .limit(1)
      .getOne();
    if (last) {
      return {
        ...last.buyer,
        ...(await this.anafStatus(accountantId, cui)),
        source: BuyerSource.Invoice,
      };
    }
    const company = await this.companies.findByCui(accountantId, cui);
    if (company?.address?.trim()) {
      return {
        ...sellerFromCompany(company),
        inactive: company.inactive,
        eFactura: company.eFactura,
        anafChecked: false,
        source: BuyerSource.Company,
      };
    }
    return {
      ...(await this.lookupBuyer(accountantId, cui)),
      anafChecked: true,
      source: BuyerSource.Anaf,
    };
  }

  async lineSuggestions(
    accountantId: number,
    companyId: number,
    buyerCui: string,
  ): Promise<LineSuggestion[]> {
    await this.companies.get(accountantId, companyId);
    const rows = await this.invoicesToBuyer(accountantId, buyerCui)
      .select([
        'invoice.id',
        'invoice.lines',
        'invoice.currency',
        'invoice.issueDate',
      ])
      .andWhere('invoice.companyId = :companyId', { companyId })
      .limit(SUGGESTION_INVOICE_LIMIT)
      .getMany();
    return distinctLineSuggestions(rows);
  }

  private async anafStatus(
    accountantId: number,
    cui: string,
  ): Promise<BuyerStatus | Omit<BuyerStatus, 'vatPayer'>> {
    try {
      const record = await this.anaf.lookup(accountantId, cui);
      if (record) {
        const { vatPayer, inactive, eFactura } = buyerFromAnaf(record);
        return { vatPayer, inactive, eFactura, anafChecked: true };
      }
    } catch (error) {
      this.logger.warn(`ANAF status check failed for buyer: ${String(error)}`);
    }
    return { inactive: null, eFactura: null, anafChecked: false };
  }

  private invoicesToBuyer(accountantId: number, buyerCui: string) {
    return this.invoices
      .createQueryBuilder('invoice')
      .where('invoice.accountantId = :accountantId', { accountantId })
      .andWhere("invoice.buyer ->> 'cui' = :buyerCui", { buyerCui })
      .andWhere('invoice.stornoOfInvoiceId IS NULL')
      .orderBy('invoice.issueDate', 'DESC')
      .addOrderBy('invoice.id', 'DESC');
  }
}
