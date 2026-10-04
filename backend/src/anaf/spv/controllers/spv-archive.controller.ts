import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountantParamGuard } from '../../../auth/accountant-param.guard.js';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard.js';
import { ARCHIVE_THROTTLE } from '../../../common/constants.js';
import { ParseIdPipe } from '../../../common/parse-id.pipe.js';
import { SpvArchiveService } from '../services/spv-archive.service.js';
import { ArchiveQuery } from '../spv.dto.js';

@Controller('accountants/:accountantId/spv/archive')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class SpvArchiveController {
  constructor(private readonly archive: SpvArchiveService) {}

  @Get()
  @Throttle(ARCHIVE_THROTTLE)
  list(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Query() query: ArchiveQuery,
  ) {
    return this.archive.list(accountantId, {
      cif: query.cif,
      type: query.type,
      companyId: query.companyId,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
    });
  }

  @Get(':id/download')
  @Throttle(ARCHIVE_THROTTLE)
  @Header('Cache-Control', 'no-store')
  async download(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    const doc = await this.archive.download(accountantId, id);
    return new StreamableFile(doc.content, {
      type: doc.contentType,
      disposition: `attachment; filename="${doc.filename}"`,
    });
  }
}
