import { XMLParser } from 'fast-xml-parser';
import { EfacturaStandard } from '../dto/efactura.enums.js';
import { MAX_STORED_LINES } from '../dto/efactura.constants.js';
import type {
  EinvoiceLine,
  EinvoiceParty,
  ParsedEinvoice,
} from '../dto/efactura.types.js';

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  htmlEntities: false,
  processEntities: true,
});

function asList(node: unknown): unknown[] {
  if (node === undefined || node === null) return [];
  return Array.isArray(node) ? node : [node];
}

function at(node: unknown, ...path: string[]): unknown {
  let current = node;
  for (const key of path) {
    const first = asList(current)[0];
    if (typeof first !== 'object' || first === null) return undefined;
    current = (first as Record<string, unknown>)[key];
  }
  return current;
}

function text(node: unknown): string | null {
  const first = asList(node)[0];
  let value: unknown = first;
  if (typeof first === 'object' && first !== null) {
    value = (first as Record<string, unknown>)['#text'];
  }
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function attr(node: unknown, name: string): string | null {
  const first = asList(node)[0];
  if (typeof first !== 'object' || first === null) return null;
  const value = (first as Record<string, unknown>)[`@_${name}`];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function amount(node: unknown): number | null {
  const value = text(node);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(node: unknown): number | null {
  const value = amount(node);
  return value === null ? null : Math.round(value * 100) / 100;
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  return compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : null;
}

export function normalizeTaxId(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replaceAll(/\s+/g, '').toUpperCase();
  const romanian = /^RO(\d{2,10})$/.exec(cleaned);
  const id = romanian ? romanian[1] : cleaned;
  return id ? id.slice(0, 32) : null;
}

function inCurrency(nodes: unknown, currency: string | null): unknown {
  const list = asList(nodes);
  return (
    list.find((n) => currency !== null && attr(n, 'currencyID') === currency) ??
    list[0]
  );
}

function ublParty(party: unknown): EinvoiceParty {
  const taxIds = asList(at(party, 'PartyTaxScheme')).map((s) =>
    text(at(s, 'CompanyID')),
  );
  const cui =
    taxIds.find((id) => id !== null) ??
    text(at(party, 'PartyLegalEntity', 'CompanyID')) ??
    text(at(party, 'PartyIdentification', 'ID'));
  return {
    cui: normalizeTaxId(cui ?? null),
    name:
      text(at(party, 'PartyLegalEntity', 'RegistrationName')) ??
      text(at(party, 'PartyName', 'Name')),
  };
}

function ublLine(line: unknown): EinvoiceLine {
  const quantity = at(line, 'InvoicedQuantity') ?? at(line, 'CreditedQuantity');
  const tax = at(line, 'Item', 'ClassifiedTaxCategory');
  return {
    name: text(at(line, 'Item', 'Name')),
    quantity: amount(quantity),
    unitCode: attr(quantity, 'unitCode'),
    unitPrice: amount(at(line, 'Price', 'PriceAmount')),
    vatCategory: text(at(tax, 'ID')),
    vatPercent: amount(at(tax, 'Percent')),
    net: money(at(line, 'LineExtensionAmount')),
  };
}

function parseUbl(root: unknown, creditNote: boolean): ParsedEinvoice {
  const currency = text(at(root, 'DocumentCurrencyCode'));
  const totals = at(root, 'LegalMonetaryTotal');
  const lines = asList(at(root, creditNote ? 'CreditNoteLine' : 'InvoiceLine'));
  return withCompleteness({
    standard: creditNote ? EfacturaStandard.CN : EfacturaStandard.UBL,
    typeCode: text(
      at(root, creditNote ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'),
    ),
    number: text(at(root, 'ID')),
    issueDate: isoDate(text(at(root, 'IssueDate'))),
    dueDate: isoDate(
      text(at(root, 'DueDate')) ??
        text(at(root, 'PaymentMeans', 'PaymentDueDate')),
    ),
    currency,
    supplier: ublParty(at(root, 'AccountingSupplierParty', 'Party')),
    customer: ublParty(at(root, 'AccountingCustomerParty', 'Party')),
    totalNet: money(at(totals, 'TaxExclusiveAmount')),
    totalVat: money(
      inCurrency(
        asList(at(root, 'TaxTotal')).map((t) => at(t, 'TaxAmount')),
        currency,
      ),
    ),
    totalGross: money(
      at(totals, 'TaxInclusiveAmount') ?? at(totals, 'PayableAmount'),
    ),
    lines: lines.slice(0, MAX_STORED_LINES).map((l) => ublLine(l)),
    incomplete: null,
  });
}

function ciiParty(party: unknown): EinvoiceParty {
  const taxIds = asList(at(party, 'SpecifiedTaxRegistration')).map((r) =>
    text(at(r, 'ID')),
  );
  const cui =
    taxIds.find((id) => id !== null) ??
    text(at(party, 'SpecifiedLegalOrganization', 'ID'));
  return { cui: normalizeTaxId(cui ?? null), name: text(at(party, 'Name')) };
}

function ciiLine(line: unknown): EinvoiceLine {
  const quantity = at(line, 'SpecifiedLineTradeDelivery', 'BilledQuantity');
  const settlement = at(line, 'SpecifiedLineTradeSettlement');
  const tax = at(settlement, 'ApplicableTradeTax');
  return {
    name: text(at(line, 'SpecifiedTradeProduct', 'Name')),
    quantity: amount(quantity),
    unitCode: attr(quantity, 'unitCode'),
    unitPrice: amount(
      at(
        line,
        'SpecifiedLineTradeAgreement',
        'NetPriceProductTradePrice',
        'ChargeAmount',
      ),
    ),
    vatCategory: text(at(tax, 'CategoryCode')),
    vatPercent: amount(at(tax, 'RateApplicablePercent')),
    net: money(
      at(
        settlement,
        'SpecifiedTradeSettlementLineMonetarySummation',
        'LineTotalAmount',
      ),
    ),
  };
}

function parseCii(root: unknown): ParsedEinvoice {
  const transaction = at(root, 'SupplyChainTradeTransaction');
  const agreement = at(transaction, 'ApplicableHeaderTradeAgreement');
  const settlement = at(transaction, 'ApplicableHeaderTradeSettlement');
  const summary = at(
    settlement,
    'SpecifiedTradeSettlementHeaderMonetarySummation',
  );
  const currency = text(at(settlement, 'InvoiceCurrencyCode'));
  const lines = asList(at(transaction, 'IncludedSupplyChainTradeLineItem'));
  return withCompleteness({
    standard: EfacturaStandard.CII,
    typeCode: text(at(root, 'ExchangedDocument', 'TypeCode')),
    number: text(at(root, 'ExchangedDocument', 'ID')),
    issueDate: isoDate(
      text(at(root, 'ExchangedDocument', 'IssueDateTime', 'DateTimeString')),
    ),
    dueDate: isoDate(
      text(
        at(
          settlement,
          'SpecifiedTradePaymentTerms',
          'DueDateDateTime',
          'DateTimeString',
        ),
      ),
    ),
    currency,
    supplier: ciiParty(at(agreement, 'SellerTradeParty')),
    customer: ciiParty(at(agreement, 'BuyerTradeParty')),
    totalNet: money(at(summary, 'TaxBasisTotalAmount')),
    totalVat: money(inCurrency(at(summary, 'TaxTotalAmount'), currency)),
    totalGross: money(at(summary, 'GrandTotalAmount')),
    lines: lines.slice(0, MAX_STORED_LINES).map((l) => ciiLine(l)),
    incomplete: null,
  });
}

function withCompleteness(invoice: ParsedEinvoice): ParsedEinvoice {
  const missing = [
    invoice.number ? null : 'numărul',
    invoice.issueDate ? null : 'data emiterii',
    invoice.supplier.cui ? null : 'CUI-ul furnizorului',
    invoice.customer.cui ? null : 'CUI-ul cumpărătorului',
    invoice.totalGross === null ? 'totalul' : null,
  ].filter((m) => m !== null);
  return {
    ...invoice,
    incomplete: missing.length
      ? `Nu s-au putut citi din factură: ${missing.join(', ')}`
      : null,
  };
}

export function parseEinvoice(xml: string): ParsedEinvoice | null {
  if (/<!DOCTYPE/i.test(xml)) return null;
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (doc.Invoice) return parseUbl(doc.Invoice, false);
  if (doc.CreditNote) return parseUbl(doc.CreditNote, true);
  if (doc.CrossIndustryInvoice) return parseCii(doc.CrossIndustryInvoice);
  return null;
}
