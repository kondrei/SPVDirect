import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AccountantParamGuard } from '../../auth/guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { AuthService } from '../../auth/services/auth.service.js';
import {
  cookieOptions,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from '../../auth/session.js';
import {
  ANAF_LOOKUP_THROTTLE,
  PASSWORD_THROTTLE,
} from '../../common/constants.js';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { normalizeCui } from '../../companies/dto/company.dto.js';
import { AccountantsService } from '../services/accountants.service.js';
import { ChangePasswordDto, UpdateProfileDto } from '../dto/profile.dto.js';

@Controller('accountants/:accountantId')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class AccountantsController {
  private readonly production: boolean;

  constructor(
    private readonly accountants: AccountantsService,
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.production = config.get('NODE_ENV') === 'production';
  }

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
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.accountants.changePassword(accountantId, dto);
    res.cookie(
      SESSION_COOKIE,
      await this.auth.signSession(accountantId),
      cookieOptions(SESSION_TTL_SECONDS, this.production),
    );
  }
}
