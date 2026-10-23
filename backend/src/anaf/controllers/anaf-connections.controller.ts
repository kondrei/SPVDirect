import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AccountantParamGuard } from '../../auth/guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { ANAF_CONNECTION_THROTTLE } from '../../common/constants.js';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { AnafConnectionsService } from '../services/anaf-connections.service.js';

class UpdateConnectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label: string;
}

@Controller('accountants/:accountantId/anaf/connections')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class AnafConnectionsController {
  constructor(
    private readonly anafConnectionsService: AnafConnectionsService,
  ) {}

  @Get()
  list(@Param('accountantId', ParseIdPipe) accountantId: number) {
    return this.anafConnectionsService.list(accountantId);
  }

  @Patch(':id')
  update(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateConnectionDto,
  ) {
    return this.anafConnectionsService.rename(accountantId, id, dto.label);
  }

  @Delete(':id')
  @HttpCode(204)
  @Throttle(ANAF_CONNECTION_THROTTLE)
  remove(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.anafConnectionsService.remove(accountantId, id);
  }

  @Get(':id/test')
  @Throttle(ANAF_CONNECTION_THROTTLE)
  test(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.anafConnectionsService.test(accountantId, id);
  }
}
