import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountantParamGuard } from '../../auth/guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import {
  ARCHIVE_THROTTLE,
  EFACTURA_IMPORT_THROTTLE,
  EFACTURA_THROTTLE,
  INVOICE_MAIL_THROTTLE,
} from '../../common/constants.js';
import { attachment } from '../../common/download-file.js';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { ARCHIVE_PAGE_SIZE } from '../dto/efactura.constants.js';
import {
  ArchiveQuery,
  EmailArchiveDto,
  ImportMessagesDto,
  ImportPeriodDto,
} from '../dto/efactura.dto.js';
import { EfacturaArchiveService } from '../services/efactura-archive.service.js';

@Controller('accountants/:accountantId/efactura')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class EfacturaArchiveController {
  constructor(private readonly archive: EfacturaArchiveService) {}

  @Post('companies/:companyId/messages/import')
  @HttpCode(200)
  @Throttle(EFACTURA_IMPORT_THROTTLE)
  importMessages(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('companyId', ParseIdPipe) companyId: number,
    @Body() dto: ImportMessagesDto,
  ) {
    return this.archive.importMessages(accountantId, companyId, dto.messageIds);
  }

  @Post('companies/:companyId/messages/import-period')
  @HttpCode(200)
  @Throttle(EFACTURA_IMPORT_THROTTLE)
  importPeriod(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('companyId', ParseIdPipe) companyId: number,
    @Body() dto: ImportPeriodDto,
  ) {
    return this.archive.importPeriod(accountantId, companyId, dto.zile);
  }

  @Get('archive')
  @Throttle(ARCHIVE_THROTTLE)
  list(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Query() query: ArchiveQuery,
  ) {
    return this.archive.list(accountantId, {
      companyId: query.companyId,
      direction: query.direction,
      from: query.from,
      to: query.to,
      q: query.q,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? ARCHIVE_PAGE_SIZE,
    });
  }

  @Get('archive/:id')
  @Throttle(ARCHIVE_THROTTLE)
  get(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.archive.get(accountantId, id);
  }

  @Get('archive/:id/zip')
  @Throttle(ARCHIVE_THROTTLE)
  @Header('Cache-Control', 'no-store')
  async zip(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return attachment(await this.archive.zip(accountantId, id));
  }

  @Get('archive/:id/xml')
  @Throttle(ARCHIVE_THROTTLE)
  @Header('Cache-Control', 'no-store')
  async xml(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return attachment(await this.archive.xml(accountantId, id));
  }

  @Get('archive/:id/pdf')
  @Throttle(EFACTURA_THROTTLE)
  @Header('Cache-Control', 'no-store')
  async pdf(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return attachment(await this.archive.pdf(accountantId, id));
  }

  @Post('archive/:id/email')
  @HttpCode(200)
  @Throttle(INVOICE_MAIL_THROTTLE)
  email(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: EmailArchiveDto,
  ) {
    return this.archive.email(accountantId, id, {
      to: dto.to,
      message: dto.message,
    });
  }
}
