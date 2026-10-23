import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountantParamGuard } from '../../auth/guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import {
  ANAF_LOOKUP_THROTTLE,
  INVOICE_MAIL_THROTTLE,
  INVOICE_THROTTLE,
} from '../../common/constants.js';
import { attachment } from '../../common/download-file.js';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { ParseCuiPipe } from '../../companies/dto/company.dto.js';
import {
  CreateInvoiceDto,
  CreateStornoDto,
  LineSuggestionsQuery,
  ListInvoicesQuery,
  NextNumberQuery,
  SendInvoiceDto,
} from '../dto/invoice.dto.js';
import { InvoiceBuyersService } from '../services/invoice-buyers.service.js';
import { InvoiceDeliveryService } from '../services/invoice-delivery.service.js';
import { InvoiceStornoService } from '../services/invoice-storno.service.js';
import { InvoicesService } from '../services/invoices.service.js';

@Controller('accountants/:accountantId/invoices')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly invoiceBuyersService: InvoiceBuyersService,
    private readonly invoiceStornoService: InvoiceStornoService,
    private readonly invoiceDeliveryService: InvoiceDeliveryService,
  ) {}

  @Get()
  @Throttle(INVOICE_THROTTLE)
  list(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Query() query: ListInvoicesQuery,
  ) {
    return this.invoicesService.list(accountantId, {
      companyId: query.companyId,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
    });
  }

  @Get('stats')
  @Throttle(INVOICE_THROTTLE)
  stats(@Param('accountantId', ParseIdPipe) accountantId: number) {
    return this.invoicesService.stats(accountantId);
  }

  @Get('buyer-lookup/:cui')
  @Throttle(ANAF_LOOKUP_THROTTLE)
  lookupBuyer(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('cui', ParseCuiPipe) cui: string,
  ) {
    return this.invoiceBuyersService.lookupBuyer(accountantId, cui);
  }

  @Get('buyers/:cui')
  @Throttle(ANAF_LOOKUP_THROTTLE)
  findBuyer(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('cui', ParseCuiPipe) cui: string,
  ) {
    return this.invoiceBuyersService.findBuyer(accountantId, cui);
  }

  @Get('next-number')
  @Throttle(INVOICE_THROTTLE)
  async nextNumber(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Query() query: NextNumberQuery,
  ) {
    return {
      number: await this.invoicesService.nextNumber(
        accountantId,
        query.companyId,
        query.series,
      ),
    };
  }

  @Get('line-suggestions')
  @Throttle(INVOICE_THROTTLE)
  lineSuggestions(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Query() query: LineSuggestionsQuery,
  ) {
    return this.invoiceBuyersService.lineSuggestions(
      accountantId,
      query.companyId,
      query.buyerCui,
    );
  }

  @Post()
  @Throttle(INVOICE_MAIL_THROTTLE)
  create(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.create(accountantId, dto);
  }

  @Get(':id')
  @Throttle(INVOICE_THROTTLE)
  get(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.invoicesService.detail(accountantId, id);
  }

  @Post(':id/storno')
  @Throttle(INVOICE_MAIL_THROTTLE)
  createStorno(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: CreateStornoDto,
  ) {
    return this.invoiceStornoService.createStorno(accountantId, id, dto);
  }

  @Get(':id/pdf')
  @Throttle(INVOICE_THROTTLE)
  @Header('Cache-Control', 'no-store')
  async pdf(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return attachment(await this.invoiceDeliveryService.pdf(accountantId, id));
  }

  @Get(':id/xml')
  @Throttle(INVOICE_THROTTLE)
  @Header('Cache-Control', 'no-store')
  async xml(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return attachment(await this.invoiceDeliveryService.xml(accountantId, id));
  }

  @Post(':id/store')
  @HttpCode(200)
  @Throttle(INVOICE_THROTTLE)
  saveToStorage(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.invoiceDeliveryService.saveToStorage(accountantId, id);
  }

  @Post(':id/send')
  @HttpCode(200)
  @Throttle(INVOICE_MAIL_THROTTLE)
  send(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: SendInvoiceDto,
  ) {
    return this.invoiceDeliveryService.send(accountantId, id, dto.to);
  }
}
