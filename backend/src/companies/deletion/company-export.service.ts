import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Readable } from 'node:stream';
import { Repository } from 'typeorm';
import { SpvArchiveService } from '../../anaf/spv/services/spv-archive.service.js';
import { SpvMessage } from '../../anaf/spv/spv-message.entity.js';
import type { DownloadFile } from '../../common/download-file.js';
import { EfacturaUpload } from '../../efactura/efactura-upload.entity.js';
import { Invoice } from '../../invoices/invoice.entity.js';
import { InvoiceDeliveryService } from '../../invoices/services/invoice-delivery.service.js';
import type { Company } from '../company.entity.js';
import { CompaniesService } from '../services/companies.service.js';
import { companySpvMessages } from './company-records.js';
import { toCsv, type CsvValue } from './csv.js';
import { ZipStream } from './zip-stream.js';
import { LogoContentType } from '../dto/company.enums.js';

export interface CompanyExport {
  content: Readable;
  contentType: string;
  filename: string;
}

const INVOICE_HEADER = [
  'id',
  'serie',
  'numar',
  'data_emiterii',
  'data_livrarii',
  'scadenta',
  'moneda',
  'cumparator',
  'cui_cumparator',
  'total_fara_tva',
  'tva',
  'total',
  'storno_pentru',
  'creata_la',
];

const UPLOAD_HEADER = [
  'id',
  'factura_id',
  'mediu',
  'standard',
  'index_incarcare',
  'stare',
  'id_descarcare',
  'eroare',
  'verificata_la',
  'creata_la',
];

const SPV_HEADER = [
  'id',
  'id_mesaj_anaf',
  'cif',
  'tip',
  'detalii',
  'id_solicitare',
  'data_anaf',
  'descarcat_la',
];

@Injectable()
export class CompanyExportService {
  private readonly logger = new Logger(CompanyExportService.name);

  constructor(
    private readonly companies: CompaniesService,
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
    @InjectRepository(EfacturaUpload)
    private readonly uploads: Repository<EfacturaUpload>,
    @InjectRepository(SpvMessage)
    private readonly messages: Repository<SpvMessage>,
    private readonly delivery: InvoiceDeliveryService,
    private readonly spv: SpvArchiveService,
  ) {}

  async export(
    accountantId: number,
    id: number,
    now = new Date(),
  ): Promise<CompanyExport> {
    const company = await this.companies.get(accountantId, id);
    const zip = new ZipStream();
    void this.stream(zip, `company ${company.id}`, async (errors) => {
      await this.writeCompany(zip, company, '', errors);
    });
    return {
      content: zip.output,
      contentType: 'application/zip',
      filename: `firma-${company.cui}-export-${now.toISOString().slice(0, 10)}.zip`,
    };
  }

  async stream(
    zip: ZipStream,
    label: string,
    write: (errors: string[]) => Promise<void>,
  ): Promise<void> {
    const errors: string[] = [];
    try {
      await write(errors);
      if (!zip.output.destroyed) {
        if (errors.length) zip.add('erori.txt', `${errors.join('\n')}\n`);
        zip.end();
      }
    } catch (err) {
      this.logger.error(`Export of ${label} failed: ${(err as Error).message}`);
      zip.fail(err as Error);
    }
  }

  async writeCompany(
    zip: ZipStream,
    company: Company,
    prefix: string,
    errors: string[],
  ): Promise<boolean> {
    const accountantId = company.accountantId;
    const [invoices, uploads, messages] = await Promise.all([
      this.invoices.find({
        where: { accountantId, companyId: company.id },
        order: { issueDate: 'ASC', id: 'ASC' },
      }),
      this.uploads.find({
        where: { accountantId, companyId: company.id },
        order: { id: 'ASC' },
      }),
      companySpvMessages(this.messages, company)
        .orderBy('m.anafCreatedAt', 'ASC', 'NULLS LAST')
        .addOrderBy('m.id', 'ASC')
        .getMany(),
    ]);

    zip.add(`${prefix}firma.json`, json(company));
    await this.addLogo(zip, errors, company, prefix);

    zip.add(`${prefix}facturi.json`, json(invoices));
    zip.add(
      `${prefix}facturi.csv`,
      toCsv(INVOICE_HEADER, invoices.map(invoiceRow)),
    );
    for (const invoice of invoices) {
      if (!(await zip.ready())) return false;
      await this.addFile(zip, errors, `${prefix}facturi`, false, () =>
        this.delivery.pdf(accountantId, invoice.id),
      );
      await this.addFile(zip, errors, `${prefix}facturi`, true, () =>
        this.delivery.xml(accountantId, invoice.id),
      );
    }

    zip.add(
      `${prefix}efactura.csv`,
      toCsv(UPLOAD_HEADER, uploads.map(uploadRow)),
    );
    return this.writeSpv(zip, accountantId, messages, `${prefix}spv`, errors);
  }

  async writeSpv(
    zip: ZipStream,
    accountantId: number,
    messages: SpvMessage[],
    name: string,
    errors: string[],
  ): Promise<boolean> {
    zip.add(`${name}.csv`, toCsv(SPV_HEADER, messages.map(spvRow)));
    for (const message of messages) {
      if (!message.downloadedAt) continue;
      if (!(await zip.ready())) return false;
      await this.addFile(zip, errors, name, false, () =>
        this.spv.download(accountantId, message.id),
      );
    }
    return true;
  }

  private async addLogo(
    zip: ZipStream,
    errors: string[],
    company: Company,
    prefix: string,
  ): Promise<void> {
    if (!company.logoContentType) return;
    try {
      const logo = await this.companies.getLogo(
        company.accountantId,
        company.id,
      );
      const ext = logo.contentType === LogoContentType.Png ? 'png' : 'jpg';
      zip.add(`${prefix}logo.${ext}`, logo.content, false);
    } catch (err) {
      if (err instanceof NotFoundException) return;
      errors.push(`${prefix}logo: ${(err as Error).message}`);
    }
  }

  private async addFile(
    zip: ZipStream,
    errors: string[],
    folder: string,
    compress: boolean,
    load: () => Promise<DownloadFile>,
  ): Promise<void> {
    try {
      const file = await load();
      zip.add(`${folder}/${file.filename}`, file.content, compress);
    } catch (err) {
      errors.push(`${folder}: ${(err as Error).message}`);
    }
  }
}

export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function invoiceRow(i: Invoice): CsvValue[] {
  return [
    i.id,
    i.series,
    i.number,
    i.issueDate,
    i.deliveryDate,
    i.dueDate,
    i.currency,
    i.buyer.name,
    i.buyer.cui,
    i.totalNet,
    i.totalVat,
    i.totalGross,
    i.stornoOfSeries ? `${i.stornoOfSeries}-${i.stornoOfNumber}` : null,
    i.createdAt,
  ];
}

function uploadRow(u: EfacturaUpload): CsvValue[] {
  return [
    u.id,
    u.invoiceId,
    u.environment,
    u.standard,
    u.uploadIndex,
    u.status,
    u.downloadId,
    u.errorMessage,
    u.checkedAt,
    u.createdAt,
  ];
}

function spvRow(m: SpvMessage): CsvValue[] {
  return [
    m.id,
    m.anafMessageId,
    m.cif,
    m.type,
    m.details,
    m.requestId,
    m.anafCreatedRaw,
    m.downloadedAt,
  ];
}
