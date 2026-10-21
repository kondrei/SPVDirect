import { applyDecorators } from '@nestjs/common';
import { blankToNull as blankText } from '../../common/text.js';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CUI_PATTERN,
  normalizeCui,
  normalizeIban,
} from '../../companies/dto/company.dto.js';
import { UNIT_NAMES } from './invoice.constants.js';
import type { Unit } from './invoice.types.js';
import { Currency, PaymentMethod, VatCategory } from './invoice.enums.js';
import type { LineVatCategory } from './invoice.types.js';

export const LINE_VAT_CATEGORIES = Object.values(VatCategory).filter(
  (c): c is LineVatCategory => c !== VatCategory.NotSubject,
);

export const MAX_INVOICE_LINES = 100;
export const MAX_INVOICE_PAGE_SIZE = 100;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Data trebuie să fie în formatul AAAA-LL-ZZ';

const SERIES = /^[A-Z0-9]{1,10}$/;

function blankToNull(value: unknown): unknown {
  return typeof value === 'string' ? blankText(value) : value;
}

function IsInvoiceSeries() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim().toUpperCase() : value,
    ),
    Matches(SERIES, { message: 'Seria poate avea 1–10 litere sau cifre' }),
  );
}

function trimmed(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class InvoiceBuyerDto {
  @Transform(({ value }) => trimmed(value))
  @IsString()
  @MinLength(1, { message: 'Completați denumirea cumpărătorului' })
  @MaxLength(255)
  name: string;

  @IsOptional()
  @Transform(({ value }) => normalizeCui(blankToNull(value)))
  @ValidateIf((_, v) => v !== null)
  @Matches(CUI_PATTERN, { message: 'CUI cumpărător invalid' })
  cui?: string | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(30)
  regCom?: string | null;

  @Transform(({ value }) => trimmed(value))
  @IsString()
  @MinLength(1, { message: 'Completați adresa cumpărătorului' })
  @MaxLength(500)
  address: string;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  street?: string | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @Matches(/^RO-[A-Z]{1,2}$/, { message: 'Județ invalid (ex. RO-TM)' })
  county?: string | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(12)
  postalCode?: string | null;

  @IsOptional()
  @Transform(({ value }) => normalizeIban(value))
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/, { message: 'IBAN invalid' })
  iban?: string | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  bank?: string | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsEmail({}, { message: 'Adresa de email a cumpărătorului este invalidă' })
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[0-9+().\s-]{3,30}$/, { message: 'Număr de telefon invalid' })
  phone?: string | null;

  @IsOptional()
  @IsBoolean()
  vatPayer?: boolean;
}

export class InvoiceLineDto {
  @Transform(({ value }) => trimmed(value))
  @IsString()
  @MinLength(1, { message: 'Completați denumirea produsului sau serviciului' })
  @MaxLength(500)
  description: string;

  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Cantitatea poate avea cel mult 3 zecimale' },
  )
  @IsPositive({ message: 'Cantitatea trebuie să fie pozitivă' })
  @Max(1_000_000_000)
  quantity: number;

  @IsIn(UNIT_NAMES, { message: 'Unitate de măsură invalidă' })
  unit: Unit;

  @IsNumber(
    { maxDecimalPlaces: 4 },
    { message: 'Prețul poate avea cel mult 4 zecimale' },
  )
  @Min(0, { message: 'Prețul nu poate fi negativ' })
  @Max(1_000_000_000)
  unitPrice: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate: number;

  @IsOptional()
  @IsIn(LINE_VAT_CATEGORIES, { message: 'Categorie TVA invalidă' })
  vatCategory?: LineVatCategory;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  vatExemptionReason?: string | null;
}

export class CreateInvoiceDto {
  @IsInt()
  @Min(1)
  companyId: number;

  @IsInvoiceSeries()
  series: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999_999)
  number?: number;

  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  issueDate: string;

  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  deliveryDate: string;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  dueDate?: string | null;

  @IsEnum(Currency, { message: 'Monedă neacceptată' })
  currency: Currency;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive({ message: 'Cursul de schimb trebuie să fie pozitiv' })
  @Max(1_000_000)
  exchangeRate?: number | null;

  @IsEnum(PaymentMethod, { message: 'Mod de plată invalid' })
  paymentMethod: PaymentMethod;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @ValidateNested()
  @Type(() => InvoiceBuyerDto)
  buyer: InvoiceBuyerDto;

  @IsArray()
  @ArrayMinSize(1, { message: 'Adăugați cel puțin o linie pe factură' })
  @ArrayMaxSize(MAX_INVOICE_LINES, {
    message: `Factura poate avea cel mult ${MAX_INVOICE_LINES} de linii`,
  })
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];

  @IsOptional()
  @IsBoolean()
  saveToStorage?: boolean;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsEmail({}, { message: 'Adresa de email este invalidă' })
  @MaxLength(255)
  sendToEmail?: string | null;
}

export class SendInvoiceDto {
  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsEmail({}, { message: 'Adresa de email este invalidă' })
  @MaxLength(255)
  to?: string | null;
}

export class ListInvoicesQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_INVOICE_PAGE_SIZE)
  pageSize?: number;
}

export class NextNumberQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId: number;

  @IsInvoiceSeries()
  series: string;
}

export class LineSuggestionsQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId: number;

  @Transform(({ value }) => normalizeCui(value))
  @Matches(CUI_PATTERN, { message: 'CUI cumpărător invalid' })
  buyerCui: string;
}

export class StornoLineDto {
  @IsInt()
  @Min(0)
  @Max(MAX_INVOICE_LINES)
  lineIndex: number;

  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Cantitatea poate avea cel mult 3 zecimale' },
  )
  @IsPositive({ message: 'Cantitatea de stornat trebuie să fie pozitivă' })
  @Max(1_000_000_000)
  quantity: number;
}

export class CreateStornoDto {
  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  issueDate?: string | null;

  @IsOptional()
  @IsInvoiceSeries()
  series?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_INVOICE_LINES)
  @ValidateNested({ each: true })
  @Type(() => StornoLineDto)
  lines?: StornoLineDto[];

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  saveToStorage?: boolean;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsEmail({}, { message: 'Adresa de email este invalidă' })
  @MaxLength(255)
  sendToEmail?: string | null;
}
