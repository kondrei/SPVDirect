import { useState, type FormEvent } from 'react';
import { detailsOf } from '../../api/client';
import { useCompanies } from '../../api/hooks/companies';
import { useInvoices } from '../../api/hooks/invoices';
import { useTransformXml, useValidateInvoice, useValidateXml } from '../../api/hooks/efactura';
import { ErrorLog } from '../../components/ErrorLog';
import { PageHead } from '../../components/PageHead';
import { SelectField } from '../../components/SelectField';
import { Alert, Button, ButtonLink, Card } from '../../components/ui';
import { useAppPath } from '../../hooks/useAppPath';
import { formatAmount } from '../../lib/format';
import { invoiceNumber } from '../../lib/invoice';

type Standard = 'FACT1' | 'FCN';

export function EfacturaValidatorPage() {
  const appPath = useAppPath();
  const companies = useCompanies();
  const [companyId, setCompanyId] = useState<number | undefined>();
  const [invoiceId, setInvoiceId] = useState<number | undefined>();
  const invoices = useInvoices({ companyId, page: 1 });
  const validateXml = useValidateXml();
  const validateInvoice = useValidateInvoice();
  const transform = useTransformXml();
  const [file, setFile] = useState<File | null>(null);
  const [standard, setStandard] = useState<Standard>('FACT1');
  const [skip, setSkip] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = invoiceId ? validateInvoice : validateXml;
  const items = companyId ? (invoices.data?.items ?? []) : [];

  const chooseCompany = (id: number | undefined) => {
    setCompanyId(id);
    setInvoiceId(undefined);
    validateInvoice.reset();
  };

  const chooseInvoice = (id: number | undefined) => {
    setInvoiceId(id);
    validateInvoice.reset();
    validateXml.reset();
    setError(null);
  };

  const hasSource = () => {
    if (invoiceId || file) {
      setError(null);
      return true;
    }
    setError('Alegeți o factură din SPVDirect sau un fișier XML.');
    return false;
  };

  const check = (e: FormEvent) => {
    e.preventDefault();
    if (!hasSource()) return;
    if (invoiceId) validateInvoice.mutate(invoiceId);
    else if (file) validateXml.mutate({ file, standard });
  };

  const toPdf = () => {
    if (!hasSource()) return;
    if (invoiceId) {
      transform.mutate({ invoiceId, standard: 'FACT1', skipValidation: skip });
    } else if (file) {
      transform.mutate({ file, standard, skipValidation: skip });
    }
  };

  return (
    <>
      <PageHead
        title="Validator e-Factura"
        context="Verifică un XML cu validatorul ANAF și îl convertește în PDF, fără să-l trimiți."
        actions={<ButtonLink to={appPath('/efactura')}>Încărcări</ButtonLink>}
      />
      <Card>
        <form className="stack" onSubmit={check} noValidate>
          <div className="form-row">
            <SelectField
              label="Firma"
              value={companyId ?? ''}
              onChange={(e) =>
                chooseCompany(e.target.value ? Number(e.target.value) : undefined)
              }
            >
              <option value="">Alegeți firma</option>
              {(companies.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Factură emisă în SPVDirect"
              value={invoiceId ?? ''}
              disabled={!companyId}
              onChange={(e) =>
                chooseInvoice(e.target.value ? Number(e.target.value) : undefined)
              }
            >
              <option value="">
                {!companyId
                  ? 'Alegeți întâi firma'
                  : items.length === 0
                    ? 'Nicio factură emisă'
                    : 'Alegeți factura'}
              </option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {invoiceNumber(i.series, i.number)} · {i.issueDate} ·{' '}
                  {i.buyerName} · {formatAmount(i.totalGross)} {i.currency}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="form-row">
            <SelectField
              label="Tip document"
              value={invoiceId ? 'FACT1' : standard}
              disabled={!!invoiceId}
              onChange={(e) => setStandard(e.target.value as Standard)}
            >
              <option value="FACT1">FACT1, factură</option>
              <option value="FCN">FCN, notă de credit</option>
            </SelectField>
            <div className="spv-field">
              <label className="spv-field-label" htmlFor="validator-file">
                Sau un fișier XML (maxim 10 MB)
              </label>
              <input
                id="validator-file"
                className="spv-input"
                type="file"
                accept=".xml,text/xml,application/xml"
                disabled={!!invoiceId}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={skip}
              onChange={(e) => setSkip(e.target.checked)}
            />
            Convertește în PDF fără validare (ANAF nu garantează datele din PDF)
          </label>
          {error ? <Alert tone="danger" title={error} /> : null}
          {validate.isError ? (
            <Alert tone="danger" title="Validarea nu a putut fi făcută.">
              {validate.error.message}
            </Alert>
          ) : null}
          {validate.isSuccess ? (
            validate.data.valid ? (
              <Alert tone="success" title="XML-ul este valid.">
                {validate.data.traceId
                  ? `Cod de urmărire ANAF: ${validate.data.traceId}`
                  : null}
              </Alert>
            ) : (
              <Alert tone="danger" title="XML-ul nu este valid.">
                <ErrorLog lines={validate.data.messages} />
              </Alert>
            )
          ) : null}
          {transform.isError ? (
            <Alert tone="danger" title="PDF-ul nu a putut fi generat.">
              {transform.error.message}
              <ErrorLog lines={detailsOf(transform.error)} />
            </Alert>
          ) : null}
          <div className="spv-row">
            <Button
              type="submit"
              variant="primary"
              icon="check"
              loading={validate.isPending}
            >
              Validează
            </Button>
            <Button
              icon="download"
              loading={transform.isPending}
              onClick={toPdf}
            >
              Convertește în PDF
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
