import { useState, type Dispatch } from 'react';
import type { FoundBuyer } from '../../api/types';
import { Alert, Button, Card, StatusBadge, TextField } from '../../components/ui';
import type { BuyerForm, InvoiceFormAction } from './invoiceForm';
import type { useBuyerAutofill } from './useBuyerAutofill';
import { BuyerSource } from '../../api/enums';

function buyerSource(buyer: FoundBuyer): string {
  if (buyer.source === BuyerSource.Company) return 'Date preluate din firmele dvs.';
  if (buyer.source === BuyerSource.Anaf) return 'Date preluate din ANAF.';
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
      {buyer.source === BuyerSource.Invoice && !buyer.anafChecked ? (
        <StatusBadge status="unverified" />
      ) : null}
      <span className="muted small">{buyerSource(buyer)}</span>
    </div>
  );
}

export function BuyerCard({
  buyer,
  dispatch,
  autofill,
}: {
  buyer: BuyerForm;
  dispatch: Dispatch<InvoiceFormAction>;
  autofill: ReturnType<typeof useBuyerAutofill>;
}) {
  const [cuiError, setCuiError] = useState<string | undefined>();
  const { lookup, findBuyer, found } = autofill;
  const set = (patch: Partial<BuyerForm>) => dispatch({ type: 'buyer', patch });
  const search = () =>
    setCuiError(
      autofill.search() ? undefined : 'CUI invalid: folosiți 2–10 cifre, cu sau fără RO.',
    );

  return (
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
              set({ cui: e.target.value });
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
        {found ? <BuyerStatus buyer={found} /> : null}
        <TextField
          label="Denumire"
          value={buyer.name}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={255}
          placeholder="Exemplu SRL"
        />
        <TextField
          label="Adresa"
          value={buyer.address}
          onChange={(e) => set({ address: e.target.value })}
          maxLength={500}
          placeholder="Str. Exemplu nr. 1, București, Sector 1"
        />
        <div className="form-row">
          <TextField
            label="Nr. Reg. Com."
            mono
            value={buyer.regCom}
            onChange={(e) => set({ regCom: e.target.value })}
            placeholder="J40/1234/2020"
          />
          <TextField
            label="IBAN"
            mono
            value={buyer.iban}
            onChange={(e) => set({ iban: e.target.value })}
            placeholder="RO49 AAAA 1B31 0075 9384 0000"
          />
        </div>
        <div className="form-row">
          <TextField
            label="Email"
            type="email"
            value={buyer.email}
            onChange={(e) => set({ email: e.target.value })}
            placeholder="contabilitate@exemplu.ro"
            hint="Folosit la trimiterea facturii pe email."
          />
          <TextField
            label="Telefon"
            value={buyer.phone}
            onChange={(e) => set({ phone: e.target.value })}
            placeholder="0722 123 456"
          />
        </div>
      </div>
    </Card>
  );
}
