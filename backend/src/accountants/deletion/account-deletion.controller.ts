import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AccountantParamGuard } from '../../auth/guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { SessionCookieService } from '../../auth/services/session-cookie.service.js';
import { EXPORT_THROTTLE, PASSWORD_THROTTLE } from '../../common/constants.js';
import { attachment } from '../../common/download-file.js';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { DeleteAccountDto } from '../dto/profile.dto.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { AccountExportService } from './account-export.service.js';

@Controller('accountants/:accountantId')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class AccountDeletionController {
  constructor(
    private readonly deletion: AccountDeletionService,
    private readonly exports: AccountExportService,
    private readonly session: SessionCookieService,
  ) {}

  @Get('export')
  @Throttle(EXPORT_THROTTLE)
  async export(@Param('accountantId', ParseIdPipe) accountantId: number) {
    return attachment(await this.exports.export(accountantId));
  }

  @Delete()
  @HttpCode(204)
  @Throttle(PASSWORD_THROTTLE)
  async remove(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.deletion.softDelete(accountantId, dto.password);
    this.session.clear(res);
  }
}
