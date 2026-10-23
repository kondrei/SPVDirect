# Two-step verification is optional: an authenticator app and/or an email code, plus one 5-digit recovery code

SPVDirect holds ANAF OAuth tokens, client invoices and SPV documents, so a stolen password gives an attacker everything the accountant can do at ANAF. Accountants can turn on two-step verification in Profil. After the password, the login asks for a code from an authenticator app (TOTP, RFC 6238), a code sent by email, or either one when both are on (the accountant chooses at each login). It stays optional, so a rollout locks nobody out of an existing account and accountants who already protect their device and mailbox can keep the simpler login. Each accountant gets one 5-digit recovery code, and can trust a browser for 30 days. Panou shows a banner explaining why to turn it on until one method is on.

## Considered Options

- **Make MFA mandatory:** rejected for now. Some accountants work from a shared office computer without a smartphone at hand, and a forced switch would lock them out until an admin resets each account. It can become mandatory later without schema changes.
- **SMS codes:** rejected. SMS costs money per login and can be hijacked by SIM swap.
- **Passkeys / WebAuthn:** phishing-resistant and the better long-term option, but more work (browser API, credential storage, several devices per account). It can be added next to the other methods later.
- **Authenticator app (TOTP):** works offline, costs nothing, every accountant can install Google or Microsoft Authenticator, and it takes about 60 lines on `node:crypto` with no dependency. This is the method Profil recommends.
- **Email code (added at the product owner's request):** easier for accountants who don't want an app. It is weaker, because the second factor is only as strong as the mailbox, and a stolen mailbox can often be used to reset other accounts. So it is offered next to the app, not instead of it, and Profil describes the app as the safer choice. The code is 6 digits, valid 10 minutes, used once, at most one email a minute per account, and is stored only as a scrypt hash. Wrong email codes count towards the same 15-minute lock as wrong app codes.

## Recovery code

The usual design is about ten long, random recovery codes. The product owner chose **one short code of 5 digits** to keep it easy to write down. 100,000 values are few, so the code gets extra protection:

- It is hashed with scrypt, like a password, not with SHA-256, so a database leak can't be brute-forced in a fraction of a second.
- 10 wrong recovery codes block it (counted separately from the other codes, not reset by time). The 15-minute lock after 5 wrong codes applies too, plus the per-IP throttle. Each attempt is counted in the database before the code is checked, so parallel requests can't get past the limits.
- It works once, and every use emails the accountant. The login that used it ends every other session and trusted device. Profil then asks for a new code.
- It is created when the first method is turned on and kept while at least one method stays on.

An attacker who already has the password therefore gets at most 10 guesses at the recovery code (a 0.01% chance) before it is blocked, and the accountant is told.

## Consequences

- An accountant who loses access to every method they turned on, and to the recovery code, needs an administrator to reset MFA in the database (README, "Resetting two-step verification"). There is no self-service reset by email when only the app is on, on purpose: that would make the mailbox a way around the second factor.
- Changing MFA settings (turning a method on or off, a new recovery code) asks for the password again, not for a code. An accountant who used the recovery code and has no other method left can still turn MFA off and set it up again.
- The settings, secrets and counters live in their own table, `accountant_mfa` (one row per accountant who started a setup, deleted with the account). Profile reads and the export never load them, and a future per-device method like passkeys gets its own 1:N table instead of more columns on `accountants`. Only `mfa_changed_at` stays on `accountants`, next to `password_changed_at`, because the session check reads both on every request. A change to `accountant_mfa` and the `mfa_changed_at` bump run in one transaction.
- `mfa_changed_at` ends sessions the same way `password_changed_at` does, so turning a method on also logs out any session an attacker may already have opened.
