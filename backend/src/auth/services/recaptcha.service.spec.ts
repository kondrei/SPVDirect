import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { RecaptchaService } from './recaptcha.service.js';

const URL = 'https://www.google.com/recaptcha/api/siteverify';

function setup(data: unknown) {
  const post = vi.fn().mockResolvedValue({ status: 200, data });
  const service = new RecaptchaService(
    new ConfigService({
      RECAPTCHA_SECRET_KEY: 'secret',
      RECAPTCHA_MIN_SCORE: 0.5,
      RECAPTCHA_VERIFY_URL: URL,
    }),
    { axiosRef: { post } } as unknown as HttpService,
  );
  return { service, post };
}

const human = { success: true, score: 0.9, action: 'register' };

describe('RecaptchaService', () => {
  it('posts secret, token and IP form-encoded to siteverify', async () => {
    const { service, post } = setup(human);
    await service.verify('tok', 'register', '1.2.3.4');
    const [url, body, opts] = post.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe(URL);
    expect(Object.fromEntries(new URLSearchParams(body))).toEqual({
      secret: 'secret',
      response: 'tok',
      remoteip: '1.2.3.4',
    });
    expect(opts.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
  });

  it('accepts a human score for the expected action', async () => {
    await expect(
      setup(human).service.verify('tok', 'register'),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['an unsuccessful check', { success: false, 'error-codes': ['bad'] }],
    ['a low score', { ...human, score: 0.1 }],
    ['another action', { ...human, action: 'login' }],
    ['a missing score (v2 token)', { success: true, action: 'register' }],
    ['a non-JSON body', ''],
  ])('rejects %s with 400', async (_, data) => {
    await expect(
      setup(data).service.verify('tok', 'register'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps a network failure to 503', async () => {
    const { service, post } = setup(human);
    post.mockRejectedValue(new Error('ECONNRESET'));
    await expect(service.verify('tok', 'register')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
