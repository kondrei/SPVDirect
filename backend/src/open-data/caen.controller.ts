import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CaenService } from './caen.service.js';

@Controller('caen')
@UseGuards(JwtAuthGuard)
export class CaenController {
  constructor(private readonly caen: CaenService) {}

  @Get(':code')
  async get(@Param('code') code: string) {
    const info = await this.caen.describe(code);
    if (!info) throw new NotFoundException('Cod CAEN necunoscut');
    return info;
  }
}
