import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiLogsModule } from '../api-logs/api-logs.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { Company } from '../companies/company.entity.js';
import { AnafGatewayModule } from './anaf-gateway.module.js';
import { AnafAuthorizationService } from './services/anaf-authorization.service.js';
import { AnafConnectionsService } from './services/anaf-connections.service.js';
import { AnafConnection } from './anaf-connection.entity.js';
import { AnafConnectionsController } from './controllers/anaf-connections.controller.js';
import { AnafOAuthController } from './controllers/anaf-oauth.controller.js';
import { SpvArchiveController } from './spv/controllers/spv-archive.controller.js';
import { SpvArchiveService } from './spv/services/spv-archive.service.js';
import { SpvFileStore } from './spv/services/spv-file-store.service.js';
import { SpvMessage } from './spv/spv-message.entity.js';
import { SpvController } from './spv/controllers/spv.controller.js';
import { SpvService } from './spv/services/spv.service.js';
import { AuthorizationLink } from './authorization-links/authorization-link.entity.js';
import { AuthorizationLinksController } from './authorization-links/authorization-links.controller.js';
import { AuthorizationLinksService } from './authorization-links/authorization-links.service.js';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      AnafConnection,
      AuthorizationLink,
      SpvMessage,
      Company,
    ]),
    ApiLogsModule,
    AnafGatewayModule,
    CompaniesModule,
  ],
  controllers: [
    AnafOAuthController,
    AnafConnectionsController,
    AuthorizationLinksController,
    SpvController,
    SpvArchiveController,
  ],
  providers: [
    AnafAuthorizationService,
    AnafConnectionsService,
    AuthorizationLinksService,
    SpvService,
    SpvArchiveService,
    SpvFileStore,
  ],
  exports: [
    AnafGatewayModule,
    AnafConnectionsService,
    SpvService,
    SpvArchiveService,
    SpvFileStore,
  ],
})
export class AnafModule {}
