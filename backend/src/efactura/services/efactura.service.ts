import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { AxiosResponse } from 'axios';
import { Repository } from 'typeorm';
import { AnafApiService } from '../../anaf/services/anaf-api.service.js';
import { ApiLogsService } from '../../api-logs/api-logs.service.js';
import { CompaniesService } from '../../companies/services/companies.service.js';
import { InvoicesService } from '../../invoices/services/invoices.service.js';
import {
  MAX_XML_BYTES,
  type MESSAGE_FILTERS,
  type UPLOAD_STANDARDS,
  type VALIDATE_STANDARDS,
} from '../dto/efactura.dto.js';
import {
  EfacturaUpload,
  type UploadStatus,
} from '../efactura-upload.entity.js';
import {
  anafStampToIso,
  parseStatusResponse,
  parseUploadResponse,
} from '../helpers/efactura-xml.js';

export const EFACTURA_SERVICE = 'EFACTURA';
export const NO_CERTIFICATE =
  'Firma nu are un certificat ANAF asociat. Legați un certificat din pagina firmei.';
const ZIP_MAGIC = [0x50, 0x4b];
const PDF_MAGIC = '%PDF';

export interface UploadInput {
  companyId: number;
  xml: string;
  standard: (typeof UPLOAD_STANDARDS)[number];
  invoiceId?: number | null;
  extern?: boolean;
  autofactura?: boolean;
  executare?: boolean;
  b2c?: boolean;
}

