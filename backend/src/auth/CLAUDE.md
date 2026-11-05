# auth: the SPVDirect session, MFA and registration

The root CLAUDE.md has the session rules every route follows (guards, `/accountants/:accountantId`). This file covers how the session, two-step verification and registration work inside.

## Session
- Email and password, hashed with scrypt (`common/crypto/password.ts`). A JWT signed with `JWT_SECRET` goes into the httpOnly cookie `spv_session`.
- Accountant ids are integers (identity, from 1). The JWT `sub` is the id as a string; `JwtAuthGuard` rejects anything else (old UUID sessions get 401).
- Only `/auth/me` reads the id from the session (`@CurrentAccountantId()`); the frontend needs it to build URLs.
- `JwtAuthGuard` also checks the database on every request: the accountant must still exist, be `active`, and the token's `iat` must not be older than `password_changed_at` or `mfa_changed_at`. A password or MFA change re-issues the current cookie, so only other sessions end.
- `SessionCookieService` is the only place that sets or clears `spv_session`, `spv_mfa_pending` and `spv_mfa_trust`.

## Two-step verification (`mfa/`, ADR 0003)
Optional. `MfaService`, `MfaController` under `/accountants/:accountantId/mfa`.
- The settings live in their own 1:1 table `accountant_mfa` (`AccountantMfa`, `AccountantMfaRepository`; primary key and FK `accountant_id`, `ON DELETE CASCADE`); only `mfa_changed_at` stays on `accountants`, because `JwtAuthGuard` reads it on every request. Every change that bumps it runs in one transaction with the `accountant_mfa` write (`MfaService.changed`).
- The accountant turns on an authenticator app, a code by email, or both (`MfaMethod` `app`/`email`, plus `recovery`), each with its own setup (`app/setup[/confirm]`, `email/setup[/confirm]`) and `DELETE mfa/app|email` (`DELETE mfa` turns everything off).
- App: TOTP per RFC 6238 (SHA-1, 6 digits, 30 s, ±1 step) on `node:crypto`, the secret encrypted with `TokenCipher`, every accepted step stored (`last_used_step`, conditional UPDATE) so a code can't be replayed.
- Email: a 6-digit code (`newEmailCode`, 10 min, a new one at most once a minute through a conditional upsert on `email_code_sent_at`) emailed by `MfaMailer.sendCode` (`MailKind.MfaCode`; the code is never in the subject), stored as a scrypt hash and consumed by a conditional UPDATE; a failed email clears it and answers 503.
- Registration can name a method (`RegisterDto.mfaMethod`, optional): it is only stored as `accountant_mfa.requested_method` in the registration transaction, never turned on, because a pending account has no session. While no method is on, `POST /auth/login` answers `mfaSetup` with it, the frontend opens the 2FA card on Profil (`#autentificare-2fa`) and the regular setup (password, then QR or email code) runs there; turning any method on clears it, and `DELETE mfa/request` drops it.
- One 5-digit recovery code (scrypt) is created when the first method is turned on and cleared, in SQL, when the last one goes off.
- Login: with any method on, `POST /auth/login` sets no session: it sets the 10-minute `spv_mfa_pending` cookie and answers `{ mfaRequired: true, methods }`; `POST /auth/login/mfa/email` sends the email code and `POST /auth/login/mfa` takes `{ code, method }`.
- Every attempt is counted before the code is checked (`claimAttempt`, one conditional UPDATE), so parallel guesses can't pass the limits: 5 wrong codes lock verification for 15 minutes; 10 wrong recovery codes block it until a TOTP login or a new code.
- `rememberDevice` sets `spv_mfa_trust` (a JWT, 30 days), valid only when issued after `mfa_changed_at` and `password_changed_at`.
- Turning a method on or off, or using or replacing the recovery code, bumps `mfa_changed_at` and emails the accountant (`MailKind.MfaChanged`). The MFA routes take the password again, not a code.
- Never log codes, secrets or the `otpauthUri`.

## Registration (`registrations/`)
- Registration needs a reCAPTCHA v3 token (`RecaptchaService`, action `register`) and creates a `pending` accountant with no session.
- It goes through `@nestjs/cqrs`: `RegisterAccountantCommand` inserts the accountant in one transaction, then publishes `AccountantRegisteredEvent`. `AdminApprovalMailHandler` emails `ADMIN_EMAIL` approve/reject links and sets `admin_notified_at`.
- A failed email never undoes the registration; the request stays pending with `admin_notified_at` null. `AdminApprovalRetryJob` (`@nestjs/schedule`, daily at 08:00 Europe/Bucharest) runs `ResendAdminApprovalCommand` for those requests. The command swaps in a new token, guarded by the old hash so concurrent resends can't both send, and emails the admin again.
- Every email attempt goes through `RegistrationMailer`. Tokens never go into logs.
- The GET link shows a confirmation page and a POST acts, so mail scanners that prefetch links can't approve or ban anyone. Reject deletes the request and adds the email to `banned_emails`. Login answers 403 while pending.
