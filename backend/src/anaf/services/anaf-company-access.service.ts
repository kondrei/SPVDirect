import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { AxiosResponse } from 'axios';
import { bodyJson } from '../../efactura/helpers/anaf-body.js';
import { AnafApiService } from './anaf-api.service.js';
import { ApiLogService } from '../../api-logs/dto/api-log.enums.js';

interface MessageListBody {
  mesaje?: unknown[];
  eroare?: string;
  message?: string;
}

export const noSpvRight = (cui: string): string =>
  `Certificatul nu are drept în SPV pentru CUI ${cui}. Legați firma de un certificat autorizat pentru ea în SPV.`;

@Injectable()
export class AnafCompanyAccessService {
  constructor(private readonly anafApiService: AnafApiService) {}

  async assertAccess(
    accountantId: number,
    connectionId: number,
    cui: string,
    companyId?: number,
  ): Promise<void> {
    let res: AxiosResponse<unknown>;
    try {
      res = await this.anafApiService.request<unknown>({
        accountantId,
        connectionId,
        companyId,
        service: ApiLogService.Efactura,
        path: this.anafApiService.envPath('/FCTEL/rest/listaMesajeFactura'),
        params: { zile: 1, cif: cui },
        responseType: 'text',
        allowStatuses: [400],
      });
    } catch (err) {
      if (
        err instanceof HttpException &&
        err.getStatus() === HttpStatus.FORBIDDEN
      ) {
        throw new BadRequestException(noSpvRight(cui));
      }
      throw err;
    }

    const body = bodyJson<MessageListBody>(res.data);
    if (!body) {
      throw new BadGatewayException('ANAF a returnat un răspuns neașteptat');
    }
    const failure =
      body.eroare ?? (res.status === 400 ? body.message : undefined);
    if (!failure) {
      if (Array.isArray(body.mesaje)) return;
      throw new BadGatewayException('ANAF a returnat un răspuns neașteptat');
    }
    if (/nu exist[aă] mesaje/i.test(failure)) return;
    if (/drept/i.test(failure)) throw new BadRequestException(noSpvRight(cui));
    throw new BadRequestException(`ANAF: ${failure}`);
  }
}
