import { useState } from 'react';
import { Link } from 'react-router';
import { useActivity } from '../api/hooks/activity';
import type { ActivityItem, Company } from '../api/types';
import { ACTIVITY_LABELS, ACTIVITY_PAGE_SIZE } from '../common/constants';
import { useAppPath } from '../hooks/useAppPath';
import { formatDateTime, plural } from '../lib/format';
import { EmptyState } from './EmptyState';
import { QueryError } from './QueryError';
import { SelectField } from './SelectField';
import { Badge, Button, Card, DataTable } from './ui';

export function ActivityCard({ companies }: { companies: Company[] }) {
  const [companyId, setCompanyId] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const activity = useActivity({ companyId, page });
  const appPath = useAppPath();
  const byId = new Map(companies.map((c) => [c.id, c]));
  const total = activity.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));

  const company = (row: ActivityItem) => {
    const live = row.companyId ? byId.get(row.companyId) : undefined;
    if (live) {
      return (
        <Link className="row-link" to={appPath(`/companies/${live.id}`)}>
          {live.name}
        </Link>
      );
    }
    const name = row.details.companyName;
    return typeof name === 'string' ? name : '—';
  };

  return (
    <Card
      title="Activitate"
      subtitle="Operațiunile făcute în cont: firme, facturi, e-Factura, SPV, certificate"
    >
      <div className="stack">
        <div className="form-row">
          <SelectField
            label="Firma"
            value={companyId ?? ''}
            onChange={(e) => {
              setCompanyId(e.target.value ? Number(e.target.value) : undefined);
              setPage(1);
            }}
          >
            <option value="">Toate firmele</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
        {activity.isError ? (
          <QueryError error={activity.error} retry={() => activity.refetch()} />
        ) : null}
        {activity.isPending ? (
          <div className="loading">Se încarcă…</div>
        ) : activity.data && activity.data.items.length === 0 ? (
          <EmptyState icon="clock" title="Nicio operațiune înregistrată.">
            Aici apar firmele adăugate, facturile emise sau stornate, trimiterile
            și validările e-Factura și celelalte operațiuni din cont.
          </EmptyState>
        ) : activity.data ? (
          <>
            <DataTable
              caption="Activitate"
              rows={activity.data.items}
              rowKey={(r) => r.id}
              stack
              columns={[
                {
                  key: 'date',
                  header: 'Data și ora',
                  mono: true,
                  render: (r) => formatDateTime(r.createdAt),
                },
                {
                  key: 'action',
                  header: 'Operațiune',
                  render: (r) => {
                    const meta = ACTIVITY_LABELS[r.action];
                    return meta ? (
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    ) : (
                      r.action
                    );
                  },
                },
                { key: 'company', header: 'Firmă', render: company },
                {
                  key: 'description',
                  header: 'Detalii',
                  render: (r) => r.description,
                },
                {
                  key: 'user',
                  header: 'Utilizator',
                  render: (r) => r.accountantName,
                },
              ]}
            />
            <div className="spv-row">
              <Button
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Mai noi
              </Button>
              <span className="muted">
                Pagina {page} din {lastPage} ·{' '}
                {plural(total, 'operațiune', 'operațiuni')}
              </span>
              <Button
                size="sm"
                disabled={page >= lastPage}
                onClick={() => setPage(page + 1)}
              >
                Mai vechi
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
