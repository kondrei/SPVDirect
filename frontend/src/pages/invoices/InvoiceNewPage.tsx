import { useReducer, useState, type Dispatch, type SubmitEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useCompanies } from '../../api/hooks/companies';
import {
  useCreateInvoice,
  useInvoiceLineSuggestions,
  useNextInvoiceNumber,
} from '../../api/hooks/invoices';
import type { Company, CreatedInvoice } from '../../api/types';
import { EmptyState } from '../../components/EmptyState';
import { PageHead } from '../../components/PageHead';
import { QueryError } from '../../components/QueryError';
import { SelectField } from '../../components/SelectField';
import { Alert, Button, ButtonLink, Card, TextField } from '../../components/ui';
import { useAppPath } from '../../hooks/useAppPath';
import {
  formatCui,
  isValidCui,
  normalizeCui,
  parseDecimal,
} from '../../lib/format';
import { computeTotals, CURRENCIES, PAYMENT_LABELS } from '../../lib/invoice';
import { BuyerCard } from './BuyerCard';
import { InvoiceCreated } from './InvoiceCreated';
import {
  buildInvoicePayload,
  exchangeRateOf,
  initialInvoiceForm,
  invoiceFormReducer,
  validateInvoiceForm,
  vatRatesOn,
  type InvoiceFormAction,
  type InvoiceHeader,
} from './invoiceForm';
import { InvoiceLinesCard } from './InvoiceLinesCard';
import { InvoiceOptionsCard, InvoiceTotalsCard } from './InvoiceSummaryCards';
import { useBuyerAutofill } from './useBuyerAutofill';
import { Currency, PaymentMethod } from '../../api/enums';

const finite = (value: number) => (Number.isFinite(value) ? value : 0);

function InvoiceHeaderCard({
  header,
  company,
  companies,
  suggestedNumber,
  dispatch,
}: Readonly<{
  header: InvoiceHeader;
  company: Company;
  companies: Company[];
  suggestedNumber: number | undefined;
  dispatch: Dispatch<InvoiceFormAction>;
}>) {
  const set = (patch: Partial<InvoiceHeader>) => dispatch({ type: 'header', patch });
  return (
    <Card
      title="Date generale"
      subtitle={`Furnizor: ${company.name} · ${formatCui(company.cui)}`}
    >
      <div className="stack">
        <div className="form-row">
          <SelectField
            label="Firma emitentă (furnizor)"
            value={header.companyId}
            onChange={(e) => set({ companyId: Number(e.target.value) })}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {formatCui(c.cui)}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Seria"
            mono
            value={header.series}
            onChange={(e) => set({ series: e.target.value })}
            maxLength={10}
            placeholder="FCT"
          />
          <TextField
            label="Număr"
            mono
            inputMode="numeric"
            value={header.number}
            onChange={(e) => set({ number: e.target.value })}
            placeholder={suggestedNumber ? String(suggestedNumber) : '1'}
            hint="Lăsați gol pentru următorul număr din serie."
          />
        </div>
        {company.vatPayer === true && company.vatOnCollection ? (
          <Alert tone="info" title="Firma aplică TVA la încasare.">
            Mențiunea „TVA la încasare” se adaugă automat pe factură.
          </Alert>
        ) : null}
        {company.vatPayer === true ? null : (
          <Alert tone="info" title="Firma nu este plătitoare de TVA.">
            Factura se emite fără TVA, cu mențiunea corespunzătoare.
          </Alert>
        )}
        {company.address ? null : (
          <Alert tone="danger" title="Firma nu are adresă.">
            Reîmprospătați datele din ANAF pe pagina firmei înainte de a emite
            facturi.
          </Alert>
        )}
        <div className="form-row">
          <TextField
            label="Data emiterii"
            type="date"
            value={header.issueDate}
            onChange={(e) => set({ issueDate: e.target.value })}
          />
          <TextField
            label="Data livării / prestării"
            type="date"
            value={header.deliveryDate}
            onChange={(e) => set({ deliveryDate: e.target.value })}
          />
          <TextField
            label="Scadența"
            type="date"
            value={header.dueDate}
            onChange={(e) => set({ dueDate: e.target.value })}
          />
        </div>
        <div className="form-row">
          <SelectField
            label="Moneda"
            value={header.currency}
            onChange={(e) => set({ currency: e.target.value as Currency })}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
          {header.currency === Currency.RON ? null : (
            <TextField
              label={`Curs BNR (RON pentru 1 ${header.currency})`}
              mono
              inputMode="decimal"
              value={header.exchangeRate}
              onChange={(e) => set({ exchangeRate: e.target.value })}
              placeholder="4,9750"
              hint="Necesar pentru TVA exprimat în RON."
            />
          )}
          <SelectField
            label="Mod de plată"
            value={header.paymentMethod}
            onChange={(e) => set({ paymentMethod: e.target.value as PaymentMethod })}
          >
            {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_LABELS[m]}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
    </Card>
  );
}

