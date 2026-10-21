import { Fragment, type Dispatch } from 'react';
import { Card, TextAreaField, TextField } from '../../components/ui';
import { formatAmount } from '../../lib/format';
import type { Totals } from '../../lib/invoice';
import {
  emailRecipient,
  type InvoiceFormAction,
  type InvoiceFormState,
} from './invoiceForm';
import { Currency } from '../../api/enums';

export function InvoiceOptionsCard({
  state,
  dispatch,
}: Readonly<{
  state: InvoiceFormState;
  dispatch: Dispatch<InvoiceFormAction>;
}>) {
  const { delivery } = state;
  return (
    <Card title="Opțiuni">
      <div className="stack">
        <TextAreaField
          label="Mențiuni pe factură"
          rows={2}
          value={state.header.notes}
          onChange={(e) => dispatch({ type: 'header', patch: { notes: e.target.value } })}
          maxLength={500}
          placeholder="Ex.: conform contractului nr. 12 din 01.09.2026"
        />
        <label className="check">
          <input
            type="checkbox"
            checked={delivery.saveToStorage}
            onChange={(e) =>
              dispatch({ type: 'delivery', patch: { saveToStorage: e.target.checked } })
            }
          />
          <span>Salvează PDF-ul în cloud</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={delivery.sendEmail}
            onChange={(e) =>
              dispatch({ type: 'delivery', patch: { sendEmail: e.target.checked } })
            }
          />
          <span>Trimite factura pe email cumpărătorului</span>
        </label>
        {delivery.sendEmail ? (
          <TextField
            label="Trimite la"
            type="email"
            value={emailRecipient(state)}
            onChange={(e) =>
              dispatch({ type: 'delivery', patch: { emailTo: e.target.value } })
            }
            placeholder="contabilitate@exemplu.ro"
          />
        ) : null}
      </div>
    </Card>
  );
}

export function InvoiceTotalsCard({
  totals,
  currency,
  vatPayer,
}: Readonly<{
  totals: Totals;
  currency: Currency;
  vatPayer: boolean;
}>) {
  return (
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
        {currency === Currency.RON ? null : (
          <>
            <dt>TVA în RON</dt>
            <dd className="mono">{formatAmount(totals.vatRon)}</dd>
          </>
        )}
      </dl>
    </Card>
  );
}
