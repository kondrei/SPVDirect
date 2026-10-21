import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useMe } from '../api/hooks/auth';
import { usePublicStats } from '../api/hooks/publicStats';
import type { PublicStats } from '../api/types';
import {
  Badge,
  Button,
  ButtonLink,
  Icon,
  type IconName,
  Stat,
  StatusBadge,
  Wordmark,
} from '../components/ui';
import { accountantPath } from '../hooks/useAppPath';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTheme } from '../hooks/useTheme';
import { formatDateTime } from '../lib/format';
import { safeNext } from '../lib/safeNext';
import { AppPreview } from './landing/AppPreview';
import { AuthPanel, authTab, type AuthTab } from './landing/AuthPanel';

const numberFmt = new Intl.NumberFormat('ro-RO');

const COUNTERS: { key: keyof Omit<PublicStats, 'updatedAt'>; label: string; icon: IconName }[] = [
  { key: 'accountants', label: 'Contabili activi', icon: 'key' },
  { key: 'companies', label: 'Firme gestionate', icon: 'building' },
  { key: 'invoices', label: 'Facturi emise', icon: 'invoice' },
  { key: 'efacturaUploads', label: 'Facturi acceptate în e-Factura', icon: 'upload' },
  { key: 'spvMessages', label: 'Mesaje SPV arhivate', icon: 'download' },
  { key: 'anafConnections', label: 'Certificate ANAF conectate', icon: 'certificate' },
];

interface Feature {
  icon: IconName;
  title: string;
  text: string;
  points: string[];
  soon?: boolean;
}

const FEATURES: Feature[] = [
  {
    icon: 'certificate',
    title: 'Conectare certificat ANAF',
    text: 'Autorizați accesul o singură dată, cu tokenul USB sau certificatul în cloud, direct pe logincert.anaf.ro.',
    points: [
      'Tokenurile ANAF se reînnoiesc fără să mai folosiți certificatul',
      'Linkuri de autorizare pentru clienții care își păstrează certificatul',
      'Vedeți rolurile și data expirării fiecărui certificat',
    ],
  },
  {
    icon: 'building',
    title: 'Portofoliu de firme',
    text: 'Adăugați clienții după CUI. Datele se completează din registrul ANAF.',
    points: [
      'Denumire, adresă, Reg. Com. și cod CAEN preluate automat',
      'Plătitor de TVA, TVA la încasare și înscriere în e-Factura',
      'Import în bloc al unei liste de CUI-uri',
    ],
  },
  {
    icon: 'invoice',
    title: 'Facturare conformă',
    text: 'Emiteți facturi fiscale conform art. 319 Cod fiscal, cu cotele de TVA în vigoare la data livrării.',
    points: [
      'PDF și XML UBL 2.1 CIUS-RO, validat de ANAF',
      'Facturi storno totale sau parțiale, pe fiecare linie',
      'Trimitere pe email și arhivare în cloud',
    ],
  },
  {
    icon: 'upload',
    title: 'RO e-Factura',
    text: 'Încărcați facturile în SPV și urmăriți starea lor fără să intrați în portalul ANAF.',
    points: [
      'Validare cu validatorul ANAF înainte de trimitere',
      'Starea fiecărei încărcări: acceptată, respinsă, în prelucrare',
      'Lista mesajelor ANAF și descărcarea facturilor primite',
    ],
  },
  {
    icon: 'download',
    title: 'Mesaje SPV',
    text: 'Mesajele din Spațiul Privat Virtual salvate pentru toate firmele, într-o arhivă comună.',
    points: [
      'Filtrare după CIF',
      'Descărcarea documentelor salvate',
      'Cereri de documente către ANAF, direct din aplicație',
    ],
  },
  {
    icon: 'truck',
    title: 'RO e-Transport',
    text: 'Declararea transporturilor de bunuri cu risc fiscal ridicat și obținerea codurilor UIT.',
    points: ['Construit pe aceeași conexiune ANAF', 'Istoric al declarațiilor pe firmă'],
    soon: true,
  },
];

