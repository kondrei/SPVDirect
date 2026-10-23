export enum PostgresErrorCode {
  UniqueViolation = '23505',
  ForeignKeyViolation = '23503',
}

export enum MailKind {
  AdminApproval = 'admin-approval',
  ApprovalNotice = 'approval-notice',
  Invoice = 'invoice',
  EfacturaArchive = 'efactura-archive',
  MfaChanged = 'mfa-changed',
  MfaCode = 'mfa-code',
}
