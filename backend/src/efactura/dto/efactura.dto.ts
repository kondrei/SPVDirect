import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export const UPLOAD_STANDARDS = ['UBL', 'CN', 'CII', 'RASP'] as const;
export const VALIDATE_STANDARDS = ['FACT1', 'FCN'] as const;
export const MESSAGE_FILTERS = ['E', 'P', 'T', 'R'] as const;
export const MAX_MESSAGE_DAYS = 60;
export const MAX_XML_BYTES = 10 * 1024 * 1024;

function toBoolean({ value }: { value: unknown }): unknown {
  if (value === true || value === 'true' || value === 'DA' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0' || value === '') {
    return false;
  }
  return value;
}

@Injectable()
export class ParseAnafIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^\d{1,20}$/.test(value)) {
      throw new BadRequestException('Identificator invalid');
    }
    return value;
  }
}

export class UploadInvoiceDto {
  @IsOptional()
  @IsBoolean({ message: 'extern trebuie să fie da/nu' })
  extern?: boolean;
}

export class UploadXmlDto {
  @Type(() => Number)
  @IsInt({ message: 'Alegeți firma' })
  @Min(1)
  companyId: number;

  @IsIn(UPLOAD_STANDARDS, {
    message: `Standardul trebuie să fie ${UPLOAD_STANDARDS.join(', ')}`,
  })
  standard: (typeof UPLOAD_STANDARDS)[number];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  extern?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  autofactura?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  executare?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  b2c?: boolean;
}

export class ValidateXmlDto {
  @IsOptional()
  @IsIn(VALIDATE_STANDARDS, {
    message: `Standardul trebuie să fie ${VALIDATE_STANDARDS.join(' sau ')}`,
  })
  standard?: (typeof VALIDATE_STANDARDS)[number];
}

export class TransformXmlDto extends ValidateXmlDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  skipValidation?: boolean;
}

export class ListUploadsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  invoiceId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ListMessagesQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Numărul de zile trebuie să fie întreg' })
  @Min(1, { message: 'Numărul de zile trebuie să fie cel puțin 1' })
  @Max(MAX_MESSAGE_DAYS, {
    message: `ANAF permite cel mult ${MAX_MESSAGE_DAYS} de zile`,
  })
  zile?: number;

  @IsOptional()
  @IsIn(MESSAGE_FILTERS, {
    message: `Filtrul trebuie să fie ${MESSAGE_FILTERS.join(', ')}`,
  })
  filtru?: (typeof MESSAGE_FILTERS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  startTime?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  endTime?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;
}
