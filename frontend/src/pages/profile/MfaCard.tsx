import { useEffect, useState, type SubmitEvent } from 'react';
import QRCode from 'qrcode';
import {
  useConfirmAppSetup,
  useConfirmEmailSetup,
  useDisableMfa,
  useMfaStatus,
  useRegenerateRecoveryCode,
  useStartAppSetup,
  useStartEmailSetup,
} from '../../api/hooks/mfa';
import { MfaMethod } from '../../api/enums';
import type { MfaSetup, MfaStatus } from '../../api/types';
import { CopyField } from '../../components/CopyField';
import { QueryError } from '../../components/QueryError';
import { Alert, Button, Card, StatusBadge, TextField } from '../../components/ui';
import { formatDate } from '../../lib/format';

type PasswordAction = 'app-setup' | 'email-setup' | 'regenerate' | 'disable-app' | 'disable-email';

type Flow =
  | { kind: 'password'; action: PasswordAction }
  | { kind: 'scan'; setup: MfaSetup }
  | { kind: 'email-code'; sentTo: string }
  | { kind: 'recovery'; code: string };

interface PasswordResult {
  setup?: MfaSetup;
  sentTo?: string;
  recoveryCode?: string;
}

const PASSWORD_ACTION_LABELS: Record<PasswordAction, string> = {
  'app-setup': 'Continuă',
  'email-setup': 'Trimite codul pe email',
  regenerate: 'Generează un cod nou',
  'disable-app': 'Dezactivează aplicația',
  'disable-email': 'Dezactivează codul pe email',
};

const DISABLED_NOTICE: Partial<Record<PasswordAction, string>> = {
  'disable-app': 'Aplicația de autentificare a fost dezactivată.',
  'disable-email': 'Codul pe email a fost dezactivat.',
};

const SIX_DIGITS = /^\d{6}$/;

function QrImage({ uri }: Readonly<{ uri: string }>) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(uri, { margin: 1, width: 192 })
      .then((url) => {
        if (live) setSrc(url);
      })
      .catch(() => setSrc(null));
    return () => {
      live = false;
    };
  }, [uri]);
  return src ? (
    <img src={src} width={192} height={192} alt="Cod QR pentru aplicația de autentificare" />
  ) : null;
}

function PasswordStep({
  action,
  willTurnOff,
  onCancel,
  onDone,
}: Readonly<{
  action: PasswordAction;
  willTurnOff: boolean;
  onCancel: () => void;
  onDone: (result: PasswordResult) => void;
}>) {
  const startApp = useStartAppSetup();
  const startEmail = useStartEmailSetup();
  const regenerate = useRegenerateRecoveryCode();
  const disableApp = useDisableMfa(MfaMethod.App);
  const disableEmail = useDisableMfa(MfaMethod.Email);
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const mutation = {
    'app-setup': startApp,
    'email-setup': startEmail,
    regenerate,
    'disable-app': disableApp,
    'disable-email': disableEmail,
  }[action];
  const disabling = action === 'disable-app' || action === 'disable-email';

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!password) return;
    if (action === 'app-setup') startApp.mutate(password, { onSuccess: (setup) => onDone({ setup }) });
    if (action === 'email-setup') startEmail.mutate(password, { onSuccess: (r) => onDone(r) });
    if (action === 'regenerate') regenerate.mutate(password, { onSuccess: (r) => onDone(r) });
    if (action === 'disable-app') disableApp.mutate(password, { onSuccess: () => onDone({}) });
    if (action === 'disable-email') disableEmail.mutate(password, { onSuccess: () => onDone({}) });
  };

  return (
    <form onSubmit={submit} noValidate className="stack">
      {disabling ? (
        <Alert tone="warning" title="Dezactivați această metodă?">
          {willTurnOff
            ? 'Este singura metodă activă: contul rămâne protejat doar de parolă, iar codul de recuperare nu mai funcționează.'
            : 'Cealaltă metodă rămâne activă, la fel și codul de recuperare.'}{' '}
          Celelalte sesiuni deschise se închid.
        </Alert>
      ) : null}
      {mutation.isError ? <Alert tone="danger" title={mutation.error.message} /> : null}
      <TextField
        label="Parola, pentru confirmare"
        type="password"
        autoComplete="current-password"
        maxLength={200}
        value={password}
        onChange={(e) => {
          mutation.reset();
          setPassword(e.target.value);
        }}
        error={touched && !password ? 'Introduceți parola.' : undefined}
      />
      <div className="spv-row">
        <Button type="submit" size="sm" variant={disabling ? 'danger' : 'primary'} loading={mutation.isPending}>
          {PASSWORD_ACTION_LABELS[action]}
        </Button>
        <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={onCancel}>
          Renunță
        </Button>
      </div>
    </form>
  );
}

