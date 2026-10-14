import {
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
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AccountantParamGuard } from '../../auth/guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { SessionCookieService } from '../../auth/services/session-cookie.service.js';
import {
  ANAF_LOOKUP_THROTTLE,
  PASSWORD_THROTTLE,
} from '../../common/constants.js';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { ParseCuiPipe } from '../../companies/dto/company.dto.js';
import { AccountantsService } from '../services/accountants.service.js';
import { ChangePasswordDto, UpdateProfileDto } from '../dto/profile.dto.js';

@Controller('accountants/:accountantId')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class AccountantsController {
  constructor(
    private readonly accountants: AccountantsService,
    private readonly session: SessionCookieService,
  ) {}

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
    @Param('cui', ParseCuiPipe) cui: string,
  ) {
    return this.accountants.lookupFirm(accountantId, cui);
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
    await this.session.issue(res, accountantId);
  }
}
