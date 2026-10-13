import { Fragment, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  useCompanies,
  useCreateInvoice,
  useDownloadInvoice,
  useInvoiceLineSuggestions,
  useNextInvoiceNumber,
  useSaveInvoiceToStorage,
  useUploadInvoiceToAnaf,
  useValidateInvoice,
} from '../../api/hooks';
import type {
  BuyerLookup,
  Company,
  CreateInvoiceInput,
  CreatedInvoice,
  FoundBuyer,
  InvoiceCurrency,
  InvoiceUnit,
  LineSuggestion,
  PaymentMethod,
} from '../../api/types';
import { detailsOf } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorLog } from '../../components/ErrorLog';
import { PageHead } from '../../components/PageHead';
import { QueryError } from '../../components/QueryError';
import { LineDescriptionField } from '../../components/invoices/LineDescriptionField';
import { SendPanel } from '../../components/invoices/SendPanel';
import { StornoPanel } from '../../components/invoices/StornoPanel';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  StatusBadge,
  TextAreaField,
  TextField,
} from '../../components/ui';
import { useAppPath } from '../../hooks/useAppPath';
import { useBuyerAutofill } from './useBuyerAutofill';
import {
  decimalText,
  formatAmount,
  formatCui,
  isValidCui,
  normalizeCui,
} from '../../lib/format';
import {
  allowedVatRates,
  computeTotals,
  CURRENCIES,
  INVOICE_UNITS,
  invoiceFilename,
  invoiceNumber,
  PAYMENT_LABELS,
  todayIso,
  ZERO_VAT_REASONS,
} from '../../lib/invoice';

type ZeroReason = keyof typeof ZERO_VAT_REASONS;

interface LineForm {
  key: number;
  description: string;
  quantity: string;
  unit: InvoiceUnit;
  unitPrice: string;
  vatRate: string;
  zeroReason: ZeroReason;
}

interface BuyerForm {
  cui: string;
  name: string;
  regCom: string;
  address: string;
  iban: string;
  email: string;
  phone: string;
  street: string | null;
  city: string | null;
  county: string | null;
  postalCode: string | null;
  vatPayer: boolean;
}

const EMPTY_BUYER: BuyerForm = {
  cui: '',
  name: '',
  regCom: '',
  address: '',
  iban: '',
  email: '',
  phone: '',
  street: null,
  city: null,
  county: null,
  postalCode: null,
  vatPayer: false,
};

let nextLineKey = 1;

function emptyLine(vatRate: string): LineForm {
  return {
    key: nextLineKey++,
    description: '',
    quantity: '1',
    unit: 'serviciu',
    unitPrice: '',
    vatRate,
    zeroReason: 'E',
  };
}

function parseDecimal(value: string): number {
  const text = value.trim().replace(',', '.');
  return text === '' ? NaN : Number(text);
}

function lineFromSuggestion(
  suggestion: LineSuggestion,
  vatPayer: boolean,
  rates: number[],
): Partial<LineForm> {
  const keepsRate =
    vatPayer && suggestion.vatCategory !== 'O' && rates.includes(suggestion.vatRate);
  return {
    description: suggestion.description,
    quantity: decimalText(suggestion.quantity),
    unit: suggestion.unit,
    unitPrice: decimalText(suggestion.unitPrice),
    ...(keepsRate ? { vatRate: String(suggestion.vatRate) } : {}),
    ...(keepsRate && suggestion.vatRate === 0 && suggestion.vatCategory in ZERO_VAT_REASONS
      ? { zeroReason: suggestion.vatCategory as ZeroReason }
      : {}),
  };
}

function buyerSource(buyer: FoundBuyer): string {
  if (buyer.source === 'company') return 'Date preluate din firmele dvs.';
  if (buyer.source === 'anaf') return 'Date preluate din ANAF.';
  return buyer.anafChecked
    ? 'Date preluate din ultima factură emisă acestui client, cu statusul actual din ANAF.'
    : 'Date preluate din ultima factură emisă acestui client. ANAF nu a răspuns: apăsați Caută la ANAF pentru a verifica statusul.';
}

