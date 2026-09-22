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
import { CurrentAccountantId } from '../auth/current-accountant.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AnafApiService } from './anaf-api.service.js';
import { AnafConnection } from './anaf-connection.entity.js';

class UpdateConnectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label: string;
}

@Controller('anaf/connections')
@UseGuards(JwtAuthGuard)
export class AnafConnectionsController {
  constructor(
    private readonly api: AnafApiService,
    @InjectRepository(AnafConnection)
    private readonly connections: Repository<AnafConnection>,
  ) {}

  /** Token columns are `select: false`, so they never leave the server. */
  @Get()
  list(@CurrentAccountantId() accountantId: string) {
    return this.connections.find({
      where: { accountantId },
      order: { createdAt: 'DESC' },
    });
  }

  @Patch(':id')
  async update(
    @CurrentAccountantId() accountantId: string,
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
    @CurrentAccountantId() accountantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.connections.remove(await this.get(accountantId, id));
  }

  /** Calls ANAF's TestOauth "hello" service with this connection's token. */
  @Get(':id/test')
  async test(
    @CurrentAccountantId() accountantId: string,
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

  private async get(accountantId: string, id: string) {
    const connection = await this.connections.findOneBy({ id, accountantId });
    if (!connection) throw new NotFoundException('Conexiune ANAF inexistentă');
    return connection;
  }
}
