import { BadGatewayException, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { ApiLogsService } from '../../api-logs/api-logs.service.js';
import { trackApiCall } from '../../api-logs/track-api-call.js';
import type {
  AnafTvaRecord,
  AnafTvaResponse,
} from '../helpers/anaf-company-info.js';
import {
  ApiLogService,
  ApiLogMethod,
} from '../../api-logs/dto/api-log.enums.js';

export const MIN_INTERVAL_MS = 1_000;
export const MAX_CUIS_PER_REQUEST = 100;

const bucharestDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Bucharest',
});

@Injectable()
export class AnafCompanyLookupService {
  private queue: Promise<void> = Promise.resolve();
  private nextAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly apiLogs: ApiLogsService,
  ) {}

  async lookup(
    accountantId: number,
    cui: string,
    companyId: number | null = null,
  ): Promise<AnafTvaRecord | null> {
    const found = await this.request(accountantId, [cui], companyId);
    return found.get(Number(cui)) ?? null;
  }

  async lookupMany(
    accountantId: number,
    cuis: string[],
  ): Promise<Map<number, AnafTvaRecord>> {
    const found = new Map<number, AnafTvaRecord>();
    for (let i = 0; i < cuis.length; i += MAX_CUIS_PER_REQUEST) {
      const chunk = cuis.slice(i, i + MAX_CUIS_PER_REQUEST);
      for (const [cui, record] of await this.request(accountantId, chunk)) {
        found.set(cui, record);
      }
    }
    return found;
  }

  private async request(
    accountantId: number,
    cuis: string[],
    companyId: number | null = null,
  ): Promise<Map<number, AnafTvaRecord>> {
    await this.waitTurn();

    const endpoint = this.config.getOrThrow<string>('ANAF_TVA_ENDPOINT');
    return trackApiCall(
      this.apiLogs,
      {
        accountantId,
        anafConnectionId: null,
        companyId,
        service: ApiLogService.PlatitorTva,
        method: ApiLogMethod.Post,
        endpoint: new URL(endpoint).pathname,
      },
      async (outcome) => {
        try {
          const data = bucharestDate.format(new Date());
          const res = await this.http.axiosRef.post<AnafTvaResponse>(
            endpoint,
            cuis.map((cui) => ({ cui: Number(cui), data })),
            { timeout: 30_000, validateStatus: () => true },
          );
          outcome.statusCode = res.status;
          if (res.status !== 200 || !Array.isArray(res.data?.found)) {
            outcome.error = `HTTP ${res.status}`;
            throw new BadGatewayException(
              `Serviciul ANAF de verificare a CUI a răspuns cu ${res.status}. Reîncercați în câteva momente.`,
            );
          }
          const wanted = new Set(cuis.map(Number));
          const found = new Map<number, AnafTvaRecord>();
          for (const record of res.data.found) {
            const cui = Number(record.date_generale?.cui);
            if (wanted.has(cui) && !found.has(cui)) found.set(cui, record);
          }
          return found;
        } catch (err) {
          if (err instanceof BadGatewayException) throw err;
          outcome.error = isAxiosError(err)
            ? (err.code ?? err.message)
            : String(err);
          throw new BadGatewayException(
            'Serviciul ANAF de verificare a CUI nu răspunde. Reîncercați în câteva momente.',
          );
        }
      },
    );
  }

  private waitTurn(): Promise<void> {
    const turn = this.queue.then(async () => {
      const wait = this.nextAt - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.nextAt = Date.now() + MIN_INTERVAL_MS;
    });
    this.queue = turn;
    return turn;
  }
}
