import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { ActivityItem } from '../../api-logs/dto/api-log.types.js';
import { accountExported } from '../../api-logs/activity-entries.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { AnafConnection } from '../../anaf/anaf-connection.entity.js';
import { normalizeCif } from '../../anaf/spv/services/spv-archive.service.js';
import { SpvMessage } from '../../anaf/spv/spv-message.entity.js';
import type { Company } from '../../companies/company.entity.js';
import {
  CompanyExportService,
  json,
} from '../../companies/deletion/company-export.service.js';
import type { CompanyExport } from '../../companies/dto/company.types.js';
import { toCsv, type CsvValue } from '../../companies/deletion/csv.js';
import { ZipStream } from '../../companies/deletion/zip-stream.js';
import { CompaniesService } from '../../companies/services/companies.service.js';
import { AccountantsService } from '../services/accountants.service.js';
import {
  ACTIVITY_HEADER,
  COMPANY_HEADER,
  CONNECTION_HEADER,
  accountExportFilename,
} from '../dto/accountant.constants.js';
import { AccountExportFile } from '../dto/accountant.enums.js';

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
    private readonly activity: ActivityLogsService,
  ) {}

  async export(accountantId: number, now = new Date()): Promise<CompanyExport> {
    const profile = await this.accountants.getProfile(accountantId);
    await this.activity.record(accountantId, accountExported());
    const zip = new ZipStream();
    void this.companyExport.stream(
      zip,
      `account ${accountantId}`,
      async (errors) => {
        const [companies, connections, activity] = await Promise.all([
          this.companies.list(accountantId),
          this.connections.find({
            where: { accountantId },
            order: { id: 'ASC' },
          }),
          this.activity.all(accountantId),
        ]);
        zip.add(AccountExportFile.Profile, json(profile));
        zip.add(
          AccountExportFile.Connections,
          toCsv(
            CONNECTION_HEADER,
            connections.map((c) => connectionRow(c)),
          ),
        );
        zip.add(
          AccountExportFile.Companies,
          toCsv(
            COMPANY_HEADER,
            companies.map((c) => companyRow(c)),
          ),
        );
        zip.add(
          AccountExportFile.Activity,
          toCsv(
            ACTIVITY_HEADER,
            activity.map((a) => activityRow(a)),
          ),
        );
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
          AccountExportFile.UnmatchedSpv,
          errors,
        );
      },
    );
    return {
      content: zip.output,
      contentType: 'application/zip',
      filename: accountExportFilename(now),
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
  return `${AccountExportFile.CompaniesFolder}/${company.cui}`;
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

function activityRow(a: ActivityItem): CsvValue[] {
  return [
    a.createdAt,
    a.accountantName,
    a.action,
    a.companyId,
    a.description,
    JSON.stringify(a.details),
  ];
}

function companyRow(c: Company): CsvValue[] {
  return [c.id, c.cui, c.name, folder(c), c.createdAt];
}
