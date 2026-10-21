import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AnafConnection } from '../../anaf/anaf-connection.entity.js';
import { normalizeCif } from '../../anaf/spv/services/spv-archive.service.js';
import { SpvMessage } from '../../anaf/spv/spv-message.entity.js';
import type { Company } from '../../companies/company.entity.js';
import {
  CompanyExportService,
  json,
  type CompanyExport,
} from '../../companies/deletion/company-export.service.js';
import { toCsv, type CsvValue } from '../../companies/deletion/csv.js';
import { ZipStream } from '../../companies/deletion/zip-stream.js';
import { CompaniesService } from '../../companies/services/companies.service.js';
import { AccountantsService } from '../services/accountants.service.js';

const CONNECTION_HEADER = [
  'id',
  'eticheta',
  'serie_certificat',
  'drepturi',
  'sursa',
  'stare',
  'acces_expira_la',
  'reimprospatare_expira_la',
  'creat_la',
];

const COMPANY_HEADER = ['id', 'cui', 'denumire', 'dosar', 'adaugata_la'];

@Injectable()
export class AccountExportService {
  constructor(
    private readonly accountants: AccountantsService,
    private readonly companies: CompaniesService,
    private readonly companyExport: CompanyExportService,
    @InjectRepository(AnafConnection)
    private readonly connections: Repository<AnafConnection>,
    @InjectRepository(SpvMessage)
    private readonly messages: Repository<SpvMessage>,
  ) {}

  async export(accountantId: number, now = new Date()): Promise<CompanyExport> {
    const profile = await this.accountants.getProfile(accountantId);
    const zip = new ZipStream();
    void this.companyExport.stream(
      zip,
      `account ${accountantId}`,
      async (errors) => {
        const [companies, connections] = await Promise.all([
          this.companies.list(accountantId),
          this.connections.find({
            where: { accountantId },
            order: { id: 'ASC' },
          }),
        ]);
        zip.add('cont.json', json(profile));
        zip.add(
          'certificate.csv',
          toCsv(CONNECTION_HEADER, connections.map(connectionRow)),
        );
        zip.add('firme.csv', toCsv(COMPANY_HEADER, companies.map(companyRow)));
        for (const company of companies) {
          const done = await this.companyExport.writeCompany(
            zip,
            company,
            `${folder(company)}/`,
            errors,
          );
          if (!done) return;
        }
        await this.companyExport.writeSpv(
          zip,
          accountantId,
          await this.unmatchedMessages(accountantId, companies),
          'spv-fara-firma',
          errors,
        );
      },
    );
    return {
      content: zip.output,
      contentType: 'application/zip',
      filename: `cont-spvdirect-export-${now.toISOString().slice(0, 10)}.zip`,
    };
  }

  private async unmatchedMessages(
    accountantId: number,
    companies: Company[],
  ): Promise<SpvMessage[]> {
    const cuis = new Set(companies.map((c) => c.cui));
    const messages = await this.messages.find({
      where: { accountantId, companyId: IsNull() },
      order: { anafCreatedAt: 'ASC', id: 'ASC' },
    });
    return messages.filter((m) => !cuis.has(normalizeCif(m.cif) ?? ''));
  }
}

function folder(company: Company): string {
  return `firme/${company.cui}`;
}

function connectionRow(c: AnafConnection): CsvValue[] {
  return [
    c.id,
    c.label,
    c.certSerial,
    c.roles.join(','),
    c.source,
    c.status,
    c.accessExpiresAt,
    c.refreshExpiresAt,
    c.createdAt,
  ];
}

function companyRow(c: Company): CsvValue[] {
  return [c.id, c.cui, c.name, folder(c), c.createdAt];
}
