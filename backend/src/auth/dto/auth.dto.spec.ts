import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './auth.dto.js';
import { MfaMethod } from './auth.enums.js';

async function errorsOf(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(RegisterDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property);
}

const base = {
  email: 'ana@example.ro',
  password: 'a-long-password',
  captchaToken: 'captcha',
};

describe('RegisterDto.mfaMethod', () => {
  it('is optional', async () => {
    expect(await errorsOf(base)).toEqual([]);
  });

  it.each([MfaMethod.App, MfaMethod.Email])('accepts %s', async (mfaMethod) => {
    expect(await errorsOf({ ...base, mfaMethod })).toEqual([]);
  });

  it.each([MfaMethod.Recovery, 'sms', 1])('refuses %s', async (mfaMethod) => {
    expect(await errorsOf({ ...base, mfaMethod })).toEqual(['mfaMethod']);
  });
});
