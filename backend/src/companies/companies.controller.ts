import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentAccountantId } from '../auth/current-accountant.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CompaniesService } from './companies.service.js';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto.js';

@Controller('companies')
@UseGuards(JwtAuthGuard)
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  list(@CurrentAccountantId() accountantId: string) {
    return this.companies.list(accountantId);
  }

  @Post()
  create(
    @CurrentAccountantId() accountantId: string,
    @Body() dto: CreateCompanyDto,
  ) {
    return this.companies.create(accountantId, dto);
  }

  @Get(':id')
  get(
    @CurrentAccountantId() accountantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.companies.get(accountantId, id);
  }

  @Patch(':id')
  update(
    @CurrentAccountantId() accountantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companies.update(accountantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentAccountantId() accountantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.companies.remove(accountantId, id);
  }
}
