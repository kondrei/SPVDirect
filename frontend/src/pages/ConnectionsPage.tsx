import { useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  useCompanies,
  useConnections,
  useConnectUrl,
  useDeleteConnection,
  useRenameConnection,
  useTestConnection,
} from '../api/hooks';
import type { AnafConnection } from '../api/types';
import { ConfirmButton } from '../components/ConfirmButton';
import { EmptyState } from '../components/EmptyState';
import { PageHead } from '../components/PageHead';
import { QueryError } from '../components/QueryError';
import {
  Alert,
  Badge,
  Button,
  ButtonAnchor,
  Card,
  StatusBadge,
  TextField,
} from '../components/ui';
import {
  connectionStatus,
  daysUntil,
  formatDate,
  formatDateTime,
  groupSerial,
  pluralFirme,
  pluralZile,
} from '../lib/format';

function CallbackBanner() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status');
  if (status !== 'ok' && status !== 'error') return null;
  const dismiss = (
    <Button size="sm" onClick={() => setParams({}, { replace: true })}>
      Închide
    </Button>
  );
  return status === 'ok' ? (
    <Alert
      tone="success"
      title="Certificatul a fost conectat."
      action={dismiss}
    >
      ANAF a emis tokenurile; tokenul USB nu mai este necesar până la
      reautorizare. Legați certificatul de firmele pe care le acoperă.
    </Alert>
  ) : (
    <Alert tone="danger" title="Autorizarea ANAF nu a reușit." action={dismiss}>
      {params.get('message') ?? 'Reîncercați conectarea certificatului.'}
    </Alert>
  );
}

function ConnectionCard({
  c,
  companies,
}: {
  c: AnafConnection;
  companies: number;
}) {
  const rename = useRenameConnection();
  const remove = useDeleteConnection();
  const test = useTestConnection();
  const connectUrl = useConnectUrl();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(c.label);
  const status = connectionStatus(c);
  const days = daysUntil(c.refreshExpiresAt);

  return (
    <Card
      title={
        editing ? (
          <form
            className="form-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!label.trim()) return;
              rename.mutate(
                { id: c.id, label: label.trim() },
                { onSuccess: () => setEditing(false) },
              );
            }}
          >
            <TextField
              aria-label="Denumire certificat"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={120}
            />
            <Button
              type="submit"
              size="sm"
              variant="primary"
              loading={rename.isPending}
            >
              Salvează
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setLabel(c.label);
                setEditing(false);
              }}
            >
              Renunță
            </Button>
          </form>
        ) : (
          c.label
        )
      }
      subtitle={
        <>
          Serie <span className="mono">{groupSerial(c.certSerial)}</span> ·{' '}
          {c.source === 'self'
            ? 'certificatul cabinetului'
            : 'autorizat prin link'}{' '}
          · {pluralFirme(companies)}
        </>
      }
      actions={
        !editing ? (
          <>
            <StatusBadge status={status}>
              {status === 'expiring'
                ? `Expiră în ${pluralZile(Math.max(0, days))}`
                : undefined}
            </StatusBadge>
          </>
        ) : undefined
      }
    >
      <div className="stack">
        <dl className="dl">
          <dt>Roluri ANAF</dt>
          <dd className="spv-row">
            {c.roles.length ? (
              c.roles.map((r) => (
                <Badge key={r} tone="brand">
                  {r}
                </Badge>
              ))
            ) : (
              <span className="muted">—</span>
            )}
          </dd>
          <dt>Acces expiră</dt>
          <dd className="mono">{formatDate(c.accessExpiresAt)}</dd>
          <dt>Reautorizare până la</dt>
          <dd className="mono">{formatDate(c.refreshExpiresAt)}</dd>
          <dt>Ultima reîmprospătare</dt>
          <dd className="mono">
            {c.lastRefreshedAt ? formatDateTime(c.lastRefreshedAt) : '—'}
          </dd>
        </dl>
        {status === 'expired' || status === 'revoked' ? (
          <Alert
            tone="danger"
            title={
              status === 'revoked'
                ? 'Accesul a fost revocat.'
                : 'Accesul a expirat.'
            }
          >
            {c.source === 'self'
              ? 'Conectați din nou certificatul cabinetului.'
              : 'Generați un link nou din pagina firmei și trimiteți-l titularului.'}
          </Alert>
        ) : null}
        {test.isSuccess ? (
          <Alert tone="success" title="ANAF a răspuns.">
            <span className="mono">{test.data.body}</span>
          </Alert>
        ) : null}
        {test.isError ? (
          <Alert tone="danger" title="Testul a eșuat.">
            {test.error.message}
          </Alert>
        ) : null}
        {rename.isError ? (
          <Alert tone="danger" title={rename.error.message} />
        ) : null}
        {remove.isError ? (
          <Alert tone="danger" title={remove.error.message} />
        ) : null}
        <div className="spv-row">
          <Button
            size="sm"
            icon="refresh"
            loading={test.isPending}
            onClick={() => test.mutate(c.id)}
            disabled={status === 'revoked'}
          >
            Testează conexiunea
          </Button>
          {!editing ? (
            <Button
              size="sm"
              variant="ghost"
              icon="edit"
              onClick={() => setEditing(true)}
            >
              Redenumește
            </Button>
          ) : null}
          {c.source === 'self' &&
          (status === 'expiring' || status === 'expired') ? (
            <ButtonAnchor
              size="sm"
              variant="primary"
              icon="certificate"
              href={connectUrl}
            >
              Reautorizează
            </ButtonAnchor>
          ) : null}
          <span style={{ marginLeft: 'auto' }}>
            <ConfirmButton
              label="Șterge"
              confirmLabel="Revocă și șterge"
              loading={remove.isPending}
              onConfirm={() => remove.mutate(c.id)}
            />
          </span>
        </div>
      </div>
    </Card>
  );
}

