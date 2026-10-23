import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AccountantsService } from '../../accountants/services/accountants.service.js';
import { loggedIn } from '../../api-logs/activity-entries.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { Accountant } from '../../accountants/accountant.entity.js';
import { AuthService } from '../services/auth.service.js';
import { CurrentAccountantId } from '../decorators/current-accountant.decorator.js';
import { LoginDto, MfaLoginDto, RegisterDto } from '../dto/auth.dto.js';
import { MFA_LOGIN_EXPIRED } from '../dto/auth.constants.js';
import type { MfaRequired } from '../dto/auth.types.js';
import { MfaService } from '../services/mfa.service.js';
import { CREDENTIALS_THROTTLE } from '../../common/constants.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { RegisterAccountantCommand } from '../registrations/register-accountant.command.js';
import { SessionCookieService } from '../services/session-cookie.service.js';
import { AccountStatus } from '../../accountants/dto/accountant.enums.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountantsService: AccountantsService,
    private readonly commandBus: CommandBus,
    private readonly sessionCookieService: SessionCookieService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly mfaService: MfaService,
  ) {}

  @Post('register')
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(202)
  async register(@Body() dto: RegisterDto, @Ip() ip: string) {
    await this.commandBus.execute(new RegisterAccountantCommand(dto, ip));
    return { status: AccountStatus.Pending };
  }

  @Post('login')
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const accountant = await this.authService.validateLogin(dto);
    const methods = await this.mfaService.factors(accountant.id);
    if (
      methods.length &&
      !this.mfaService.trustsDevice(
        accountant,
        await this.sessionCookieService.readMfaTrust(req),
      )
    ) {
      this.sessionCookieService.clear(res);
      await this.sessionCookieService.issueMfaPending(res, accountant.id);
      const required: MfaRequired = { mfaRequired: true, methods };
      return required;
    }
    await this.sessionCookieService.issue(res, accountant.id);
    await this.activityLogsService.record(accountant.id, loggedIn());
    return toPublic(accountant);
  }

  @Post('login/mfa')
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(200)
  async loginMfa(
    @Body() dto: MfaLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const accountantId = await this.pendingAccountant(req);
    await this.mfaService.verifyLogin(accountantId, dto.code, dto.method);
    const accountant = await this.accountantsService.findById(accountantId);
    if (!accountant) throw new UnauthorizedException(MFA_LOGIN_EXPIRED);
    this.sessionCookieService.clearMfaPending(res);
    await this.sessionCookieService.issue(res, accountantId);
    if (dto.rememberDevice) {
      await this.sessionCookieService.issueMfaTrust(res, accountantId);
    }
    await this.activityLogsService.record(accountantId, loggedIn());
    return toPublic(accountant);
  }

  @Post('login/mfa/email')
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(200)
  async sendLoginEmailCode(@Req() req: Request) {
    return this.mfaService.sendLoginEmailCode(
      await this.pendingAccountant(req),
    );
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    this.sessionCookieService.clear(res);
    this.sessionCookieService.clearMfaPending(res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentAccountantId() accountantId: number) {
    const accountant = await this.accountantsService.findById(accountantId);
    if (!accountant) throw new NotFoundException();
    return toPublic(accountant);
  }

  private async pendingAccountant(req: Request): Promise<number> {
    const pending = await this.sessionCookieService.readMfaPending(req);
    if (
      !pending ||
      !(await this.authService.isSessionValid(
        pending.accountantId,
        pending.issuedAt,
      ))
    ) {
      throw new UnauthorizedException(MFA_LOGIN_EXPIRED);
    }
    return pending.accountantId;
  }
}

function toPublic(a: Accountant) {
  return { id: a.id, email: a.email, name: a.name, createdAt: a.createdAt };
}
