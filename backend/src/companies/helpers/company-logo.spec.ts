import { BadRequestException } from '@nestjs/common';
import {
  detectLogoType,
  MAX_LOGO_BYTES,
  validateLogo,
} from './company-logo.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

describe('detectLogoType', () => {
  it('recognises PNG and JPEG by their signature', () => {
    expect(detectLogoType(PNG)).toBe('image/png');
    expect(detectLogoType(JPEG)).toBe('image/jpeg');
  });

  it('rejects anything else, whatever the file name says', () => {
    expect(detectLogoType(Buffer.from('<svg></svg>'))).toBeNull();
    expect(detectLogoType(Buffer.from('GIF89a'))).toBeNull();
  });
});

describe('validateLogo', () => {
  it('accepts a PNG and returns its content type', () => {
    expect(validateLogo(PNG)).toEqual({
      content: PNG,
      contentType: 'image/png',
    });
  });

  it('requires a file', () => {
    expect(() => validateLogo(undefined)).toThrow(BadRequestException);
    expect(() => validateLogo(Buffer.alloc(0))).toThrow(BadRequestException);
  });

  it('rejects files over the size limit', () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_LOGO_BYTES)]);
    expect(() => validateLogo(big)).toThrow('cel mult 512 KB');
  });

  it('rejects other formats', () => {
    expect(() => validateLogo(Buffer.from('<svg/>'))).toThrow('PNG sau JPEG');
  });
});
