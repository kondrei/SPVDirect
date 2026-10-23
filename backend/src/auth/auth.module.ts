import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AccountantsModule } from '../accountants/accountants.module.js';
import { ApiLogsModule } from '../api-logs/api-logs.module.js';
import { AuthController } from './controllers/auth.controller.js';
import { MfaController } from './controllers/mfa.controller.js';
import { MfaMailer } from './services/mfa-mailer.service.js';
import { MfaService } from './services/mfa.service.js';
import { AuthService } from './services/auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RecaptchaService } from './services/recaptcha.service.js';
import { SessionCookieService } from './services/session-cookie.service.js';
import { AdminApprovalRetryJob } from './registrations/admin-approval-retry.job.js';
import { RegisterAccountantHandler } from './registrations/register-accountant.handler.js';
import {
  AdminApprovalMailHandler,
  ApprovalNoticeMailHandler,
} from './registrations/registration-mail.handlers.js';
import { RegistrationMailer } from './registrations/services/registration-mailer.service.js';
import { RegistrationsController } from './registrations/registrations.controller.js';
import { RegistrationsService } from './registrations/services/registrations.service.js';
import { ResendAdminApprovalHandler } from './registrations/resend-admin-approval.handler.js';

@Global()
@Module({
  imports: [
    AccountantsModule,
    ApiLogsModule,
    HttpModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController, MfaController, RegistrationsController],
  providers: [
    AuthService,
    SessionCookieService,
    MfaService,
    MfaMailer,
    JwtAuthGuard,
    RecaptchaService,
    RegistrationsService,
    RegisterAccountantHandler,
    AdminApprovalMailHandler,
    ApprovalNoticeMailHandler,
    RegistrationMailer,
    ResendAdminApprovalHandler,
    AdminApprovalRetryJob,
  ],
  exports: [JwtModule, JwtAuthGuard, AuthService, SessionCookieService],
})
export class AuthModule {}
