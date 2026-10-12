import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Accountant } from '../accountants/accountant.entity.js';
import { AnafConnection } from '../anaf/anaf-connection.entity.js';
import { SpvMessage } from '../anaf/spv/spv-message.entity.js';
import { Company } from '../companies/company.entity.js';
import { EfacturaUpload } from '../efactura/efactura-upload.entity.js';
import { Invoice } from '../invoices/invoice.entity.js';

export const PUBLIC_STATS_TTL_MS = 5 * 60_000;

export interface PublicStats {
  accountants: number;
  companies: number;
  invoices: number;
  efacturaUploads: number;
  spvMessages: number;
  anafConnections: number;
  updatedAt: string;
}

@Injectable()
export class PublicStatsService {
  private cached: { stats: PublicStats; expiresAt: number } | null = null;
  private inFlight: Promise<PublicStats> | null = null;
  private generation = 0;

  constructor(
    @InjectRepository(Accountant)
    private readonly accountants: Repository<Accountant>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
    @InjectRepository(EfacturaUpload)
    private readonly uploads: Repository<EfacturaUpload>,
    @InjectRepository(SpvMessage)
    private readonly spvMessages: Repository<SpvMessage>,
    @InjectRepository(AnafConnection)
    private readonly connections: Repository<AnafConnection>,
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
      this.accountants.countBy({ status: 'active' }),
      this.companies.count(),
      this.invoices.count(),
      this.uploads.countBy({ status: 'ok' }),
      this.spvMessages.count(),
      this.connections.count(),
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
