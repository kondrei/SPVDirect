import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { SupabaseStorage } from '../../common/storage/supabase-storage.js';

@Injectable()
export class InvoiceFileStore {
  private readonly storage: SupabaseStorage;

  constructor(config: ConfigService, http: HttpService) {
    this.storage = new SupabaseStorage(config, http, 'SUPABASE_INVOICE_BUCKET');
  }

  get configured(): boolean {
    return this.storage.configured;
  }

  pathFor(
    accountantId: number,
    companyId: number,
    series: string,
    number: number,
  ): string {
    return `${accountantId}/${companyId}/${series}-${String(number).padStart(6, '0')}.pdf`;
  }

  put(path: string, content: Buffer): Promise<void> {
    return this.storage.put(path, content, 'application/pdf');
  }

  get(path: string): Promise<Buffer> {
    return this.storage.get(path);
  }

  remove(paths: string[]): Promise<void> {
    return this.storage.remove(paths);
  }
}
