import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export function normalizeCui(value: unknown): unknown {
  return typeof value === 'string'
    ? value.replace(/\s+/g, '').replace(/^RO/i, '')
    : value;
}

export class CreateCompanyDto {
  @Transform(({ value }) => normalizeCui(value))
  @Matches(/^\d{2,10}$/, { message: 'CUI invalid' })
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
  @Matches(/^\d{2,10}$/, {
    each: true,
    message: 'Lista conține CUI-uri invalide',
  })
  cuis: string[];
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  anafConnectionId?: string | null;
}
