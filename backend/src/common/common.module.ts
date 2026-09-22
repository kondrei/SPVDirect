import { Global, Module } from '@nestjs/common';
import { TokenCipher } from './crypto/token-cipher.service.js';

@Global()
@Module({
  providers: [TokenCipher],
  exports: [TokenCipher],
})
export class CommonModule {}
