import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const MAX_INT4 = 2_147_483_647;

@Injectable()
export class ParseIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const id = /^\d{1,10}$/.test(value) ? Number(value) : NaN;
    if (!Number.isInteger(id) || id < 1 || id > MAX_INT4) {
      throw new BadRequestException('Identificator invalid');
    }
    return id;
  }
}
