import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { useCompanyLogoUrl, useRemoveCompanyLogo, useUpdateCompany, useUploadCompanyLogo } from '../../api/hooks/companies';
import type { Company } from '../../api/types';
import { MAX_LOGO_BYTES } from '../../common/constants';
import { ConfirmButton } from '../ConfirmButton';
import { Alert, Button, Card, TextField } from '../ui';

const LOGO_TYPES = ['image/png', 'image/jpeg'];
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

function compactIban(value: string): string {
  return value.replaceAll(/\s+/g, '').toUpperCase();
}

export function InvoiceDetailsCard({ company }: Readonly<{ company: Company }>) {
  const update = useUpdateCompany(company.id);
  const [iban, setIban] = useState(company.iban ?? '');
  const [bankName, setBankName] = useState(company.bankName ?? '');
  const [email, setEmail] = useState(company.email ?? '');
  const [phone, setPhone] = useState(company.phone ?? '');
  const anafIban = company.anafData?.date_generale.iban?.trim() ?? '';
  const ibanError =
    iban.trim() && !IBAN.test(compactIban(iban)) ? 'IBAN invalid.' : undefined;
  const changed =
    iban !== (company.iban ?? '') ||
    bankName !== (company.bankName ?? '') ||
    email !== (company.email ?? '') ||
    phone !== (company.phone ?? '');

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    if (ibanError) return;
    update.mutate({
      iban: compactIban(iban) || null,
      bankName: bankName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
    });
  };

  return (
    <Card
      title="Date pentru facturi"
      subtitle="Apar pe facturile emise de această firmă"
    >
      <form className="stack" onSubmit={submit} noValidate>
        <TextField
          label="IBAN"
          mono
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          placeholder={anafIban || 'RO49 AAAA 1B31 0075 9384 0000'}
          hint={
            anafIban && !iban.trim()
              ? `Folosim IBAN-ul din ANAF: ${anafIban}`
              : 'Contul în care clienții plătesc facturile.'
          }
          error={ibanError}
        />
        <TextField
          label="Banca"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          maxLength={100}
        />
        <div className="form-row">
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={255}
            hint="Clienții răspund la această adresă."
          />
          <TextField
            label="Telefon"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
          />
        </div>
        {update.isError ? (
          <Alert tone="danger" title={update.error.message} />
        ) : null}
        {update.isSuccess && !changed ? (
          <Alert tone="success" title="Datele au fost salvate." />
        ) : null}
        <div>
          <Button
            type="submit"
            variant="primary"
            disabled={!changed || Boolean(ibanError)}
            loading={update.isPending}
          >
            Salvează
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function LogoCard({ company }: Readonly<{ company: Company }>) {
  const upload = useUploadCompanyLogo(company.id);
  const remove = useRemoveCompanyLogo(company.id);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const logoUrl = useCompanyLogoUrl(company);

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setError('Logo-ul trebuie să fie PNG sau JPEG.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(`Logo-ul poate avea cel mult ${MAX_LOGO_BYTES / 1024} KB.`);
      return;
    }
    setError(null);
    upload.mutate(file);
  };

  return (
    <Card
      title="Logo"
      subtitle="Apare în colțul facturilor emise de această firmă"
    >
      <div className="stack">
        {logoUrl ? (
          <img
            className="company-logo"
            src={logoUrl}
            alt={`Logo ${company.name}`}
          />
        ) : (
          <p className="muted">Firma nu are logo. Facturile se emit fără.</p>
        )}
        {error ? <Alert tone="danger" title={error} /> : null}
        {upload.isError ? (
          <Alert tone="danger" title={upload.error.message} />
        ) : null}
        {remove.isError ? (
          <Alert tone="danger" title={remove.error.message} />
        ) : null}
        <input
          ref={fileInput}
          type="file"
          accept={LOGO_TYPES.join(',')}
          hidden
          aria-label="Fișier logo"
          onChange={pick}
        />
        <div className="spv-row">
          <Button
            icon="upload"
            loading={upload.isPending}
            onClick={() => fileInput.current?.click()}
          >
            {company.hasLogo ? 'Schimbă logo-ul' : 'Încarcă logo'}
          </Button>
          {company.hasLogo ? (
            <ConfirmButton
              label="Șterge logo-ul"
              confirmLabel="Confirmă ștergerea"
              loading={remove.isPending}
              onConfirm={() => remove.mutate()}
            />
          ) : null}
          <span className="muted small">PNG sau JPEG, cel mult 512 KB.</span>
        </div>
      </div>
    </Card>
  );
}
