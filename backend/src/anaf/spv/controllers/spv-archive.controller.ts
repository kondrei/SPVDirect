import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AccountantParamGuard } from '../../../auth/guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import { ARCHIVE_THROTTLE } from '../../../common/constants.js';
import { attachment } from '../../../common/download-file.js';
import { ParseIdPipe } from '../../../common/parse-id.pipe.js';
import { SpvArchiveService } from '../services/spv-archive.service.js';
import { MAX_IMPORT_BYTES, MAX_SPV_PDF_BYTES } from '../spv-import.js';
import { ArchiveQuery } from '../dto/spv.dto.js';

@Controller('accountants/:accountantId/spv/archive')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class SpvArchiveController {
  constructor(private readonly spvArchiveService: SpvArchiveService) {}

  @Get()
  @Throttle(ARCHIVE_THROTTLE)
  list(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Query() query: ArchiveQuery,
  ) {
    return this.spvArchiveService.list(accountantId, {
      cif: query.cif,
      type: query.type,
      companyId: query.companyId,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
    });
  }

  @Post('import')
  @HttpCode(200)
  @Throttle(ARCHIVE_THROTTLE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES + 1 } }),
  )
  importMessages(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    return this.spvArchiveService.importMessages(accountantId, file?.buffer);
  }

  @Put(':id/document')
  @Throttle(ARCHIVE_THROTTLE)
  @UseInterceptors(
    FileInterceptor('document', {
      limits: { fileSize: MAX_SPV_PDF_BYTES + 1 },
    }),
  )
  saveDocument(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    return this.spvArchiveService.saveDocument(accountantId, id, file?.buffer);
  }

  @Get(':id/download')
  @Throttle(ARCHIVE_THROTTLE)
  @Header('Cache-Control', 'no-store')
  async download(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    const doc = await this.spvArchiveService.download(accountantId, id);
    return attachment(doc);
  }
}
