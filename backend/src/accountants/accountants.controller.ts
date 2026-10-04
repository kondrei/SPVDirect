import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountantParamGuard } from '../auth/accountant-param.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  ANAF_LOOKUP_THROTTLE,
  PASSWORD_THROTTLE,
} from '../common/constants.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { normalizeCui } from '../companies/dto/company.dto.js';
import { AccountantsService } from './accountants.service.js';
import { ChangePasswordDto, UpdateProfileDto } from './dto/profile.dto.js';

@Controller('accountants/:accountantId')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class AccountantsController {
  constructor(private readonly accountants: AccountantsService) {}

  @Get('profile')
  getProfile(@Param('accountantId', ParseIdPipe) accountantId: number) {
    return this.accountants.getProfile(accountantId);
  }

  @Patch('profile')
  updateProfile(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.accountants.updateProfile(accountantId, dto);
  }

  @Get('profile/firm-lookup/:cui')
  @Throttle(ANAF_LOOKUP_THROTTLE)
  lookupFirm(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('cui') cui: string,
  ) {
    const normalized = normalizeCui(cui);
    if (typeof normalized !== 'string' || !/^\d{2,10}$/.test(normalized)) {
      throw new BadRequestException('CUI invalid');
    }
    return this.accountants.lookupFirm(accountantId, normalized);
  }

  @Post('password')
  @HttpCode(204)
  @Throttle(PASSWORD_THROTTLE)
  async changePassword(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.accountants.changePassword(accountantId, dto);
  }
}
