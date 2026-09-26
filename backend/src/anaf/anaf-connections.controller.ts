import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Repository } from 'typeorm';
import { AccountantParamGuard } from '../auth/accountant-param.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { AnafApiService } from './anaf-api.service.js';
import { AnafConnection } from './anaf-connection.entity.js';
import { AnafOAuthService } from './anaf-oauth.service.js';

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
    private readonly api: AnafApiService,
    private readonly oauth: AnafOAuthService,
    @InjectRepository(AnafConnection)
    private readonly connections: Repository<AnafConnection>,
  ) {}

  @Get()
  list(@Param('accountantId', ParseIdPipe) accountantId: number) {
    return this.connections.find({
      where: { accountantId },
      order: { createdAt: 'DESC' },
    });
  }

  @Patch(':id')
  async update(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConnectionDto,
  ) {
    const connection = await this.get(accountantId, id);
    connection.label = dto.label;
    return this.connections.save(connection);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const connection = await this.get(accountantId, id);
    await this.oauth.revokeConnection(connection.id);
    await this.connections.remove(connection);
  }

  @Get(':id/test')
  async test(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const res = await this.api.request<string>({
      accountantId,
      connectionId: id,
      service: 'TestOAuth',
      path: '/TestOauth/jaxrs/hello',
      params: { name: 'SPVDirect' },
      responseType: 'text',
    });
    return { status: res.status, body: res.data };
  }

  private async get(accountantId: number, id: string) {
    const connection = await this.connections.findOneBy({ id, accountantId });
    if (!connection) throw new NotFoundException('Conexiune ANAF inexistentă');
    return connection;
  }
}
