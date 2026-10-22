import { REDACTED } from '../constants.js';
import { maskText, redact, redactObject } from './redact.js';

describe('maskText', () => {
  it('masks email addresses, CNPs and JWTs', () => {
    expect(
      maskText(
        'Factura a fost trimisă pe email la ana.pop+f@client.example.ro, CNP 1850312400017, token eyJhbGciOi.eyJzdWIi.c2ln',
      ),
    ).toBe(
      'Factura a fost trimisă pe email la [email], CNP [cnp], token [token]',
    );
  });

  it('keeps company CUIs, ids and other 13-digit numbers', () => {
    expect(maskText('CUI 12345678, mesaj 3300000123, at 1761134400000')).toBe(
      'CUI 12345678, mesaj 3300000123, at 1761134400000',
    );
  });
});

describe('redactObject', () => {
  it('redacts names and email fields at any depth and keeps the ids', () => {
    expect(
      redactObject({
        accountantId: 1,
        details: {
          invoiceId: 9,
          buyerName: 'Ion Popescu PFA',
          buyerCui: '1850312400017',
          companyName: 'ALFA SRL',
          cui: '123',
          to: ['a@b.ro'],
          attachments: ['Factura-ALFA-1.pdf'],
        },
      }),
    ).toEqual({
      accountantId: 1,
      details: {
        invoiceId: 9,
        buyerName: REDACTED,
        buyerCui: '[cnp]',
        companyName: REDACTED,
        cui: '123',
        to: REDACTED,
        attachments: REDACTED,
      },
    });
  });

  it('drops the free-text description', () => {
    expect(
      redactObject({ endpoint: 'company.created', description: 'x' }),
    ).toEqual({
      endpoint: 'company.created',
    });
  });

  it('never changes the row that goes to the database', () => {
    const details = { emailedTo: 'a@b.ro', note: 'la a@b.ro' };
    redactObject({ details });
    expect(details).toEqual({ emailedTo: 'a@b.ro', note: 'la a@b.ro' });
  });

  it('keeps null fields as null', () => {
    expect(redactObject({ replyTo: null, error: null })).toEqual({
      replyTo: null,
      error: null,
    });
  });
});

describe('redact format', () => {
  it('masks the message and error and drops the description', () => {
    const details = { to: 'a@b.ro' };
    const info = redact().transform({
      level: 'warn',
      message: 'Email to a@b.ro failed',
      error: '550 a@b.ro unknown',
      description: 'trimisă la a@b.ro',
      details,
    });
    expect(info).toEqual({
      level: 'warn',
      message: 'Email to [email] failed',
      error: '550 [email] unknown',
      details: { to: REDACTED },
    });
    expect(details.to).toBe('a@b.ro');
  });
});
