import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export function normalizeCui(value: unknown): unknown {
  return typeof value === 'string'
    ? value.replace(/\s+/g, '').replace(/^RO/i, '')
    : value;
}

export const CUI_PATTERN = /^\d{2,10}$/;

@Injectable()
export class ParseCuiPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const cui = normalizeCui(value);
    if (typeof cui !== 'string' || !CUI_PATTERN.test(cui)) {
      throw new BadRequestException('CUI invalid');
    }
    return cui;
  }
}

export class CreateCompanyDto {
  @Transform(({ value }) => normalizeCui(value))
  @Matches(CUI_PATTERN, { message: 'CUI invalid' })
  cui: string;
}

export const MAX_BULK_CUIS = 500;

export class CreateCompaniesDto {
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map(normalizeCui) : value,
  )
  @IsArray({ message: 'Lista de CUI-uri lipsește' })
  @ArrayMinSize(1, { message: 'Introduceți cel puțin un CUI' })
  @ArrayMaxSize(MAX_BULK_CUIS, {
    message: `Puteți adăuga cel mult ${MAX_BULK_CUIS} firme odată`,
  })
  @Matches(CUI_PATTERN, {
    each: true,
    message: 'Lista conține CUI-uri invalide',
  })
  cuis: string[];
}

export function normalizeIban(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const compact = value.replace(/\s+/g, '').toUpperCase();
  return compact === '' ? null : compact;
}

function blankToNull(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export class UpdateCompanyInvoiceDetailsDto {
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
  bankName?: string | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsEmail({}, { message: 'Adresa de email este invalidă' })
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[0-9+().\s-]{3,30}$/, { message: 'Număr de telefon invalid' })
  phone?: string | null;
}

export class UpdateCompanyDto extends UpdateCompanyInvoiceDetailsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  anafConnectionId?: number | null;
}
