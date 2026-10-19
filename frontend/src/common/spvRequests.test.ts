import { describe, expect, it } from 'vitest';
import {
  SPV_INCOME_REASONS,
  SPV_REQUEST_TYPES,
  spvRequestError,
  spvRequestPayload,
  spvRequestType,
  type SpvRequestForm,
} from './spvRequests';

const form = (patch: Partial<SpvRequestForm> = {}): SpvRequestForm => ({
  tip: '',
  cui: '8000000000',
  an: '',
  luna: '',
  motiv: '',
  numarInregistrare: '',
  cuiPunctDeLucru: '',
  ...patch,
});

describe('SPV request types', () => {
  it('has every ANAF type once, each with a readable name', () => {
    const tips = SPV_REQUEST_TYPES.map((t) => t.tip);
    expect(tips).toHaveLength(34);
    expect(new Set(tips).size).toBe(34);
    expect(SPV_REQUEST_TYPES.every((t) => t.label.length > 2)).toBe(true);
    expect(SPV_INCOME_REASONS).toHaveLength(31);
  });

  it('checks only the fields the type needs', () => {
    const fisa = spvRequestType('Fisa Rol');
    expect(spvRequestError(fisa, form())).toBeNull();
    expect(spvRequestError(fisa, form({ cuiPunctDeLucru: 'x1' }))).toBe(
      'CUI-ul punctului de lucru este invalid.',
    );

    const d300 = spvRequestType('D300');
    expect(spvRequestError(d300, form({ an: '2025' }))).toBe(
      'Luna trebuie să fie între 1 și 12.',
    );
    expect(spvRequestError(d300, form({ an: '2025', luna: '3' }))).toBeNull();

    expect(
      spvRequestError(spvRequestType('D208'), form({ an: '2025', luna: '3' })),
    ).toBe('Luna trebuie să fie 6 sau 12.');
    expect(
      spvRequestError(spvRequestType('Duplicat Recipisa'), form()),
    ).toBe('Introduceți numărul de înregistrare al recipisei.');
    expect(spvRequestError(undefined, form())).toBe('Alegeți tipul cererii.');
  });

  it('sends only the fields the type uses', () => {
    const d300 = spvRequestType('D300')!;
    expect(
      spvRequestPayload(
        d300,
        form({ an: '2025', luna: '3', motiv: 'Altele', numarInregistrare: '9' }),
      ),
    ).toEqual({ tip: 'D300', cui: '8000000000', an: 2025, luna: 3 });
    expect(
      spvRequestPayload(spvRequestType('Fisa Rol')!, form()),
    ).toEqual({ tip: 'Fisa Rol', cui: '8000000000' });
  });
});
