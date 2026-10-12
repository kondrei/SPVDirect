import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Accountant } from '../accountants/accountant.entity.js';
import { AnafConnection } from '../anaf/anaf-connection.entity.js';
import { SpvMessage } from '../anaf/spv/spv-message.entity.js';
import { Company } from '../companies/company.entity.js';
import { EfacturaUpload } from '../efactura/efactura-upload.entity.js';
import { Invoice } from '../invoices/invoice.entity.js';
import { PublicStatsController } from './public-stats.controller.js';
import { PublicStatsService } from './public-stats.service.js';
import { PublicStatsSubscriber } from './public-stats.subscriber.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Accountant,
      AnafConnection,
      Company,
      EfacturaUpload,
      Invoice,
      SpvMessage,
    ]),
  ],
  controllers: [PublicStatsController],
  providers: [PublicStatsService, PublicStatsSubscriber],
})
export class PublicStatsModule {}
