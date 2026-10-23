import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AccountantParamGuard } from '../../auth/guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { AuthorizationLinksService } from './authorization-links.service.js';

@Controller(
  'accountants/:accountantId/companies/:companyId/authorization-links',
)
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class AuthorizationLinksController {
  constructor(
    private readonly authorizationLinksService: AuthorizationLinksService,
  ) {}

  @Post()
  create(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('companyId', ParseIdPipe) companyId: number,
  ) {
    return this.authorizationLinksService.create(accountantId, companyId);
  }
}
