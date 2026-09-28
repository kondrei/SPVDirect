import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CaenController } from './caen.controller.js';
import { CaenService } from './caen.service.js';
import { DataGovRoService } from './data-gov-ro.service.js';

@Module({
  imports: [HttpModule],
  controllers: [CaenController],
  providers: [DataGovRoService, CaenService],
  exports: [CaenService],
})
export class OpenDataModule {}