export function ConnectionsPage() {
  const connections = useConnections();
  const companies = useCompanies();
  const connectUrl = useConnectUrl();
  const count = (id: string) =>
    companies.data?.filter((co) => co.anafConnectionId === id).length ?? 0;
  const list = connections.data ?? [];

  return (
    <>
      <PageHead
        title="Certificate ANAF"
        context="Fiecare certificat calificat autorizat dă acces la SPV pentru firmele pe care le reprezintă."
        actions={
          <ButtonAnchor
            variant="primary"
            icon="certificate"
            href={connectUrl}
          >
            Conectează certificat
          </ButtonAnchor>
        }
      />
      <CallbackBanner />
      <Alert tone="info" title="Tokenul USB se folosește doar la autorizare.">
        Veți fi redirecționat la logincert.anaf.ro, unde alegeți certificatul și
        introduceți PIN-ul. SPVDirect nu vede PIN-ul; primește de la ANAF un
        acces valabil până la un an.
      </Alert>
      {connections.isError ? (
        <QueryError
          error={connections.error}
          retry={() => connections.refetch()}
        />
      ) : null}
      {connections.isPending ? (
        <div className="loading">Se încarcă…</div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon="certificate"
            title="Niciun certificat conectat."
            actions={
              <ButtonAnchor
                variant="primary"
                icon="certificate"
                href={connectUrl}
              >
                Conectează certificat
              </ButtonAnchor>
            }
          >
            Conectați certificatul cabinetului (de exemplu unul de împuternicit
            care acoperă mai multe CUI-uri), sau trimiteți clientului un link de
            autorizare din pagina firmei.
          </EmptyState>
        </Card>
      ) : (
        <div className="stack">
          {list.map((c) => (
            <ConnectionCard key={c.id} c={c} companies={count(c.id)} />
          ))}
        </div>
      )}
    </>
  );
}
