import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useLogin, useRegister } from '../../api/hooks/auth';
import { MIN_PASSWORD } from '../../common/constants';
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

function LoginForm() {
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: (me) => {
          const next = params.get('next');
          navigate(next ? safeNext(next) : accountantPath(me.id, ''), { replace: true });
        },
      },
    );
  };

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

function RegisterForm({ onDone }: { onDone: () => void }) {
  const register = useRegister();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  const submit = (e: FormEvent) => {
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

export function AuthPanel({ tab, onTab }: { tab: AuthTab; onTab: (tab: AuthTab) => void }) {
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
    const next =
      e.key === 'Home'
        ? TABS[0]
        : e.key === 'End'
          ? TABS[TABS.length - 1]
          : TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
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
