import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CaenService } from './services/caen.service.js';

@Controller('caen')
@UseGuards(JwtAuthGuard)
export class CaenController {
  constructor(private readonly caenService: CaenService) {}

  @Get(':code')
  async get(@Param('code') code: string) {
    const info = await this.caenService.describe(code);
    if (!info) throw new NotFoundException('Cod CAEN necunoscut');
    return info;
  }
}
