export const EDITABLE_COMPANY_FIELDS = [
  'name',
  'iban',
  'bankName',
  'email',
  'phone',
] as const;

export const COMPANY_FIELD_LABELS = {
  name: 'denumire',
  iban: 'IBAN',
  bankName: 'banca',
  email: 'email',
  phone: 'telefon',
  anafConnectionId: 'certificat ANAF',
} as const;

export function companyExportFilename(cui: string, now: Date): string {
  return `firma-${cui}-export-${now.toISOString().slice(0, 10)}.zip`;
}
