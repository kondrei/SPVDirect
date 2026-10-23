import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnafApiService } from '../../services/anaf-api.service.js';
import type { DownloadFile } from '../../../common/download-file.js';
import type { CreateSpvRequestDto } from '../dto/spv.dto.js';
import { ApiLogService } from '../../../api-logs/dto/api-log.enums.js';

export interface RawSpvMessage {
  id?: string | number;
  detalii?: string;
  cif?: string;
  data_creare?: string;
  id_solicitare?: string | number | null;
  tip?: string;
}

interface RawSpvList {
  titlu?: string;
  mesaje?: RawSpvMessage[];
  cnp?: string;
  cui?: string;
  serial?: string;
  eroare?: string;
}

interface RawSpvRequestResult {
  id_solicitare?: string | number | null;
  parametri?: string;
  serial?: string;
  cnp?: string;
  titlu?: string;
  eroare?: string;
}

export interface SpvMessage {
  id: string;
  details: string | null;
  cif: string | null;
  createdAt: string | null;
  requestId: string | null;
  type: string | null;
}

export interface SpvMessageList {
  title: string | null;
  messages: SpvMessage[];
  cnp: string | null;
  cuis: string | null;
  certSerial: string | null;
}

export interface SpvRequestResult {
  requestId: string;
  parameters: string | null;
  certSerial: string | null;
  cnp: string | null;
  title: string | null;
}

export type SpvDocument = DownloadFile;

interface SpvReply {
  status: number;
  headers?: Record<string, unknown>;
  data: unknown;
}

function textOrNull(value: string | number | null | undefined): string | null {
  return value === undefined || value === null || value === ''
    ? null
    : String(value);
}

export function toSpvMessages(raw: RawSpvMessage[]): SpvMessage[] {
  return raw.map((m) => ({
    id: String(m.id),
    details: textOrNull(m.detalii),
    cif: textOrNull(m.cif),
    createdAt: textOrNull(m.data_creare),
    requestId: textOrNull(m.id_solicitare),
    type: textOrNull(m.tip),
  }));
}

@Injectable()
export class SpvService {
  constructor(
    private readonly anafApiService: AnafApiService,
    private readonly configService: ConfigService,
  ) {}

  async listMessages(
    accountantId: number,
    connectionId: number,
    query: { zile: number; cif?: string },
  ): Promise<SpvMessageList> {
    const params: Record<string, string | number> = { zile: query.zile };
    if (query.cif) params.cif = query.cif;

    const res = await this.anafApiService.request<RawSpvList>({
      accountantId,
      connectionId,
      service: ApiLogService.Spv,
      baseUrl: this.baseUrl(),
      path: '/listaMesaje',
      params,
    });
    const body = this.json<RawSpvList>(res);
    this.throwOnBusinessError(body);

    return {
      title: textOrNull(body.titlu),
      messages: toSpvMessages(body.mesaje ?? []),
      cnp: textOrNull(body.cnp),
      cuis: textOrNull(body.cui),
      certSerial: textOrNull(body.serial),
    };
  }

  async downloadMessage(
    accountantId: number,
    connectionId: number,
    messageId: string,
  ): Promise<SpvDocument> {
    const res = await this.anafApiService.request<ArrayBuffer>({
      accountantId,
      connectionId,
      service: ApiLogService.Spv,
      baseUrl: this.baseUrl(),
      path: '/descarcare',
      params: { id: messageId },
      responseType: 'arraybuffer',
    });
    const content = Buffer.from(res.data);
    const contentType = String(res.headers?.['content-type'] ?? '');

    const reply = {
      status: res.status,
      headers: res.headers,
      data: content.toString('utf8'),
    };
    if (contentType.includes('json') || content[0] === 0x7b) {
      this.throwOnBusinessError(this.json<RawSpvList>(reply));
      throw new BadGatewayException('ANAF a returnat un răspuns neașteptat');
    }
    if (contentType.includes('html') || content[0] === 0x3c) {
      throw this.unreadable(reply);
    }
    if (content.length === 0) {
      throw new BadGatewayException('ANAF a returnat un document gol');
    }

    return {
      content,
      contentType: contentType || 'application/pdf',
      filename: `mesaj-${messageId}.pdf`,
    };
  }

  async createRequest(
    accountantId: number,
    connectionId: number,
    dto: CreateSpvRequestDto,
  ): Promise<SpvRequestResult> {
    const params: Record<string, string | number> = {
      tip: dto.tip,
      cui: dto.cui,
    };
    if (dto.an !== undefined) params.an = dto.an;
    if (dto.luna !== undefined) params.luna = dto.luna;
    if (dto.motiv) params.motiv = dto.motiv;
    if (dto.numarInregistrare) {
      params.numar_inregistrare = dto.numarInregistrare;
    }
    if (dto.cuiPunctDeLucru) params.cui_pui = dto.cuiPunctDeLucru;

    const res = await this.anafApiService.request<RawSpvRequestResult>({
      accountantId,
      connectionId,
      service: ApiLogService.Spv,
      baseUrl: this.baseUrl(),
      path: '/cerere',
      params,
    });
    const body = this.json<RawSpvRequestResult>(res);
    this.throwOnBusinessError(body);
    if (body.id_solicitare === undefined || body.id_solicitare === null) {
      throw new BadGatewayException('ANAF nu a returnat numărul solicitării');
    }

    return {
      requestId: String(body.id_solicitare),
      parameters: textOrNull(body.parametri),
      certSerial: textOrNull(body.serial),
      cnp: textOrNull(body.cnp),
      title: textOrNull(body.titlu),
    };
  }

  private baseUrl(): string {
    return this.configService.getOrThrow<string>('ANAF_SPV_ENDPOINT');
  }

  private json<T extends object>(res: SpvReply): T {
    let parsed: unknown = res.data;
    if (typeof res.data === 'string') {
      try {
        parsed = JSON.parse(res.data);
      } catch {
        parsed = null;
      }
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw this.unreadable(res);
    }
    return parsed as T;
  }

  private unreadable(res: SpvReply): BadGatewayException {
    const text = typeof res.data === 'string' ? res.data : '';
    const header = res.headers?.['content-type'];
    const contentType = typeof header === 'string' ? header : '';
    const html =
      contentType.includes('html') || text.trimStart().startsWith('<');
    return new BadGatewayException(
      html
        ? 'ANAF a returnat o pagină HTML în loc de răspunsul SPV. Serviciul SPV poate să nu accepte autorizarea OAuth a certificatului.'
        : 'ANAF a returnat un răspuns invalid',
    );
  }

  private throwOnBusinessError(body: { eroare?: string }): void {
    if (body.eroare) throw new BadRequestException(`ANAF: ${body.eroare}`);
  }
}
