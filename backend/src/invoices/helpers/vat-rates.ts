import { VatCategory } from '../dto/invoice.enums.js';

export const VAT_RATE_CHANGE_DATE = '2025-08-01';

export function allowedVatRates(deliveryDate: string): number[] {
  return deliveryDate >= VAT_RATE_CHANGE_DATE ? [21, 11, 0] : [19, 9, 5, 0];
}

export const DEFAULT_EXEMPTION_REASON: Record<
  Exclude<VatCategory, VatCategory.Standard>,
  string
> = {
  [VatCategory.ZeroRated]: 'Operațiune cu cotă zero de TVA',
  [VatCategory.Exempt]: 'Scutit de TVA conform art. 292 din Codul fiscal',
  [VatCategory.ReverseCharge]:
    'Taxare inversă conform art. 331 din Codul fiscal',
  [VatCategory.NotSubject]: 'Furnizor neînregistrat în scopuri de TVA',
};
