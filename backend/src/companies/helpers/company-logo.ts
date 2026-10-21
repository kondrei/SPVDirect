import { BadRequestException } from '@nestjs/common';
import { LogoContentType } from '../dto/company.enums.js';

export const MAX_LOGO_BYTES = 512 * 1024;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

function startsWith(bytes: Buffer, signature: number[]): boolean {
  return signature.every((b, i) => bytes[i] === b);
}

export function detectLogoType(bytes: Buffer): LogoContentType | null {
  if (startsWith(bytes, PNG)) return LogoContentType.Png;
  if (startsWith(bytes, JPEG)) return LogoContentType.Jpeg;
  return null;
}

export function validateLogo(bytes: Buffer | undefined): {
  content: Buffer;
  contentType: LogoContentType;
} {
  if (!bytes || bytes.length === 0) {
    throw new BadRequestException('Alegeți un fișier cu logo-ul firmei');
  }
  if (bytes.length > MAX_LOGO_BYTES) {
    throw new BadRequestException(
      `Logo-ul poate avea cel mult ${MAX_LOGO_BYTES / 1024} KB`,
    );
  }
  const contentType = detectLogoType(bytes);
  if (!contentType) {
    throw new BadRequestException('Logo-ul trebuie să fie PNG sau JPEG');
  }
  return { content: bytes, contentType };
}