function InvoiceForm({ companies }: Readonly<{ companies: Company[] }>) {
  const appPath = useAppPath();
  const [params] = useSearchParams();
  const requested = Number(params.get('company'));
  const [state, dispatch] = useReducer(
    invoiceFormReducer,
    companies.find((c) => c.id === requested)?.id ?? companies[0].id,
    initialInvoiceForm,
  );
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInvoice | null>(null);
  const { header, buyer, lines } = state;
  const company = companies.find((c) => c.id === header.companyId) ?? companies[0];
  const vatPayer = company.vatPayer === true;

  const autofill = useBuyerAutofill(buyer.cui, (cui, found) =>
    dispatch({ type: 'buyerFound', cui, found }),
  );
  const create = useCreateInvoice();
  const suggested = useNextInvoiceNumber(company.id, header.series.trim().toUpperCase());
  const [suggestionsCui, setSuggestionsCui] = useState('');
  const previousLines = useInvoiceLineSuggestions(company.id, suggestionsCui);
  const suggestions =
    suggestionsCui === normalizeCui(buyer.cui)
      ? (previousLines.data ?? []).filter((s) => s.currency === header.currency)
      : [];

  const rates = vatRatesOn(header.deliveryDate);
  const exchange = exchangeRateOf(header);
  const totals = computeTotals(
    lines.map((l) => ({
      quantity: finite(parseDecimal(l.quantity)),
      unitPrice: finite(parseDecimal(l.unitPrice)),
      vatRate: Number(l.vatRate),
    })),
    vatPayer,
    exchange !== null && Number.isFinite(exchange) ? exchange : null,
  );

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    const problem = validateInvoiceForm(state);
    setError(problem);
    if (problem) return;
    create.mutate(buildInvoicePayload(company, state), { onSuccess: setCreated });
  };

  const reset = () => {
    setCreated(null);
    setError(null);
    dispatch({ type: 'reset' });
    create.reset();
    autofill.reset();
  };

  if (created) return <InvoiceCreated result={created} onAnother={reset} />;

  return (
    <>
      <PageHead
        crumbs={<Link to={appPath('/invoices')}>Facturi</Link>}
        title="Factură nouă"
        context="Factură fiscală conform art. 319 din Codul fiscal."
      />
      <form className="stack" onSubmit={submit} noValidate>
        <InvoiceHeaderCard
          header={header}
          company={company}
          companies={companies}
          suggestedNumber={suggested.data?.number}
          dispatch={dispatch}
        />
        <BuyerCard buyer={buyer} dispatch={dispatch} autofill={autofill} />
        <InvoiceLinesCard
          lines={lines}
          rates={rates}
          currency={header.currency}
          vatPayer={vatPayer}
          suggestions={suggestions}
          onOpenSuggestions={() => {
            if (isValidCui(buyer.cui)) setSuggestionsCui(normalizeCui(buyer.cui));
          }}
          dispatch={dispatch}
        />
        <div className="grid-1-1">
          <InvoiceOptionsCard state={state} dispatch={dispatch} />
          <InvoiceTotalsCard
            totals={totals}
            currency={header.currency}
            vatPayer={vatPayer}
          />
        </div>

        {error ? <Alert tone="danger" title={error} /> : null}
        {create.isError ? (
          <Alert tone="danger" title="Factura nu a fost emisă.">
            {create.error.message}
          </Alert>
        ) : null}
        <div className="spv-row">
          <Button
            type="submit"
            variant="primary"
            icon="invoice"
            loading={create.isPending}
            disabled={!company.address}
          >
            Emite factura
          </Button>
          <ButtonLink to={appPath('/invoices')}>Renunță</ButtonLink>
        </div>
      </form>
    </>
  );
}

export function InvoiceNewPage() {
  const appPath = useAppPath();
  const companies = useCompanies();
  if (companies.isPending) return <div className="loading">Se încarcă…</div>;
  if (companies.isError) {
    return (
      <QueryError error={companies.error} retry={() => companies.refetch()} />
    );
  }
  if (companies.data.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="building"
          title="Adăugați întâi o firmă."
          actions={
            <ButtonLink to={appPath('/companies')} variant="primary">
              Mergi la firme
            </ButtonLink>
          }
        >
          Facturile se emit în numele unei firme din lista dvs.
        </EmptyState>
      </Card>
    );
  }
  return <InvoiceForm companies={companies.data} />;
}
