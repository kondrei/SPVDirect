import type { AnafTvaRecord } from '../../companies/helpers/anaf-company-info.js';

export interface ParsedAddress {
  street: string | null;
  city: string | null;
  county: string | null;
  postalCode: string | null;
}

const EMPTY: ParsedAddress = {
  street: null,
  city: null,
  county: null,
  postalCode: null,
};

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function bucharestSector(locality: string): string | null {
  const match = /sector(?:ul)?\s*([1-6])/i.exec(locality);
  return match ? `SECTOR${match[1]}` : null;
}

export function parseAnafAddress(
  record: AnafTvaRecord | null | undefined,
): ParsedAddress {
  const seat = record?.adresa_sediu_social;
  if (!seat) return EMPTY;
  const countyCode = clean(seat.scod_JudetAuto)?.toUpperCase() ?? null;
  const locality = clean(seat.sdenumire_Localitate);
  const number = clean(seat.snumar_Strada);
  const street = [
    clean(seat.sdenumire_Strada),
    number ? `nr. ${number}` : null,
    clean(seat.sdetalii_Adresa),
  ]
    .filter(Boolean)
    .join(', ');
  const city =
    countyCode === 'B' && locality
      ? (bucharestSector(locality) ?? locality)
      : locality;
  return {
    street: street || null,
    city,
    county: countyCode ? `RO-${countyCode}` : null,
    postalCode: clean(seat.scod_Postal),
  };
}
