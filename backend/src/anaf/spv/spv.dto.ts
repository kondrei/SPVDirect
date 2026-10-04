import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const MAX_SPV_DAYS = 60;

function stripSpaces(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(/\s+/g, '') : value;
}

@Injectable()
export class ParseSpvMessageIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^\d{1,20}$/.test(value)) {
      throw new BadRequestException('Identificator de mesaj invalid');
    }
    return value;
  }
}

export class ListSpvMessagesQuery {
  @Type(() => Number)
  @IsInt({ message: 'Numărul de zile trebuie să fie întreg' })
  @Min(1, { message: 'Numărul de zile trebuie să fie cel puțin 1' })
  @Max(MAX_SPV_DAYS, {
    message: `ANAF permite cel mult ${MAX_SPV_DAYS} de zile`,
  })
  zile: number;

  @IsOptional()
  @Transform(({ value }) => stripSpaces(value))
  @Matches(/^\d{2,13}$/, { message: 'CIF/CNP invalid' })
  cif?: string;
}

export class CreateSpvRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  tip: string;

  @Transform(({ value }) => stripSpaces(value))
  @Matches(/^\d{2,13}$/, { message: 'CUI/CNP invalid' })
  cui: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(2100)
  an?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  luna?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motiv?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  numarInregistrare?: string;

  @IsOptional()
  @Transform(({ value }) => stripSpaces(value))
  @Matches(/^\d{2,13}$/, { message: 'CUI punct de lucru invalid' })
  cuiPunctDeLucru?: string;
}

export class SyncSpvDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Numărul de zile trebuie să fie întreg' })
  @Min(1, { message: 'Numărul de zile trebuie să fie cel puțin 1' })
  @Max(MAX_SPV_DAYS, {
    message: `ANAF permite cel mult ${MAX_SPV_DAYS} de zile`,
  })
  zile?: number;
}

export class ArchiveQuery {
  @IsOptional()
  @Transform(({ value }) => stripSpaces(value))
  @Matches(/^\d{2,13}$/, { message: 'CIF/CNP invalid' })
  cif?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