const STEPS = [
  { title: 'Creați contul', text: 'Cererea de cont este verificată și aprobată de echipa SPVDirect.' },
  { title: 'Conectați certificatul', text: 'Autorizați SPVDirect pe logincert.anaf.ro, o singură dată pentru fiecare certificat.' },
  { title: 'Adăugați firmele', text: 'Introduceți CUI-urile clienților. Facturile și mesajele SPV sunt la un clic distanță.' },
];

const SECURITY = [
  'Certificatul digital și PIN-ul nu ajung niciodată la SPVDirect: se folosesc doar în browser, pe site-ul ANAF.',
  'Tokenurile emise de ANAF sunt stocate criptat (AES-256-GCM).',
  'Fiecare apel către ANAF este jurnalizat, fără tokenuri sau date de autentificare.',
  'Conturile noi sunt aprobate manual, iar sesiunile expiră la schimbarea parolei.',
];

function Counters() {
  const stats = usePublicStats();
  let status = 'Se încarcă cifrele…';
  if (stats.data) {
    status = `Actualizat la ${formatDateTime(stats.data.updatedAt)}.`;
  } else if (stats.isError) {
    status = 'Cifrele nu sunt disponibile momentan. Reveniți în câteva minute.';
  }
  return (
    <section className="landing-section" id="cifre" aria-labelledby="cifre-title">
      <div className="landing-section-head">
        <h2 id="cifre-title">SPVDirect în cifre</h2>
        <p>{status}</p>
      </div>
      <div className="landing-stats" aria-busy={stats.isPending || undefined}>
        {COUNTERS.map((c) => (
          <Stat
            key={c.key}
            icon={c.icon}
            label={c.label}
            value={stats.data ? numberFmt.format(stats.data[c.key]) : '—'}
          />
        ))}
      </div>
    </section>
  );
}

