import { Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PUBLIC_LINK_THROTTLE } from '../../common/constants.js';
import {
  escapeHtml,
  renderPage,
  sendHtmlPage as send,
} from '../../common/html.js';
import { ParseLinkTokenPipe } from '../../common/parse-token.pipe.js';
import type { PendingRegistration } from '../dto/auth.types.js';
import { RegistrationsService } from './services/registrations.service.js';
import { RegistrationDecision } from '../dto/auth.enums.js';

const INVALID = 'Cererea nu există sau a fost deja aprobată ori respinsă.';

const CONFIRM: Record<
  RegistrationDecision,
  { title: string; button: string; note: string }
> = {
  [RegistrationDecision.Approve]: {
    title: 'Aprobare cont',
    button: 'Aprobă contul',
    note: 'Utilizatorul se va putea autentifica imediat și va primi un email de confirmare.',
  },
  [RegistrationDecision.Reject]: {
    title: 'Respingere cerere',
    button: 'Respinge și blochează emailul',
    note: 'Cererea se șterge, iar adresa de email nu va mai putea fi folosită pentru înregistrare.',
  },
};

@Controller('auth/registrations')
@Throttle(PUBLIC_LINK_THROTTLE)
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Get(':token/approve')
  confirmApprove(
    @Param('token', ParseLinkTokenPipe) token: string,
    @Res() res: Response,
  ) {
    return this.confirm(res, token, RegistrationDecision.Approve);
  }

  @Get(':token/reject')
  confirmReject(
    @Param('token', ParseLinkTokenPipe) token: string,
    @Res() res: Response,
  ) {
    return this.confirm(res, token, RegistrationDecision.Reject);
  }

  @Post(':token/approve')
  @HttpCode(200)
  async approve(
    @Param('token', ParseLinkTokenPipe) token: string,
    @Res() res: Response,
  ) {
    const done = await this.registrationsService.approve(token);
    if (!done) return send(res, 404, 'Link invalid', INVALID);
    return send(
      res,
      200,
      'Cont aprobat',
      `Contul ${describe(done)} a fost aprobat.`,
    );
  }

  @Post(':token/reject')
  @HttpCode(200)
  async reject(
    @Param('token', ParseLinkTokenPipe) token: string,
    @Res() res: Response,
  ) {
    const done = await this.registrationsService.reject(token);
    if (!done) return send(res, 404, 'Link invalid', INVALID);
    return send(
      res,
      200,
      'Cerere respinsă',
      `Cererea ${describe(done)} a fost respinsă, iar adresa de email a fost blocată.`,
    );
  }

  private async confirm(
    res: Response,
    token: string,
    decision: RegistrationDecision,
  ) {
    const pending = await this.registrationsService.findPending(token);
    if (!pending) return send(res, 404, 'Link invalid', INVALID);
    const c = CONFIRM[decision];
    const action = `/auth/registrations/${encodeURIComponent(token)}/${decision}`;
    return res.type('html').send(
      renderPage(
        c.title,
        `<h1>${escapeHtml(c.title)}</h1>
<p>${describe(pending)} a cerut un cont SPVDirect pe ${escapeHtml(pending.createdAt.toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' }))}.</p>
<p class="muted">${escapeHtml(c.note)}</p>
<form method="post" action="${escapeHtml(action)}">
  <button type="submit" class="btn${decision === RegistrationDecision.Reject ? ' btn-danger' : ''}">${escapeHtml(c.button)}</button>
</form>`,
      ),
    );
  }
}

function describe(p: PendingRegistration): string {
  const email = `&lt;${escapeHtml(p.email)}&gt;`;
  return p.name ? `<strong>${escapeHtml(p.name)}</strong> ${email}` : email;
}
