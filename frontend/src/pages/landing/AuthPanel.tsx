import { useEffect, useRef, useState, type SubmitEvent, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  isMfaRequired,
  useLogin,
  useLoginMfa,
  useRegister,
  useSendLoginEmailCode,
} from '../../api/hooks/auth';
import { MfaMethod } from '../../api/enums';
import type { Accountant, MfaFactor } from '../../api/types';
import {
  MFA_CODE_PATTERN,
  MFA_FACTOR_LABELS,
  MFA_FACTORS,
  MIN_PASSWORD,
  RECOVERY_CODE_DIGITS,
} from '../../common/constants';
import { Alert, Button, TextField } from '../../components/ui';
import { accountantPath } from '../../hooks/useAppPath';
import { loadRecaptcha } from '../../lib/recaptcha';
import { safeNext } from '../../lib/safeNext';

export type AuthTab = 'login' | 'register';

const TABS: { id: AuthTab; label: string }[] = [
  { id: 'login', label: 'Autentificare' },
  { id: 'register', label: 'Cont nou' },
];

export function authTab(value: string | null): AuthTab {
  return value === 'register' ? 'register' : 'login';
}

function useEnterApp() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (me: Accountant) => {
    const next = params.get('next');
    return navigate(next ? safeNext(next) : accountantPath(me.id, ''), { replace: true });
  };
}

