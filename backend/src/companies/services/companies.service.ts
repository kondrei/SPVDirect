import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  companyAnafRefreshed,
  companyCreated,
  companyLogoChanged,
  companyUpdated,
} from '../../api-logs/activity-entries.js';
import { EDITABLE_COMPANY_FIELDS } from '../dto/company.constants.js';
import type { CompanyField, BulkCreateResult } from '../dto/company.types.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { AnafConnectionRepository } from '../../anaf/repositories/anaf-connection.repository.js';
import { AnafCompanyAccessService } from '../../anaf/services/anaf-company-access.service.js';
import { isUniqueViolation } from '../../common/db-errors.js';
import { validateLogo } from '../helpers/company-logo.js';
import {
  companyFieldsFromAnaf,
  type AnafTvaRecord,
} from '../helpers/anaf-company-info.js';
import { AnafCompanyLookupService } from './anaf-company-lookup.service.js';
import type { Company } from '../company.entity.js';
import { CompanyRepository } from '../repositories/company.repository.js';
import {
  CreateCompaniesDto,
  CreateCompanyDto,
  UpdateCompanyDto,
} from '../dto/company.dto.js';
import { BulkCreateStatus } from '../dto/company.enums.js';

export const CUI_NOT_FOUND =
  'CUI incorect: nu există nicio firmă cu acest CUI în baza de date ANAF.';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly anafConnectionRepository: AnafConnectionRepository,
    private readonly anafCompanyLookupService: AnafCompanyLookupService,
    private readonly anafCompanyAccessService: AnafCompanyAccessService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  list(accountantId: number): Promise<Company[]> {
    return this.companyRepository.listByName(accountantId);
  }

  async get(accountantId: number, id: number): Promise<Company> {
    const company = await this.companyRepository.findOwned(accountantId, id);
    if (!company) throw new NotFoundException('Firma nu a fost găsită');
    return company;
  }

  findByCui(accountantId: number, cui: string): Promise<Company | null> {
    return this.companyRepository.findByCui(accountantId, cui);
  }

  async create(accountantId: number, dto: CreateCompanyDto): Promise<Company> {
    if (await this.companyRepository.existsByCui(accountantId, dto.cui)) {
      throw new ConflictException('Firma cu acest CUI există deja');
    }
    const record = await this.anafCompanyLookupService.lookup(
      accountantId,
      dto.cui,
    );
    if (!record) throw new BadRequestException(CUI_NOT_FOUND);
    let company: Company;
    try {
      company = await this.companyRepository.save(
        this.companyRepository.create({
          accountantId,
          cui: dto.cui,
          ...companyFieldsFromAnaf(record),
          anafSyncedAt: new Date(),
        }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Firma cu acest CUI există deja');
      }
      throw err;
    }
    await this.activityLogsService.record(
      accountantId,
      companyCreated(company),
    );
    return company;
  }

  async createMany(
    accountantId: number,
    dto: CreateCompaniesDto,
  ): Promise<BulkCreateResult[]> {
    const seen = new Set<number>();
    const cuis = dto.cuis.filter((cui) => {
      const n = Number(cui);
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    });

    const existing = new Set(
      (await this.companyRepository.existingCuis(accountantId, cuis)).map(
        (c) => c.cui,
      ),
    );
    const toLookup = cuis.filter((cui) => !existing.has(cui));
    const found = toLookup.length
      ? await this.anafCompanyLookupService.lookupMany(accountantId, toLookup)
      : new Map<number, AnafTvaRecord>();

    const results: BulkCreateResult[] = [];
    for (const cui of cuis) {
      if (existing.has(cui)) {
        results.push({ cui, status: BulkCreateStatus.Exists });
        continue;
      }
      const record = found.get(Number(cui));
      if (!record) {
        results.push({ cui, status: BulkCreateStatus.NotFound });
        continue;
      }
      try {
        const company = await this.companyRepository.save(
          this.companyRepository.create({
            accountantId,
            cui,
            ...companyFieldsFromAnaf(record),
            anafSyncedAt: new Date(),
          }),
        );
        results.push({ cui, status: BulkCreateStatus.Created, company });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        results.push({ cui, status: BulkCreateStatus.Exists });
      }
    }
    await this.activityLogsService.recordMany(
      accountantId,
      results.flatMap((r) =>
        r.status === BulkCreateStatus.Created
          ? [companyCreated(r.company)]
          : [],
      ),
    );
    return results;
  }

  async refreshFromAnaf(accountantId: number, id: number): Promise<Company> {
    const company = await this.get(accountantId, id);
    const record = await this.anafCompanyLookupService.lookup(
      accountantId,
      company.cui,
      id,
    );
    if (!record) throw new BadRequestException(CUI_NOT_FOUND);
    Object.assign(company, companyFieldsFromAnaf(record), {
      name: company.name,
      anafSyncedAt: new Date(),
    });
    const saved = await this.companyRepository.save(company);
    await this.activityLogsService.record(
      accountantId,
      companyAnafRefreshed(saved),
    );
    return saved;
  }

  async update(
    accountantId: number,
    id: number,
    dto: UpdateCompanyDto,
  ): Promise<Company> {
    const company = await this.get(accountantId, id);
    const changed: CompanyField[] = [];
    for (const field of EDITABLE_COMPANY_FIELDS) {
      const value = dto[field];
      if (value === undefined || value === company[field]) continue;
      Object.assign(company, { [field]: value });
      changed.push(field);
    }
    if (
      dto.anafConnectionId !== undefined &&
      dto.anafConnectionId !== company.anafConnectionId
    ) {
      if (dto.anafConnectionId !== null) {
        if (
          !(await this.anafConnectionRepository.existsOwned(
            accountantId,
            dto.anafConnectionId,
          ))
        ) {
          throw new BadRequestException('Certificat ANAF necunoscut');
        }
        await this.anafCompanyAccessService.assertAccess(
          accountantId,
          dto.anafConnectionId,
          company.cui,
          company.id,
        );
      }
      company.anafConnectionId = dto.anafConnectionId;
      changed.push('anafConnectionId');
    }
    const saved = await this.companyRepository.save(company);
    if (changed.length) {
      await this.activityLogsService.record(
        accountantId,
        companyUpdated(saved, changed),
      );
    }
    return saved;
  }

  async attachConnection(companyId: number, connectionId: number) {
    await this.companyRepository.update(companyId, {
      anafConnectionId: connectionId,
    });
  }

  async setLogo(
    accountantId: number,
    id: number,
    file: Buffer | undefined,
  ): Promise<Company> {
    const logo = validateLogo(file);
    const company = await this.get(accountantId, id);
    await this.companyRepository.update(company.id, {
      logo: logo.content,
      logoContentType: logo.contentType,
    });
    company.logoContentType = logo.contentType;
    await this.activityLogsService.record(
      accountantId,
      companyLogoChanged(company, false),
    );
    return company;
  }

  async getLogo(
    accountantId: number,
    id: number,
  ): Promise<{ content: Buffer; contentType: string }> {
    const company = await this.companyRepository.findWithLogo(accountantId, id);
    if (!company) throw new NotFoundException('Firma nu a fost găsită');
    if (!company.logo || !company.logoContentType) {
      throw new NotFoundException('Firma nu are logo');
    }
    return { content: company.logo, contentType: company.logoContentType };
  }

  async removeLogo(accountantId: number, id: number): Promise<Company> {
    const company = await this.get(accountantId, id);
    await this.companyRepository.update(company.id, {
      logo: null,
      logoContentType: null,
    });
    company.logoContentType = null;
    await this.activityLogsService.record(
      accountantId,
      companyLogoChanged(company, true),
    );
    return company;
  }
}
