import { BadRequestException } from '@nestjs/common';
import { strFromU8, unzipSync } from 'fflate';
import {
  BYTE_ORDER_MARK,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_UNCOMPRESSED_BYTES,
  SIGNATURE_ENTRY_PREFIX,
} from '../dto/efactura.constants.js';
import type { ExtractedInvoice } from '../dto/efactura.types.js';

class ZipTooLarge extends Error {}

function baseName(name: string): string {
  return (name.split('/').pop() ?? name).toLowerCase();
}

function isInvoiceEntry(name: string): boolean {
  const base = baseName(name);
  return base.endsWith('.xml') && !base.startsWith(SIGNATURE_ENTRY_PREFIX);
}

function unzip(zip: Buffer): Record<string, Uint8Array> {
  let entries = 0;
  let total = 0;
  try {
    return unzipSync(zip, {
      filter: (file) => {
        entries++;
        total += file.originalSize;
        if (entries > MAX_ZIP_ENTRIES || total > MAX_ZIP_UNCOMPRESSED_BYTES) {
          throw new ZipTooLarge();
        }
        return isInvoiceEntry(file.name);
      },
    });
  } catch (err) {
    throw new BadRequestException(
      err instanceof ZipTooLarge
        ? 'Arhiva ANAF este prea mare'
        : 'Arhiva ANAF nu poate fi citită',
    );
  }
}

export function extractInvoiceXml(zip: Buffer): ExtractedInvoice | null {
  const files = unzip(zip);
  const name = Object.keys(files)
    .filter((entry) => isInvoiceEntry(entry))
    .sort((a, b) => a.localeCompare(b))[0];
  if (!name) return null;
  const index = /^(\d{1,20})\.xml$/.exec(baseName(name));
  const xml = strFromU8(files[name]);
  return {
    xml: xml.codePointAt(0) === BYTE_ORDER_MARK ? xml.slice(1) : xml,
    uploadIndex: index ? index[1] : null,
  };
}
