import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto, UpdateProfileDto } from './profile.dto.js';

async function check<T extends object>(
  cls: new () => T,
  body: Record<string, unknown>,
) {
  const dto = plainToInstance(cls, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors: errors.map((e) => e.property) };
}

describe('UpdateProfileDto', () => {
  it('accepts a full profile and normalizes the firm CUI', async () => {
    const { dto, errors } = await check(UpdateProfileDto, {
      name: '  Ana Pop ',
      phone: '+40 722 000 000',
      ceccarMember: true,
      professionalTitle: 'expert_contabil',
      ceccarNumber: '12345/2010',
      ceccarBranch: 'București',
      ccfNumber: '321',
      firmName: 'Cabinet Pop',
      firmCui: 'RO 12345678',
    });
    expect(errors).toEqual([]);
    expect(dto.name).toBe('Ana Pop');
    expect(dto.firmCui).toBe('12345678');
  });

  it('turns blank strings into null', async () => {
    const { dto, errors } = await check(UpdateProfileDto, {
      phone: '   ',
      firmCui: '',
      professionalTitle: '',
    });
    expect(errors).toEqual([]);
    expect(dto).toMatchObject({
      phone: null,
      firmCui: null,
      professionalTitle: null,
    });
  });

  it('rejects invalid values', async () => {
    const { errors } = await check(UpdateProfileDto, {
      phone: 'abc',
      ceccarMember: 'yes',
      professionalTitle: 'auditor',
      ceccarNumber: '12 34',
      firmCui: '1',
    });
    expect(errors.sort()).toEqual([
      'ceccarMember',
      'ceccarNumber',
      'firmCui',
      'phone',
      'professionalTitle',
    ]);
  });

  it('does not allow changing the email or password through the profile', async () => {
    const { errors } = await check(UpdateProfileDto, {
      email: 'x@example.com',
      passwordHash: 'x',
    });
    expect(errors.sort()).toEqual(['email', 'passwordHash']);
  });
});

describe('ChangePasswordDto', () => {
  it('requires a new password of at least 10 characters', async () => {
    const { errors } = await check(ChangePasswordDto, {
      currentPassword: 'old',
      newPassword: 'short',
    });
    expect(errors).toEqual(['newPassword']);
  });

  it('requires the current password', async () => {
    const { errors } = await check(ChangePasswordDto, {
      newPassword: 'a-long-password',
    });
    expect(errors).toEqual(['currentPassword']);
  });
});
