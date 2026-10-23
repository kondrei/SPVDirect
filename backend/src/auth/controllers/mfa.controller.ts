import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PASSWORD_THROTTLE } from '../../common/constants.js';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { MfaCodeDto, MfaPasswordDto } from '../dto/auth.dto.js';
import { MfaMethod } from '../dto/auth.enums.js';
import type { MfaFactor } from '../dto/auth.types.js';
import { AccountantParamGuard } from '../guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { MfaService } from '../services/mfa.service.js';
import { SessionCookieService } from '../services/session-cookie.service.js';

@Controller('accountants/:accountantId/mfa')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly sessionCookieService: SessionCookieService,
  ) {}

  @Get()
  status(@Param('accountantId', ParseIdPipe) accountantId: number) {
    return this.mfaService.status(accountantId);
  }

  @Post('app/setup')
  @HttpCode(200)
  @Throttle(PASSWORD_THROTTLE)
  startAppSetup(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: MfaPasswordDto,
  ) {
    return this.mfaService.startAppSetup(accountantId, dto.password);
  }

  @Post('app/setup/confirm')
  @HttpCode(200)
  @Throttle(PASSWORD_THROTTLE)
  async confirmAppSetup(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: MfaCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.mfaService.confirmAppSetup(
      accountantId,
      dto.code,
    );
    await this.sessionCookieService.issue(res, accountantId);
    return result;
  }

  @Post('email/setup')
  @HttpCode(200)
  @Throttle(PASSWORD_THROTTLE)
  startEmailSetup(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: MfaPasswordDto,
  ) {
    return this.mfaService.startEmailSetup(accountantId, dto.password);
  }

  @Post('email/setup/confirm')
  @HttpCode(200)
  @Throttle(PASSWORD_THROTTLE)
  async confirmEmailSetup(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: MfaCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.mfaService.confirmEmailSetup(
      accountantId,
      dto.code,
    );
    await this.sessionCookieService.issue(res, accountantId);
    return result;
  }

  @Post('recovery-code')
  @HttpCode(200)
  @Throttle(PASSWORD_THROTTLE)
  async regenerateRecoveryCode(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: MfaPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.mfaService.regenerateRecoveryCode(
      accountantId,
      dto.password,
    );
    await this.sessionCookieService.issue(res, accountantId);
    return result;
  }

  @Delete('app')
  @HttpCode(204)
  @Throttle(PASSWORD_THROTTLE)
  disableApp(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: MfaPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    return this.disableAndRenew(accountantId, dto, res, MfaMethod.App);
  }

  @Delete('email')
  @HttpCode(204)
  @Throttle(PASSWORD_THROTTLE)
  disableEmail(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: MfaPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    return this.disableAndRenew(accountantId, dto, res, MfaMethod.Email);
  }

  @Delete()
  @HttpCode(204)
  @Throttle(PASSWORD_THROTTLE)
  disable(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: MfaPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    return this.disableAndRenew(accountantId, dto, res, null);
  }

  private async disableAndRenew(
    accountantId: number,
    dto: MfaPasswordDto,
    res: Response,
    method: MfaFactor | null,
  ): Promise<void> {
    await this.mfaService.disable(accountantId, dto.password, method);
    await this.sessionCookieService.issue(res, accountantId);
  }
}
