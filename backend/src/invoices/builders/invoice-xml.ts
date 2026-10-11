import { BadRequestException } from '@nestjs/common';
import type { Invoice } from '../invoice.entity.js';
import { stornoReference, vatId } from '../helpers/invoice-format.js';
import { UNITS, type InvoiceParty } from '../invoice.types.js';

export const CIUS_RO_CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1';

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]);
}

function amount(value: number): string {
  return value.toFixed(2);
}

function tag(name: string, value: string, attributes = ''): string {
  return `<${name}${attributes}>${esc(value)}</${name}>`;
}

function partyXml(
  wrapper: string,
  party: InvoiceParty,
  legalId: string,
  showVatId: boolean,
): string {
  const id = vatId(party);
  const taxScheme = party.vatPayer && showVatId
    ? `<cac:PartyTaxScheme>${tag('cbc:CompanyID', id)}<cac:TaxScheme>${tag('cbc:ID', 'VAT')}</cac:TaxScheme></cac:PartyTaxScheme>`
    : '';
  const contact =
    party.phone || party.email
      ? `<cac:Contact>${party.phone ? tag('cbc:Telephone', party.phone) : ''}${party.email ? tag('cbc:ElectronicMail', party.email) : ''}</cac:Contact>`
      : '';
  return `<cac:${wrapper}><cac:Party>
<cac:PartyName>${tag('cbc:Name', party.name)}</cac:PartyName>
<cac:PostalAddress>${tag('cbc:StreetName', party.street ?? party.address)}${tag('cbc:CityName', party.city ?? 'Necunoscut')}${party.postalCode ? tag('cbc:PostalZone', party.postalCode) : ''}${tag('cbc:CountrySubentity', party.county ?? 'RO-B')}<cac:Country>${tag('cbc:IdentificationCode', 'RO')}</cac:Country></cac:PostalAddress>
${taxScheme}
<cac:PartyLegalEntity>${tag('cbc:RegistrationName', party.name)}${tag('cbc:CompanyID', legalId)}</cac:PartyLegalEntity>
${contact}
</cac:Party></cac:${wrapper}>`;
}

function categoryXml(
  category: string,
  rate: number,
  reason: string | null,
): string {
  return `<cac:TaxCategory>${tag('cbc:ID', category)}${category === 'O' ? '' : tag('cbc:Percent', rate.toFixed(2))}${category !== 'S' && reason ? tag('cbc:TaxExemptionReason', reason) : ''}<cac:TaxScheme>${tag('cbc:ID', 'VAT')}</cac:TaxScheme></cac:TaxCategory>`;
}

type InvoiceData = Pick<
  Invoice,
  | 'series'
  | 'number'
  | 'issueDate'
  | 'deliveryDate'
  | 'dueDate'
  | 'currency'
  | 'exchangeRate'
  | 'paymentMethod'
  | 'vatOnCollection'
  | 'seller'
  | 'buyer'
  | 'lines'
  | 'vatBreakdown'
  | 'totalNet'
  | 'totalVat'
  | 'totalGross'
  | 'totalVatRon'
  | 'stornoOfSeries'
  | 'stornoOfNumber'
  | 'stornoOfIssueDate'
  | 'notes'
>;

