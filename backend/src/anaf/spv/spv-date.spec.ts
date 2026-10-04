import { parseAnafDateTime } from './spv-date.js';

describe('parseAnafDateTime', () => {
  it('reads Bucharest winter time (UTC+2)', () => {
    expect(parseAnafDateTime('20.12.2017 12:00:00')?.toISOString()).toBe(
      '2017-12-20T10:00:00.000Z',
    );
  });

  it('reads Bucharest summer time (UTC+3)', () => {
    expect(parseAnafDateTime('15.07.2024 12:30:15')?.toISOString()).toBe(
      '2024-07-15T09:30:15.000Z',
    );
  });

  it('accepts a date without time as midnight Bucharest time', () => {
    expect(parseAnafDateTime('20.12.2017')?.toISOString()).toBe(
      '2017-12-19T22:00:00.000Z',
    );
  });

  it.each([null, '', 'ieri', '2017-12-20 12:00:00', '31.02.2024 10:00:00'])(
    'returns null for %s',
    (value) => {
      expect(parseAnafDateTime(value)).toBeNull();
    },
  );
});
