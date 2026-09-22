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

/** "RO 12345678" / "ro12345678" -> "12345678" */
export function normalizeCui(value: unknown): unknown {
  return typeof value === 'string'
    ? value.replace(/\s+/g, '').replace(/^RO/i, '')
    : value;
}

export class CreateCompanyDto {
  @Transform(({ value }) => normalizeCui(value))
  @Matches(/^\d{2,10}$/, { message: 'CUI invalid' })
  cui: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  /** null detaches the certificate. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  anafConnectionId?: string | null;
}
