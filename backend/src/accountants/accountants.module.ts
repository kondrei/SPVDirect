import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Accountant } from './accountant.entity.js';
import { AccountantsService } from './accountants.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Accountant])],
  providers: [AccountantsService],
  exports: [AccountantsService],
})
export class AccountantsModule {}