function BuyerStatus({ buyer }: { buyer: FoundBuyer }) {
  return (
    <div className="spv-row">
      <StatusBadge status={buyer.vatPayer ? 'yes' : 'no'}>
        {buyer.vatPayer ? 'Plătitor de TVA' : 'Neplătitor de TVA'}
      </StatusBadge>
      {buyer.eFactura === null ? null : (
        <StatusBadge status={buyer.eFactura ? 'yes' : 'no'}>
          {buyer.eFactura ? 'Înregistrat în RO e-Factura' : 'Neînregistrat în RO e-Factura'}
        </StatusBadge>
      )}
      {buyer.inactive ? <StatusBadge status="inactive" /> : null}
      {buyer.source === 'invoice' && !buyer.anafChecked ? (
        <StatusBadge status="unverified" />
      ) : null}
      <span className="muted small">{buyerSource(buyer)}</span>
    </div>
  );
}

function buyerFromLookup(found: BuyerLookup, previous: BuyerForm): BuyerForm {
  return {
    cui: found.cui ?? previous.cui,
    name: found.name,
    regCom: found.regCom ?? '',
    address: found.address,
    iban: found.iban ?? '',
    email: found.email ?? previous.email,
    phone: found.phone ?? '',
    street: found.street,
    city: found.city,
    county: found.county,
    postalCode: found.postalCode,
    vatPayer: found.vatPayer,
  };
}

function buildPayload(input: {
  company: Company;
  series: string;
  number: string;
  issueDate: string;
  deliveryDate: string;
  dueDate: string;
  currency: InvoiceCurrency;
  exchangeRate: string;
  paymentMethod: PaymentMethod;
  notes: string;
  buyer: BuyerForm;
  lines: LineForm[];
  saveToStorage: boolean;
  sendEmail: boolean;
  emailTo: string;
}): CreateInvoiceInput {
  const vatPayer = input.company.vatPayer === true;
  const blank = (value: string) => value.trim() || null;
  return {
    companyId: input.company.id,
    series: input.series.trim().toUpperCase(),
    ...(input.number.trim() ? { number: Number(input.number) } : {}),
    issueDate: input.issueDate,
    deliveryDate: input.deliveryDate,
    dueDate: blank(input.dueDate),
    currency: input.currency,
    exchangeRate:
      input.currency === 'RON' ? null : parseDecimal(input.exchangeRate),
    paymentMethod: input.paymentMethod,
    notes: blank(input.notes),
    buyer: {
      name: input.buyer.name.trim(),
      address: input.buyer.address.trim(),
      cui: blank(normalizeCui(input.buyer.cui)),
      regCom: blank(input.buyer.regCom),
      iban: blank(input.buyer.iban),
      email: blank(input.buyer.email),
      phone: blank(input.buyer.phone),
      street: input.buyer.street,
      city: input.buyer.city,
      county: input.buyer.county,
      postalCode: input.buyer.postalCode,
      vatPayer: input.buyer.vatPayer,
    },
    lines: input.lines.map((line) => {
      const vatRate = vatPayer ? Number(line.vatRate) : 0;
      return {
        description: line.description.trim(),
        quantity: parseDecimal(line.quantity),
        unit: line.unit,
        unitPrice: parseDecimal(line.unitPrice),
        vatRate,
        ...(vatPayer && vatRate === 0 ? { vatCategory: line.zeroReason } : {}),
      };
    }),
    saveToStorage: input.saveToStorage,
    sendToEmail: input.sendEmail ? input.emailTo.trim() : null,
  };
}

