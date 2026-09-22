import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentAccountantId } from '../../auth/current-accountant.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { AuthorizationLinksService } from './authorization-links.service.js';

@Controller('companies/:companyId/authorization-links')
@UseGuards(JwtAuthGuard)
export class AuthorizationLinksController {
  constructor(private readonly links: AuthorizationLinksService) {}

  /** Returns a one-time URL to send to the company's certificate holder. */
  @Post()
  create(
    @CurrentAccountantId() accountantId: string,
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ) {
    return this.links.create(accountantId, companyId);
  }
}
