import { Fragment, type ReactNode } from 'react';
import { useRefreshCompanyAnaf } from '../api/hooks';
import type { AnafTvaRecord, CaenInfo, Company } from '../api/types';
import { CaenName } from './CaenName';
import { formatAnafDate, formatCui, formatDateTime } from '../lib/format';
import { Alert, Button, Card, StatusBadge } from './ui';

type Row = [label: string, value: ReactNode];

function text(
  value: string | number | undefined | null,
  { mono = false, date = false } = {},
): ReactNode {
  const s = value == null ? '' : String(value).trim();
  if (!s) return <span className="muted">—</span>;
  const shown = date ? formatAnafDate(s) : s;
  return mono || date ? <span className="mono">{shown}</span> : shown;
}

const flag = (on: boolean | undefined | null) =>
  on == null ? text('') : <StatusBadge status={on ? 'yes' : 'no'} />;
const date = (value: string | undefined) => text(value, { date: true });
const inactiveFlag = (on: boolean | undefined | null) =>
  on ? <StatusBadge status="inactive" /> : flag(on);

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="stack-sm">
      <h3 className="h3">{title}</h3>
      <dl className="dl">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

function address(a: Record<string, string>, p: 's' | 'd'): Row[] {
  const f = (key: string) => a?.[`${p}${key}`];
  return [
    ['Stradă', text(f('denumire_Strada'))],
    ['Număr', text(f('numar_Strada'))],
    ['Localitate', text(f('denumire_Localitate'))],
    ['Cod localitate', text(f('cod_Localitate'), { mono: true })],
    ['Județ', text(f('denumire_Judet'))],
    ['Cod județ', text(f('cod_Judet'), { mono: true })],
    ['Cod județ auto', text(f('cod_JudetAuto'), { mono: true })],
    ['Țară', text(f('tara'))],
    ['Detalii adresă', text(f('detalii_Adresa'))],
    ['Cod poștal', text(f('cod_Postal'), { mono: true })],
  ];
}

export function AnafDetails({
  data,
  caen,
}: {
  data: AnafTvaRecord;
  caen?: CaenInfo | null;
}) {
  const g = data.date_generale;
  const tva = data.inregistrare_scop_Tva;
  const inc = data.inregistrare_RTVAI;
  const inactiv = data.stare_inactiv;
  const split = data.inregistrare_SplitTVA;
  const periods = tva?.perioade_TVA ?? [];
  const caenCode = g.cod_CAEN?.trim();
  const caenValue = caenCode ? (
    <CaenName caen={caen} code={caenCode} />
  ) : (
    text('')
  );

  return (
    <div className="anaf-grid">
      <Section
        title="Date generale"
        rows={[
          ['Denumire', text(g.denumire)],
          ['CUI', text(formatCui(String(g.cui)), { mono: true })],
          ['Nr. Reg. Com.', text(g.nrRegCom, { mono: true })],
          ['Adresă domiciliu fiscal', text(g.adresa)],
          ['Cod poștal', text(g.codPostal, { mono: true })],
          ['Telefon', text(g.telefon, { mono: true })],
          ['Fax', text(g.fax, { mono: true })],
          ['Act autorizare', text(g.act)],
          ['Stare înregistrare', text(g.stare_inregistrare)],
          ['Data înregistrării', date(g.data_inregistrare)],
          ['Cod CAEN', caenValue],
          ['IBAN', text(g.iban, { mono: true })],
          ['Organ fiscal competent', text(g.organFiscalCompetent)],
          ['Formă de proprietate', text(g.forma_de_proprietate)],
          ['Formă de organizare', text(g.forma_organizare)],
          ['Formă juridică', text(g.forma_juridica)],
        ]}
      />
      <div className="stack">
        <Section
          title="RO e-Factura"
          rows={[
            ['În Registrul RO e-Factura', flag(g.statusRO_e_Factura)],
            ['Data înscrierii', date(g.data_inreg_Reg_RO_e_Factura)],
          ]}
        />
        <Section
          title="Înregistrare în scopuri de TVA"
          rows={[
            ['Plătitor de TVA', flag(tva?.scpTVA)],
            ...periods.flatMap((p, i): Row[] => {
              const n = periods.length > 1 ? ` (${i + 1})` : '';
              return [
                [`Data înregistrării${n}`, date(p.data_inceput_ScpTVA)],
                [`Data anulării${n}`, date(p.data_sfarsit_ScpTVA)],
                [`Data operării anulării${n}`, date(p.data_anul_imp_ScpTVA)],
                [`Temeiul anulării${n}`, text(p.mesaj_ScpTVA)],
              ];
            }),
          ]}
        />
        <Section
          title="TVA la încasare"
          rows={[
            ['Aplică TVA la încasare', flag(inc?.statusTvaIncasare)],
            ['De la', date(inc?.dataInceputTvaInc)],
            ['Până la', date(inc?.dataSfarsitTvaInc)],
            ['Data actualizării', date(inc?.dataActualizareTvaInc)],
            ['Data publicării', date(inc?.dataPublicareTvaInc)],
            ['Tip actualizare', text(inc?.tipActTvaInc)],
          ]}
        />
      </div>
      <Section
        title="Contribuabil inactiv / reactivat"
        rows={[
          ['Inactiv', inactiveFlag(inactiv?.statusInactivi)],
          ['Data inactivării', date(inactiv?.dataInactivare)],
          ['Data reactivării', date(inactiv?.dataReactivare)],
          ['Data publicării', date(inactiv?.dataPublicare)],
          ['Data radierii', date(inactiv?.dataRadiere)],
        ]}
      />
      <Section
        title="Plata defalcată a TVA"
        rows={[
          ['Aplică plata defalcată', flag(split?.statusSplitTVA)],
          ['Data începerii', date(split?.dataInceputSplitTVA)],
          ['Data anulării', date(split?.dataAnulareSplitTVA)],
        ]}
      />
      <Section
        title="Adresa sediului social"
        rows={address(data.adresa_sediu_social, 's')}
      />
      <Section
        title="Adresa domiciliului fiscal"
        rows={address(data.adresa_domiciliu_fiscal, 'd')}
      />
    </div>
  );
}

export function AnafDataCard({ company }: { company: Company }) {
  const refresh = useRefreshCompanyAnaf(company.id);
  const data = company.anafData;
  return (
    <Card
      title="Date ANAF"
      subtitle={
        data && company.anafSyncedAt
          ? `Registrul ANAF al contribuabililor · date valabile la ${formatAnafDate(data.date_generale.data)}, preluate ${formatDateTime(company.anafSyncedAt)}`
          : 'Registrul ANAF al contribuabililor (TVA, TVA la încasare, inactivi, plata defalcată, RO e-Factura)'
      }
      actions={
        <Button
          icon="refresh"
          size="sm"
          loading={refresh.isPending}
          onClick={() => refresh.mutate()}
        >
          {data ? 'Actualizează' : 'Preia datele'}
        </Button>
      }
    >
      <div className="stack">
        {refresh.isError ? (
          <Alert tone="danger" title={refresh.error.message} />
        ) : null}
        {data ? (
          <AnafDetails data={data} caen={company.caen} />
        ) : (
          <Alert
            tone="info"
            title="Datele ANAF nu au fost încă preluate pentru această firmă."
          >
            Firma a fost adăugată înainte ca SPVDirect să preia datele de la
            ANAF. Apăsați „Preia datele”.
          </Alert>
        )}
      </div>
    </Card>
  );
}
