import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AccountantsService } from '../../accountants/services/accountants.service.js';
import { loggedIn } from '../../api-logs/activity-entries.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { Accountant } from '../../accountants/accountant.entity.js';
import { AuthService } from '../services/auth.service.js';
import { CurrentAccountantId } from '../decorators/current-accountant.decorator.js';
import { LoginDto, RegisterDto } from '../dto/auth.dto.js';
import { CREDENTIALS_THROTTLE } from '../../common/constants.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { RegisterAccountantCommand } from '../registrations/register-accountant.command.js';
import { SessionCookieService } from '../services/session-cookie.service.js';
import { AccountStatus } from '../../accountants/dto/accountant.enums.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly accountants: AccountantsService,
    private readonly commands: CommandBus,
    private readonly session: SessionCookieService,
    private readonly activity: ActivityLogsService,
  ) {}

  @Post('register')
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(202)
  async register(@Body() dto: RegisterDto, @Ip() ip: string) {
    await this.commands.execute(new RegisterAccountantCommand(dto, ip));
    return { status: AccountStatus.Pending };
  }

  @Post('login')
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const accountant = await this.auth.validateLogin(dto);
    await this.session.issue(res, accountant.id);
    await this.activity.record(accountant.id, loggedIn());
    return toPublic(accountant);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    this.session.clear(res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentAccountantId() accountantId: number) {
    const accountant = await this.accountants.findById(accountantId);
    if (!accountant) throw new NotFoundException();
    return toPublic(accountant);
  }
}

function toPublic(a: Accountant) {
  return { id: a.id, email: a.email, name: a.name, createdAt: a.createdAt };
}
