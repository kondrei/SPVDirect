import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useRegister } from '../api/hooks';
import { Alert, Button, TextField } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { loadRecaptcha } from '../lib/recaptcha';

export const MIN_PASSWORD = 10;

export function RegisterPage() {
  useDocumentTitle('Cont nou');
  const register = useRegister();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  useEffect(() => {
    loadRecaptcha().catch(() => undefined);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (password.length < MIN_PASSWORD) return;
    register.mutate({
      email: email.trim(),
      password,
      name: name.trim() || undefined,
    });
  };

  if (register.isSuccess) {
    return (
      <div className="spv-card auth-card">
        <h1>Cerere trimisă</h1>
        <Alert tone="success" title="Contul așteaptă aprobarea">
          Cererea pentru {register.variables.email} a fost înregistrată și
          așteaptă aprobarea administratorului. Veți primi un email când contul
          este aprobat.
        </Alert>
        <p className="auth-foot">
          <Link to="/login">Înapoi la autentificare</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="spv-card auth-card">
      <h1>Cont nou</h1>
      <form onSubmit={submit} noValidate>
        {register.isError ? (
          <Alert tone="danger" title={register.error.message} />
        ) : null}
        <TextField
          label="Nume"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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
      <p className="auth-foot">
        Aveți deja cont? <Link to="/login">Autentificați-vă</Link>
      </p>
    </div>
  );
}
