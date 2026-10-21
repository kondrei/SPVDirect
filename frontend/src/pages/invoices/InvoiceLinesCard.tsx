import type { Dispatch } from 'react';
import type { InvoiceUnit, LineSuggestion } from '../../api/types';
import { SelectField } from '../../components/SelectField';
import { LineDescriptionField } from '../../components/invoices/LineDescriptionField';
import { Button, Card, TextField } from '../../components/ui';
import { INVOICE_UNITS, ZERO_VAT_REASONS } from '../../lib/invoice';
import {
  lineFromSuggestion,
  type InvoiceFormAction,
  type LineForm,
  type ZeroReason,
} from './invoiceForm';
import { Currency } from '../../api/enums';

export function InvoiceLinesCard({
  lines,
  rates,
  currency,
  vatPayer,
  suggestions,
  onOpenSuggestions,
  dispatch,
}: Readonly<{
  lines: LineForm[];
  rates: number[];
  currency: Currency;
  vatPayer: boolean;
  suggestions: LineSuggestion[];
  onOpenSuggestions: () => void;
  dispatch: Dispatch<InvoiceFormAction>;
}>) {
  const setLine = (key: number, patch: Partial<LineForm>) =>
    dispatch({ type: 'line', key, patch });
  return (
    <Card title="Produse și servicii" subtitle="Prețurile se introduc fără TVA.">
      <div className="stack">
        {lines.map((line, index) => (
          <div key={line.key} className="invoice-line">
            <LineDescriptionField
              label={`Denumire (linia ${index + 1})`}
              value={line.description}
              suggestions={suggestions}
              onChange={(description) => setLine(line.key, { description })}
              onPick={(s) =>
                setLine(line.key, lineFromSuggestion(s, vatPayer, rates))
              }
              placeholder="Servicii de contabilitate, luna octombrie"
              onOpen={onOpenSuggestions}
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
              <SelectField
                label="U.M."
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
              </SelectField>
              <TextField
                label={`Preț unitar (${currency}, fără TVA)`}
                mono
                inputMode="decimal"
                value={line.unitPrice}
                onChange={(e) => setLine(line.key, { unitPrice: e.target.value })}
                placeholder="100,00"
              />
              {vatPayer ? (
                <SelectField
                  label="Cota TVA"
                  value={line.vatRate}
                  onChange={(e) => setLine(line.key, { vatRate: e.target.value })}
                >
                  {rates.map((r) => (
                    <option key={r} value={String(r)}>
                      {r}%
                    </option>
                  ))}
                </SelectField>
              ) : null}
              {vatPayer && Number(line.vatRate) === 0 ? (
                <SelectField
                  label="Motiv cotă 0%"
                  value={line.zeroReason}
                  onChange={(e) =>
                    setLine(line.key, { zeroReason: e.target.value as ZeroReason })
                  }
                >
                  {(Object.keys(ZERO_VAT_REASONS) as ZeroReason[]).map((r) => (
                    <option key={r} value={r}>
                      {ZERO_VAT_REASONS[r]}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              {lines.length > 1 ? (
                <Button
                  variant="ghost"
                  icon="trash"
                  aria-label={`Șterge linia ${index + 1}`}
                  onClick={() => dispatch({ type: 'removeLine', key: line.key })}
                >
                  Șterge
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        <div>
          <Button icon="plus" onClick={() => dispatch({ type: 'addLine' })}>
            Adaugă linie
          </Button>
        </div>
      </div>
    </Card>
  );
}
