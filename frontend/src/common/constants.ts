import { ActivityAction, ImportStatus, MfaMethod } from '../api/enums';
import type { MfaFactor } from '../api/types';
import type { Tone } from '../components/ui';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const EXPIRING_DAYS = 30;
export const MAX_BULK_CUIS = 500;
export const MAX_CUI_FILE_BYTES = 1024 * 1024;
export const MAX_SPV_DAYS = 60;
export const ANAF_SPV_WEB_URL = 'https://webserviced.anaf.ro/SPVWS2/rest';
export const MAX_SPV_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_SPV_PDF_BYTES = 10 * 1024 * 1024;
export const SPV_PAGE_SIZE = 25;
export const MIN_PASSWORD = 10;
export const MFA_CODE_PATTERN = /^(?:\d{5}|\d{6})$/;
export const RECOVERY_CODE_DIGITS = 5;
export const MFA_FACTORS: readonly MfaFactor[] = [MfaMethod.App, MfaMethod.Email];
export const MFA_FACTOR_LABELS: Record<MfaFactor, string> = {
  [MfaMethod.App]: 'Aplicația de autentificare',
  [MfaMethod.Email]: 'Email',
};

export const INVOICE_PAGE_SIZE = 25;

export const ARCHIVE_PAGE_SIZE = 25;
export const MAX_IMPORT_IDS = 50;
export const MAX_MESSAGE_DAYS = 60;
export const IMPORT_PROBLEM_STATUSES: ReadonlySet<ImportStatus> = new Set([
  ImportStatus.Skipped,
  ImportStatus.Failed,
]);

export const MAX_LOGO_BYTES = 512 * 1024;

export const ACTIVITY_PAGE_SIZE = 6;

export const ACTIVITY_LABELS: Record<ActivityAction, { label: string; tone: Tone }> = {
  [ActivityAction.LoggedIn]: { label: 'Autentificare', tone: 'neutral' },
  [ActivityAction.ProfileUpdated]: { label: 'Profil modificat', tone: 'neutral' },
  [ActivityAction.PasswordChanged]: { label: 'Parolă schimbată', tone: 'warning' },
  [ActivityAction.MfaEnabled]: { label: '2FA activată', tone: 'success' },
  [ActivityAction.MfaDisabled]: { label: '2FA dezactivată', tone: 'warning' },
  [ActivityAction.MfaRecoveryUsed]: { label: 'Cod de recuperare folosit', tone: 'warning' },
  [ActivityAction.MfaRecoveryRegenerated]: { label: 'Cod de recuperare nou', tone: 'neutral' },
  [ActivityAction.AccountExported]: { label: 'Export cont', tone: 'neutral' },
  [ActivityAction.CompanyCreated]: { label: 'Firmă adăugată', tone: 'success' },
  [ActivityAction.CompanyUpdated]: { label: 'Firmă modificată', tone: 'neutral' },
  [ActivityAction.CompanyAnafRefreshed]: { label: 'Date ANAF reîncărcate', tone: 'neutral' },
  [ActivityAction.CompanyLogoChanged]: { label: 'Logo firmă', tone: 'neutral' },
  [ActivityAction.CompanyExported]: { label: 'Export firmă', tone: 'neutral' },
  [ActivityAction.CompanyDeleted]: { label: 'Firmă ștearsă', tone: 'danger' },
  [ActivityAction.CompaniesPurged]: { label: 'Date eliminate definitiv', tone: 'danger' },
  [ActivityAction.InvoiceIssued]: { label: 'Factură emisă', tone: 'brand' },
  [ActivityAction.InvoiceStorno]: { label: 'Factură stornată', tone: 'warning' },
  [ActivityAction.InvoiceSent]: { label: 'Factură trimisă pe email', tone: 'brand' },
  [ActivityAction.InvoiceStored]: { label: 'Factură salvată în cloud', tone: 'neutral' },
  [ActivityAction.EfacturaUploaded]: { label: 'Trimisă la e-Factura', tone: 'brand' },
  [ActivityAction.EfacturaStatusChecked]: { label: 'Stare e-Factura verificată', tone: 'neutral' },
  [ActivityAction.EfacturaDownloaded]: { label: 'Descărcare e-Factura', tone: 'neutral' },
  [ActivityAction.EfacturaMessagesLoaded]: { label: 'Mesaje e-Factura încărcate', tone: 'neutral' },
  [ActivityAction.EfacturaValidated]: { label: 'Validare ANAF', tone: 'neutral' },
  [ActivityAction.EfacturaTransformed]: { label: 'XML transformat în PDF', tone: 'neutral' },
  [ActivityAction.EfacturaArchiveImported]: { label: 'Import în arhiva e-Factura', tone: 'brand' },
  [ActivityAction.EfacturaArchiveEmailed]: { label: 'Factură din arhivă trimisă pe email', tone: 'brand' },
  [ActivityAction.EfacturaArchiveSyncFailed]: { label: 'Import automat eșuat', tone: 'danger' },
  [ActivityAction.SpvImported]: { label: 'Import mesaje SPV', tone: 'neutral' },
  [ActivityAction.SpvDocumentSaved]: { label: 'PDF SPV încărcat', tone: 'neutral' },
  [ActivityAction.CertificateConnected]: { label: 'Certificat conectat', tone: 'success' },
  [ActivityAction.CertificateRenamed]: { label: 'Certificat redenumit', tone: 'neutral' },
  [ActivityAction.CertificateRemoved]: { label: 'Certificat deconectat', tone: 'danger' },
  [ActivityAction.CertificateTested]: { label: 'Certificat testat', tone: 'neutral' },
  [ActivityAction.AuthorizationLinkCreated]: { label: 'Link de autorizare creat', tone: 'neutral' },
};
