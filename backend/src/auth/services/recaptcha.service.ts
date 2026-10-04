import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';

export const RECAPTCHA_FAILED =
  'Verificarea anti-robot a eșuat. Reîncărcați pagina și reîncercați.';

interface SiteVerifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
}

@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly http: HttpService,
  ) {}

  async verify(token: string, action: string, remoteIp?: string) {
    const body = new URLSearchParams({
      secret: this.config.get('RECAPTCHA_SECRET_KEY', { infer: true }),
      response: token,
    });
    if (remoteIp) body.set('remoteip', remoteIp);

    let data: SiteVerifyResponse | undefined;
    try {
      const res = await this.http.axiosRef.post<SiteVerifyResponse>(
        this.config.get('RECAPTCHA_VERIFY_URL', { infer: true }),
        body.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10_000,
        },
      );
      data = res.data;
    } catch (err) {
      this.logger.warn(
        `reCAPTCHA siteverify unreachable: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Verificarea anti-robot nu este disponibilă momentan. Reîncercați în câteva minute.',
      );
    }

    const minScore = this.config.get('RECAPTCHA_MIN_SCORE', { infer: true });
    if (
      !data?.success ||
      data.action !== action ||
      typeof data.score !== 'number' ||
      data.score < minScore
    ) {
      this.logger.warn(
        `reCAPTCHA rejected: success=${data?.success} action=${data?.action} score=${data?.score} errors=${(data?.['error-codes'] ?? []).join(',')}`,
      );
      throw new BadRequestException(RECAPTCHA_FAILED);
    }
  }
}
