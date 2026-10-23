import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AccountantParamGuard } from '../../auth/guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { CaenService } from '../../open-data/services/caen.service.js';
import { CompaniesService } from '../services/companies.service.js';
import {
  ANAF_BULK_THROTTLE,
  ANAF_LOOKUP_THROTTLE,
} from '../../common/constants.js';
import { MAX_LOGO_BYTES } from '../helpers/company-logo.js';
import type { Company } from '../company.entity.js';
import { toCompanyResponse } from '../helpers/company-response.js';
import {
  CreateCompaniesDto,
  CreateCompanyDto,
  UpdateCompanyDto,
} from '../dto/company.dto.js';
import { BulkCreateStatus } from '../dto/company.enums.js';

@Controller('accountants/:accountantId/companies')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly caenService: CaenService,
  ) {}

  private respond(company: Company) {
    return toCompanyResponse(company, this.caenService);
  }

  @Get()
  async list(@Param('accountantId', ParseIdPipe) accountantId: number) {
    return Promise.all(
      (await this.companiesService.list(accountantId)).map((c) =>
        this.respond(c),
      ),
    );
  }

  @Post()
  @Throttle(ANAF_LOOKUP_THROTTLE)
  async create(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: CreateCompanyDto,
  ) {
    return this.respond(await this.companiesService.create(accountantId, dto));
  }

  @Post('bulk')
  @Throttle(ANAF_BULK_THROTTLE)
  async createMany(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: CreateCompaniesDto,
  ) {
    const results = await this.companiesService.createMany(accountantId, dto);
    return Promise.all(
      results.map(async (r) =>
        r.status === BulkCreateStatus.Created
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
    return this.respond(await this.companiesService.get(accountantId, id));
  }

  @Post(':id/anaf-refresh')
  @HttpCode(200)
  @Throttle(ANAF_LOOKUP_THROTTLE)
  async refreshFromAnaf(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.respond(
      await this.companiesService.refreshFromAnaf(accountantId, id),
    );
  }

  @Patch(':id')
  @Throttle(ANAF_LOOKUP_THROTTLE)
  async update(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.respond(
      await this.companiesService.update(accountantId, id, dto),
    );
  }

  @Put(':id/logo')
  @UseInterceptors(
    FileInterceptor('logo', { limits: { fileSize: MAX_LOGO_BYTES + 1 } }),
  )
  async uploadLogo(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    return this.respond(
      await this.companiesService.setLogo(accountantId, id, file?.buffer),
    );
  }

  @Get(':id/logo')
  @Header('Cache-Control', 'private, no-cache')
  async logo(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    const logo = await this.companiesService.getLogo(accountantId, id);
    return new StreamableFile(logo.content, { type: logo.contentType });
  }

  @Delete(':id/logo')
  async removeLogo(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.respond(
      await this.companiesService.removeLogo(accountantId, id),
    );
  }
}
