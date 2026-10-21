export enum BulkCreateStatus {
  Created = 'created',
  Exists = 'exists',
  NotFound = 'not_found',
}

export enum LogoContentType {
  Png = 'image/png',
  Jpeg = 'image/jpeg',
}

export enum CompanyExportFile {
  Company = 'firma.json',
  Invoices = 'facturi.json',
  InvoiceList = 'facturi.csv',
  InvoicesFolder = 'facturi',
  Uploads = 'efactura.csv',
  EfacturaArchiveList = 'efactura-arhiva.csv',
  EfacturaArchiveFolder = 'efactura-arhiva',
  Spv = 'spv',
  Logo = 'logo',
  Errors = 'erori.txt',
}
