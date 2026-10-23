import { Injectable } from '@nestjs/common';
import { AccountantRepository } from '../accountants/repositories/accountant.repository.js';
import { AnafConnectionRepository } from '../anaf/repositories/anaf-connection.repository.js';
import { SpvMessageRepository } from '../anaf/spv/repositories/spv-message.repository.js';
import { CompanyRepository } from '../companies/repositories/company.repository.js';
import { EfacturaUploadRepository } from '../efactura/repositories/efactura-upload.repository.js';
import { InvoiceRepository } from '../invoices/repositories/invoice.repository.js';
import type { PublicStats } from './dto/public-stats.types.js';

export const PUBLIC_STATS_TTL_MS = 5 * 60_000;

@Injectable()
export class PublicStatsService {
  private cached: { stats: PublicStats; expiresAt: number } | null = null;
  private inFlight: Promise<PublicStats> | null = null;
  private generation = 0;

  constructor(
    private readonly accountantRepository: AccountantRepository,
    private readonly companyRepository: CompanyRepository,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly efacturaUploadRepository: EfacturaUploadRepository,
    private readonly spvMessageRepository: SpvMessageRepository,
    private readonly anafConnectionRepository: AnafConnectionRepository,
  ) {}

  invalidate(): void {
    this.generation++;
    this.inFlight = null;
    if (this.cached) this.cached = { ...this.cached, expiresAt: 0 };
  }

  getStats(): Promise<PublicStats> {
    const cached = this.cached;
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.stats);
    }
    if (this.inFlight) return this.inFlight;
    const generation = this.generation;
    const load: Promise<PublicStats> = this.load()
      .then((stats) => {
        if (generation === this.generation) {
          this.cached = { stats, expiresAt: Date.now() + PUBLIC_STATS_TTL_MS };
        }
        return stats;
      })
      .catch((err: unknown) => {
        if (cached) return cached.stats;
        throw err;
      })
      .finally(() => {
        if (this.inFlight === load) this.inFlight = null;
      });
    this.inFlight = load;
    return load;
  }

  private async load(): Promise<PublicStats> {
    const [
      accountants,
      companies,
      invoices,
      efacturaUploads,
      spvMessages,
      anafConnections,
    ] = await Promise.all([
      this.accountantRepository.countActive(),
      this.companyRepository.count(),
      this.invoiceRepository.count(),
      this.efacturaUploadRepository.countOk(),
      this.spvMessageRepository.count(),
      this.anafConnectionRepository.count(),
    ]);
    return {
      accountants,
      companies,
      invoices,
      efacturaUploads,
      spvMessages,
      anafConnections,
      updatedAt: new Date().toISOString(),
    };
  }
}
