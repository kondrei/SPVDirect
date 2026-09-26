import { BadGatewayException, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { ApiLogsService } from '../api-logs/api-logs.service.js';
import type { AnafTvaRecord, AnafTvaResponse } from './anaf-company-info.js';

export const MIN_INTERVAL_MS = 1_000;

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
    accountantId: string,
    cui: string,
    companyId: string | null = null,
  ): Promise<AnafTvaRecord | null> {
    await this.waitTurn();

    const endpoint = this.config.getOrThrow<string>('ANAF_TVA_ENDPOINT');
    const started = performance.now();
    let status: number | null = null;
    let error: string | null = null;
    try {
      const res = await this.http.axiosRef.post<AnafTvaResponse>(
        endpoint,
        [{ cui: Number(cui), data: bucharestDate.format(new Date()) }],
        { timeout: 30_000, validateStatus: () => true },
      );
      status = res.status;
      if (status !== 200 || !Array.isArray(res.data?.found)) {
        error = `HTTP ${status}`;
        throw new BadGatewayException(
          `Serviciul ANAF de verificare a CUI a răspuns cu ${status}. Reîncercați în câteva momente.`,
        );
      }
      return (
        res.data.found.find(
          (r) => Number(r.date_generale?.cui) === Number(cui),
        ) ?? null
      );
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      error = isAxiosError(err) ? (err.code ?? err.message) : String(err);
      throw new BadGatewayException(
        'Serviciul ANAF de verificare a CUI nu răspunde. Reîncercați în câteva momente.',
      );
    } finally {
      await this.apiLogs.record({
        accountantId,
        anafConnectionId: null,
        companyId,
        service: 'PlatitorTva',
        method: 'POST',
        endpoint: new URL(endpoint).pathname,
        statusCode: status,
        responseTimeMs: Math.round(performance.now() - started),
        error,
      });
    }
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
