import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AnafConnection } from '../../anaf/anaf-connection.entity.js';
import { AnafCompanyAccessService } from '../../anaf/services/anaf-company-access.service.js';
import { isUniqueViolation } from '../../common/db-errors.js';
import { validateLogo } from '../helpers/company-logo.js';
import {
  companyFieldsFromAnaf,
  type AnafTvaRecord,
} from '../helpers/anaf-company-info.js';
import { AnafCompanyLookupService } from './anaf-company-lookup.service.js';
import { Company } from '../company.entity.js';
import {
  CreateCompaniesDto,
  CreateCompanyDto,
  UpdateCompanyDto,
} from '../dto/company.dto.js';
import { BulkCreateStatus } from '../dto/company.enums.js';

export const CUI_NOT_FOUND =
  'CUI incorect: nu există nicio firmă cu acest CUI în baza de date ANAF.';

export type BulkCreateResult =
  | { cui: string; status: BulkCreateStatus.Created; company: Company }
  | {
      cui: string;
      status: BulkCreateStatus.Exists | BulkCreateStatus.NotFound;
    };

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(AnafConnection)
    private readonly connections: Repository<AnafConnection>,
    private readonly anaf: AnafCompanyLookupService,
    private readonly access: AnafCompanyAccessService,
  ) {}

  list(accountantId: number): Promise<Company[]> {
    return this.companies.find({
      where: { accountantId },
      order: { name: 'ASC' },
    });
  }

  async get(accountantId: number, id: number): Promise<Company> {
    const company = await this.companies.findOneBy({ id, accountantId });
    if (!company) throw new NotFoundException('Firma nu a fost găsită');
    return company;
  }

  findByCui(accountantId: number, cui: string): Promise<Company | null> {
    return this.companies.findOneBy({ accountantId, cui });
  }

  async create(accountantId: number, dto: CreateCompanyDto): Promise<Company> {
    if (await this.companies.existsBy({ accountantId, cui: dto.cui })) {
      throw new ConflictException('Firma cu acest CUI există deja');
    }
    const record = await this.anaf.lookup(accountantId, dto.cui);
    if (!record) throw new BadRequestException(CUI_NOT_FOUND);
    try {
      return await this.companies.save(
        this.companies.create({
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
      (
        await this.companies.find({
          select: { cui: true },
          where: { accountantId, cui: In(cuis) },
        })
      ).map((c) => c.cui),
    );
    const toLookup = cuis.filter((cui) => !existing.has(cui));
    const found = toLookup.length
      ? await this.anaf.lookupMany(accountantId, toLookup)
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
        const company = await this.companies.save(
          this.companies.create({
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
    return results;
  }

  async refreshFromAnaf(accountantId: number, id: number): Promise<Company> {
    const company = await this.get(accountantId, id);
    const record = await this.anaf.lookup(accountantId, company.cui, id);
    if (!record) throw new BadRequestException(CUI_NOT_FOUND);
    Object.assign(company, companyFieldsFromAnaf(record), {
      name: company.name,
      anafSyncedAt: new Date(),
    });
    return this.companies.save(company);
  }

  async update(
    accountantId: number,
    id: number,
    dto: UpdateCompanyDto,
  ): Promise<Company> {
    const company = await this.get(accountantId, id);
    if (dto.name !== undefined) company.name = dto.name;
    if (dto.iban !== undefined) company.iban = dto.iban;
    if (dto.bankName !== undefined) company.bankName = dto.bankName;
    if (dto.email !== undefined) company.email = dto.email;
    if (dto.phone !== undefined) company.phone = dto.phone;
    if (
      dto.anafConnectionId !== undefined &&
      dto.anafConnectionId !== company.anafConnectionId
    ) {
      if (dto.anafConnectionId !== null) {
        if (
          !(await this.connections.existsBy({
            id: dto.anafConnectionId,
            accountantId,
          }))
        ) {
          throw new BadRequestException('Certificat ANAF necunoscut');
        }
        await this.access.assertAccess(
          accountantId,
          dto.anafConnectionId,
          company.cui,
          company.id,
        );
      }
      company.anafConnectionId = dto.anafConnectionId;
    }
    return this.companies.save(company);
  }

  async attachConnection(companyId: number, connectionId: number) {
    await this.companies.update(
      { id: companyId },
      { anafConnectionId: connectionId },
    );
  }

  async setLogo(
    accountantId: number,
    id: number,
    file: Buffer | undefined,
  ): Promise<Company> {
    const logo = validateLogo(file);
    const company = await this.get(accountantId, id);
    await this.companies.update(
      { id: company.id },
      { logo: logo.content, logoContentType: logo.contentType },
    );
    company.logoContentType = logo.contentType;
    return company;
  }

  async getLogo(
    accountantId: number,
    id: number,
  ): Promise<{ content: Buffer; contentType: string }> {
    const company = await this.companies
      .createQueryBuilder('c')
      .addSelect('c.logo')
      .where('c.id = :id AND c.accountantId = :accountantId', {
        id,
        accountantId,
      })
      .getOne();
    if (!company) throw new NotFoundException('Firma nu a fost găsită');
    if (!company.logo || !company.logoContentType) {
      throw new NotFoundException('Firma nu are logo');
    }
    return { content: company.logo, contentType: company.logoContentType };
  }

  async removeLogo(accountantId: number, id: number): Promise<Company> {
    const company = await this.get(accountantId, id);
    await this.companies.update(
      { id: company.id },
      { logo: null, logoContentType: null },
    );
    company.logoContentType = null;
    return company;
  }
}
