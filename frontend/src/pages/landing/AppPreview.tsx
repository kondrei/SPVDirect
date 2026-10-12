import { Icon, type IconName, StatusBadge, type Status, Wordmark } from '../../components/ui';

const NAV: { title?: string; items: { label: string; icon: IconName; count?: number; current?: boolean }[] }[] = [
  {
    items: [
      { label: 'Panou', icon: 'home', current: true },
      { label: 'Firme', icon: 'building', count: 2 },
      { label: 'Certificate ANAF', icon: 'certificate', count: 1 },
    ],
  },
  {
    title: 'Facturare',
    items: [
      { label: 'Facturi', icon: 'invoice' },
      { label: 'Trimise la ANAF', icon: 'upload' },
      { label: 'Mesaje e-Factura', icon: 'download' },
      { label: 'Validator XML', icon: 'check' },
    ],
  },
  {
    title: 'Servicii SPV',
    items: [
      { label: 'Mesaje SPV', icon: 'download' },
      { label: 'e-Transport', icon: 'truck' },
    ],
  },
];

const STATS: { label: string; icon: IconName; value: string; note: string }[] = [
  { label: 'Firme gestionate', icon: 'building', value: '38', note: '2 firme fără certificat' },
  { label: 'Certificate valide', icon: 'certificate', value: '6', note: '1 expiră curând' },
  { label: 'Facturi emise luna aceasta', icon: 'invoice', value: '214', note: '3 stornări' },
  { label: 'Facturat luna aceasta', icon: 'upload', value: '1.284.530,40', note: 'RON, +12% față de septembrie' },
];

const INVOICES: { no: string; buyer: string; amount: string; status: Status }[] = [
  { no: 'SPV-0142', buyer: 'AGRO VEST SRL', amount: '12.400,00', status: 'ok' },
  { no: 'SPV-0143', buyer: 'CONSTRUCT NORD SA', amount: '8.915,50', status: 'processing' },
  { no: 'TMS-0087', buyer: 'LACTA BANAT SRL', amount: '3.210,00', status: 'ok' },
  { no: 'TMS-0088', buyer: 'DELTA LOGISTIC SRL', amount: '640,75', status: 'nok' },
];

const CERTS: { label: string; meta: string; status: Status }[] = [
  { label: 'Popescu, token USB', meta: '24 de firme', status: 'active' },
  { label: 'Ionescu, certificat cloud', meta: 'Reautorizare în 21 de zile', status: 'expiring' },
  { label: 'Marin, token USB', meta: '12 firme', status: 'active' },
];

export function AppPreview() {
  return (
    <figure className="landing-shot" aria-labelledby="app-preview-caption">
      <figcaption id="app-preview-caption" className="spv-sr-only">
        Captură din aplicația SPVDirect, cu date de exemplu: meniul, panoul cu statistici, facturile recente și certificatele ANAF.
      </figcaption>
      <div aria-hidden="true">
        <div className="landing-shot-bar">
          <span className="landing-shot-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="landing-shot-url">spvdirect.ro/accountants/1</span>
        </div>
        <div className="landing-shot-app">
          <div className="spv-side landing-shot-side">
            <div className="spv-side-brand">
              <Wordmark />
            </div>
            {NAV.map((g) => (
              <div key={g.title ?? 'main'}>
                {g.title ? <div className="spv-side-group">{g.title}</div> : null}
                {g.items.map((it) => (
                  <div key={it.label} className={it.current ? 'spv-nav-item landing-shot-current' : 'spv-nav-item'}>
                    <Icon name={it.icon} />
                    {it.label}
                    {it.count ? <span className="spv-nav-count">{it.count}</span> : null}
                  </div>
                ))}
              </div>
            ))}
            <div className="spv-side-foot">
              <span className="spv-avatar">MP</span>
              <div className="app-user">
                <div className="app-user-name">Maria Popescu</div>
                <div className="app-user-email">maria@cabinet-exemplu.ro</div>
              </div>
            </div>
          </div>
          <div className="landing-shot-main">
            <div className="page-head">
              <div>
                <div className="landing-shot-h1">Bună ziua, Maria</div>
                <p>Luni, 12 octombrie 2026</p>
              </div>
              <div className="spv-row">
                <span className="spv-btn spv-btn-secondary spv-btn-sm">
                  <Icon name="plus" />
                  Adaugă firmă
                </span>
                <span className="spv-btn spv-btn-primary spv-btn-sm">
                  <Icon name="certificate" />
                  Conectează certificat
                </span>
              </div>
            </div>
            <div className="spv-alert spv-alert-warning">
              <Icon name="alert" />
              <div>
                <p className="spv-alert-title">Certificatul „Ionescu, certificat cloud” expiră în 21 de zile.</p>
                <p className="spv-alert-text">Titularul trebuie să reautorizeze; 2 firme depind de el.</p>
              </div>
            </div>
            <div className="landing-shot-stats">
              {STATS.map((s) => (
                <div key={s.label} className="spv-card spv-stat">
                  <div className="spv-stat-label">
                    <Icon name={s.icon} />
                    {s.label}
                  </div>
                  <div className="spv-stat-value">{s.value}</div>
                  <div className="spv-stat-note">{s.note}</div>
                </div>
              ))}
            </div>
            <div className="landing-shot-grid">
              <div className="spv-card landing-shot-card">
                <div className="landing-shot-card-head">Facturi recente</div>
                <table className="spv-table">
                  <thead>
                    <tr>
                      <th>Număr</th>
                      <th>Cumpărător</th>
                      <th className="spv-num">Total RON</th>
                      <th>e-Factura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {INVOICES.map((r) => (
                      <tr key={r.no}>
                        <td className="mono">{r.no}</td>
                        <td>{r.buyer}</td>
                        <td className="spv-num">{r.amount}</td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="spv-card landing-shot-card">
                <div className="landing-shot-card-head">Certificate ANAF</div>
                <ul className="landing-shot-list">
                  {CERTS.map((c) => (
                    <li key={c.label}>
                      <div>
                        <div className="strong">{c.label}</div>
                        <div className="muted small">{c.meta}</div>
                      </div>
                      <StatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
