import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AccountantParamGuard } from '../../auth/accountant-param.guard.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { AuthorizationLinksService } from './authorization-links.service.js';

@Controller(
  'accountants/:accountantId/companies/:companyId/authorization-links',
)
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class AuthorizationLinksController {
  constructor(private readonly links: AuthorizationLinksService) {}

  @Post()
  create(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('companyId', ParseIdPipe) companyId: number,
  ) {
    return this.links.create(accountantId, companyId);
  }
}
