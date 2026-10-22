import { Global, Module } from '@nestjs/common';
import { ApiLogsModule } from '../api-logs/api-logs.module.js';
import { TokenCipher } from './crypto/token-cipher.service.js';
import { MailService } from './mail/mail.service.js';

@Global()
@Module({
  imports: [ApiLogsModule],
  providers: [TokenCipher, MailService],
  exports: [TokenCipher, MailService],
})
export class CommonModule {}
