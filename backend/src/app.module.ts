import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountantsModule } from './accountants/accountants.module.js';
import { AnafModule } from './anaf/anaf.module.js';
import { ApiLogsModule } from './api-logs/api-logs.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { CompanyDeletionModule } from './companies/deletion/company-deletion.module.js';
import { AccountDeletionModule } from './accountants/deletion/account-deletion.module.js';
import { Env, envValidationSchema } from './config/env.validation.js';
import { buildTypeOrmOptions } from './config/typeorm.config.js';
import { HealthController } from './health.controller.js';
import { EfacturaModule } from './efactura/efactura.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { OpenDataModule } from './open-data/open-data.module.js';
import { PublicStatsModule } from './public-stats/public-stats.module.js';
import { RepositoriesModule } from './database/repositories.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildTypeOrmOptions({
          DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
          DATABASE_SSL: config.get('DATABASE_SSL', { infer: true }),
          DB_SLOW_QUERY_MS: config.get('DB_SLOW_QUERY_MS', { infer: true }),
        }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    RepositoriesModule,
    CqrsModule.forRoot(),
    ScheduleModule.forRoot(),
    CommonModule,
    AuthModule,
    AccountantsModule,
    OpenDataModule,
    CompaniesModule,
    CompanyDeletionModule,
    AccountDeletionModule,
    InvoicesModule,
    EfacturaModule,
    ApiLogsModule,
    AnafModule,
    PublicStatsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
