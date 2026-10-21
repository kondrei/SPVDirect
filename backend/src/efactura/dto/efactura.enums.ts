export enum UploadStatus {
  Sending = 'sending',
  Processing = 'processing',
  Ok = 'ok',
  Nok = 'nok',
  Rejected = 'rejected',
}

export const ACTIVE_UPLOAD_STATUSES: readonly UploadStatus[] = [
  UploadStatus.Sending,
  UploadStatus.Processing,
  UploadStatus.Ok,
];

export enum EfacturaStandard {
  UBL = 'UBL',
  CN = 'CN',
  CII = 'CII',
  RASP = 'RASP',
}

export enum ValidateStandard {
  FACT1 = 'FACT1',
  FCN = 'FCN',
}

export enum MessageFilter {
  Errors = 'E',
  Received = 'P',
  Sent = 'T',
  BuyerMessage = 'R',
}

export enum AnafUploadState {
  Ok = 'ok',
  Nok = 'nok',
  InProgress = 'in prelucrare',
  XmlErrors = 'xml cu erori',
}

export enum AnafExecutionStatus {
  Success = '0',
  Error = '1',
}
