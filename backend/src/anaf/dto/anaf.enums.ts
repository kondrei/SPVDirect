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

export enum AnafGrantType {
  AuthorizationCode = 'authorization_code',
  RefreshToken = 'refresh_token',
}

export enum AnafTokenHint {
  AccessToken = 'access_token',
  RefreshToken = 'refresh_token',
}

export enum LinkFailure {
  NotFound = 'not_found',
  Used = 'used',
  Expired = 'expired',
}

export enum AuthorizationOutcomeKind {
  Self = 'self',
  Link = 'link',
  LinkInvalid = 'link-invalid',
}

export enum AnafOAuthError {
  InvalidClient = 'invalid_client',
  UnauthorizedClient = 'unauthorized_client',
  InvalidGrant = 'invalid_grant',
}

export enum ConnectCallbackStatus {
  Ok = 'ok',
  Error = 'error',
}
