import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountantParamGuard } from '../../../auth/accountant-param.guard.js';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard.js';
import {
  SPV_REQUEST_THROTTLE,
  SPV_THROTTLE,
} from '../../../common/constants.js';
import { ParseIdPipe } from '../../../common/parse-id.pipe.js';
import {
  CreateSpvRequestDto,
  ListSpvMessagesQuery,
  ParseSpvMessageIdPipe,
  SyncSpvDto,
} from '../spv.dto.js';
import { SpvArchiveService } from '../services/spv-archive.service.js';
import { SpvService } from '../services/spv.service.js';

@Controller('accountants/:accountantId/anaf/connections/:connectionId/spv')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class SpvController {
  constructor(
    private readonly spv: SpvService,
    private readonly archive: SpvArchiveService,
  ) {}

  @Get('messages')
  @Throttle(SPV_THROTTLE)
  list(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Query() query: ListSpvMessagesQuery,
  ) {
    return this.spv.listMessages(accountantId, connectionId, query);
  }

  @Get('messages/:messageId/download')
  @Throttle(SPV_THROTTLE)
  @Header('Cache-Control', 'no-store')
  async download(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Param('messageId', ParseSpvMessageIdPipe) messageId: string,
  ) {
    const doc = await this.spv.downloadMessage(
      accountantId,
      connectionId,
      messageId,
    );
    return new StreamableFile(doc.content, {
      type: doc.contentType,
      disposition: `attachment; filename="${doc.filename}"`,
    });
  }

  @Post('sync')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async sync(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: SyncSpvDto,
  ) {
    return this.archive.sync(accountantId, connectionId, dto.zile);
  }

  @Post('requests')
  @HttpCode(201)
  @Throttle(SPV_REQUEST_THROTTLE)
  createRequest(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: CreateSpvRequestDto,
  ) {
    return this.spv.createRequest(accountantId, connectionId, dto);
  }
}
