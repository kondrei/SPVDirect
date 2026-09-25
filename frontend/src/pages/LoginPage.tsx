import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useLogin } from '../api/hooks';
import { Alert, Button, TextField } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { safeNext } from '../lib/safeNext';

export function LoginPage() {
  useDocumentTitle('Autentificare');
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email: email.trim(), password }, { onSuccess: () => navigate(safeNext(params.get('next')), { replace: true }) });
  };

  return (
    <div className="spv-card auth-card">
      <h1>Autentificare</h1>
      <p>Intrați în contul SPVDirect al cabinetului.</p>
      <form onSubmit={submit} noValidate>
        {login.isError ? <Alert tone="danger" title={login.error.message} /> : null}
        <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Parolă" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" variant="primary" loading={login.isPending}>
          {login.isPending ? 'Se verifică…' : 'Intră în cont'}
        </Button>
      </form>
      <p className="auth-foot">
        Nu aveți cont? <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}>Creați unul</Link>
      </p>
    </div>
  );
}
