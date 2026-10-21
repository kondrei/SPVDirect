export const CONNECTION_HEADER = [
  'id',
  'eticheta',
  'serie_certificat',
  'drepturi',
  'sursa',
  'stare',
  'acces_expira_la',
  'reimprospatare_expira_la',
  'creat_la',
];

export const COMPANY_HEADER = ['id', 'cui', 'denumire', 'dosar', 'adaugata_la'];

export const ACTIVITY_HEADER = [
  'data',
  'utilizator',
  'operatiune',
  'firma_id',
  'descriere',
  'detalii',
];

export function accountExportFilename(now: Date): string {
  return `cont-spvdirect-export-${now.toISOString().slice(0, 10)}.zip`;
}
