import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { normalizeCui } from '../../companies/dto/company.dto.js';
import {
  PROFESSIONAL_TITLES,
  type ProfessionalTitle,
} from '../accountant.entity.js';

export function blankToNull(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

const MEMBER_NUMBER = /^[A-Za-z0-9/-]{1,20}$/;

export class UpdateProfileDto {
  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  name?: string | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\+?[0-9 ()./-]{6,30}$/, { message: 'Număr de telefon invalid' })
  phone?: string | null;

  @IsOptional()
  @IsBoolean()
  ceccarMember?: boolean;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsIn(PROFESSIONAL_TITLES, { message: 'Calitate profesională invalidă' })
  professionalTitle?: ProfessionalTitle | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @Matches(MEMBER_NUMBER, {
    message: 'Numărul de legitimație CECCAR este invalid',
  })
  ceccarNumber?: string | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  ceccarBranch?: string | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @Matches(MEMBER_NUMBER, { message: 'Numărul de carnet CCF este invalid' })
  ccfNumber?: string | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(255)
  firmName?: string | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(normalizeCui(value)))
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{2,10}$/, { message: 'CUI invalid' })
  firmCui?: string | null;

  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{4}$/, { message: 'Codul CAEN are 4 cifre' })
  firmCaenCode?: string | null;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  newPassword: string;
}