export function renderInvoiceXml(invoice: InvoiceData): string {
  if (!invoice.buyer.cui) {
    throw new BadRequestException(
      'Factura nu are CUI pentru cumpărător, deci nu poate fi exportată ca XML e-Factura.',
    );
  }
  const currency = invoice.currency;
  const reference = stornoReference(invoice);
  const outOfScope = invoice.lines.some((l) => l.vatCategory === 'O');
  const notes = [
    reference ? `Stornare factură ${reference}` : null,
    invoice.vatOnCollection ? 'TVA la încasare' : null,
    invoice.notes,
  ].filter((n): n is string => Boolean(n));

  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
    tag('cbc:CustomizationID', CIUS_RO_CUSTOMIZATION_ID),
    tag(
      'cbc:ID',
      `${invoice.series}${String(invoice.number).padStart(6, '0')}`,
    ),
    tag('cbc:IssueDate', invoice.issueDate),
  ];
  if (invoice.dueDate) parts.push(tag('cbc:DueDate', invoice.dueDate));
  parts.push(tag('cbc:InvoiceTypeCode', '380'));
  if (notes.length) parts.push(tag('cbc:Note', notes.join('; ')));
  parts.push(tag('cbc:TaxPointDate', invoice.deliveryDate));
  parts.push(tag('cbc:DocumentCurrencyCode', currency));
  if (currency !== 'RON') parts.push(tag('cbc:TaxCurrencyCode', 'RON'));

  if (reference && invoice.stornoOfSeries && invoice.stornoOfNumber !== null) {
    parts.push(
      `<cac:BillingReference><cac:InvoiceDocumentReference>${tag('cbc:ID', `${invoice.stornoOfSeries}${String(invoice.stornoOfNumber).padStart(6, '0')}`)}${tag('cbc:IssueDate', invoice.stornoOfIssueDate ?? '')}</cac:InvoiceDocumentReference></cac:BillingReference>`,
    );
  }

  parts.push(
    partyXml(
      'AccountingSupplierParty',
      invoice.seller,
      invoice.seller.regCom ?? vatId(invoice.seller),
      !outOfScope,
    ),
    partyXml(
      'AccountingCustomerParty',
      invoice.buyer,
      invoice.buyer.vatPayer && !outOfScope
        ? (invoice.buyer.regCom ?? vatId(invoice.buyer))
        : (invoice.buyer.cui ?? ''),
      !outOfScope,
    ),
    `<cac:Delivery>${tag('cbc:ActualDeliveryDate', invoice.deliveryDate)}</cac:Delivery>`,
  );

  if (invoice.paymentMethod !== 'transfer') {
    parts.push(
      `<cac:PaymentMeans>${tag('cbc:PaymentMeansCode', '10')}</cac:PaymentMeans>`,
    );
  } else if (invoice.seller.iban) {
    parts.push(
      `<cac:PaymentMeans>${tag('cbc:PaymentMeansCode', '30')}<cac:PayeeFinancialAccount>${tag('cbc:ID', invoice.seller.iban)}</cac:PayeeFinancialAccount></cac:PaymentMeans>`,
    );
  }
  if (!invoice.dueDate) {
    parts.push(
      `<cac:PaymentTerms>${tag('cbc:Note', 'Plata la emiterea facturii')}</cac:PaymentTerms>`,
    );
  }

  const subtotals = invoice.vatBreakdown
    .map(
      (row) =>
        `<cac:TaxSubtotal>${tag('cbc:TaxableAmount', amount(row.taxableAmount), ` currencyID="${currency}"`)}${tag('cbc:TaxAmount', amount(row.vatAmount), ` currencyID="${currency}"`)}${categoryXml(row.category, row.rate, row.exemptionReason)}</cac:TaxSubtotal>`,
    )
    .join('');
  parts.push(
    `<cac:TaxTotal>${tag('cbc:TaxAmount', amount(invoice.totalVat), ` currencyID="${currency}"`)}${subtotals}</cac:TaxTotal>`,
  );
  if (currency !== 'RON') {
    parts.push(
      `<cac:TaxTotal>${tag('cbc:TaxAmount', amount(invoice.totalVatRon), ' currencyID="RON"')}</cac:TaxTotal>`,
    );
  }

  const attr = ` currencyID="${currency}"`;
  parts.push(
    `<cac:LegalMonetaryTotal>${tag('cbc:LineExtensionAmount', amount(invoice.totalNet), attr)}${tag('cbc:TaxExclusiveAmount', amount(invoice.totalNet), attr)}${tag('cbc:TaxInclusiveAmount', amount(invoice.totalGross), attr)}${tag('cbc:PayableAmount', amount(invoice.totalGross), attr)}</cac:LegalMonetaryTotal>`,
  );

  invoice.lines.forEach((line, index) => {
    parts.push(
      `<cac:InvoiceLine>${tag('cbc:ID', String(index + 1))}${tag('cbc:InvoicedQuantity', String(line.quantity), ` unitCode="${UNITS[line.unit]}"`)}${tag('cbc:LineExtensionAmount', amount(line.netAmount), attr)}<cac:Item>${tag('cbc:Name', line.description.slice(0, 200))}<cac:ClassifiedTaxCategory>${tag('cbc:ID', line.vatCategory)}${line.vatCategory === 'O' ? '' : tag('cbc:Percent', line.vatRate.toFixed(2))}<cac:TaxScheme>${tag('cbc:ID', 'VAT')}</cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price>${tag('cbc:PriceAmount', String(line.unitPrice), attr)}</cac:Price></cac:InvoiceLine>`,
    );
  });

  parts.push('</Invoice>');
  return parts.join('\n');
}
