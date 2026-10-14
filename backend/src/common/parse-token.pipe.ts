import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const LINK_TOKEN = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class ParseLinkTokenPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!LINK_TOKEN.test(value)) {
      throw new BadRequestException('Linkul nu este valid.');
    }
    return value;
  }
}
