import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AccountantParamGuard } from '../../auth/guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import {
  EFACTURA_THROTTLE,
  EFACTURA_UPLOAD_THROTTLE,
} from '../../common/constants.js';
import { attachment } from '../../common/download-file.js';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import {
  LatestUploadsQuery,
  ListMessagesQuery,
  ListUploadsQuery,
  ParseAnafIdPipe,
  TransformXmlDto,
  UploadInvoiceDto,
  UploadXmlDto,
  ValidateXmlDto,
} from '../dto/efactura.dto.js';
import { MAX_XML_BYTES } from '../dto/efactura.constants.js';
import { EfacturaService } from '../services/efactura.service.js';

const xmlFile = () =>
  FileInterceptor('file', { limits: { fileSize: MAX_XML_BYTES + 1 } });

function xmlOf(file: { buffer: Buffer } | undefined): string {
  if (!file?.buffer?.length) {
    throw new BadRequestException('Alegeți un fișier XML');
  }
  return file.buffer.toString('utf8');
}

@Controller('accountants/:accountantId/efactura')
@UseGuards(JwtAuthGuard, AccountantParamGuard)
export class EfacturaController {
  constructor(private readonly efactura: EfacturaService) {}

  @Get('uploads')
  @Throttle(EFACTURA_THROTTLE)
  list(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Query() query: ListUploadsQuery,
  ) {
    return this.efactura.list(accountantId, {
      companyId: query.companyId,
      invoiceId: query.invoiceId,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
    });
  }

  @Post('uploads')
  @Throttle(EFACTURA_UPLOAD_THROTTLE)
  @UseInterceptors(xmlFile())
  upload(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: UploadXmlDto,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    return this.efactura.upload(accountantId, {
      companyId: dto.companyId,
      standard: dto.standard,
      extern: dto.extern,
      autofactura: dto.autofactura,
      executare: dto.executare,
      b2c: dto.b2c,
      xml: xmlOf(file),
    });
  }

  @Get('invoices/latest-uploads')
  @Throttle(EFACTURA_THROTTLE)
  latestForInvoices(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Query() query: LatestUploadsQuery,
  ) {
    return this.efactura.latestForInvoices(accountantId, query.ids);
  }

  @Get('uploads/:id')
  @Throttle(EFACTURA_THROTTLE)
  get(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.efactura.get(accountantId, id);
  }

  @Post('uploads/:id/refresh')
  @HttpCode(200)
  @Throttle(EFACTURA_THROTTLE)
  refresh(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.efactura.refresh(accountantId, id);
  }

  @Get('uploads/:id/download')
  @Throttle(EFACTURA_THROTTLE)
  @Header('Cache-Control', 'no-store')
  async download(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('id', ParseIdPipe) id: number,
  ) {
    return attachment(await this.efactura.download(accountantId, id));
  }

  @Post('invoices/:invoiceId/upload')
  @Throttle(EFACTURA_UPLOAD_THROTTLE)
  uploadInvoice(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('invoiceId', ParseIdPipe) invoiceId: number,
    @Body() dto: UploadInvoiceDto,
  ) {
    return this.efactura.uploadInvoice(accountantId, invoiceId, dto);
  }

  @Post('invoices/:invoiceId/validate')
  @HttpCode(200)
  @Throttle(EFACTURA_THROTTLE)
  validateInvoice(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('invoiceId', ParseIdPipe) invoiceId: number,
  ) {
    return this.efactura.validateInvoice(accountantId, invoiceId);
  }

  @Get('companies/:companyId/messages')
  @Throttle(EFACTURA_THROTTLE)
  messages(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('companyId', ParseIdPipe) companyId: number,
    @Query() query: ListMessagesQuery,
  ) {
    return this.efactura.listMessages(accountantId, companyId, query);
  }

  @Get('companies/:companyId/messages/:messageId/download')
  @Throttle(EFACTURA_THROTTLE)
  @Header('Cache-Control', 'no-store')
  async downloadMessage(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Param('companyId', ParseIdPipe) companyId: number,
    @Param('messageId', ParseAnafIdPipe) messageId: string,
  ) {
    return attachment(
      await this.efactura.downloadMessage(accountantId, companyId, messageId),
    );
  }

  @Post('validate')
  @HttpCode(200)
  @Throttle(EFACTURA_THROTTLE)
  @UseInterceptors(xmlFile())
  validate(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: ValidateXmlDto,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    return this.efactura.validateXml(accountantId, xmlOf(file), dto.standard);
  }

  @Post('transform')
  @HttpCode(200)
  @Throttle(EFACTURA_THROTTLE)
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(xmlFile())
  async transform(
    @Param('accountantId', ParseIdPipe) accountantId: number,
    @Body() dto: TransformXmlDto,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    return attachment(
      await this.efactura.transformXml(
        accountantId,
        xmlOf(file),
        dto.standard,
        dto.skipValidation,
      ),
    );
  }
}
