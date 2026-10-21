import { strToU8, zipSync } from 'fflate';

export const SELLER_CUI = '12345678';
export const BUYER_CUI = '87654321';

export function ublInvoice({
  seller = `RO${SELLER_CUI}`,
  buyer = BUYER_CUI,
  number = 'FCT-0042',
}: { seller?: string; buyer?: string; number?: string } = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID>
  <cbc:ID>${number}</cbc:ID>
  <cbc:IssueDate>2026-10-02</cbc:IssueDate>
  <cbc:DueDate>2026-10-30</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>RON</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyTaxScheme><cbc:CompanyID>${seller}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>ALFA &amp; FIUL SRL</cbc:RegistrationName><cbc:CompanyID>J40/1/2020</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyLegalEntity><cbc:RegistrationName>BETA SRL</cbc:RegistrationName><cbc:CompanyID>${buyer}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">4.20</cbc:TaxAmount></cac:TaxTotal>
  <cac:TaxTotal><cbc:TaxAmount currencyID="RON">21.00</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RON">100.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RON">100.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RON">121.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RON">121.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="H87">2</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="RON">100.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Consultanță</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>21</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="RON">50</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

export function ublCreditNote(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>NC-7</cbc:ID>
  <cbc:IssueDate>2026-10-05</cbc:IssueDate>
  <cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>
  <cbc:DocumentCurrencyCode>RON</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>ALFA SRL</cbc:RegistrationName><cbc:CompanyID>${SELLER_CUI}</cbc:CompanyID></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>BETA SRL</cbc:RegistrationName><cbc:CompanyID>${BUYER_CUI}</cbc:CompanyID></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode><cbc:PaymentDueDate>2026-11-05</cbc:PaymentDueDate></cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="RON">2.10</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="RON">10.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RON">12.10</cbc:TaxInclusiveAmount>
  </cac:LegalMonetaryTotal>
  <cac:CreditNoteLine>
    <cbc:CreditedQuantity unitCode="H87">1</cbc:CreditedQuantity>
    <cbc:LineExtensionAmount currencyID="RON">10.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Retur</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="RON">10</cbc:PriceAmount></cac:Price>
  </cac:CreditNoteLine>
</CreditNote>`;
}

export function ciiInvoice(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocument>
    <ram:ID>CII-9</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">20261003</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:SpecifiedTradeProduct><ram:Name>Abonament</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>200</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">1</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>21</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>200</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>GAMA SRL</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">RO 555</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>ALFA SRL</ram:Name><ram:SpecifiedLegalOrganization><ram:ID>${SELLER_CUI}</ram:ID></ram:SpecifiedLegalOrganization></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">20261102</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount>200</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="RON">210</ram:TaxTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">42</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>242</ram:GrandTotalAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

export function anafZip(
  xml: string,
  uploadIndex = '5001120362',
  extra: Record<string, string> = {},
): Buffer {
  const entries: Record<string, Uint8Array> = {
    [`${uploadIndex}.xml`]: strToU8(xml),
    [`semnatura_${uploadIndex}.xml`]: strToU8('<Signature/>'),
  };
  for (const [name, content] of Object.entries(extra)) {
    entries[name] = strToU8(content);
  }
  return Buffer.from(zipSync(entries));
}
