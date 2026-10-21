export enum AccountStatus {
  Pending = 'pending',
  Active = 'active',
  Deleted = 'deleted',
}

export enum ProfessionalTitle {
  ExpertContabil = 'expert_contabil',
  ContabilAutorizat = 'contabil_autorizat',
}

export enum AnafEnvironment {
  Test = 'test',
  Prod = 'prod',
}

export enum AnafConnectionStatus {
  Active = 'active',
  Expired = 'expired',
  Revoked = 'revoked',
}

export enum AnafConnectionSource {
  Self = 'self',
  Link = 'link',
}

export enum ConnectCallbackStatus {
  Ok = 'ok',
  Error = 'error',
}

export enum BulkCreateStatus {
  Created = 'created',
  Exists = 'exists',
  NotFound = 'not_found',
}

export enum VatCategory {
  Standard = 'S',
  ZeroRated = 'Z',
  Exempt = 'E',
  ReverseCharge = 'AE',
  NotSubject = 'O',
}

export enum Currency {
  RON = 'RON',
  EUR = 'EUR',
  USD = 'USD',
  GBP = 'GBP',
  CHF = 'CHF',
}

export enum PaymentMethod {
  Transfer = 'transfer',
  Numerar = 'numerar',
  Card = 'card',
}

export enum BuyerSource {
  Invoice = 'invoice',
  Company = 'company',
  Anaf = 'anaf',
}

export enum UploadStatus {
  Sending = 'sending',
  Processing = 'processing',
  Ok = 'ok',
  Nok = 'nok',
  Rejected = 'rejected',
}

export enum EfacturaStandard {
  UBL = 'UBL',
  CN = 'CN',
  CII = 'CII',
  RASP = 'RASP',
}

export enum MessageFilter {
  Errors = 'E',
  Received = 'P',
  Sent = 'T',
  BuyerMessage = 'R',
}
