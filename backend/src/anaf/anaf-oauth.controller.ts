import {
  Controller,
  Get,
  Logger,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { CurrentAccountantId } from '../auth/current-accountant.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { cookieOptions } from '../auth/session.js';
import { escapeHtml, renderPage } from '../common/html.js';
import { CompaniesService } from '../companies/companies.service.js';
import { AnafOAuthService } from './anaf-oauth.service.js';
import {
  AuthorizationLinksService,
  LinkLookup,
} from './authorization-links/authorization-links.service.js';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  OAuthStatePayload,
} from './oauth-state.js';

const LINK_ERRORS: Record<Exclude<LinkLookup, { ok: true }>['reason'], string> =
  {
    not_found: 'Linkul de autorizare nu este valid.',
    used: 'Acest link de autorizare a fost deja folosit.',
    expired: 'Linkul de autorizare a expirat. Cereți contabilului un link nou.',
  };

@Controller('anaf')
export class AnafOAuthController {
  private readonly logger = new Logger(AnafOAuthController.name);
  private readonly production: boolean;

  constructor(
    private readonly oauth: AnafOAuthService,
    private readonly links: AuthorizationLinksService,
    private readonly companies: CompaniesService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.production = config.get('NODE_ENV') === 'production';
  }

  /** (A) Accountant connects their own certificate. */
  @Get('connect')
  @UseGuards(JwtAuthGuard)
  async connect(
    @CurrentAccountantId() accountantId: string,
    @Res() res: Response,
  ) {
    await this.redirectToAnaf(res, { mode: 'self', accountantId });
  }

  /** (B) Public landing page of an authorization link, opened by the certificate holder. */
  @Get('authorize/:token')
  async linkLanding(@Param('token') token: string, @Res() res: Response) {
    const lookup = await this.links.findByToken(token);
    if (!lookup.ok) {
      return this.sendPage(
        res,
        400,
        'Link invalid',
        LINK_ERRORS[lookup.reason],
      );
    }
    const { company } = lookup;
    return res.type('html').send(
      renderPage(
        'Autorizare ANAF',
        `<h1>Autorizare acces ANAF</h1>
<p>Contabilul dvs. solicită acces la serviciile ANAF (e-Factura, e-Transport) pentru firma
<strong>${escapeHtml(company.name)}</strong> (CUI ${escapeHtml(company.cui)}), prin aplicația SPVDirect.</p>
<ul>
  <li>Aveți nevoie de certificatul digital calificat (token USB sau certificat în cloud) înregistrat în SPV.</li>
  <li>Veți fi redirecționat către <strong>logincert.anaf.ro</strong>, unde alegeți certificatul și introduceți PIN-ul.</li>
  <li>SPVDirect nu primește certificatul sau PIN-ul, doar un token de acces emis de ANAF, valabil 90 de zile.</li>
</ul>
<a class="btn" href="/anaf/authorize/${encodeURIComponent(token)}/start">Autorizează cu certificatul</a>
<p class="muted">Linkul expiră la ${lookup.link.expiresAt.toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' })}.</p>`,
      ),
    );
  }

  @Get('authorize/:token/start')
  async linkStart(@Param('token') token: string, @Res() res: Response) {
    const lookup = await this.links.findByToken(token);
    if (!lookup.ok) {
      return this.sendPage(
        res,
        400,
        'Link invalid',
        LINK_ERRORS[lookup.reason],
      );
    }
    await this.redirectToAnaf(res, { mode: 'link', linkId: lookup.link.id });
  }

  /** Redirect target registered at ANAF (ANAF_REDIRECT_URI). */
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const payload = await this.readState(req);
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
    if (!payload) {
      return this.sendPage(
        res,
        400,
        'Sesiune expirată',
        'Sesiunea de autorizare a expirat sau lipsește. Porniți din nou autorizarea.',
      );
    }
    // ANAF's reference flow leaves `state` empty; when it is echoed back it must match.
    if (state !== undefined && state !== payload.state) {
      return this.fail(res, payload, 'Parametrul state nu corespunde.');
    }
    if (error || !code) {
      return this.fail(
        res,
        payload,
        `ANAF a refuzat autorizarea (${error ?? 'fără cod'}).`,
      );
    }

    try {
      const tokens = await this.oauth.exchangeCode(code);

      if (payload.mode === 'self') {
        await this.oauth.saveConnection(payload.accountantId, tokens, 'self');
        return res.redirect(this.frontendUrl('/connections?status=ok'));
      }

      const lookup = await this.links.findById(payload.linkId);
      if (!lookup.ok) {
        return this.sendPage(
          res,
          400,
          'Link invalid',
          LINK_ERRORS[lookup.reason],
        );
      }
      const connection = await this.oauth.saveConnection(
        lookup.link.accountantId,
        tokens,
        'link',
      );
      if (!(await this.links.markUsed(lookup.link.id, connection.id))) {
        return this.sendPage(res, 409, 'Link folosit', LINK_ERRORS.used);
      }
      await this.companies.attachConnection(lookup.company.id, connection.id);
      return this.sendPage(
        res,
        200,
        'Autorizare reușită',
        `Autorizarea pentru ${escapeHtml(lookup.company.name)} a reușit. Puteți închide această pagină.`,
      );
    } catch (err) {
      this.logger.error(`ANAF callback failed: ${String(err)}`);
      return this.fail(res, payload, 'Nu s-a putut obține tokenul de la ANAF.');
    }
  }

  private async redirectToAnaf(
    res: Response,
    flow:
      { mode: 'self'; accountantId: string } | { mode: 'link'; linkId: string },
  ) {
    const state = randomBytes(24).toString('base64url');
    const payload: OAuthStatePayload = { ...flow, state };
    const signed = await this.jwt.signAsync(payload, {
      expiresIn: OAUTH_STATE_TTL_SECONDS,
    });
    res.cookie(
      OAUTH_STATE_COOKIE,
      signed,
      cookieOptions(OAUTH_STATE_TTL_SECONDS, this.production),
    );
    res.redirect(this.oauth.buildAuthorizeUrl(state));
  }

  private async readState(req: Request): Promise<OAuthStatePayload | null> {
    const raw = (req.cookies as Record<string, string> | undefined)?.[
      OAUTH_STATE_COOKIE
    ];
    if (!raw) return null;
    try {
      return await this.jwt.verifyAsync<OAuthStatePayload>(raw);
    } catch {
      return null;
    }
  }

  private fail(res: Response, payload: OAuthStatePayload, message: string) {
    if (payload.mode === 'self') {
      return res.redirect(
        this.frontendUrl(
          `/connections?status=error&message=${encodeURIComponent(message)}`,
        ),
      );
    }
    return this.sendPage(res, 400, 'Autorizare eșuată', escapeHtml(message));
  }

  private sendPage(
    res: Response,
    status: number,
    title: string,
    messageHtml: string,
  ) {
    return res
      .status(status)
      .type('html')
      .send(
        renderPage(title, `<h1>${escapeHtml(title)}</h1><p>${messageHtml}</p>`),
      );
  }

  private frontendUrl(path: string): string {
    return `${this.config.getOrThrow<string>('FRONTEND_URL')}${path}`;
  }
}
