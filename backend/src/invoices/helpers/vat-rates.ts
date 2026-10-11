import type { VatCategory } from '../invoice.types.js';

export const VAT_RATE_CHANGE_DATE = '2025-08-01';

export function allowedVatRates(deliveryDate: string): number[] {
  return deliveryDate >= VAT_RATE_CHANGE_DATE ? [21, 11, 0] : [19, 9, 5, 0];
}

export const DEFAULT_EXEMPTION_REASON: Record<
  Exclude<VatCategory, 'S'>,
  string
> = {
  Z: 'Operațiune cu cotă zero de TVA',
  E: 'Scutit de TVA conform art. 292 din Codul fiscal',
  AE: 'Taxare inversă conform art. 331 din Codul fiscal',
  O: 'Furnizor neînregistrat în scopuri de TVA',
};
