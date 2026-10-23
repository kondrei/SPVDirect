import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

import {
  efacturaDownloaded,
  efacturaMessagesLoaded,
  efacturaStatusChecked,
  efacturaTransformed,
  efacturaUploaded,
  efacturaValidated,
} from '../../api-logs/activity-entries.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { AnafApiService } from '../../anaf/services/anaf-api.service.js';
import { isUniqueViolation } from '../../common/db-errors.js';
import { lockLiveCompany } from '../../companies/company-lock.js';
import { CompanyRepository } from '../../companies/repositories/company.repository.js';
import type { Company } from '../../companies/company.entity.js';
import { CompaniesService } from '../../companies/services/companies.service.js';
import { InvoiceRepository } from '../../invoices/repositories/invoice.repository.js';
import { INVOICE_NOT_FOUND } from '../../invoices/services/invoice-lookup.js';
import { InvoicesService } from '../../invoices/services/invoices.service.js';
import { assertXmlPayload } from '../dto/efactura.dto.js';
import type { EfacturaUpload } from '../efactura-upload.entity.js';
import { EfacturaInvoiceRepository } from '../repositories/efactura-invoice.repository.js';
import { EfacturaUploadRepository } from '../repositories/efactura-upload.repository.js';
import {
  bodyJson,
  bodyText,
  orNull,
  type AnafErrorBody,
} from '../helpers/anaf-body.js';
import {
  anafStampToIso,
  parseStatusResponse,
  parseUploadResponse,
} from '../helpers/efactura-xml.js';
import {
  EfacturaValidator,
  type EfacturaFile,
  type ValidationResult,
} from './efactura-validator.service.js';
import { AnafEnvironment } from '../../anaf/dto/anaf.enums.js';
import {
  ApiLogService,
  ApiLogMethod,
} from '../../api-logs/dto/api-log.enums.js';
import {
  UploadStatus,
  EfacturaStandard,
  ValidateStandard,
} from '../dto/efactura.enums.js';
import type {
  UploadInput,
  UploadPage,
  MessageList,
  CertifiedCompany,
  AnafTarget,
  SendOutcome,
  RawMessageList,
  MessageQuery,
  UploadListFilter,
} from '../dto/efactura.types.js';
import {
  NO_CERTIFICATE,
  NO_MESSAGES_PATTERN,
  STALE_SENDING_MS,
  UPLOAD_INTERRUPTED,
  ZIP_MAGIC,
} from '../dto/efactura.constants.js';

export function certified(company: Company): CertifiedCompany {
  if (!company.anafConnectionId) throw new BadRequestException(NO_CERTIFICATE);
  return {
    id: company.id,
    cui: company.cui,
    connectionId: company.anafConnectionId,
  };
}

function alreadySent(active: EfacturaUpload | null): ConflictException {
  return new ConflictException(
    active?.status === UploadStatus.Ok
      ? 'Factura a fost deja trimisă și validată de ANAF'
      : 'Factura este deja în curs de trimitere sau procesare la ANAF',
  );
}

@Injectable()
export class EfacturaService {
  constructor(
    private readonly anafApiService: AnafApiService,
    private readonly efacturaValidator: EfacturaValidator,
    private readonly companiesService: CompaniesService,
    private readonly invoicesService: InvoicesService,
    private readonly efacturaUploadRepository: EfacturaUploadRepository,
    private readonly activityLogsService: ActivityLogsService,
    private readonly efacturaInvoiceRepository: EfacturaInvoiceRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly companyRepository: CompanyRepository,
    private readonly invoiceRepository: InvoiceRepository,
  ) {}

  async upload(
    accountantId: number,
    input: UploadInput,
  ): Promise<EfacturaUpload> {
    assertXmlPayload(input.xml);
    const company = await this.certifiedCompany(accountantId, input.companyId);
    const outcome = await this.send(accountantId, company, input);
    const saved = await this.efacturaUploadRepository.insert({
      ...this.newUpload(accountantId, company, null, input.standard),
      ...outcome,
    });
    await this.activityLogsService.record(
      accountantId,
      efacturaUploaded(saved, null),
    );
    return saved;
  }

