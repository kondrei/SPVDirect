import { maskEmail, newEmailCode, newRecoveryCode } from './codes.js';

describe('MFA codes', () => {
  it('makes 5-digit recovery codes and 6-digit email codes, zero-padded', () => {
    for (let i = 0; i < 200; i++) {
      expect(newRecoveryCode()).toMatch(/^\d{5}$/);
      expect(newEmailCode()).toMatch(/^\d{6}$/);
    }
  });

  it('masks the mailbox but keeps the domain', () => {
    expect(maskEmail('andrei@cabinet.ro')).toBe('a***@cabinet.ro');
    expect(maskEmail('a@b.ro')).toBe('a***@b.ro');
    expect(maskEmail('fara-arond')).toBe('***');
  });
});
