import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AxiosResponse } from 'axios';
import { ApiLogsService } from '../../api-logs/api-logs.service.js';
import { trackApiCall } from '../../api-logs/track-api-call.js';
import type { DownloadFile } from '../../common/download-file.js';
import {
  assertXmlPayload,
  type ValidateStandard,
} from '../dto/efactura.dto.js';
import {
  bodyJson,
  orNull,
  validationMessages,
  type AnafErrorBody,
} from '../helpers/anaf-body.js';

export const EFACTURA_SERVICE = 'EFACTURA';
const PDF_MAGIC = '%PDF';

export interface ValidationResult {
  valid: boolean;
  messages: string[];
  traceId: string | null;
}

export type EfacturaFile = DownloadFile;

@Injectable()
export class EfacturaValidator {
  private readonly logger = new Logger(EfacturaValidator.name);

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly apiLogs: ApiLogsService,
  ) {}

  async validate(
    accountantId: number,
    xml: string,
    standard: ValidateStandard = 'FACT1',
  ): Promise<ValidationResult> {
    const res = await this.post(
      accountantId,
      `/validare/${standard}`,
      xml,
      'text',
    );
    const body = bodyJson<AnafErrorBody>(res.data);
    if (!body || (res.status !== 200 && res.status !== 404)) {
      throw new BadGatewayException('Validatorul ANAF nu a răspuns corect');
    }
    if (res.status === 404) {
      throw new BadRequestException(
        body.message ?? body.eroare ?? 'Standard de validare necunoscut',
      );
    }
    return {
      valid: body.stare === 'ok',
      messages: validationMessages(body),
      traceId: orNull(body.trace_id),
    };
  }

  async validateIfAvailable(
    accountantId: number,
    xml: string,
    standard: ValidateStandard,
  ): Promise<ValidationResult | null> {
    try {
      return await this.validate(accountantId, xml, standard);
    } catch (err) {
      if (err instanceof BadGatewayException) {
        this.logger.warn(`ANAF validator unavailable: ${err.message}`);
        return null;
      }
      throw err;
    }
  }

  async transform(
    accountantId: number,
    xml: string,
    standard: ValidateStandard = 'FACT1',
    skipValidation = false,
  ): Promise<EfacturaFile> {
    const res = await this.post(
      accountantId,
      `/transformare/${standard}${skipValidation ? '/DA' : ''}`,
      xml,
      'arraybuffer',
    );
    const content = Buffer.from(res.data as ArrayBuffer);
    if (res.status === 200 && content.subarray(0, 4).toString() === PDF_MAGIC) {
      return {
        content,
        contentType: 'application/pdf',
        filename: 'factura.pdf',
      };
    }
    const body = bodyJson<AnafErrorBody>(content.toString('utf8'));
    const errors = validationMessages(body);
    if (errors.length) {
      throw new BadRequestException({
        message: 'XML-ul nu trece validarea ANAF, deci nu poate fi transformat',
        errors,
      });
    }
    throw new BadGatewayException(
      body?.message ?? 'Transformarea ANAF nu a răspuns corect',
    );
  }

  private post(
    accountantId: number,
    path: string,
    xml: string,
    responseType: 'text' | 'arraybuffer',
  ): Promise<AxiosResponse<unknown>> {
    assertXmlPayload(xml);
    return trackApiCall(
      this.apiLogs,
      {
        accountantId,
        anafConnectionId: null,
        companyId: null,
        service: EFACTURA_SERVICE,
        method: 'POST',
        endpoint: path.replace(/^(\/[a-z]+\/[A-Z0-9]+).*/, '$1'),
      },
      async (outcome) => {
        try {
          const res = await this.http.axiosRef.post<unknown>(
            `${this.config.getOrThrow<string>('ANAF_EFACTURA_VALIDATE_ENDPOINT')}${path}`,
            xml,
            {
              headers: { 'Content-Type': 'text/plain' },
              responseType,
              timeout: 60_000,
              validateStatus: () => true,
            },
          );
          outcome.statusCode = res.status;
          if (res.status >= 400) outcome.error = `HTTP ${res.status}`;
          return res;
        } catch (err) {
          outcome.error = err instanceof Error ? err.message : String(err);
          throw new BadGatewayException(
            'Serviciul ANAF nu a putut fi contactat',
          );
        }
      },
    );
  }
}