export function LandingPage() {
  useDocumentTitle('');
  const { theme, toggle } = useTheme();
  const me = useMe();
  const appPath = me.data ? accountantPath(me.data.id, '') : null;
  const [params, setParams] = useSearchParams();
  const tab = authTab(params.get('auth'));
  const wantsAuth = params.has('auth');
  const [scrollOnLoad] = useState(wantsAuth);

  useEffect(() => {
    if (scrollOnLoad) document.getElementById('cont')?.scrollIntoView?.({ block: 'start' });
  }, [scrollOnLoad]);

  const selectTab = (next: AuthTab) => {
    setParams(
      (p) => {
        const q = new URLSearchParams(p);
        q.set('auth', next);
        return q;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const openAuth = (next: AuthTab) => {
    selectTab(next);
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('cont')?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    requestAnimationFrame(() => document.getElementById(`auth-tab-${next}`)?.focus({ preventScroll: true }));
  };

  if (me.data && wantsAuth) {
    const next = params.get('next');
    return <Navigate to={next ? safeNext(next) : accountantPath(me.data.id, '')} replace />;
  }

  let account: ReactNode;
  if (appPath) {
    account = (
      <div className="spv-card landing-auth landing-signed">
        <Icon name="check" />
        <h2>Sunteți autentificat</h2>
        <p className="muted">{me.data?.name || me.data?.email}</p>
        <ButtonLink to={appPath} variant="primary" icon="chevron">
          Deschide aplicația
        </ButtonLink>
      </div>
    );
  } else if (me.isPending) {
    account = <div className="spv-card landing-auth landing-auth-wait" id="cont" aria-busy="true" />;
  } else {
    account = <AuthPanel tab={tab} onTab={selectTab} />;
  }

  return (
    <div className="landing">
      <header className="landing-bar">
        <a href="#top" className="landing-home" aria-label="SPVDirect, începutul paginii">
          <Wordmark />
        </a>
        <nav className="landing-nav" aria-label="Secțiuni">
          <a href="#aplicatia">Aplicația</a>
          <a href="#functionalitati">Funcționalități</a>
          <a href="#cifre">Cifre</a>
          <a href="#securitate">Securitate</a>
        </nav>
        <div className="spv-row">
          <button
            type="button"
            className="spv-btn spv-btn-ghost spv-btn-sm"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Temă luminoasă' : 'Temă întunecată'}
            title={theme === 'dark' ? 'Temă luminoasă' : 'Temă întunecată'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          {appPath ? (
            <ButtonLink to={appPath} variant="primary" size="sm">
              Deschide aplicația
            </ButtonLink>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => openAuth('login')}>
                Autentificare
              </Button>
              <Button variant="primary" size="sm" onClick={() => openAuth('register')}>
                Creează cont
              </Button>
            </>
          )}
        </div>
      </header>

      <main id="top">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <Badge tone="brand" icon="check">
              Portal pentru contabili
            </Badge>
            <h1>Serviciile ANAF ale tuturor clienților, într-un singur loc.</h1>
            <p>
              SPVDirect conectează cabinetul de contabilitate la Spațiul Privat Virtual: facturare,
              RO e-Factura și mesaje SPV pentru fiecare firmă, cu certificatul digital folosit o
              singură dată.
            </p>
          </div>
          {account}
        </section>

        <section className="landing-section" id="aplicatia" aria-labelledby="aplicatia-title">
          <div className="landing-section-head">
            <h2 id="aplicatia-title">Aplicația</h2>
            <p>Panoul cabinetului: firmele, certificatele ANAF și facturile, dintr-o privire. Datele din imagine sunt de exemplu.</p>
          </div>
          <AppPreview />
        </section>

        <Counters />

        <section className="landing-section" id="functionalitati" aria-labelledby="functionalitati-title">
          <div className="landing-section-head">
            <h2 id="functionalitati-title">Funcționalități</h2>
            <p>Tot ce face un cabinet în SPV, fără să schimbe certificatul de la o firmă la alta.</p>
          </div>
          <div className="landing-features">
            {FEATURES.map((f) => (
              <article key={f.title} className="spv-card landing-feature">
                <div className="landing-feature-head">
                  <span className="landing-feature-icon">
                    <Icon name={f.icon} />
                  </span>
                  {f.soon ? <StatusBadge status="pending">În curând</StatusBadge> : null}
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
                <ul>
                  {f.points.map((p) => (
                    <li key={p}>
                      <Icon name="check" />
                      {p}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section" aria-labelledby="pasi-title">
          <div className="landing-section-head">
            <h2 id="pasi-title">Cum începeți</h2>
          </div>
          <ol className="landing-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="spv-card">
                <span className="landing-step-no">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section" id="securitate" aria-labelledby="securitate-title">
          <div className="spv-card landing-security">
            <div>
              <h2 id="securitate-title">Securitate</h2>
              <p className="muted">Lucrați cu datele fiscale ale clienților. Le tratăm ca atare.</p>
            </div>
            <ul>
              {SECURITY.map((s) => (
                <li key={s}>
                  <Icon name="certificate" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="landing-final">
          <h2>Începeți cu primul certificat.</h2>
          <p>Cererea de cont durează un minut.</p>
          {appPath ? (
            <ButtonLink to={appPath} variant="primary" icon="chevron">
              Deschide aplicația
            </ButtonLink>
          ) : (
            <Button variant="primary" icon="plus" onClick={() => openAuth('register')}>
              Creează cont
            </Button>
          )}
        </section>
      </main>

      <footer className="landing-foot">
        <Wordmark />
        <span className="muted small">
          © {new Date().getFullYear()} SPVDirect. Nu este un serviciu oficial ANAF.
        </span>
      </footer>
    </div>
  );
}