  async uploadInvoice(
    accountantId: number,
    invoiceId: number,
    options: { extern?: boolean } = {},
  ): Promise<EfacturaUpload> {
    const invoice = await this.invoicesService.get(accountantId, invoiceId);
    const company = await this.certifiedCompany(
      accountantId,
      invoice.companyId,
    );
    const claim = await this.claimInvoice(accountantId, company, invoiceId);
    let outcome: SendOutcome;
    try {
      const xml = await this.invoicesService.xml(accountantId, invoiceId);
      const check = await this.efacturaValidator.validateIfAvailable(
        accountantId,
        xml,
        ValidateStandard.FACT1,
      );
      if (check && !check.valid) {
        throw new BadRequestException({
          message: 'XML-ul facturii nu trece validarea ANAF',
          errors: check.messages,
        });
      }
      outcome = await this.send(accountantId, company, {
        companyId: company.id,
        xml,
        standard: EfacturaStandard.UBL,
        extern: options.extern,
      });
    } catch (err) {
      await this.efacturaUploadRepository.deleteSending(claim.id);
      throw err;
    }
    const saved = await this.efacturaUploadRepository.save(
      Object.assign(claim, outcome),
    );
    await this.activityLogsService.record(
      accountantId,
      efacturaUploaded(saved, invoice),
    );
    return saved;
  }

  async list(
    accountantId: number,
    filter: UploadListFilter,
  ): Promise<UploadPage> {
    const [items, total] = await this.efacturaUploadRepository.page(
      accountantId,
      filter,
    );
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }

  async latestForInvoices(
    accountantId: number,
    invoiceIds: number[],
  ): Promise<EfacturaUpload[]> {
    if (!invoiceIds.length) return [];
    const rows = await this.efacturaUploadRepository.newestFirstForInvoices(
      accountantId,
      invoiceIds,
    );
    const latest = new Map<number, EfacturaUpload>();
    for (const row of rows) {
      if (row.invoiceId !== null && !latest.has(row.invoiceId)) {
        latest.set(row.invoiceId, row);
      }
    }
    return [...latest.values()];
  }

  async get(accountantId: number, id: number): Promise<EfacturaUpload> {
    const upload = await this.efacturaUploadRepository.findOwned(
      accountantId,
      id,
    );
    if (!upload) throw new NotFoundException('Încărcarea nu a fost găsită');
    return upload;
  }

