import { BadRequestException } from '@nestjs/common';
import { blankToNull } from '../../common/text.js';
import type { AnafTvaRecord } from '../../companies/helpers/anaf-company-info.js';
import type { Company } from '../../companies/company.entity.js';
import { parseAnafAddress } from '../helpers/anaf-address.js';
import type { InvoiceBuyerDto, InvoiceLineDto } from '../dto/invoice.dto.js';
import type { InvoiceLineInput, InvoiceParty } from '../invoice.types.js';
import {
  allowedVatRates,
  DEFAULT_EXEMPTION_REASON,
} from '../helpers/vat-rates.js';
import { VatCategory } from '../dto/invoice.enums.js';

export interface BuyerLookup extends InvoiceParty {
  inactive: boolean | null;
  eFactura: boolean | null;
}

export function sellerFromCompany(company: Company): InvoiceParty {
  const address = blankToNull(company.address);
  if (!address) {
    throw new BadRequestException(
      'Firma emitentă nu are adresă. Reîmprospătați datele din ANAF pe pagina firmei.',
    );
  }
  const anaf = company.anafData?.date_generale;
  const parsed = parseAnafAddress(company.anafData);
  return {
    name: company.name,
    cui: company.cui,
    regCom: company.regCom,
    address,
    ...parsed,
    postalCode: parsed.postalCode ?? blankToNull(anaf?.codPostal),
    iban: company.iban ?? blankToNull(anaf?.iban),
    bank: company.bankName,
    email: company.email,
    phone: company.phone ?? blankToNull(anaf?.telefon),
    vatPayer: company.vatPayer === true,
  };
}

export function buyerFromDto(dto: InvoiceBuyerDto): InvoiceParty {
  return {
    name: dto.name,
    cui: dto.cui ?? null,
    regCom: dto.regCom ?? null,
    address: dto.address,
    street: dto.street ?? null,
    city: dto.city ?? null,
    county: dto.county ?? null,
    postalCode: dto.postalCode ?? null,
    iban: dto.iban ?? null,
    bank: dto.bank ?? null,
    email: dto.email ?? null,
    phone: dto.phone ?? null,
    vatPayer: dto.vatPayer ?? false,
  };
}

export function buyerFromAnaf(record: AnafTvaRecord): BuyerLookup {
  const g = record.date_generale;
  const parsed = parseAnafAddress(record);
  return {
    name: g.denumire.trim(),
    cui: String(g.cui),
    regCom: blankToNull(g.nrRegCom),
    address: blankToNull(g.adresa) ?? '',
    ...parsed,
    postalCode: parsed.postalCode ?? blankToNull(g.codPostal),
    iban: blankToNull(g.iban),
    bank: null,
    email: null,
    phone: blankToNull(g.telefon),
    vatPayer: record.inregistrare_scop_Tva?.scpTVA === true,
    inactive: record.stare_inactiv?.statusInactivi ?? null,
    eFactura: g.statusRO_e_Factura ?? null,
  };
}

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function validateInvoiceDates(dates: {
  issueDate: string;
  deliveryDate: string;
  dueDate?: string | null;
}): void {
  for (const value of [dates.issueDate, dates.deliveryDate, dates.dueDate]) {
    if (value && !isCalendarDate(value)) {
      throw new BadRequestException(`Dată invalidă: ${value}`);
    }
  }
  if (dates.dueDate && dates.dueDate < dates.issueDate) {
    throw new BadRequestException(
      'Scadența nu poate fi înaintea datei emiterii',
    );
  }
}

export function normalizeLines(
  lines: InvoiceLineDto[],
  sellerVatPayer: boolean,
  deliveryDate: string,
): InvoiceLineInput[] {
  const rates = allowedVatRates(deliveryDate);
  return lines.map((line, index) => {
    const base = {
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
    };
    if (!sellerVatPayer) {
      return {
        ...base,
        vatRate: 0,
        vatCategory: VatCategory.NotSubject,
        vatExemptionReason: DEFAULT_EXEMPTION_REASON.O,
      };
    }
    const position = `Linia ${index + 1}`;
    if (!rates.includes(line.vatRate)) {
      throw new BadRequestException(
        `${position}: cota de TVA ${line.vatRate}% nu este valabilă pentru data livării (${rates.join('%, ')}%)`,
      );
    }
    if (line.vatRate > 0) {
      if (line.vatCategory && line.vatCategory !== VatCategory.Standard) {
        throw new BadRequestException(
          `${position}: o cotă de TVA mai mare de 0% nu poate avea scutire sau taxare inversă`,
        );
      }
      return {
        ...base,
        vatRate: line.vatRate,
        vatCategory: VatCategory.Standard,
        vatExemptionReason: null,
      };
    }
    if (!line.vatCategory || line.vatCategory === VatCategory.Standard) {
      throw new BadRequestException(
        `${position}: alegeți motivul pentru cota 0% (scutit, cotă zero sau taxare inversă)`,
      );
    }
    return {
      ...base,
      vatRate: 0,
      vatCategory: line.vatCategory,
      vatExemptionReason:
        line.vatExemptionReason ?? DEFAULT_EXEMPTION_REASON[line.vatCategory],
    };
  });
}