function Created({
  result,
  onAnother,
}: {
  result: CreatedInvoice;
  onAnother: () => void;
}) {
  const appPath = useAppPath();
  const download = useDownloadInvoice();
  const store = useSaveInvoiceToStorage();
  const toAnaf = useUploadInvoiceToAnaf();
  const check = useValidateInvoice();
  const [panel, setPanel] = useState<'send' | 'storno' | null>(null);
  const { invoice } = result;
  const number = invoiceNumber(invoice.series, invoice.number);
  const name = invoiceFilename(invoice);
  return (
    <>
      <PageHead title="Factura a fost emisă" context={number} />
      <Card>
        <div className="stack">
          <Alert tone="success" title={`Factura ${number} a fost creată.`}>
            Total de plată: {formatAmount(invoice.totalGross)} {invoice.currency}.
          </Alert>
          {invoice.storagePath ? (
            <Alert tone="success" title="PDF-ul a fost salvat în Storage." />
          ) : null}
          {invoice.emailedTo ? (
            <Alert tone="success" title={`Emailul a fost trimis la ${invoice.emailedTo}.`} />
          ) : null}
          {result.storageError ? (
            <Alert tone="warning" title="Salvarea în Storage a eșuat.">
              {result.storageError}
            </Alert>
          ) : null}
          {result.emailError ? (
            <Alert tone="warning" title="Emailul nu a fost trimis.">
              {result.emailError}
            </Alert>
          ) : null}
          {download.isError ? (
            <Alert tone="danger" title="Descărcarea a eșuat.">
              {download.error.message}
            </Alert>
          ) : null}
          {store.isError ? (
            <Alert tone="danger" title="Factura nu a fost salvată în Storage.">
              {store.error.message}
            </Alert>
          ) : null}
          {store.isSuccess ? (
            <Alert tone="success" title="PDF-ul a fost salvat în Storage." />
          ) : null}
          {toAnaf.isError ? (
            <Alert tone="danger" title="Factura nu a fost trimisă la ANAF.">
              {toAnaf.error.message}
              <ErrorLog lines={detailsOf(toAnaf.error)} />
            </Alert>
          ) : null}
          {toAnaf.isSuccess ? (
            toAnaf.data.status === 'rejected' ? (
              <Alert tone="danger" title="ANAF a refuzat factura.">
                {toAnaf.data.errorMessage}
              </Alert>
            ) : (
              <Alert
                tone="success"
                title={`Factura a fost trimisă la ANAF. Index: ${toAnaf.data.uploadIndex}.`}
              >
                Starea se verifică în pagina Trimise la ANAF.
              </Alert>
            )
          ) : null}
          {check.isError ? (
            <Alert tone="danger" title="Validarea nu a putut fi făcută.">
              {check.error.message}
            </Alert>
          ) : null}
          {check.isSuccess ? (
            check.data.valid ? (
              <Alert tone="success" title="XML-ul facturii este valid pentru ANAF." />
            ) : (
              <Alert tone="danger" title="XML-ul facturii nu trece validarea ANAF.">
                <ErrorLog lines={check.data.messages} />
              </Alert>
            )
          ) : null}
          <div className="action-grid">
            <Button
              variant="primary"
              icon="download"
              loading={download.isPending && download.variables?.format === 'pdf'}
              onClick={() =>
                download.mutate({ id: invoice.id, format: 'pdf', filename: name })
              }
            >
              Descarcă PDF
            </Button>
            <Button
              icon="download"
              loading={download.isPending && download.variables?.format === 'xml'}
              onClick={() =>
                download.mutate({ id: invoice.id, format: 'xml', filename: name })
              }
            >
              Descarcă XML e-Factura
            </Button>
            <Button
              loading={check.isPending}
              onClick={() => check.mutate(invoice.id)}
            >
              Validează XML
            </Button>
            {toAnaf.isSuccess && toAnaf.data.status !== 'rejected' ? null : (
              <Button
                icon="upload"
                loading={toAnaf.isPending}
                onClick={() => toAnaf.mutate(invoice.id)}
              >
                Trimite la ANAF
              </Button>
            )}
            <Button onClick={() => setPanel(panel === 'send' ? null : 'send')}>
              Trimite pe email
            </Button>
            {!invoice.storagePath && !store.isSuccess ? (
              <Button
                icon="upload"
                loading={store.isPending}
                onClick={() => store.mutate(invoice.id)}
              >
                Salvează în Storage
              </Button>
            ) : null}
            <Button onClick={() => setPanel(panel === 'storno' ? null : 'storno')}>
              Stornează
            </Button>
          </div>
          <hr className="separator" />
          <div className="spv-row">
            <Button onClick={onAnother}>Factură nouă</Button>
            <ButtonLink to={appPath('/invoices')}>Înapoi la facturi</ButtonLink>
          </div>
        </div>
      </Card>
      {panel === 'send' ? (
        <SendPanel
          invoice={invoice}
          defaultTo={invoice.emailedTo ?? invoice.buyer.email ?? ''}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {panel === 'storno' ? (
        <StornoPanel invoice={invoice} onClose={() => setPanel(null)} />
      ) : null}
    </>
  );
}

function InvoiceForm({ companies }: { companies: Company[] }) {
  const appPath = useAppPath();
  const [params] = useSearchParams();
  const requested = Number(params.get('company'));
  const [companyId, setCompanyId] = useState(
    companies.find((c) => c.id === requested)?.id ?? companies[0].id,
  );
  const company = companies.find((c) => c.id === companyId) ?? companies[0];
  const vatPayer = company.vatPayer === true;

  const [series, setSeries] = useState('FCT');
  const [number, setNumber] = useState('');
  const [issueDate, setIssueDate] = useState(todayIso());
  const [deliveryDate, setDeliveryDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState<InvoiceCurrency>('RON');
  const [exchangeRate, setExchangeRate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transfer');
  const [notes, setNotes] = useState('');
  const [buyer, setBuyer] = useState<BuyerForm>(EMPTY_BUYER);
  const [lines, setLines] = useState<LineForm[]>(() => [emptyLine('21')]);
  const [saveToStorage, setSaveToStorage] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cuiError, setCuiError] = useState<string | undefined>();
  const [created, setCreated] = useState<CreatedInvoice | null>(null);

  const autofill = useBuyerAutofill(buyer.cui, (cui, found) =>
    setBuyer((b) => (normalizeCui(b.cui) === cui ? buyerFromLookup(found, b) : b)),
  );
  const { lookup, findBuyer, found: foundBuyer } = autofill;
  const create = useCreateInvoice();
  const suggested = useNextInvoiceNumber(company.id, series.trim().toUpperCase());
  const [suggestionsCui, setSuggestionsCui] = useState('');
  const previousLines = useInvoiceLineSuggestions(company.id, suggestionsCui);
  const suggestions =
    suggestionsCui === normalizeCui(buyer.cui)
      ? (previousLines.data ?? []).filter((s) => s.currency === currency)
      : [];
  const loadSuggestions = () => {
    if (isValidCui(buyer.cui)) setSuggestionsCui(normalizeCui(buyer.cui));
  };

  const rates = allowedVatRates(deliveryDate || todayIso());
  const exchange = currency === 'RON' ? null : parseDecimal(exchangeRate);
  const totals = computeTotals(
    lines.map((l) => ({
      quantity: Number.isFinite(parseDecimal(l.quantity)) ? parseDecimal(l.quantity) : 0,
      unitPrice: Number.isFinite(parseDecimal(l.unitPrice)) ? parseDecimal(l.unitPrice) : 0,
      vatRate: Number(l.vatRate),
    })),
    vatPayer,
    exchange !== null && Number.isFinite(exchange) ? exchange : null,
  );

  const setBuyerField = (patch: Partial<BuyerForm>) =>
    setBuyer((b) => ({ ...b, ...patch }));
  const setLine = (key: number, patch: Partial<LineForm>) =>
    setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const search = () => {
    setCuiError(
      autofill.search() ? undefined : 'CUI invalid: folosiți 2–10 cifre, cu sau fără RO.',
    );
  };

  const validate = (): string | null => {
    if (!/^[A-Za-z0-9]{1,10}$/.test(series.trim())) {
      return 'Seria poate avea 1–10 litere sau cifre.';
    }
    if (number.trim() && !/^\d{1,6}$/.test(number.trim())) {
      return 'Numărul facturii trebuie să fie întreg, cel mult 6 cifre.';
    }
    if (!issueDate || !deliveryDate) {
      return 'Completați data emiterii și data livării.';
    }
    if (dueDate && dueDate < issueDate) {
      return 'Scadența nu poate fi înaintea datei emiterii.';
    }
    if (currency !== 'RON' && !(exchange && exchange > 0)) {
      return 'Introduceți cursul BNR pentru a calcula TVA în RON.';
    }
    if (!buyer.name.trim() || !buyer.address.trim()) {
      return 'Completați denumirea și adresa cumpărătorului.';
    }
    if (buyer.cui.trim() && !isValidCui(buyer.cui)) {
      return 'CUI-ul cumpărătorului este invalid.';
    }
    for (const [index, line] of lines.entries()) {
      if (!line.description.trim()) {
        return `Linia ${index + 1}: completați denumirea.`;
      }
      if (!(parseDecimal(line.quantity) > 0)) {
        return `Linia ${index + 1}: cantitatea trebuie să fie pozitivă.`;
      }
      if (!(parseDecimal(line.unitPrice) >= 0)) {
        return `Linia ${index + 1}: introduceți prețul unitar fără TVA.`;
      }
    }
    if (sendEmail && !/^\S+@\S+\.\S+$/.test(emailTo.trim())) {
      return 'Introduceți adresa de email la care se trimite factura.';
    }
    return null;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validate();
    setError(problem);
    if (problem) return;
    create.mutate(
      buildPayload({
        company,
        series,
        number,
        issueDate,
        deliveryDate,
        dueDate,
        currency,
        exchangeRate,
        paymentMethod,
        notes,
        buyer,
        lines,
        saveToStorage,
        sendEmail,
        emailTo,
      }),
      { onSuccess: setCreated },
    );
  };

  const reset = () => {
    setCreated(null);
    setNumber('');
    setBuyer(EMPTY_BUYER);
    setCuiError(undefined);
    setLines([emptyLine('21')]);
    setNotes('');
    setSendEmail(false);
    setSaveToStorage(false);
    create.reset();
    autofill.reset();
  };

  if (created) return <Created result={created} onAnother={reset} />;

  return (
    <>
      <PageHead
        crumbs={<Link to={appPath('/invoices')}>Facturi</Link>}
        title="Factură nouă"
        context="Factură fiscală conform art. 319 din Codul fiscal."
      />
      <form className="stack" onSubmit={submit} noValidate>
        <Card
          title="Date generale"
          subtitle={`Furnizor: ${company.name} · ${formatCui(company.cui)}`}
        >
          <div className="stack">
            <div className="form-row">
              <div className="spv-field">
                <label className="spv-field-label" htmlFor="inv-company">
                  Firma emitentă (furnizor)
                </label>
                <select
                  id="inv-company"
                  className="spv-input"
                  value={companyId}
                  onChange={(e) => setCompanyId(Number(e.target.value))}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {formatCui(c.cui)}
                    </option>
                  ))}
                </select>
              </div>
              <TextField
                label="Seria"
                mono
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                maxLength={10}
                placeholder="FCT"
              />
              <TextField
                label="Număr"
                mono
                inputMode="numeric"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder={suggested.data ? String(suggested.data.number) : '1'}
                hint="Lăsați gol pentru următorul număr din serie."
              />
            </div>
            {company.vatPayer === true ? (
              company.vatOnCollection ? (
                <Alert tone="info" title="Firma aplică TVA la încasare.">
                  Mențiunea „TVA la încasare” se adaugă automat pe factură.
                </Alert>
              ) : null
            ) : (
              <Alert tone="info" title="Firma nu este plătitoare de TVA.">
                Factura se emite fără TVA, cu mențiunea corespunzătoare.
              </Alert>
            )}
            {!company.address ? (
              <Alert tone="danger" title="Firma nu are adresă.">
                Reîmprospătați datele din ANAF pe pagina firmei înainte de a
                emite facturi.
              </Alert>
            ) : null}
            <div className="form-row">
              <TextField
                label="Data emiterii"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
              <TextField
                label="Data livării / prestării"
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
              <TextField
                label="Scadența"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="form-row">
              <div className="spv-field">
                <label className="spv-field-label" htmlFor="inv-currency">
                  Moneda
                </label>
                <select
                  id="inv-currency"
                  className="spv-input"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as InvoiceCurrency)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              {currency !== 'RON' ? (
                <TextField
                  label={`Curs BNR (RON pentru 1 ${currency})`}
                  mono
                  inputMode="decimal"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  placeholder="4,9750"
                  hint="Necesar pentru TVA exprimat în RON."
                />
              ) : null}
              <div className="spv-field">
                <label className="spv-field-label" htmlFor="inv-payment">
                  Mod de plată
                </label>
                <select
                  id="inv-payment"
                  className="spv-input"
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as PaymentMethod)
                  }
                >
                  {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </Card>

        <Card
          title="Cumpărător"
          subtitle="Introduceți CUI-ul: completăm datele din facturile anterioare, din firmele dvs. sau din ANAF."
        >
          <div className="stack">
            <div className="form-row">
              <TextField
                label="CUI"
                mono
                value={buyer.cui}
                onChange={(e) => {
                  setBuyerField({ cui: e.target.value });
                  setCuiError(undefined);
                }}
                {...autofill.cuiFieldProps}
                placeholder="RO 12345678"
                hint="Lăsați gol pentru persoane fizice."
                error={cuiError}
              />
              <Button
                icon="search"
                loading={lookup.isPending}
                onClick={search}
                {...autofill.searchButtonProps}
              >
                Caută la ANAF
              </Button>
            </div>
            {findBuyer.isPending ? (
              <div className="muted small">Se caută clientul…</div>
            ) : null}
            {findBuyer.isError ? (
              <Alert tone="danger" title="Clientul nu a fost găsit.">
                {findBuyer.error.message}
              </Alert>
            ) : null}
            {lookup.isError ? (
              <Alert tone="danger" title="Căutarea la ANAF a eșuat.">
                {lookup.error.message}
              </Alert>
            ) : null}
            {foundBuyer ? <BuyerStatus buyer={foundBuyer} /> : null}
            <TextField
              label="Denumire"
              value={buyer.name}
              onChange={(e) => setBuyerField({ name: e.target.value })}
              maxLength={255}
              placeholder="Exemplu SRL"
            />
            <TextField
              label="Adresa"
              value={buyer.address}
              onChange={(e) => setBuyerField({ address: e.target.value })}
              maxLength={500}
              placeholder="Str. Exemplu nr. 1, București, Sector 1"
            />
            <div className="form-row">
              <TextField
                label="Nr. Reg. Com."
                mono
                value={buyer.regCom}
                onChange={(e) => setBuyerField({ regCom: e.target.value })}
                placeholder="J40/1234/2020"
              />
              <TextField
                label="IBAN"
                mono
                value={buyer.iban}
                onChange={(e) => setBuyerField({ iban: e.target.value })}
                placeholder="RO49 AAAA 1B31 0075 9384 0000"
              />
            </div>
            <div className="form-row">
              <TextField
                label="Email"
                type="email"
                value={buyer.email}
                onChange={(e) => setBuyerField({ email: e.target.value })}
                placeholder="contabilitate@exemplu.ro"
                hint="Folosit la trimiterea facturii pe email."
              />
              <TextField
                label="Telefon"
                value={buyer.phone}
                onChange={(e) => setBuyerField({ phone: e.target.value })}
                placeholder="0722 123 456"
              />
            </div>
          </div>
        </Card>

        <Card
          title="Produse și servicii"
          subtitle="Prețurile se introduc fără TVA."
        >
          <div className="stack">
            {lines.map((line, index) => (
              <div key={line.key} className="invoice-line">
                <LineDescriptionField
                  label={`Denumire (linia ${index + 1})`}
                  value={line.description}
                  suggestions={suggestions}
                  onChange={(description) => setLine(line.key, { description })}
                  onPick={(s) => setLine(line.key, lineFromSuggestion(s, vatPayer, rates))}
                  placeholder="Servicii de contabilitate, luna octombrie"
                  onOpen={loadSuggestions}
                />
                <div className="form-row">
                  <TextField
                    label="Cantitate"
                    mono
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => setLine(line.key, { quantity: e.target.value })}
                    placeholder="1"
                  />
                  <div className="spv-field">
                    <label
                      className="spv-field-label"
                      htmlFor={`unit-${line.key}`}
                    >
                      U.M.
                    </label>
                    <select
                      id={`unit-${line.key}`}
                      className="spv-input"
                      value={line.unit}
                      onChange={(e) =>
                        setLine(line.key, { unit: e.target.value as InvoiceUnit })
                      }
                    >
                      {INVOICE_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                  <TextField
                    label={`Preț unitar (${currency}, fără TVA)`}
                    mono
                    inputMode="decimal"
                    value={line.unitPrice}
                    onChange={(e) => setLine(line.key, { unitPrice: e.target.value })}
                    placeholder="100,00"
                  />
                  {vatPayer ? (
                    <div className="spv-field">
                      <label
                        className="spv-field-label"
                        htmlFor={`vat-${line.key}`}
                      >
                        Cota TVA
                      </label>
                      <select
                        id={`vat-${line.key}`}
                        className="spv-input"
                        value={line.vatRate}
                        onChange={(e) =>
                          setLine(line.key, { vatRate: e.target.value })
                        }
                      >
                        {rates.map((r) => (
                          <option key={r} value={String(r)}>
                            {r}%
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {vatPayer && Number(line.vatRate) === 0 ? (
                    <div className="spv-field">
                      <label
                        className="spv-field-label"
                        htmlFor={`zero-${line.key}`}
                      >
                        Motiv cotă 0%
                      </label>
                      <select
                        id={`zero-${line.key}`}
                        className="spv-input"
                        value={line.zeroReason}
                        onChange={(e) =>
                          setLine(line.key, {
                            zeroReason: e.target.value as ZeroReason,
                          })
                        }
                      >
                        {(Object.keys(ZERO_VAT_REASONS) as ZeroReason[]).map((r) => (
                          <option key={r} value={r}>
                            {ZERO_VAT_REASONS[r]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {lines.length > 1 ? (
                    <Button
                      variant="ghost"
                      icon="trash"
                      aria-label={`Șterge linia ${index + 1}`}
                      onClick={() =>
                        setLines((all) => all.filter((l) => l.key !== line.key))
                      }
                    >
                      Șterge
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            <div>
              <Button
                icon="plus"
                onClick={() =>
                  setLines((all) => [...all, emptyLine(String(rates[0]))])
                }
              >
                Adaugă linie
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid-1-1">
          <Card title="Opțiuni">
            <div className="stack">
              <TextAreaField
                label="Mențiuni pe factură"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                placeholder="Ex.: conform contractului nr. 12 din 01.09.2026"
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={saveToStorage}
                  onChange={(e) => setSaveToStorage(e.target.checked)}
                />
                Salvează PDF-ul în Supabase Storage
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => {
                    setSendEmail(e.target.checked);
                    if (e.target.checked && !emailTo) setEmailTo(buyer.email);
                  }}
                />
                Trimite factura pe email cumpărătorului
              </label>
              {sendEmail ? (
                <TextField
                  label="Trimite la"
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="contabilitate@exemplu.ro"
                />
              ) : null}
            </div>
          </Card>
          <Card title="Totaluri">
            <dl className="dl">
              {totals.byRate.map((r) => (
                <Fragment key={r.rate}>
                  <dt>{vatPayer ? `Bază ${r.rate}%` : 'Bază'}</dt>
                  <dd className="mono">{formatAmount(r.taxable)}</dd>
                </Fragment>
              ))}
              <dt>Total fără TVA</dt>
              <dd className="mono">{formatAmount(totals.net)}</dd>
              <dt>TVA</dt>
              <dd className="mono">{formatAmount(totals.vat)}</dd>
              <dt className="strong">Total de plată</dt>
              <dd className="mono strong">
                {formatAmount(totals.gross)} {currency}
              </dd>
              {currency !== 'RON' ? (
                <>
                  <dt>TVA în RON</dt>
                  <dd className="mono">{formatAmount(totals.vatRon)}</dd>
                </>
              ) : null}
            </dl>
          </Card>
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
