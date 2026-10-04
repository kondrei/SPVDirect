import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnafApiService } from '../../services/anaf-api.service.js';
import type { CreateSpvRequestDto } from '../spv.dto.js';

export const SPV_SERVICE = 'SPV';

interface RawSpvMessage {
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
  id_solicitare?: string | number;
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

export interface SpvDocument {
  content: Buffer;
  contentType: string;
  filename: string;
}

function textOrNull(value: string | number | null | undefined): string | null {
  return value === undefined || value === null || value === ''
    ? null
    : String(value);
}

@Injectable()
export class SpvService {
  constructor(
    private readonly api: AnafApiService,
    private readonly config: ConfigService,
  ) {}

  async listMessages(
    accountantId: number,
    connectionId: string,
    query: { zile: number; cif?: string },
  ): Promise<SpvMessageList> {
    const params: Record<string, string | number> = { zile: query.zile };
    if (query.cif) params.cif = query.cif;

    const res = await this.api.request<RawSpvList>({
      accountantId,
      connectionId,
      service: SPV_SERVICE,
      baseUrl: this.baseUrl(),
      path: '/listaMesaje',
      params,
    });
    const body = this.json<RawSpvList>(res.data);
    this.throwOnBusinessError(body);

    return {
      title: textOrNull(body.titlu),
      messages: (body.mesaje ?? []).map((m) => ({
        id: String(m.id),
        details: textOrNull(m.detalii),
        cif: textOrNull(m.cif),
        createdAt: textOrNull(m.data_creare),
        requestId: textOrNull(m.id_solicitare),
        type: textOrNull(m.tip),
      })),
      cnp: textOrNull(body.cnp),
      cuis: textOrNull(body.cui),
      certSerial: textOrNull(body.serial),
    };
  }

  async downloadMessage(
    accountantId: number,
    connectionId: string,
    messageId: string,
  ): Promise<SpvDocument> {
    const res = await this.api.request<ArrayBuffer>({
      accountantId,
      connectionId,
      service: SPV_SERVICE,
      baseUrl: this.baseUrl(),
      path: '/descarcare',
      params: { id: messageId },
      responseType: 'arraybuffer',
    });
    const content = Buffer.from(res.data);
    const contentType = String(res.headers?.['content-type'] ?? '');

    if (contentType.includes('json') || content[0] === 0x7b) {
      this.throwOnBusinessError(
        this.json<RawSpvList>(content.toString('utf8')),
      );
      throw new BadGatewayException('ANAF a returnat un răspuns neașteptat');
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
    connectionId: string,
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

    const res = await this.api.request<RawSpvRequestResult>({
      accountantId,
      connectionId,
      service: SPV_SERVICE,
      baseUrl: this.baseUrl(),
      path: '/cerere',
      params,
    });
    const body = this.json<RawSpvRequestResult>(res.data);
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
    return this.config.getOrThrow<string>('ANAF_SPV_ENDPOINT');
  }

  private json<T extends object>(data: unknown): T {
    let parsed: unknown = data;
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data);
      } catch {
        throw new BadGatewayException('ANAF a returnat un răspuns invalid');
      }
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new BadGatewayException('ANAF a returnat un răspuns invalid');
    }
    return parsed as T;
  }

  private throwOnBusinessError(body: { eroare?: string }): void {
    if (body.eroare) throw new BadRequestException(`ANAF: ${body.eroare}`);
  }
}