  async refresh(accountantId: number, id: number): Promise<EfacturaUpload> {
    const upload = await this.get(accountantId, id);
    if (upload.status !== UploadStatus.Processing) return upload;
    if (!upload.uploadIndex || !upload.anafConnectionId) {
      throw new ConflictException(
        'Încărcarea nu are index ANAF sau certificatul a fost șters',
      );
    }
    const res = await this.anafApiService.request<unknown>({
      accountantId,
      connectionId: upload.anafConnectionId,
      companyId: upload.companyId,
      service: ApiLogService.Efactura,
      path: this.anafApiService.envPath(
        '/FCTEL/rest/stareMesaj',
        upload.environment,
      ),
      params: { id_incarcare: upload.uploadIndex },
      responseType: 'text',
      allowStatuses: [400],
    });
    const body = bodyText(res.data);
    if (res.status === 400) {
      throw new BadRequestException(
        bodyJson<AnafErrorBody>(body)?.message ?? 'ANAF a refuzat cererea',
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
    const saved = await this.efacturaUploadRepository.save(upload);
    await this.activityLogsService.record(
      accountantId,
      efacturaStatusChecked(saved),
    );
    return saved;
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
    const file = await this.fetchZip(
      {
        accountantId,
        connectionId: upload.anafConnectionId,
        companyId: upload.companyId,
      },
      upload.environment,
      upload.downloadId,
    );
    await this.activityLogsService.record(
      accountantId,
      efacturaDownloaded(upload.companyId, upload.downloadId),
    );
    return file;
  }

  async listMessages(
    accountantId: number,
    companyId: number,
    query: MessageQuery,
  ): Promise<MessageList> {
    const record = await this.companiesService.get(accountantId, companyId);
    const company = certified(record);
    const list = await this.fetchMessages(
      { accountantId, connectionId: company.connectionId, companyId },
      company.cui,
      query,
    );
    await this.markArchived(companyId, list);
    await this.activityLogsService.record(
      accountantId,
      efacturaMessagesLoaded(record, list.messages.length, query),
    );
    return list;
  }

  async fetchMessages(
    target: AnafTarget,
    cui: string,
    query: MessageQuery,
  ): Promise<MessageList> {
    const paged = query.startTime !== undefined;
    if (paged && query.endTime === undefined) {
      throw new BadRequestException(
        'Intervalul are nevoie de startTime și endTime',
      );
    }
    const params: Record<string, string | number> = { cif: cui };
    if (paged) {
      params.startTime = query.startTime as number;
      params.endTime = query.endTime as number;
      params.pagina = query.pagina ?? 1;
    } else {
      params.zile = query.zile ?? 30;
    }
    if (query.filtru) params.filtru = query.filtru;

    const res = await this.anafApiService.request<RawMessageList>({
      ...target,
      service: ApiLogService.Efactura,
      path: this.anafApiService.envPath(
        `/FCTEL/rest/${paged ? 'listaMesajePaginatieFactura' : 'listaMesajeFactura'}`,
      ),
      params,
      allowStatuses: [400],
    });
    const body = bodyJson<RawMessageList & AnafErrorBody>(res.data);
    if (!body) {
      throw new BadGatewayException('ANAF a returnat un răspuns neașteptat');
    }
    const failure = body.eroare ?? (res.status === 400 ? body.message : null);
    if (failure && !NO_MESSAGES_PATTERN.test(failure)) {
      throw new BadRequestException(failure);
    }

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
        archivedId: null,
      })),
      total: body.numar_total_inregistrari ?? null,
      page: body.index_pagina_curenta ?? null,
      pages: body.numar_total_pagini ?? null,
    };
  }

  private async markArchived(
    companyId: number,
    list: MessageList,
  ): Promise<void> {
    if (!list.messages.length) return;
    const rows = await this.efacturaInvoiceRepository.idsByMessage(
      companyId,
      this.anafApiService.environment(),
      list.messages.map((m) => m.id),
    );
    const ids = new Map(rows.map((r) => [r.anafMessageId, r.id]));
    for (const message of list.messages) {
      message.archivedId = ids.get(message.id) ?? null;
    }
  }

  async downloadMessage(
    accountantId: number,
    companyId: number,
    messageId: string,
  ): Promise<EfacturaFile> {
    const company = await this.certifiedCompany(accountantId, companyId);
    const file = await this.fetchZip(
      { accountantId, connectionId: company.connectionId, companyId },
      this.anafApiService.environment(),
      messageId,
    );
    await this.activityLogsService.record(
      accountantId,
      efacturaDownloaded(companyId, messageId),
    );
    return file;
  }

  async validateInvoice(
    accountantId: number,
    invoiceId: number,
  ): Promise<ValidationResult> {
    const invoice = await this.invoicesService.get(accountantId, invoiceId);
    const result = await this.efacturaValidator.validate(
      accountantId,
      await this.invoicesService.xml(accountantId, invoiceId),
      ValidateStandard.FACT1,
    );
    await this.activityLogsService.record(
      accountantId,
      efacturaValidated(result, ValidateStandard.FACT1, invoice),
    );
    return result;
  }

  async validateXml(
    accountantId: number,
    xml: string,
    standard: ValidateStandard = ValidateStandard.FACT1,
  ): Promise<ValidationResult> {
    const result = await this.efacturaValidator.validate(
      accountantId,
      xml,
      standard,
    );
    await this.activityLogsService.record(
      accountantId,
      efacturaValidated(result, standard, null),
    );
    return result;
  }

  async transformXml(
    accountantId: number,
    xml: string,
    standard: ValidateStandard = ValidateStandard.FACT1,
    skipValidation = false,
  ): Promise<EfacturaFile> {
    const file = await this.efacturaValidator.transform(
      accountantId,
      xml,
      standard,
      skipValidation,
    );
    await this.activityLogsService.record(
      accountantId,
      efacturaTransformed(standard),
    );
    return file;
  }

  private async certifiedCompany(
    accountantId: number,
    companyId: number,
  ): Promise<CertifiedCompany> {
    return certified(await this.companiesService.get(accountantId, companyId));
  }

  private newUpload(
    accountantId: number,
    company: CertifiedCompany,
    invoiceId: number | null,
    standard: EfacturaStandard,
  ): Partial<EfacturaUpload> {
    return {
      accountantId,
      companyId: company.id,
      invoiceId,
      anafConnectionId: company.connectionId,
      environment: this.anafApiService.environment(),
      standard,
      uploadIndex: null,
      status: UploadStatus.Sending,
      downloadId: null,
      errorMessage: null,
      checkedAt: null,
    };
  }

  private async claimInvoice(
    accountantId: number,
    company: CertifiedCompany,
    invoiceId: number,
  ): Promise<EfacturaUpload> {
    const insert = () =>
      this.dataSource.transaction(async (manager) => {
        await lockLiveCompany(
          this.companyRepository,
          manager,
          accountantId,
          company.id,
        );
        if (
          !(await this.invoiceRepository.existsOwned(
            manager,
            accountantId,
            invoiceId,
          ))
        ) {
          throw new NotFoundException(INVOICE_NOT_FOUND);
        }
        return this.efacturaUploadRepository.insertClaim(
          manager,
          this.newUpload(
            accountantId,
            company,
            invoiceId,
            EfacturaStandard.UBL,
          ),
        );
      });
    try {
      return await insert();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    const active = await this.efacturaUploadRepository.findActive(
      accountantId,
      invoiceId,
    );
    if (
      active?.status !== UploadStatus.Sending ||
      Date.now() - active.createdAt.getTime() < STALE_SENDING_MS
    ) {
      throw alreadySent(active);
    }
    await this.efacturaUploadRepository.markInterrupted(
      active.id,
      UPLOAD_INTERRUPTED,
    );
    try {
      return await insert();
    } catch (err) {
      if (isUniqueViolation(err)) throw alreadySent(null);
      throw err;
    }
  }

  private async send(
    accountantId: number,
    company: CertifiedCompany,
    input: UploadInput,
  ): Promise<SendOutcome> {
    const params: Record<string, string> = {
      standard: input.standard,
      cif: company.cui,
    };
    if (input.extern) params.extern = 'DA';
    if (input.autofactura) params.autofactura = 'DA';
    if (input.executare) params.executare = 'DA';

    const res = await this.anafApiService.request<unknown>({
      accountantId,
      connectionId: company.connectionId,
      companyId: company.id,
      service: ApiLogService.Efactura,
      method: ApiLogMethod.Post,
      path: this.anafApiService.envPath(
        `/FCTEL/rest/${input.b2c ? 'uploadb2c' : 'upload'}`,
      ),
      params,
      data: input.xml,
      headers: { 'Content-Type': 'text/plain' },
      responseType: 'text',
      allowStatuses: [400],
    });

    if (res.status === 400) {
      return {
        uploadIndex: null,
        status: UploadStatus.Rejected,
        errorMessage:
          bodyJson<AnafErrorBody>(res.data)?.message ??
          'ANAF a refuzat cererea',
      };
    }
    const parsed = parseUploadResponse(bodyText(res.data));
    return parsed.accepted
      ? {
          uploadIndex: parsed.uploadIndex,
          status: UploadStatus.Processing,
          errorMessage: null,
        }
      : {
          uploadIndex: null,
          status: UploadStatus.Rejected,
          errorMessage: parsed.error ?? 'ANAF nu a acceptat fișierul',
        };
  }

  async fetchZip(
    target: AnafTarget,
    environment: AnafEnvironment,
    id: string,
  ): Promise<EfacturaFile> {
    const res = await this.anafApiService.request<ArrayBuffer>({
      ...target,
      service: ApiLogService.Efactura,
      path: this.anafApiService.envPath('/FCTEL/rest/descarcare', environment),
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
    const body = bodyJson<AnafErrorBody>(content.toString('utf8'));
    throw new BadRequestException(
      body?.eroare ?? body?.message ?? 'ANAF nu a returnat arhiva solicitată',
    );
  }
}
