import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  EfacturaStandard,
  MessageFilter,
  ValidateStandard,
} from './efactura.enums.js';

export const MAX_MESSAGE_DAYS = 60;
export const MAX_XML_BYTES = 10 * 1024 * 1024;

export function assertXmlPayload(xml: string): void {
  if (!xml.trim()) throw new BadRequestException('Fișierul XML este gol');
  if (Buffer.byteLength(xml) > MAX_XML_BYTES) {
    throw new BadRequestException('Fișierul depășește 10 MB');
  }
}

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

  @IsEnum(EfacturaStandard, {
    message: `Standardul trebuie să fie ${Object.values(EfacturaStandard).join(', ')}`,
  })
  standard: EfacturaStandard;

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
  @IsEnum(ValidateStandard, {
    message: `Standardul trebuie să fie ${Object.values(ValidateStandard).join(' sau ')}`,
  })
  standard?: ValidateStandard;
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

export const MAX_LATEST_UPLOAD_IDS = 100;

export class LatestUploadsQuery {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.split(',').filter(Boolean).map(Number)
      : value,
  )
  @IsArray()
  @ArrayMaxSize(MAX_LATEST_UPLOAD_IDS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2_147_483_647, { each: true })
  ids: number[];
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
  @IsEnum(MessageFilter, {
    message: `Filtrul trebuie să fie ${Object.values(MessageFilter).join(', ')}`,
  })
  filtru?: MessageFilter;

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
