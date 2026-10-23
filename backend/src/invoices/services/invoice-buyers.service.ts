import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AnafCompanyLookupService } from '../../companies/services/anaf-company-lookup.service.js';
import {
  CUI_NOT_FOUND,
  CompaniesService,
} from '../../companies/services/companies.service.js';
import {
  buyerFromAnaf,
  sellerFromCompany,
} from '../builders/invoice-builder.js';
import type {
  BuyerLookup,
  BuyerStatus,
  FoundBuyer,
  LineSuggestion,
} from '../dto/invoice.types.js';
import {
  distinctLineSuggestions,
  SUGGESTION_INVOICE_LIMIT,
} from '../helpers/invoice-line-suggestions.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { BuyerSource } from '../dto/invoice.enums.js';

@Injectable()
export class InvoiceBuyersService {
  private readonly logger = new Logger(InvoiceBuyersService.name);

  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly companiesService: CompaniesService,
    private readonly anafCompanyLookupService: AnafCompanyLookupService,
  ) {}

  async lookupBuyer(accountantId: number, cui: string): Promise<BuyerLookup> {
    const record = await this.anafCompanyLookupService.lookup(
      accountantId,
      cui,
    );
    if (!record) throw new BadRequestException(CUI_NOT_FOUND);
    return buyerFromAnaf(record);
  }

  async findBuyer(accountantId: number, cui: string): Promise<FoundBuyer> {
    const last = await this.invoiceRepository.latestBuyer(accountantId, cui);
    if (last) {
      return {
        ...last.buyer,
        ...(await this.anafStatus(accountantId, cui)),
        source: BuyerSource.Invoice,
      };
    }
    const company = await this.companiesService.findByCui(accountantId, cui);
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
    await this.companiesService.get(accountantId, companyId);
    const rows = await this.invoiceRepository.recentToBuyer(
      accountantId,
      companyId,
      buyerCui,
      SUGGESTION_INVOICE_LIMIT,
    );
    return distinctLineSuggestions(rows);
  }

  private async anafStatus(
    accountantId: number,
    cui: string,
  ): Promise<BuyerStatus | Omit<BuyerStatus, 'vatPayer'>> {
    try {
      const record = await this.anafCompanyLookupService.lookup(
        accountantId,
        cui,
      );
      if (record) {
        const { vatPayer, inactive, eFactura } = buyerFromAnaf(record);
        return { vatPayer, inactive, eFactura, anafChecked: true };
      }
    } catch (error) {
      this.logger.warn(`ANAF status check failed for buyer: ${String(error)}`);
    }
    return { inactive: null, eFactura: null, anafChecked: false };
  }
}
