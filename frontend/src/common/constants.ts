import { ActivityAction } from '../api/enums';
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

export const INVOICE_PAGE_SIZE = 25;

export const MAX_LOGO_BYTES = 512 * 1024;

export const ACTIVITY_PAGE_SIZE = 20;

export const ACTIVITY_LABELS: Record<ActivityAction, { label: string; tone: Tone }> = {
  [ActivityAction.LoggedIn]: { label: 'Autentificare', tone: 'neutral' },
  [ActivityAction.ProfileUpdated]: { label: 'Profil modificat', tone: 'neutral' },
  [ActivityAction.PasswordChanged]: { label: 'Parolă schimbată', tone: 'warning' },
  [ActivityAction.AccountExported]: { label: 'Export cont', tone: 'neutral' },
  [ActivityAction.CompanyCreated]: { label: 'Firmă adăugată', tone: 'success' },
  [ActivityAction.CompanyUpdated]: { label: 'Firmă modificată', tone: 'neutral' },
  [ActivityAction.CompanyAnafRefreshed]: { label: 'Date ANAF reîncărcate', tone: 'neutral' },
  [ActivityAction.CompanyLogoChanged]: { label: 'Logo firmă', tone: 'neutral' },
  [ActivityAction.CompanyExported]: { label: 'Export firmă', tone: 'neutral' },
  [ActivityAction.CompanyDeleted]: { label: 'Firmă ștearsă', tone: 'danger' },
  [ActivityAction.InvoiceIssued]: { label: 'Factură emisă', tone: 'brand' },
  [ActivityAction.InvoiceStorno]: { label: 'Factură stornată', tone: 'warning' },
  [ActivityAction.InvoiceSent]: { label: 'Factură trimisă pe email', tone: 'brand' },
  [ActivityAction.InvoiceStored]: { label: 'Factură salvată în Storage', tone: 'neutral' },
  [ActivityAction.EfacturaUploaded]: { label: 'Trimisă la e-Factura', tone: 'brand' },
  [ActivityAction.EfacturaStatusChecked]: { label: 'Stare e-Factura verificată', tone: 'neutral' },
  [ActivityAction.EfacturaDownloaded]: { label: 'Descărcare e-Factura', tone: 'neutral' },
  [ActivityAction.EfacturaMessagesLoaded]: { label: 'Mesaje e-Factura încărcate', tone: 'neutral' },
  [ActivityAction.EfacturaValidated]: { label: 'Validare ANAF', tone: 'neutral' },
  [ActivityAction.EfacturaTransformed]: { label: 'XML transformat în PDF', tone: 'neutral' },
  [ActivityAction.SpvImported]: { label: 'Import mesaje SPV', tone: 'neutral' },
  [ActivityAction.SpvDocumentSaved]: { label: 'PDF SPV încărcat', tone: 'neutral' },
  [ActivityAction.CertificateConnected]: { label: 'Certificat conectat', tone: 'success' },
  [ActivityAction.CertificateRenamed]: { label: 'Certificat redenumit', tone: 'neutral' },
  [ActivityAction.CertificateRemoved]: { label: 'Certificat deconectat', tone: 'danger' },
  [ActivityAction.CertificateTested]: { label: 'Certificat testat', tone: 'neutral' },
  [ActivityAction.AuthorizationLinkCreated]: { label: 'Link de autorizare creat', tone: 'neutral' },
};
