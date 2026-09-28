import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountantParamGuard } from '../auth/accountant-param.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { CaenService } from '../open-data/caen.service.js';
import { CompaniesService } from './companies.service.js';
import type { Company } from './company.entity.js';
import { toCompanyResponse } from './company-response.js';
import {
  CreateCompaniesDto,
  CreateCompanyDto,
  UpdateCompanyDto,
} from './dto/company.dto.js';

const ANAF_LOOKUP_THROTTLE = { default: { limit: 20, ttl: 60_000 } };
const ANAF_BULK_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('accountants/:accountantId/companies')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly caen: CaenService,
  ) {}

  private respond(company: Company) {
    return toCompanyResponse(company, this.caen);
  }

  @Get()
  async list(@Param('accountantId', ParseIdPipe) accountantId: number) {
    return Promise.all(
      (await this.companies.list(accountantId)).map((c) => this.respond(c)),
    );
  }

  @Post()
  @Throttle(ANAF_LOOKUP_THROTTLE)
  async create(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: CreateCompanyDto,
  ) {
    return this.respond(await this.companies.create(accountantId, dto));
  }

  @Post('bulk')
  @Throttle(ANAF_BULK_THROTTLE)
  async createMany(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: CreateCompaniesDto,
  ) {
    const results = await this.companies.createMany(accountantId, dto);
    return Promise.all(
      results.map(async (r) =>
        r.status === 'created'
          ? { ...r, company: await this.respond(r.company) }
          : r,
      ),
    );
  }

  @Get(':id')
  async get(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.respond(await this.companies.get(accountantId, id));
  }

  @Post(':id/anaf-refresh')
  @HttpCode(200)
  @Throttle(ANAF_LOOKUP_THROTTLE)
  async refreshFromAnaf(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.respond(await this.companies.refreshFromAnaf(accountantId, id));
  }

  @Patch(':id')
  async update(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.respond(await this.companies.update(accountantId, id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.companies.remove(accountantId, id);
  }
}
