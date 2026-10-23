import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountantParamGuard } from '../../auth/guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { EXPORT_THROTTLE } from '../../common/constants.js';
import { attachment } from '../../common/download-file.js';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { CompanyDeletionService } from './company-deletion.service.js';
import { CompanyExportService } from './company-export.service.js';

@Controller('accountants/:accountantId/companies')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class CompanyDeletionController {
  constructor(
    private readonly companyDeletionService: CompanyDeletionService,
    private readonly companyExportService: CompanyExportService,
  ) {}

  @Get(':id/export')
  @Throttle(EXPORT_THROTTLE)
  async export(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return attachment(await this.companyExportService.export(accountantId, id));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.companyDeletionService.softDelete(accountantId, id);
  }
}