function CodeForm({
  label,
  invalidMessage,
  pending,
  error,
  onReset,
  onSubmit,
  onCancel,
}: Readonly<{
  label: string;
  invalidMessage: string;
  pending: boolean;
  error: Error | null;
  onReset: () => void;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}>) {
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const clean = code.replaceAll(/\s/g, '');
  const invalid = !SIX_DIGITS.test(clean);

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!invalid) onSubmit(clean);
  };

  return (
    <form onSubmit={submit} noValidate className="stack">
      {error ? <Alert tone="danger" title={error.message} /> : null}
      <TextField
        label={label}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        value={code}
        onChange={(e) => {
          onReset();
          setCode(e.target.value);
        }}
        error={touched && invalid ? invalidMessage : undefined}
      />
      <div className="spv-row">
        <Button type="submit" size="sm" variant="primary" icon="check" loading={pending}>
          Activează
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          Renunță
        </Button>
      </div>
    </form>
  );
}

function ScanStep({
  setup,
  onCancel,
  onDone,
}: Readonly<{ setup: MfaSetup; onCancel: () => void; onDone: (recoveryCode: string | null) => void }>) {
  const confirm = useConfirmAppSetup();
  return (
    <div className="stack">
      <ol className="spv-steps">
        <li>Deschideți aplicația de autentificare pe telefon (Google Authenticator, Microsoft Authenticator etc.).</li>
        <li>Scanați codul QR sau introduceți manual cheia de mai jos.</li>
        <li>Scrieți codul de 6 cifre afișat de aplicație.</li>
      </ol>
      <QrImage uri={setup.otpauthUri} />
      <CopyField value={setup.secret} label="Cheie pentru introducere manuală" />
      <CodeForm
        label="Cod din aplicație"
        invalidMessage="Introduceți cele 6 cifre din aplicație."
        pending={confirm.isPending}
        error={confirm.error}
        onReset={() => confirm.reset()}
        onSubmit={(code) => confirm.mutate(code, { onSuccess: (r) => onDone(r.recoveryCode) })}
        onCancel={onCancel}
      />
    </div>
  );
}

function EmailCodeStep({
  sentTo,
  onCancel,
  onDone,
}: Readonly<{ sentTo: string; onCancel: () => void; onDone: (recoveryCode: string | null) => void }>) {
  const confirm = useConfirmEmailSetup();
  return (
    <div className="stack">
      <Alert tone="info" title={`Am trimis un cod de 6 cifre la ${sentTo}.`}>
        Introduceți-l mai jos în cel mult 10 minute, ca să confirmăm că primiți emailurile.
      </Alert>
      <CodeForm
        label="Cod din email"
        invalidMessage="Introduceți cele 6 cifre din email."
        pending={confirm.isPending}
        error={confirm.error}
        onReset={() => confirm.reset()}
        onSubmit={(code) => confirm.mutate(code, { onSuccess: (r) => onDone(r.recoveryCode) })}
        onCancel={onCancel}
      />
    </div>
  );
}

function RecoveryStep({ code, onDone }: Readonly<{ code: string; onDone: () => void }>) {
  return (
    <div className="stack">
      <Alert tone="warning" title="Păstrați codul de recuperare">
        Dacă pierdeți telefonul sau accesul la email, vă puteți autentifica o singură dată cu acest
        cod. Notați-l într-un loc sigur: nu îl mai afișăm.
      </Alert>
      <CopyField value={code} label="Cod de recuperare" />
      <div>
        <Button size="sm" variant="primary" icon="check" onClick={onDone}>
          L-am salvat
        </Button>
      </div>
    </div>
  );
}

