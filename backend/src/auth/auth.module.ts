import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Accountant } from '../accountants/accountant.entity.js';
import { AccountantsModule } from '../accountants/accountants.module.js';
import { ApiLogsModule } from '../api-logs/api-logs.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './services/auth.service.js';
import { BannedEmail } from './banned-email.entity.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RecaptchaService } from './services/recaptcha.service.js';
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
    TypeOrmModule.forFeature([Accountant, BannedEmail]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController, RegistrationsController],
  providers: [
    AuthService,
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
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
