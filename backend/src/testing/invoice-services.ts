import type { DataSource, Repository } from 'typeorm';
import { vi } from 'vitest';
import type { ActivityLogsService } from '../api-logs/activity-logs.service.js';
import type { AnafCompanyLookupService } from '../companies/services/anaf-company-lookup.service.js';
import type { Company } from '../companies/company.entity.js';
import { CompanyRepository } from '../companies/repositories/company.repository.js';
import type { CompaniesService } from '../companies/services/companies.service.js';
import type { Invoice } from '../invoices/invoice.entity.js';
import { InvoiceRepository } from '../invoices/repositories/invoice.repository.js';
import { InvoiceBuyersService } from '../invoices/services/invoice-buyers.service.js';
import { InvoiceDeliveryService } from '../invoices/services/invoice-delivery.service.js';
import type { InvoiceFileStore } from '../invoices/services/invoice-file-store.service.js';
import type { InvoiceMailer } from '../invoices/services/invoice-mailer.service.js';
import { InvoiceNumbering } from '../invoices/services/invoice-numbering.service.js';
import { InvoiceStornoService } from '../invoices/services/invoice-storno.service.js';
import { InvoicesService } from '../invoices/services/invoices.service.js';
import { fakeActivityLogs } from './activity-logs.js';

export function buildInvoiceServices(deps: {
  invoices: object;
  companies: object;
  anaf?: object;
  store: object;
  mailer: object;
  earlierMaximum?: number | null;
  earlierTaken?: boolean;
  activity?: ReturnType<typeof fakeActivityLogs>;
}) {
  const earlier = {
    withDeleted: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    getRawOne: vi.fn().mockResolvedValue({ max: deps.earlierMaximum ?? null }),
    getExists: vi.fn().mockResolvedValue(deps.earlierTaken ?? false),
  };
  const lockedCompanies = vi.fn(
    (_entity: unknown, options: { where: { id?: number } }) =>
      Promise.resolve([{ id: options.where.id }]),
  );
  const transaction = (run: (manager: unknown) => unknown) =>
    run({
      getRepository: () => deps.invoices,
      find: lockedCompanies,
    });
  const repo = Object.assign(deps.invoices, {
    manager: {
      transaction,
      createQueryBuilder: vi.fn(() => earlier),
      find: lockedCompanies,
    },
  }) as unknown as Repository<Invoice>;
  const companies = deps.companies as unknown as CompaniesService;
  const activity = deps.activity ?? fakeActivityLogs();
  const invoiceRows = new InvoiceRepository(repo);
  const companyRows = new CompanyRepository({} as Repository<Company>);
  const numbering = new InvoiceNumbering(
    { transaction } as unknown as DataSource,
    invoiceRows,
    companyRows,
  );
  const delivery = new InvoiceDeliveryService(
    invoiceRows,
    companies,
    deps.store as unknown as InvoiceFileStore,
    deps.mailer as unknown as InvoiceMailer,
    activity as unknown as ActivityLogsService,
  );
  const invoices = new InvoicesService(
    invoiceRows,
    companies,
    numbering,
    delivery,
  );
  const buyers = new InvoiceBuyersService(
    invoiceRows,
    companies,
    (deps.anaf ?? {}) as unknown as AnafCompanyLookupService,
  );
  const storno = new InvoiceStornoService(
    numbering,
    delivery,
    invoiceRows,
    companyRows,
  );
  return {
    invoices,
    earlier,
    lockedCompanies,
    buyers,
    storno,
    delivery,
    activity,
    service: {
      lookupBuyer: buyers.lookupBuyer.bind(buyers),
      findBuyer: buyers.findBuyer.bind(buyers),
      lineSuggestions: buyers.lineSuggestions.bind(buyers),
      nextNumber: invoices.nextNumber.bind(invoices),
      list: invoices.list.bind(invoices),
      stats: invoices.stats.bind(invoices),
      get: invoices.get.bind(invoices),
      detail: invoices.detail.bind(invoices),
      create: invoices.create.bind(invoices),
      createStorno: storno.createStorno.bind(storno),
      download: delivery.pdf.bind(delivery),
      downloadXml: delivery.xml.bind(delivery),
      saveToStorage: delivery.saveToStorage.bind(delivery),
      send: delivery.send.bind(delivery),
    },
  };
}