function MethodRow({
  title,
  description,
  enabledAt,
  onEnable,
  onDisable,
}: Readonly<{
  title: string;
  description: string;
  enabledAt: string | null;
  onEnable: () => void;
  onDisable: () => void;
}>) {
  return (
    <div className="spv-row" style={{ justifyContent: 'space-between' }}>
      <div>
        <div className="strong">{title}</div>
        <span className="muted small">
          {description}
          {enabledAt ? ` Activă din ${formatDate(enabledAt)}.` : ''}
        </span>
      </div>
      <div className="spv-row">
        {enabledAt ? (
          <>
            <StatusBadge status="active">Activă</StatusBadge>
            <Button size="sm" variant="ghost" icon="x" onClick={onDisable}>
              Dezactivează
            </Button>
          </>
        ) : (
          <>
            <StatusBadge status="no">Dezactivată</StatusBadge>
            <Button size="sm" icon="key" onClick={onEnable}>
              Activează
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function activeCount(mfa: MfaStatus): number {
  return [mfa.appEnabledAt, mfa.emailEnabledAt].filter(Boolean).length;
}

function Overview({
  mfa,
  notice,
  onAction,
}: Readonly<{ mfa: MfaStatus; notice: string | null; onAction: (a: PasswordAction) => void }>) {
  return (
    <div className="stack">
      {notice ? <Alert tone="success" title={notice} /> : null}
      <span className="muted small">
        Opțional: la autentificare cerem, pe lângă parolă, un cod. Alegeți una sau ambele metode;
        dacă le activați pe amândouă, alegeți la fiecare autentificare. Recomandat, pentru că în
        cont sunt certificatele ANAF și datele clienților.
      </span>
      <MethodRow
        title="Aplicația de autentificare"
        description="Cod de 6 cifre din Google Authenticator, Microsoft Authenticator etc. Cea mai sigură variantă."
        enabledAt={mfa.appEnabledAt}
        onEnable={() => onAction('app-setup')}
        onDisable={() => onAction('disable-app')}
      />
      <MethodRow
        title="Cod pe email"
        description="Vă trimitem un cod de 6 cifre pe adresa contului, valabil 10 minute."
        enabledAt={mfa.emailEnabledAt}
        onEnable={() => onAction('email-setup')}
        onDisable={() => onAction('disable-email')}
      />
      {mfa.enabled && !mfa.recoveryCodeAvailable ? (
        <Alert tone="warning" title="Nu aveți un cod de recuperare valabil">
          Codul a fost folosit sau a fost blocat după prea multe încercări greșite. Generați unul
          nou, ca să nu rămâneți fără acces.
        </Alert>
      ) : null}
      {mfa.enabled ? (
        <div>
          <Button size="sm" icon="refresh" onClick={() => onAction('regenerate')}>
            Cod de recuperare nou
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function MfaCard() {
  const status = useMfaStatus();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const finishSetup = (recoveryCode: string | null, enabledNotice: string) => {
    if (recoveryCode) {
      setFlow({ kind: 'recovery', code: recoveryCode });
    } else {
      setFlow(null);
      setNotice(enabledNotice);
    }
  };

  const body = () => {
    if (status.isPending) return <div className="loading">Se încarcă…</div>;
    if (status.isError) return <QueryError error={status.error} retry={() => status.refetch()} />;
    const cancel = () => setFlow(null);
    if (flow?.kind === 'recovery') return <RecoveryStep code={flow.code} onDone={cancel} />;
    if (flow?.kind === 'scan') {
      return (
        <ScanStep
          setup={flow.setup}
          onCancel={cancel}
          onDone={(code) => finishSetup(code, 'Aplicația de autentificare a fost activată.')}
        />
      );
    }
    if (flow?.kind === 'email-code') {
      return (
        <EmailCodeStep
          sentTo={flow.sentTo}
          onCancel={cancel}
          onDone={(code) => finishSetup(code, 'Codul pe email a fost activat.')}
        />
      );
    }
    if (flow?.kind === 'password') {
      const { action } = flow;
      return (
        <PasswordStep
          action={action}
          willTurnOff={activeCount(status.data) === 1}
          onCancel={cancel}
          onDone={(result) => {
            setNotice(DISABLED_NOTICE[action] ?? null);
            if (result.setup) setFlow({ kind: 'scan', setup: result.setup });
            else if (result.sentTo) setFlow({ kind: 'email-code', sentTo: result.sentTo });
            else if (result.recoveryCode) setFlow({ kind: 'recovery', code: result.recoveryCode });
            else setFlow(null);
          }}
        />
      );
    }
    return (
      <Overview
        mfa={status.data}
        notice={notice}
        onAction={(action) => {
          setNotice(null);
          setFlow({ kind: 'password', action });
        }}
      />
    );
  };

  return <Card title="Autentificare în doi pași">{body()}</Card>;
}

