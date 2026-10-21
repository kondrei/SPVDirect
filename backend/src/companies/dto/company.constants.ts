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

export const INVOICE_HEADER = [
  'id',
  'serie',
  'numar',
  'data_emiterii',
  'data_livrarii',
  'scadenta',
  'moneda',
  'cumparator',
  'cui_cumparator',
  'total_fara_tva',
  'tva',
  'total',
  'storno_pentru',
  'creata_la',
];

export const UPLOAD_HEADER = [
  'id',
  'factura_id',
  'mediu',
  'standard',
  'index_incarcare',
  'stare',
  'id_descarcare',
  'eroare',
  'verificata_la',
  'creata_la',
];

export const SPV_HEADER = [
  'id',
  'id_mesaj_anaf',
  'cif',
  'tip',
  'detalii',
  'id_solicitare',
  'data_anaf',
  'descarcat_la',
];

export const EFACTURA_ARCHIVE_HEADER = [
  'id',
  'id_mesaj_anaf',
  'index_incarcare',
  'mediu',
  'directie',
  'standard',
  'tip',
  'numar',
  'data_emiterii',
  'scadenta',
  'moneda',
  'furnizor',
  'cui_furnizor',
  'cumparator',
  'cui_cumparator',
  'total_fara_tva',
  'tva',
  'total',
  'factura_spvdirect',
  'eroare_citire',
  'importata_la',
];
