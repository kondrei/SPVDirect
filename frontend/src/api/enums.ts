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

export enum EfacturaDirection {
  Received = 'received',
  Sent = 'sent',
}

export enum ImportStatus {
  Imported = 'imported',
  Already = 'already',
  Skipped = 'skipped',
  Failed = 'failed',
}

export enum MessageFilter {
  Errors = 'E',
  Received = 'P',
  Sent = 'T',
  BuyerMessage = 'R',
}

export enum MfaMethod {
  App = 'app',
  Email = 'email',
  Recovery = 'recovery',
}

export enum ActivityAction {
  LoggedIn = 'account.logged_in',
  ProfileUpdated = 'account.profile_updated',
  PasswordChanged = 'account.password_changed',
  MfaEnabled = 'account.mfa_enabled',
  MfaDisabled = 'account.mfa_disabled',
  MfaRecoveryUsed = 'account.mfa_recovery_used',
  MfaRecoveryRegenerated = 'account.mfa_recovery_regenerated',
  AccountExported = 'account.exported',
  CompanyCreated = 'company.created',
  CompanyUpdated = 'company.updated',
  CompanyAnafRefreshed = 'company.anaf_refreshed',
  CompanyLogoChanged = 'company.logo_changed',
  CompanyExported = 'company.exported',
  CompanyDeleted = 'company.deleted',
  CompaniesPurged = 'company.purged',
  InvoiceIssued = 'invoice.issued',
  InvoiceStorno = 'invoice.storno',
  InvoiceSent = 'invoice.sent',
  InvoiceStored = 'invoice.stored',
  EfacturaUploaded = 'efactura.uploaded',
  EfacturaStatusChecked = 'efactura.status_checked',
  EfacturaDownloaded = 'efactura.downloaded',
  EfacturaMessagesLoaded = 'efactura.messages_loaded',
  EfacturaValidated = 'efactura.validated',
  EfacturaTransformed = 'efactura.transformed',
  EfacturaArchiveImported = 'efactura.archive_imported',
  EfacturaArchiveEmailed = 'efactura.archive_emailed',
  EfacturaArchiveSyncFailed = 'efactura.archive_sync_failed',
  SpvImported = 'spv.imported',
  SpvDocumentSaved = 'spv.document_saved',
  CertificateConnected = 'certificate.connected',
  CertificateRenamed = 'certificate.renamed',
  CertificateRemoved = 'certificate.removed',
  CertificateTested = 'certificate.tested',
  AuthorizationLinkCreated = 'authorization_link.created',
}
