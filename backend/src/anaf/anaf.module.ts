import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiLogsModule } from '../api-logs/api-logs.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { AnafApiService } from './anaf-api.service.js';
import { AnafConnection } from './anaf-connection.entity.js';
import { AnafConnectionsController } from './anaf-connections.controller.js';
import { AnafOAuthController } from './anaf-oauth.controller.js';
import { AnafOAuthService } from './anaf-oauth.service.js';
import { AuthorizationLink } from './authorization-links/authorization-link.entity.js';
import { AuthorizationLinksController } from './authorization-links/authorization-links.controller.js';
import { AuthorizationLinksService } from './authorization-links/authorization-links.service.js';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([AnafConnection, AuthorizationLink]),
    ApiLogsModule,
    CompaniesModule,
  ],
  controllers: [
    AnafOAuthController,
    AnafConnectionsController,
    AuthorizationLinksController,
  ],
  providers: [AnafOAuthService, AnafApiService, AuthorizationLinksService],
  exports: [AnafApiService],
})
export class AnafModule {}
