import { Transform } from 'class-transformer';
import {
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