export interface UploadPage {
  items: EfacturaUpload[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EfacturaMessage {
  id: string;
  requestId: string | null;
  type: string | null;
  details: string | null;
  cif: string | null;
  createdAt: string | null;
  createdAtRaw: string | null;
}

export interface MessageList {
  title: string | null;
  messages: EfacturaMessage[];
  total: number | null;
  page: number | null;
  pages: number | null;
}

export interface ValidationResult {
  valid: boolean;
  messages: string[];
  traceId: string | null;
}

export interface EfacturaFile {
  content: Buffer;
  contentType: string;
  filename: string;
}

interface RawMessage {
  id?: string | number;
  id_solicitare?: string | number | null;
  tip?: string;
  detalii?: string;
  cif?: string | number;
  data_creare?: string;
}

interface RawMessageList {
  titlu?: string;
  eroare?: string;
  mesaje?: RawMessage[];
  numar_total_inregistrari?: number;
  numar_total_pagini?: number;
  index_pagina_curenta?: number;
}

interface RawValidation {
  stare?: string;
  trace_id?: string;
  Messages?: { message?: string }[];
  message?: string;
  eroare?: string;
}

function text(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data === undefined || data === null ? '' : JSON.stringify(data);
}

function jsonOf<T extends object>(data: unknown): T | null {
  if (data && typeof data === 'object' && !Buffer.isBuffer(data)) {
    return data instanceof ArrayBuffer ? jsonOf(text(data)) : (data as T);
  }
  try {
    const parsed: unknown = JSON.parse(text(data));
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function orNull(value: string | number | null | undefined): string | null {
  return value === undefined || value === null || value === ''
    ? null
    : String(value);
}

@Injectable()
export class EfacturaService {
  private readonly logger = new Logger(EfacturaService.name);

  constructor(
    private readonly api: AnafApiService,
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly apiLogs: ApiLogsService,
    private readonly companies: CompaniesService,
    private readonly invoices: InvoicesService,
    @InjectRepository(EfacturaUpload)
    private readonly uploads: Repository<EfacturaUpload>,
  ) {}

  async upload(
    accountantId: number,
    input: UploadInput,
  ): Promise<EfacturaUpload> {
    if (!input.xml.trim()) throw new BadRequestException('Fișierul XML este gol');
    if (Buffer.byteLength(input.xml) > MAX_XML_BYTES) {
      throw new BadRequestException('Fișierul depășește 10 MB');
    }
    const company = await this.companies.get(accountantId, input.companyId);
    if (!company.anafConnectionId) throw new BadRequestException(NO_CERTIFICATE);

    const params: Record<string, string> = {
      standard: input.standard,
      cif: company.cui,
    };
    if (input.extern) params.extern = 'DA';
    if (input.autofactura) params.autofactura = 'DA';
    if (input.executare) params.executare = 'DA';
    const environment = this.config.getOrThrow<'test' | 'prod'>('ANAF_ENV');

    const res = await this.api.request<unknown>({
      accountantId,
      connectionId: company.anafConnectionId,
      companyId: company.id,
      service: EFACTURA_SERVICE,
      method: 'POST',
      path: this.api.envPath(
        `/FCTEL/rest/${input.b2c ? 'uploadb2c' : 'upload'}`,
      ),
      params,
      data: input.xml,
      headers: { 'Content-Type': 'text/plain' },
      responseType: 'text',
      allowStatuses: [400],
    });

    let uploadIndex: string | null = null;
    let status: UploadStatus = 'rejected';
    let errorMessage: string | null = null;
    if (res.status === 400) {
      errorMessage =
        jsonOf<RawValidation>(res.data)?.message ?? 'ANAF a refuzat cererea';
    } else {
      const parsed = parseUploadResponse(text(res.data));
      if (parsed.accepted) {
        uploadIndex = parsed.uploadIndex;
        status = 'processing';
      } else {
        errorMessage = parsed.error ?? 'ANAF nu a acceptat fișierul';
      }
    }

    return this.uploads.save(
      this.uploads.create({
        accountantId,
        companyId: company.id,
        invoiceId: input.invoiceId ?? null,
        anafConnectionId: company.anafConnectionId,
        environment,
        standard: input.standard,
        uploadIndex,
        status,
        downloadId: null,
        errorMessage,
        checkedAt: null,
      }),
    );
  }

  async uploadInvoice(
    accountantId: number,
    invoiceId: number,
    options: { extern?: boolean } = {},
  ): Promise<EfacturaUpload> {
    const invoice = await this.invoices.get(accountantId, invoiceId);
    const active = await this.uploads.findOne({
      where: [
        { accountantId, invoiceId, status: 'processing' },
        { accountantId, invoiceId, status: 'ok' },
      ],
    });
    if (active) {
      throw new ConflictException(
        active.status === 'ok'
          ? 'Factura a fost deja trimisă și validată de ANAF'
          : 'Factura este deja în curs de procesare la ANAF',
      );
    }
    const { content } = await this.invoices.downloadXml(accountantId, invoiceId);
    const xml = typeof content === 'string' ? content : content.toString('utf8');
    const check = await this.tryValidate(accountantId, xml, 'FACT1');
    if (check && !check.valid) {
      throw new BadRequestException({
        message: 'XML-ul facturii nu trece validarea ANAF',
        errors: check.messages,
      });
    }
    return this.upload(accountantId, {
      companyId: invoice.companyId,
      invoiceId,
      xml,
      standard: 'UBL',
      extern: options.extern,
    });
  }

  async list(
    accountantId: number,
    filter: {
      companyId?: number;
      invoiceId?: number;
      page: number;
      pageSize: number;
    },
  ): Promise<UploadPage> {
    const [items, total] = await this.uploads.findAndCount({
      where: {
        accountantId,
        ...(filter.companyId ? { companyId: filter.companyId } : {}),
        ...(filter.invoiceId ? { invoiceId: filter.invoiceId } : {}),
      },
      order: { id: 'DESC' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    });
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }

  async get(accountantId: number, id: number): Promise<EfacturaUpload> {
    const upload = await this.uploads.findOneBy({ id, accountantId });
    if (!upload) throw new NotFoundException('Încărcarea nu a fost găsită');
    return upload;
  }

  async refresh(accountantId: number, id: number): Promise<EfacturaUpload> {
    const upload = await this.get(accountantId, id);
    if (upload.status !== 'processing') return upload;
    if (!upload.uploadIndex || !upload.anafConnectionId) {
      throw new ConflictException(
        'Încărcarea nu are index ANAF sau certificatul a fost șters',
      );
    }
    const res = await this.api.request<unknown>({
      accountantId,
      connectionId: upload.anafConnectionId,
      companyId: upload.companyId,
      service: EFACTURA_SERVICE,
      path: `/${upload.environment}/FCTEL/rest/stareMesaj`,
      params: { id_incarcare: upload.uploadIndex },
      responseType: 'text',
      allowStatuses: [400],
    });
    const body = text(res.data);
    if (res.status === 400) {
      throw new BadRequestException(
        jsonOf<RawValidation>(body)?.message ?? 'ANAF a refuzat cererea',
      );
    }
    const parsed = parseStatusResponse(body);
    if (parsed.error) throw new BadGatewayException(parsed.error);
    if (!parsed.status) {
      throw new BadGatewayException('ANAF a returnat o stare necunoscută');
    }
    upload.status = parsed.status;
    upload.downloadId = parsed.downloadId ?? upload.downloadId;
    upload.checkedAt = new Date();
    return this.uploads.save(upload);
  }

  async download(accountantId: number, id: number): Promise<EfacturaFile> {
    const upload = await this.get(accountantId, id);
    if (!upload.downloadId) {
      throw new ConflictException(
        'Nu există încă un răspuns de descărcat. Verificați starea încărcării.',
      );
    }
    if (!upload.anafConnectionId) {
      throw new ConflictException('Certificatul încărcării a fost șters');
    }
    return this.fetchZip(
      accountantId,
      upload.anafConnectionId,
      upload.companyId,
      upload.environment,
      upload.downloadId,
    );
  }

  async listMessages(
    accountantId: number,
    companyId: number,
    query: {
      zile?: number;
      filtru?: (typeof MESSAGE_FILTERS)[number];
      startTime?: number;
      endTime?: number;
      pagina?: number;
    },
  ): Promise<MessageList> {
    const company = await this.companies.get(accountantId, companyId);
    if (!company.anafConnectionId) throw new BadRequestException(NO_CERTIFICATE);
    const paged = query.startTime !== undefined;
    if (paged && query.endTime === undefined) {
      throw new BadRequestException('Intervalul are nevoie de startTime și endTime');
    }
    const params: Record<string, string | number> = { cif: company.cui };
    if (paged) {
      params.startTime = query.startTime as number;
      params.endTime = query.endTime as number;
      params.pagina = query.pagina ?? 1;
    } else {
      params.zile = query.zile ?? 30;
    }
    if (query.filtru) params.filtru = query.filtru;

    const res = await this.api.request<RawMessageList>({
      accountantId,
      connectionId: company.anafConnectionId,
      companyId,
      service: EFACTURA_SERVICE,
      path: this.api.envPath(
        `/FCTEL/rest/${paged ? 'listaMesajePaginatieFactura' : 'listaMesajeFactura'}`,
      ),
      params,
      allowStatuses: [400],
    });
    const body = jsonOf<RawMessageList & RawValidation>(res.data);
    if (!body) throw new BadGatewayException('ANAF a returnat un răspuns neașteptat');
    const failure = body.eroare ?? (res.status === 400 ? body.message : null);
    if (failure) throw new BadRequestException(failure);

    return {
      title: orNull(body.titlu),
      messages: (body.mesaje ?? []).map((m) => ({
        id: String(m.id),
        requestId: orNull(m.id_solicitare),
        type: orNull(m.tip),
        details: orNull(m.detalii),
        cif: orNull(m.cif),
        createdAt: anafStampToIso(m.data_creare),
        createdAtRaw: orNull(m.data_creare),
      })),
      total: body.numar_total_inregistrari ?? null,
      page: body.index_pagina_curenta ?? null,
      pages: body.numar_total_pagini ?? null,
    };
  }

  async downloadMessage(
    accountantId: number,
    companyId: number,
    messageId: string,
  ): Promise<EfacturaFile> {
    const company = await this.companies.get(accountantId, companyId);
    if (!company.anafConnectionId) throw new BadRequestException(NO_CERTIFICATE);
    return this.fetchZip(
      accountantId,
      company.anafConnectionId,
      companyId,
      this.config.getOrThrow<string>('ANAF_ENV'),
      messageId,
    );
  }

  async validate(
    accountantId: number,
    xml: string,
    standard: (typeof VALIDATE_STANDARDS)[number] = 'FACT1',
  ): Promise<ValidationResult> {
    const res = await this.callPublic(
      accountantId,
      `/validare/${standard}`,
      xml,
      'text',
    );
    const body = jsonOf<RawValidation>(res.data);
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
      messages: (body.Messages ?? [])
        .map((m) => m.message ?? '')
        .filter(Boolean),
      traceId: orNull(body.trace_id),
    };
  }

  async transform(
    accountantId: number,
    xml: string,
    standard: (typeof VALIDATE_STANDARDS)[number] = 'FACT1',
    skipValidation = false,
  ): Promise<EfacturaFile> {
    const res = await this.callPublic(
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
    const body = jsonOf<RawValidation>(content.toString('utf8'));
    if (body?.Messages?.length) {
      throw new BadRequestException({
        message: 'XML-ul nu trece validarea ANAF, deci nu poate fi transformat',
        errors: body.Messages.map((m) => m.message ?? '').filter(Boolean),
      });
    }
    throw new BadGatewayException(
      body?.message ?? 'Transformarea ANAF nu a răspuns corect',
    );
  }

  async validateInvoice(
    accountantId: number,
    invoiceId: number,
  ): Promise<ValidationResult> {
    const { content } = await this.invoices.downloadXml(accountantId, invoiceId);
    return this.validate(
      accountantId,
      typeof content === 'string' ? content : content.toString('utf8'),
      'FACT1',
    );
  }

  private async tryValidate(
    accountantId: number,
    xml: string,
    standard: (typeof VALIDATE_STANDARDS)[number],
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

  private async fetchZip(
    accountantId: number,
    connectionId: string,
    companyId: number,
    environment: string,
    id: string,
  ): Promise<EfacturaFile> {
    const res = await this.api.request<ArrayBuffer>({
      accountantId,
      connectionId,
      companyId,
      service: EFACTURA_SERVICE,
      path: `/${environment}/FCTEL/rest/descarcare`,
      params: { id },
      responseType: 'arraybuffer',
      allowStatuses: [400],
    });
    const content = Buffer.from(res.data);
    if (
      res.status === 200 &&
      content.length > 2 &&
      content[0] === ZIP_MAGIC[0] &&
      content[1] === ZIP_MAGIC[1]
    ) {
      return {
        content,
        contentType: 'application/zip',
        filename: `efactura-${id}.zip`,
      };
    }
    const body = jsonOf<RawValidation>(content.toString('utf8'));
    throw new BadRequestException(
      body?.eroare ?? body?.message ?? 'ANAF nu a returnat arhiva solicitată',
    );
  }

  private async callPublic(
    accountantId: number,
    path: string,
    xml: string,
    responseType: 'text' | 'arraybuffer',
  ): Promise<AxiosResponse<unknown>> {
    if (!xml.trim()) throw new BadRequestException('Fișierul XML este gol');
    if (Buffer.byteLength(xml) > MAX_XML_BYTES) {
      throw new BadRequestException('Fișierul depășește 10 MB');
    }
    const started = performance.now();
    let status: number | null = null;
    let error: string | null = null;
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
      status = res.status;
      if (status >= 400) error = `HTTP ${status}`;
      return res;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException('Serviciul ANAF nu a putut fi contactat');
    } finally {
      await this.apiLogs.record({
        accountantId,
        anafConnectionId: null,
        companyId: null,
        service: EFACTURA_SERVICE,
        method: 'POST',
        endpoint: path.replace(/^(\/[a-z]+\/[A-Z0-9]+).*/, '$1'),
        statusCode: status,
        responseTimeMs: Math.round(performance.now() - started),
        error,
      });
    }
  }
}
