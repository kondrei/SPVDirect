import { Command } from '@nestjs/cqrs';
import type { RegisterDto } from '../dto/auth.dto.js';

export class RegisterAccountantCommand extends Command<void> {
  constructor(
    readonly dto: RegisterDto,
    readonly remoteIp?: string,
  ) {
    super();
  }
}
