import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CaenController } from './caen.controller.js';
import { CaenService } from './services/caen.service.js';
import { DataGovRoService } from './services/data-gov-ro.service.js';

@Module({
  imports: [HttpModule],
  controllers: [CaenController],
  providers: [DataGovRoService, CaenService],
  exports: [CaenService],
})
export class OpenDataModule {}
