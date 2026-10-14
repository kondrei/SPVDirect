import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AnafOAuthController } from '../anaf/controllers/anaf-oauth.controller.js';
import { RegistrationsController } from '../auth/registrations/registrations.controller.js';
import { paramPipes } from '../testing/param-pipes.js';
import { ParseLinkTokenPipe } from './parse-token.pipe.js';

describe('ParseLinkTokenPipe', () => {
  const pipe = new ParseLinkTokenPipe();

  it('accepts a 32-byte base64url token', () => {
    const token = randomBytes(32).toString('base64url');
    expect(pipe.transform(token)).toBe(token);
  });

  it.each([
    '',
    'short',
    'a'.repeat(44),
    `${'a'.repeat(42)}=`,
    `${'a'.repeat(42)}/`,
  ])('rejects %j', (value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });

  it.each([
    [AnafOAuthController, 'linkLanding'],
    [AnafOAuthController, 'linkStart'],
    [RegistrationsController, 'confirmApprove'],
    [RegistrationsController, 'confirmReject'],
    [RegistrationsController, 'approve'],
    [RegistrationsController, 'reject'],
  ] as const)('guards %o.%s', (controller, method) => {
    expect(paramPipes(controller, method, 'token')).toContain(
      ParseLinkTokenPipe,
    );
  });
});
