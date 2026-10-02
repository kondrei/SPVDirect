import { Global, Module } from '@nestjs/common';
import { TokenCipher } from './crypto/token-cipher.service.js';
import { MailService } from './mail/mail.service.js';

@Global()
@Module({
  providers: [TokenCipher, MailService],
  exports: [TokenCipher, MailService],
})
export class CommonModule {}
