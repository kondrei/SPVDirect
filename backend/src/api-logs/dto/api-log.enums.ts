export enum ApiLogService {
  Efactura = 'EFACTURA',
  Spv = 'SPV',
  Smtp = 'SMTP',
  TestOAuth = 'TestOAuth',
  PlatitorTva = 'PlatitorTva',
  Activity = 'ACTIVITY',
}

export enum ApiLogMethod {
  Get = 'GET',
  Post = 'POST',
  Put = 'PUT',
  Delete = 'DELETE',
  Send = 'SEND',
  Log = 'LOG',
}

export enum ActivityAction {
  LoggedIn = 'account.logged_in',
  ProfileUpdated = 'account.profile_updated',
  PasswordChanged = 'account.password_changed',
  AccountExported = 'account.exported',
  CompanyCreated = 'company.created',
  CompanyUpdated = 'company.updated',
  CompanyAnafRefreshed = 'company.anaf_refreshed',
  CompanyLogoChanged = 'company.logo_changed',
  CompanyExported = 'company.exported',
  CompanyDeleted = 'company.deleted',
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
  SpvImported = 'spv.imported',
  SpvDocumentSaved = 'spv.document_saved',
  CertificateConnected = 'certificate.connected',
  CertificateRenamed = 'certificate.renamed',
  CertificateRemoved = 'certificate.removed',
  CertificateTested = 'certificate.tested',
  AuthorizationLinkCreated = 'authorization_link.created',
}

export enum JobActivityAction {
  Completed = 'job.completed',
  Failed = 'job.failed',
}

export enum ScheduledJob {
  Purge = 'purge',
  AdminApprovalRetry = 'admin_approval_retry',
  EfacturaArchiveSync = 'efactura_archive_sync',
  SpvSync = 'spv_sync',
}
