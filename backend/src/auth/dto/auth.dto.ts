import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MFA_CODE_PATTERN } from './auth.constants.js';
import { MfaMethod } from './auth.enums.js';

function stripSpaces(value: unknown): unknown {
  return typeof value === 'string' ? value.replaceAll(/\s/g, '') : value;
}

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  captchaToken: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(200)
  password: string;
}

export class MfaCodeDto {
  @Transform(({ value }) => stripSpaces(value))
  @IsString()
  @Matches(MFA_CODE_PATTERN, {
    message: 'Codul are 6 cifre (sau 5 cifre pentru codul de recuperare)',
  })
  code: string;
}

export class MfaLoginDto extends MfaCodeDto {
  @IsOptional()
  @IsBoolean()
  rememberDevice?: boolean;

  @IsOptional()
  @IsEnum(MfaMethod, {
    message: `Metoda este una dintre: ${Object.values(MfaMethod).join(', ')}`,
  })
  method?: MfaMethod;
}

export class MfaPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}
