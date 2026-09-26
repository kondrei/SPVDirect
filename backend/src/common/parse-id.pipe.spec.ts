import { BadRequestException } from '@nestjs/common';
import { ParseIdPipe } from './parse-id.pipe.js';

const pipe = new ParseIdPipe();

describe('ParseIdPipe', () => {
  it.each([
    ['1', 1],
    ['42', 42],
    ['2147483647', 2_147_483_647],
  ])('accepts %s', (value, expected) => {
    expect(pipe.transform(value)).toBe(expected);
  });

  it.each([
    '0',
    '-1',
    '1.5',
    '1e3',
    ' 1',
    'abc',
    '',
    '2147483648',
    '99999999999',
    '0f8fad5b-d9cb-469f-a165-70867728950e',
  ])('rejects %j with 400', (value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });
});
