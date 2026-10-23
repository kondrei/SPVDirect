import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ApiLogsModule } from '../api-logs/api-logs.module.js';
import { AnafApiService } from './services/anaf-api.service.js';
import { AnafCompanyAccessService } from './services/anaf-company-access.service.js';
import { AnafOAuthService } from './services/anaf-oauth.service.js';
import { AnafTokenClient } from './services/anaf-token-client.service.js';

@Module({
  imports: [HttpModule, ApiLogsModule],
  providers: [
    AnafTokenClient,
    AnafOAuthService,
    AnafApiService,
    AnafCompanyAccessService,
  ],
  exports: [
    AnafTokenClient,
    AnafOAuthService,
    AnafApiService,
    AnafCompanyAccessService,
  ],
})
export class AnafGatewayModule {}