function MfaCodeForm({ methods, onBack }: Readonly<{ methods: MfaFactor[]; onBack: () => void }>) {
  const verify = useLoginMfa();
  const sendCode = useSendLoginEmailCode();
  const enter = useEnterApp();
  const [method, setMethod] = useState<MfaFactor>(methods[0] ?? MfaMethod.App);
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(false);
  const [touched, setTouched] = useState(false);
  const autoSent = useRef(false);
  const clean = code.replaceAll(/\s/g, '');
  const invalid = !MFA_CODE_PATTERN.test(clean);
  const viaEmail = method === MfaMethod.Email;

  useEffect(() => {
    if (autoSent.current || methods.length !== 1 || methods[0] !== MfaMethod.Email) return;
    autoSent.current = true;
    sendCode.mutate();
  }, [methods, sendCode]);

  const choose = (next: MfaFactor) => {
    verify.reset();
    setMethod(next);
  };

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;
    const used = clean.length === RECOVERY_CODE_DIGITS ? MfaMethod.Recovery : method;
    verify.mutate({ code: clean, method: used, rememberDevice: remember }, { onSuccess: enter });
  };

  return (
    <form onSubmit={submit} noValidate>
      <p className="landing-auth-lead">
        {viaEmail
          ? 'Introduceți codul de 6 cifre primit pe email.'
          : 'Introduceți codul din aplicația de autentificare (Google Authenticator, Microsoft Authenticator etc.).'}
      </p>
      {methods.length > 1 ? (
        <fieldset className="mfa-methods">
          <legend className="spv-field-label">Primesc codul din</legend>
          {MFA_FACTORS.map((m) => (
            <label key={m} className="check">
              <input
                type="radio"
                name="mfa-method"
                checked={method === m}
                onChange={() => choose(m)}
              />
              <span>{MFA_FACTOR_LABELS[m]}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {viaEmail ? (
        <div className="stack">
          {sendCode.isSuccess ? (
            <Alert tone="success" title={`Am trimis codul la ${sendCode.data.sentTo}.`}>
              Codul este valabil 10 minute.
            </Alert>
          ) : null}
          {sendCode.isError ? <Alert tone="danger" title={sendCode.error.message} /> : null}
          <Button size="sm" loading={sendCode.isPending} onClick={() => sendCode.mutate()}>
            {sendCode.isSuccess ? 'Trimite alt cod' : 'Trimite codul pe email'}
          </Button>
        </div>
      ) : null}
      {verify.isError ? <Alert tone="danger" title={verify.error.message} /> : null}
      <TextField
        label="Cod de verificare"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        value={code}
        onChange={(e) => {
          verify.reset();
          setCode(e.target.value);
        }}
        hint={`${viaEmail ? '6 cifre din email' : '6 cifre din aplicație'} sau codul de recuperare din 5 cifre.`}
        error={touched && invalid ? 'Introduceți 6 cifre sau codul de recuperare din 5 cifre.' : undefined}
      />
      <label className="check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>Nu mai cere codul pe acest dispozitiv 30 de zile</span>
      </label>
      <Button type="submit" variant="primary" loading={verify.isPending}>
        {verify.isPending ? 'Se verifică…' : 'Verifică codul'}
      </Button>
      <Button variant="ghost" onClick={onBack} disabled={verify.isPending}>
        Înapoi
      </Button>
    </form>
  );
}

function LoginForm() {
  const login = useLogin();
  const enter = useEnterApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaMethods, setMfaMethods] = useState<MfaFactor[] | null>(null);

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: (result) => {
          if (isMfaRequired(result)) {
            setPassword('');
            setMfaMethods(result.methods);
          } else {
            void enter(result);
          }
        },
      },
    );
  };

  if (mfaMethods) {
    return (
      <MfaCodeForm
        methods={mfaMethods}
        onBack={() => {
          login.reset();
          setMfaMethods(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className="landing-auth-lead">Intrați în contul SPVDirect al cabinetului.</p>
      {login.isError ? <Alert tone="danger" title={login.error.message} /> : null}
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <TextField
        label="Parolă"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" variant="primary" loading={login.isPending}>
        {login.isPending ? 'Se verifică…' : 'Intră în cont'}
      </Button>
    </form>
  );
}

function RegisterForm({ onDone }: Readonly<{ onDone: () => void }>) {
  const register = useRegister();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    setTouched(true);
    if (password.length < MIN_PASSWORD) return;
    register.mutate({ email: email.trim(), password, name: name.trim() || undefined });
  };

  if (register.isSuccess) {
    return (
      <div className="landing-auth-done">
        <Alert tone="success" title="Contul așteaptă aprobarea">
          Cererea pentru {register.variables.email} a fost înregistrată și așteaptă aprobarea
          administratorului. Veți primi un email când contul este aprobat.
        </Alert>
        <Button onClick={onDone}>Înapoi la autentificare</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className="landing-auth-lead">Cererea este aprobată de echipa SPVDirect.</p>
      {register.isError ? <Alert tone="danger" title={register.error.message} /> : null}
      <TextField label="Nume" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <TextField
        label="Parolă"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD}
        maxLength={200}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={`Cel puțin ${MIN_PASSWORD} caractere.`}
        error={
          touched && (tooShort || password.length === 0)
            ? `Parola trebuie să aibă cel puțin ${MIN_PASSWORD} caractere.`
            : undefined
        }
      />
      <Button type="submit" variant="primary" loading={register.isPending}>
        {register.isPending ? 'Se trimite…' : 'Trimite cererea'}
      </Button>
    </form>
  );
}

export function AuthPanel({ tab, onTab }: Readonly<{ tab: AuthTab; onTab: (tab: AuthTab) => void }>) {
  const tabRefs = useRef<Partial<Record<AuthTab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    loadRecaptcha().catch(() => undefined);
    document.body.classList.add('recaptcha-on');
    return () => document.body.classList.remove('recaptcha-on');
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const step = e.key === 'ArrowRight' ? 1 : TABS.length - 1;
    let next = TABS[(i + step) % TABS.length];
    if (e.key === 'Home') next = TABS[0];
    if (e.key === 'End') next = TABS.at(-1) ?? next;
    onTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div className="spv-card landing-auth" id="cont">
      <div className="landing-auth-tabs" role="tablist" aria-label="Cont SPVDirect">
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`auth-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`auth-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className="landing-auth-tab"
            onClick={() => onTab(t.id)}
            onKeyDown={onKeyDown}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`auth-panel-${tab}`} aria-labelledby={`auth-tab-${tab}`} className="landing-auth-body">
        {tab === 'login' ? <LoginForm /> : <RegisterForm onDone={() => onTab('login')} />}
      </div>
    </div>
  );
}
