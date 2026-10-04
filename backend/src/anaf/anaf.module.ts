import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiLogsModule } from '../api-logs/api-logs.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { Company } from '../companies/company.entity.js';
import { AnafApiService } from './services/anaf-api.service.js';
import { AnafConnection } from './anaf-connection.entity.js';
import { AnafConnectionsController } from './controllers/anaf-connections.controller.js';
import { AnafOAuthController } from './controllers/anaf-oauth.controller.js';
import { AnafOAuthService } from './services/anaf-oauth.service.js';
import { SpvArchiveController } from './spv/controllers/spv-archive.controller.js';
import { SpvArchiveService } from './spv/services/spv-archive.service.js';
import { SpvFileStore } from './spv/services/spv-file-store.service.js';
import { SpvMessage } from './spv/spv-message.entity.js';
import { SpvSyncJob } from './spv/spv-sync.job.js';
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
    AnafOAuthService,
    AnafApiService,
    AuthorizationLinksService,
    SpvService,
    SpvArchiveService,
    SpvFileStore,
    SpvSyncJob,
  ],
  exports: [AnafApiService, SpvService],
})
export class AnafModule {}
