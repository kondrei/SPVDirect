import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_ACTIVITY_PAGE_SIZE } from './api-log.constants.js';
import { ActivityAction } from './api-log.enums.js';

export class ListActivityQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId?: number;

  @IsOptional()
  @IsEnum(ActivityAction, {
    message: `action trebuie să fie una dintre: ${Object.values(ActivityAction).join(', ')}`,
  })
  action?: ActivityAction;

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
  @Max(MAX_ACTIVITY_PAGE_SIZE)
  pageSize?: number;
}
