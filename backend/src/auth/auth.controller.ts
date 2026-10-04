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
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AccountantsService } from '../accountants/accountants.service.js';
import { Accountant } from '../accountants/accountant.entity.js';
import { AuthService } from './services/auth.service.js';
import { CurrentAccountantId } from './current-accountant.decorator.js';
import { LoginDto, RegisterDto } from './dto/auth.dto.js';
import { CREDENTIALS_THROTTLE } from '../common/constants.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RegisterAccountantCommand } from './registrations/register-accountant.command.js';
import {
  cookieOptions,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from './session.js';

@Controller('auth')
export class AuthController {
  private readonly production: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly accountants: AccountantsService,
    private readonly commands: CommandBus,
    config: ConfigService,
  ) {
    this.production = config.get('NODE_ENV') === 'production';
  }

  @Post('register')
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(202)
  async register(@Body() dto: RegisterDto, @Ip() ip: string) {
    await this.commands.execute(new RegisterAccountantCommand(dto, ip));
    return { status: 'pending' as const };
  }

  @Post('login')
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const accountant = await this.auth.validateLogin(dto);
    await this.setSession(res, accountant.id);
    return toPublic(accountant);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentAccountantId() accountantId: number) {
    const accountant = await this.accountants.findById(accountantId);
    if (!accountant) throw new NotFoundException();
    return toPublic(accountant);
  }

  private async setSession(res: Response, accountantId: number) {
    const token = await this.auth.signSession(accountantId);
    res.cookie(
      SESSION_COOKIE,
      token,
      cookieOptions(SESSION_TTL_SECONDS, this.production),
    );
  }
}

function toPublic(a: Accountant) {
  return { id: a.id, email: a.email, name: a.name, createdAt: a.createdAt };
}
