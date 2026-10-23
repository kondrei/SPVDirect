import { MfaEvent, MfaMethod } from './auth.enums.js';

export const TOTP_ISSUER = 'SPVDirect';
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DRIFT_STEPS = 1;
export const TOTP_SECRET_BYTES = 20;
export const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const RECOVERY_CODE_DIGITS = 5;
export const MFA_CODE_PATTERN = /^(?:\d{5}|\d{6})$/;
export const EMAIL_CODE_DIGITS = 6;
export const MFA_EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const MFA_EMAIL_RESEND_MS = 60 * 1000;
export const MFA_METHOD_LABELS: Record<MfaMethod, string> = {
  [MfaMethod.App]: 'aplicația de autentificare',
  [MfaMethod.Email]: 'codul primit pe email',
  [MfaMethod.Recovery]: 'codul de recuperare',
};

export const MFA_MAX_FAILED_ATTEMPTS = 5;
export const MFA_LOCK_MS = 15 * 60 * 1000;
export const MFA_RECOVERY_MAX_FAILURES = 10;

export const MFA_PENDING_COOKIE = 'spv_mfa_pending';
export const MFA_PENDING_TTL_SECONDS = 10 * 60;
export const MFA_PENDING_AUDIENCE = 'spv-mfa-pending';
export const MFA_TRUST_COOKIE = 'spv_mfa_trust';
export const MFA_TRUST_TTL_SECONDS = 30 * 24 * 60 * 60;
export const MFA_TRUST_AUDIENCE = 'spv-mfa-trust';

export const MFA_WRONG_CODE = 'Cod de verificare incorect';
export const MFA_LOCKED =
  'Prea multe coduri greșite. Încercați din nou peste 15 minute.';
export const MFA_RECOVERY_BLOCKED =
  'Codul de recuperare a fost blocat după prea multe încercări greșite. Folosiți aplicația de autentificare sau contactați administratorul.';
export const MFA_LOGIN_EXPIRED =
  'Verificarea a expirat. Introduceți din nou emailul și parola.';
export const MFA_ALREADY_ENABLED =
  'Autentificarea în doi pași este deja activă.';
export const MFA_NOT_ENABLED = 'Autentificarea în doi pași nu este activă.';
export const MFA_METHOD_OFF = 'Metoda aleasă nu este activă pentru acest cont.';
export const MFA_EMAIL_WAIT =
  'Am trimis deja un cod. Așteptați un minut înainte să cereți altul.';
export const MFA_EMAIL_FAILED =
  'Emailul cu codul nu a putut fi trimis. Reîncercați peste un minut.';
export const MFA_EMAIL_CODE_SUBJECT = 'Codul de verificare SPVDirect';
export const MFA_SETUP_NOT_STARTED =
  'Porniți mai întâi configurarea autentificării în doi pași.';
export const MFA_WRONG_PASSWORD = 'Parola este incorectă';

export const MFA_MAIL: Record<MfaEvent, { subject: string; text: string }> = {
  [MfaEvent.AppEnabled]: {
    subject: 'Autentificarea în doi pași a fost activată',
    text: 'Autentificarea în doi pași cu aplicația de autentificare a fost activată pentru contul dvs. SPVDirect.',
  },
  [MfaEvent.AppDisabled]: {
    subject: 'Aplicația de autentificare a fost dezactivată',
    text: 'Autentificarea în doi pași cu aplicația de autentificare a fost dezactivată pentru contul dvs. SPVDirect.',
  },
  [MfaEvent.EmailEnabled]: {
    subject: 'Autentificarea în doi pași a fost activată',
    text: 'Autentificarea în doi pași cu cod pe email a fost activată pentru contul dvs. SPVDirect.',
  },
  [MfaEvent.EmailDisabled]: {
    subject: 'Codul pe email a fost dezactivat',
    text: 'Autentificarea în doi pași cu cod pe email a fost dezactivată pentru contul dvs. SPVDirect.',
  },
  [MfaEvent.Disabled]: {
    subject: 'Autentificarea în doi pași a fost dezactivată',
    text: 'Autentificarea în doi pași a fost dezactivată complet pentru contul dvs. SPVDirect.',
  },
  [MfaEvent.RecoveryUsed]: {
    subject: 'Codul de recuperare a fost folosit',
    text: 'Cineva s-a autentificat în contul dvs. SPVDirect cu codul de recuperare. Codul nu mai poate fi folosit; generați unul nou din pagina Profil.',
  },
  [MfaEvent.RecoveryRegenerated]: {
    subject: 'Un cod de recuperare nou a fost generat',
    text: 'A fost generat un cod de recuperare nou pentru contul dvs. SPVDirect. Codul vechi nu mai funcționează.',
  },
};

export const MFA_MAIL_FOOTER =
  'Dacă nu ați făcut dvs. această modificare, schimbați imediat parola și contactați administratorul.';
