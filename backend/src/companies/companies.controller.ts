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
import { CompaniesService } from './companies.service.js';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto.js';

const ANAF_LOOKUP_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@Controller('accountants/:accountantId/companies')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  list(@Param('accountantId', ParseIdPipe) accountantId: number) {
    return this.companies.list(accountantId);
  }

  @Post()
  @Throttle(ANAF_LOOKUP_THROTTLE)
  create(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: CreateCompanyDto,
  ) {
    return this.companies.create(accountantId, dto);
  }

  @Get(':id')
  get(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.companies.get(accountantId, id);
  }

  @Post(':id/anaf-refresh')
  @HttpCode(200)
  @Throttle(ANAF_LOOKUP_THROTTLE)
  refreshFromAnaf(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.companies.refreshFromAnaf(accountantId, id);
  }

  @Patch(':id')
  update(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companies.update(accountantId, id, dto);
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
