import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AccountantParamGuard } from '../auth/guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { ActivityLogsService } from './activity-logs.service.js';
import { ListActivityQuery } from './dto/activity-log.dto.js';
import { DEFAULT_ACTIVITY_PAGE_SIZE } from './dto/api-log.constants.js';

@Controller('accountants/:accountantId/activity')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class ActivityLogsController {
  constructor(private readonly activity: ActivityLogsService) {}

  @Get()
  list(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Query() query: ListActivityQuery,
  ) {
    return this.activity.list(accountantId, {
      companyId: query.companyId,
      action: query.action,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? DEFAULT_ACTIVITY_PAGE_SIZE,
    });
  }
}
