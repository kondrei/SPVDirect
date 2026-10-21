import { useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  useCaen,
  useChangePassword,
  useDeleteAccount,
  useExportAccount,
  useFirmLookup,
  useProfile,
  useUpdateProfile,
} from '../api/hooks/profile';
import type { AccountantProfile } from '../api/types';
import { CaenName } from '../components/CaenName';
import { PageHead } from '../components/PageHead';
import { QueryError } from '../components/QueryError';
import { Alert, Button, Card, TextField } from '../components/ui';
import { formatDate, isValidCui, normalizeCui } from '../lib/format';
import { MIN_PASSWORD } from '../common/constants';
import { SelectField } from '../components/SelectField';
import { ProfessionalTitle } from '../api/enums';

const PROFESSIONAL_TITLES: Record<ProfessionalTitle, string> = {
  expert_contabil: 'Expert contabil',
  contabil_autorizat: 'Contabil autorizat',
};

const CECCAR_BRANCHES = [
  'Alba',
  'Arad',
  'Argeș',
  'Bacău',
  'Bihor',
  'Bistrița-Năsăud',
  'Botoșani',
  'Brăila',
  'Brașov',
  'București',
  'Buzău',
  'Călărași',
  'Caraș-Severin',
  'Cluj',
  'Constanța',
  'Covasna',
  'Dâmbovița',
  'Dolj',
  'Galați',
  'Giurgiu',
  'Gorj',
  'Harghita',
  'Hunedoara',
  'Ialomița',
  'Iași',
  'Maramureș',
  'Mehedinți',
  'Mureș',
  'Neamț',
  'Olt',
  'Prahova',
  'Sălaj',
  'Satu Mare',
  'Sibiu',
  'Suceava',
  'Teleorman',
  'Timiș',
  'Tulcea',
  'Vâlcea',
  'Vaslui',
  'Vrancea',
];

const PHONE = /^\+?[0-9 ()./-]{6,30}$/;
const MEMBER_NUMBER = /^[A-Za-z0-9/-]{1,20}$/;

function memberNumberError(value: string): string | undefined {
  if (!value.trim()) return 'Completați numărul de legitimație.';
  return MEMBER_NUMBER.test(value.trim()) ? undefined : 'Doar litere, cifre, „/” și „-”.';
}

function caenError(code: string, known: boolean): string | undefined {
  if (!code) return undefined;
  if (!/^\d{4}$/.test(code)) return 'Codul CAEN are 4 cifre.';
  return known ? undefined : 'Cod necunoscut în nomenclatorul CAEN.';
}

function profileFields(profile: AccountantProfile) {
  return {
    name: profile.name ?? '',
    phone: profile.phone ?? '',
    ceccarMember: profile.ceccarMember,
    professionalTitle: profile.professionalTitle ?? '',
    ceccarNumber: profile.ceccarNumber ?? '',
    ceccarBranch: profile.ceccarBranch ?? '',
    ccfNumber: profile.ccfNumber ?? '',
    firmName: profile.firmName ?? '',
    firmCui: profile.firmCui ?? '',
    firmCaenCode: profile.firmCaenCode ?? '',
  };
}

type ProfileFields = ReturnType<typeof profileFields>;

function profileErrors(form: ProfileFields, caenKnown: boolean) {
  return {
    phone:
      form.phone.trim() && !PHONE.test(form.phone.trim())
        ? 'Număr de telefon invalid.'
        : undefined,
    professionalTitle:
      form.ceccarMember && !form.professionalTitle
        ? 'Alegeți calitatea profesională.'
        : undefined,
    ceccarNumber: form.ceccarMember
      ? memberNumberError(form.ceccarNumber)
      : undefined,
    ccfNumber:
      form.ccfNumber.trim() && !MEMBER_NUMBER.test(form.ccfNumber.trim())
        ? 'Doar litere, cifre, „/” și „-”.'
        : undefined,
    firmCui:
      form.firmCui.trim() && !isValidCui(form.firmCui)
        ? 'CUI invalid: 2–10 cifre, cu sau fără RO.'
        : undefined,
    firmCaenCode: caenError(form.firmCaenCode.trim(), caenKnown),
  };
}

