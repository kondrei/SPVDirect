import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnafConnection } from '../anaf/anaf-connection.entity.js';
import { Company } from './company.entity.js';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto.js';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(AnafConnection)
    private readonly connections: Repository<AnafConnection>,
  ) {}

  list(accountantId: string): Promise<Company[]> {
    return this.companies.find({
      where: { accountantId },
      order: { name: 'ASC' },
    });
  }

  async get(accountantId: string, id: string): Promise<Company> {
    const company = await this.companies.findOneBy({ id, accountantId });
    if (!company) throw new NotFoundException('Firma nu a fost găsită');
    return company;
  }

  async create(accountantId: string, dto: CreateCompanyDto): Promise<Company> {
    if (await this.companies.existsBy({ accountantId, cui: dto.cui })) {
      throw new ConflictException('Firma cu acest CUI există deja');
    }
    return this.companies.save(
      this.companies.create({ accountantId, cui: dto.cui, name: dto.name }),
    );
  }

  async update(
    accountantId: string,
    id: string,
    dto: UpdateCompanyDto,
  ): Promise<Company> {
    const company = await this.get(accountantId, id);
    if (dto.name !== undefined) company.name = dto.name;
    if (dto.anafConnectionId !== undefined) {
      if (
        dto.anafConnectionId !== null &&
        !(await this.connections.existsBy({
          id: dto.anafConnectionId,
          accountantId,
        }))
      ) {
        throw new BadRequestException('Certificat ANAF necunoscut');
      }
      company.anafConnectionId = dto.anafConnectionId;
    }
    return this.companies.save(company);
  }

  async attachConnection(companyId: string, connectionId: string) {
    await this.companies.update(
      { id: companyId },
      { anafConnectionId: connectionId },
    );
  }

  async remove(accountantId: string, id: string): Promise<void> {
    const company = await this.get(accountantId, id);
    await this.companies.remove(company);
  }
}
