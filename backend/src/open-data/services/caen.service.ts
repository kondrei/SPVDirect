import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  type CaenInfo,
  type CaenTable,
  describeCaen,
  parseCaenCsv,
} from '../caen.js';
import { DataGovRoService } from './data-gov-ro.service.js';

export const CAEN_TTL_MS = 24 * 60 * 60 * 1000;
export const CAEN_RETRY_MS = 5 * 60 * 1000;

const UNAVAILABLE =
  'Nomenclatorul CAEN nu poate fi descărcat acum de pe data.gov.ro. Reîncercați în câteva minute.';

@Injectable()
export class CaenService {
  private readonly logger = new Logger(CaenService.name);
  private table: CaenTable | null = null;
  private loadedAt = 0;
  private failedAt = 0;
  private loading: Promise<CaenTable | null> | null = null;

  constructor(private readonly dataGovRo: DataGovRoService) {}

  async describe(code: string | null | undefined): Promise<CaenInfo | null> {
    const table = await this.getTable();
    if (!table) throw new ServiceUnavailableException(UNAVAILABLE);
    return describeCaen(table, code);
  }

  async tryDescribe(code: string | null | undefined): Promise<CaenInfo | null> {
    if (!code?.trim()) return null;
    const table = await this.getTable();
    return table ? describeCaen(table, code) : null;
  }

  private getTable(): Promise<CaenTable | null> {
    const now = Date.now();
    if (this.table && now - this.loadedAt < CAEN_TTL_MS) {
      return Promise.resolve(this.table);
    }
    if (now - this.failedAt < CAEN_RETRY_MS) {
      return Promise.resolve(this.table);
    }
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async load(): Promise<CaenTable | null> {
    try {
      const table = parseCaenCsv(await this.download());
      this.table = table;
      this.loadedAt = Date.now();
      this.failedAt = 0;
      this.logger.log(
        `Loaded CAEN nomenclator: ${table.rev2.size} Rev. 2, ${table.rev3.size} Rev. 3 classes`,
      );
    } catch (err) {
      this.failedAt = Date.now();
      this.logger.warn(`Loading the CAEN nomenclator failed: ${String(err)}`);
    }
    return this.table;
  }

  private async download(): Promise<string> {
    const packages = await this.dataGovRo.searchPackages(
      'nomenclatoare',
      'onrc',
    );
    const url = packages
      .filter((pkg) => pkg.name?.startsWith('nomenclatoare'))
      .flatMap((pkg) => pkg.resources ?? [])
      .find((r) => /^n_caen\.csv$/i.test(r.name ?? ''))?.url;
    if (!url) throw new Error('No ONRC dataset with N_CAEN.CSV found');
    return this.dataGovRo.downloadText(url);
  }
}