function ProfileForm({ profile }: Readonly<{ profile: AccountantProfile }>) {
  const update = useUpdateProfile();
  const [form, setForm] = useState(() => profileFields(profile));
  const [touched, setTouched] = useState(false);
  const lookup = useFirmLookup();
  const caenCode = form.firmCaenCode.trim();
  const caen = useCaen(caenCode);
  const set =
    (key: keyof typeof form) =>
    (e: { target: { value: string } }) => {
      update.reset();
      setForm((f) => ({ ...f, [key]: e.target.value }));
    };
  const fetchFirm = () => {
    update.reset();
    if (!isValidCui(form.firmCui)) {
      setTouched(true);
      return;
    }
    lookup.mutate(normalizeCui(form.firmCui), {
      onSuccess: (firm) =>
        setForm((f) => ({
          ...f,
          firmCui: firm.firmCui,
          firmName: firm.firmName,
          firmCaenCode: firm.firmCaenCode ?? '',
        })),
    });
  };

  const errors = profileErrors(form, caen.data !== null);
  const invalid = Object.values(errors).some(Boolean);
  const show = (e: string | undefined) => (touched ? e : undefined);

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;
    const orNull = (v: string) => v.trim() || null;
    update.mutate({
      name: orNull(form.name),
      phone: orNull(form.phone),
      ceccarMember: form.ceccarMember,
      professionalTitle: form.ceccarMember
        ? ((form.professionalTitle || null) as ProfessionalTitle | null)
        : null,
      ceccarNumber: form.ceccarMember ? orNull(form.ceccarNumber) : null,
      ceccarBranch: form.ceccarMember ? orNull(form.ceccarBranch) : null,
      ccfNumber: orNull(form.ccfNumber),
      firmName: orNull(form.firmName),
      firmCui: form.firmCui.trim() ? normalizeCui(form.firmCui) : null,
      firmCaenCode: caenCode || null,
    });
  };

  return (
    <form onSubmit={submit} noValidate className="stack">
      <Card title="Date personale">
        <div className="stack">
          <dl className="dl">
            <dt>Email</dt>
            <dd>{profile.email}</dd>
            <dt>Cont creat</dt>
            <dd className="mono">{formatDate(profile.createdAt)}</dd>
          </dl>
          <div className="form-row">
            <TextField
              label="Nume"
              autoComplete="name"
              maxLength={200}
              value={form.name}
              onChange={set('name')}
              hint="Apare în bara laterală."
            />
            <TextField
              label="Telefon"
              type="tel"
              autoComplete="tel"
              maxLength={30}
              value={form.phone}
              onChange={set('phone')}
              error={show(errors.phone)}
            />
          </div>
        </div>
      </Card>
      <Card
        title="Date profesionale"
        subtitle="Calitatea în CECCAR și cabinetul prin care lucrați"
      >
        <div className="stack">
          <label className="check">
            <input
              type="checkbox"
              checked={form.ceccarMember}
              onChange={(e) => {
                update.reset();
                setForm((f) => ({ ...f, ceccarMember: e.target.checked }));
              }}
            />
            <span>Membru CECCAR</span>
          </label>
          {form.ceccarMember ? (
            <>
              <div className="form-row">
                <SelectField
                  id="title-select"
                  label="Calitate profesională"
                  value={form.professionalTitle}
                  onChange={set('professionalTitle')}
                  error={show(errors.professionalTitle)}
                >
                  <option value="">Alegeți…</option>
                  {Object.entries(PROFESSIONAL_TITLES).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label="Nr. legitimație CECCAR"
                  mono
                  maxLength={20}
                  value={form.ceccarNumber}
                  onChange={set('ceccarNumber')}
                  error={show(errors.ceccarNumber)}
                />
              </div>
              <TextField
                label="Filiala CECCAR"
                list="ceccar-branches"
                maxLength={100}
                value={form.ceccarBranch}
                onChange={set('ceccarBranch')}
              />
              <datalist id="ceccar-branches">
                {CECCAR_BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </datalist>
            </>
          ) : null}
          <TextField
            label="Nr. carnet Camera Consultanților Fiscali"
            mono
            maxLength={20}
            value={form.ccfNumber}
            onChange={set('ccfNumber')}
            error={show(errors.ccfNumber)}
            hint="Opțional, dacă sunteți și consultant fiscal."
          />
          <div className="form-row">
            <TextField
              label="CUI cabinet"
              mono
              maxLength={14}
              value={form.firmCui}
              onChange={(e) => {
                lookup.reset();
                set('firmCui')(e);
              }}
              error={show(errors.firmCui)}
              hint="Completați CUI-ul și preluați denumirea și codul CAEN de la ANAF."
            />
            <Button
              icon="download"
              disabled={!form.firmCui.trim()}
              loading={lookup.isPending}
              onClick={fetchFirm}
            >
              Preia din ANAF
            </Button>
          </div>
          {lookup.isError ? (
            <Alert tone="danger" title={lookup.error.message} />
          ) : null}
          {lookup.isSuccess ? (
            <Alert
              tone="info"
              title="Datele au fost preluate de la ANAF. Apăsați „Salvează datele” ca să le păstrați."
            />
          ) : null}
          <TextField
            label="Cabinet / societate de expertiză"
            maxLength={255}
            value={form.firmName}
            onChange={set('firmName')}
          />
          <TextField
            label="Cod CAEN cabinet"
            mono
            inputMode="numeric"
            maxLength={4}
            value={form.firmCaenCode}
            onChange={set('firmCaenCode')}
            error={show(errors.firmCaenCode)}
          />
          {caen.data ? <CaenName caen={caen.data} /> : null}
        </div>
      </Card>
      {update.isError ? (
        <Alert tone="danger" title={update.error.message} />
      ) : null}
      {update.isSuccess ? (
        <Alert tone="success" title="Datele au fost salvate." />
      ) : null}
      <div>
        <Button type="submit" variant="primary" loading={update.isPending}>
          Salvează datele
        </Button>
      </div>
    </form>
  );
}

function newPasswordError(next: string, current: string): string | undefined {
  if (next.length < MIN_PASSWORD) {
    return `Parola trebuie să aibă cel puțin ${MIN_PASSWORD} caractere.`;
  }
  return next === current
    ? 'Parola nouă trebuie să fie diferită de cea actuală.'
    : undefined;
}

function PasswordCard() {
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);

  const errors = {
    current: current ? undefined : 'Completați parola actuală.',
    next: newPasswordError(next, current),
    confirm: confirm === next ? undefined : 'Parolele nu coincid.',
  };

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setConfirm('');
          setTouched(false);
        },
      },
    );
  };
  const show = (e: string | undefined) => (touched ? e : undefined);
  const edit = (setter: (v: string) => void) => (v: string) => {
    change.reset();
    setter(v);
  };

  return (
    <Card title="Schimbă parola">
      <form onSubmit={submit} noValidate className="stack">
        {change.isError ? (
          <Alert tone="danger" title={change.error.message} />
        ) : null}
        {change.isSuccess ? (
          <Alert tone="success" title="Parola a fost schimbată." />
        ) : null}
        <TextField
          label="Parola actuală"
          type="password"
          autoComplete="current-password"
          maxLength={200}
          value={current}
          onChange={(e) => edit(setCurrent)(e.target.value)}
          error={show(errors.current)}
        />
        <TextField
          label="Parola nouă"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          maxLength={200}
          value={next}
          onChange={(e) => edit(setNext)(e.target.value)}
          hint={`Cel puțin ${MIN_PASSWORD} caractere.`}
          error={show(errors.next)}
        />
        <TextField
          label="Confirmă parola nouă"
          type="password"
          autoComplete="new-password"
          maxLength={200}
          value={confirm}
          onChange={(e) => edit(setConfirm)(e.target.value)}
          error={show(errors.confirm)}
        />
        <div>
          <Button type="submit" icon="key" loading={change.isPending}>
            Schimbă parola
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AccountDataCard() {
  const exportData = useExportAccount();
  const remove = useDeleteAccount();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const exported = exportData.isSuccess;

  const cancel = () => {
    setOpen(false);
    setPassword('');
    setTouched(false);
    remove.reset();
  };
  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!password) return;
    remove.mutate(password, {
      onSuccess: () => navigate('/', { replace: true }),
    });
  };

  return (
    <Card title="Datele contului">
      <div className="stack">
        <div className="spv-row" style={{ justifyContent: 'space-between' }}>
          <span className="muted small">
            Arhivă ZIP cu tot contul: profilul, certificatele ANAF (fără tokenuri) și, pentru
            fiecare firmă, facturile (PDF și XML), mesajele SPV și încărcările e-Factura.
          </span>
          <Button
            size="sm"
            icon="download"
            loading={exportData.isPending}
            onClick={() => exportData.mutate()}
          >
            Descarcă toate datele
          </Button>
        </div>
        {exportData.isError ? <Alert tone="danger" title={exportData.error.message} /> : null}
        {exported ? <Alert tone="success" title="Arhiva contului a fost descărcată." /> : null}

        {open ? (
          <form onSubmit={submit} noValidate className="stack">
            <Alert tone="warning" title="Ștergeți contul SPVDirect?">
              Contul, firmele și toate datele lor (facturi, mesaje SPV, încărcări e-Factura) dispar
              imediat, iar certificatele ANAF sunt revocate. Datele se șterg definitiv după 30 de
              zile, iar apoi SPVDirect nu mai păstrează nicio copie. Facturile trebuie păstrate 10
              ani (Legea contabilității, art. 25), așa că descărcați mai întâi arhiva.
            </Alert>
            {remove.isError ? <Alert tone="danger" title={remove.error.message} /> : null}
            <TextField
              label="Parola, pentru confirmare"
              type="password"
              autoComplete="current-password"
              maxLength={200}
              value={password}
              onChange={(e) => {
                remove.reset();
                setPassword(e.target.value);
              }}
              error={touched && !password ? 'Introduceți parola.' : undefined}
            />
            <div className="spv-row">
              <Button
                type="submit"
                size="sm"
                variant="danger"
                icon="trash"
                loading={remove.isPending}
                disabled={exportData.isPending}
              >
                {exported ? 'Șterge contul' : 'Șterge contul fără export'}
              </Button>
              <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={cancel}>
                Renunță
              </Button>
            </div>
          </form>
        ) : (
          <div className="spv-row" style={{ justifyContent: 'space-between' }}>
            <span className="muted small">
              Ștergerea contului elimină toate datele din SPVDirect; datele din SPV rămân la ANAF.
            </span>
            <Button size="sm" variant="ghost" icon="trash" onClick={() => setOpen(true)}>
              Șterge contul
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function ProfilePage() {
  const profile = useProfile();

  if (profile.isPending) return <div className="loading">Se încarcă…</div>;
  if (profile.isError)
    return <QueryError error={profile.error} retry={() => profile.refetch()} />;

  return (
    <>
      <PageHead
        title="Profil"
        context="Datele contului și calitatea profesională."
      />
      <div className="grid-1-1">
        <ProfileForm profile={profile.data} />
        <PasswordCard />
        <AccountDataCard />
      </div>
    </>
  );
}
