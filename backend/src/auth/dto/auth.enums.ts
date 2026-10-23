export enum RegistrationDecision {
  Approve = 'approve',
  Reject = 'reject',
}

export enum MfaMethod {
  App = 'app',
  Email = 'email',
  Recovery = 'recovery',
}

export enum MfaEvent {
  AppEnabled = 'app_enabled',
  AppDisabled = 'app_disabled',
  EmailEnabled = 'email_enabled',
  EmailDisabled = 'email_disabled',
  Disabled = 'disabled',
  RecoveryUsed = 'recovery_used',
  RecoveryRegenerated = 'recovery_regenerated',
}

export enum ResendResult {
  Sent = 'sent',
  Failed = 'failed',
  Skipped = 'skipped',
}
