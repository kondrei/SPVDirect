import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  EfacturaDirection,
  EfacturaStandard,
  MessageFilter,
  ValidateStandard,
} from './efactura.enums.js';
import {
  ANAF_ID_PATTERN,
  ARCHIVE_PAGE_SIZE,
  ISO_DATE_PATTERN,
  MAX_ARCHIVE_PAGE_SIZE,
  MAX_ARCHIVE_SEARCH,
  MAX_EMAIL_MESSAGE,
  MAX_IMPORT_IDS,
  MAX_LATEST_UPLOAD_IDS,
  MAX_MESSAGE_DAYS,
  MAX_XML_BYTES,
} from './efactura.constants.js';

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
    if (!ANAF_ID_PATTERN.test(value)) {
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

export class ImportMessagesDto {
  @IsArray({ message: 'Alegeți mesajele de importat' })
  @ArrayMinSize(1, { message: 'Alegeți cel puțin un mesaj' })
  @ArrayMaxSize(MAX_IMPORT_IDS, {
    message: `Se pot importa cel mult ${MAX_IMPORT_IDS} de mesaje odată`,
  })
  @ArrayUnique({ message: 'Un mesaj apare de mai multe ori' })
  @IsString({ each: true })
  @Matches(ANAF_ID_PATTERN, { each: true, message: 'Identificator invalid' })
  messageIds: string[];
}

export class ImportPeriodDto {
  @Type(() => Number)
  @IsInt({ message: 'Numărul de zile trebuie să fie întreg' })
  @Min(1, { message: 'Numărul de zile trebuie să fie cel puțin 1' })
  @Max(MAX_MESSAGE_DAYS, {
    message: `ANAF permite cel mult ${MAX_MESSAGE_DAYS} de zile`,
  })
  zile: number;
}

export class ArchiveQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId?: number;

  @IsOptional()
  @IsEnum(EfacturaDirection, {
    message: `Direcția trebuie să fie ${Object.values(EfacturaDirection).join(' sau ')}`,
  })
  direction?: EfacturaDirection;

  @IsOptional()
  @Matches(ISO_DATE_PATTERN, { message: 'Data de început nu este validă' })
  @IsDateString({ strict: true }, { message: 'Data de început nu este validă' })
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE_PATTERN, { message: 'Data de sfârșit nu este validă' })
  @IsDateString({ strict: true }, { message: 'Data de sfârșit nu este validă' })
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_ARCHIVE_SEARCH, { message: 'Căutarea este prea lungă' })
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ARCHIVE_PAGE_SIZE)
  pageSize?: number = ARCHIVE_PAGE_SIZE;
}

export class EmailArchiveDto {
  @IsEmail({}, { message: 'Adresa de email nu este validă' })
  @MaxLength(254)
  to: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_EMAIL_MESSAGE, {
    message: `Mesajul poate avea cel mult ${MAX_EMAIL_MESSAGE} de caractere`,
  })
  message?: string;
}
