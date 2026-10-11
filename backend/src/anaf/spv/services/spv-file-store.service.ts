import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { SupabaseStorage } from '../../../common/storage/supabase-storage.js';

@Injectable()
export class SpvFileStore {
  private readonly storage: SupabaseStorage;

  constructor(
    private readonly config: ConfigService,
    http: HttpService,
  ) {
    this.storage = new SupabaseStorage(config, http, 'SUPABASE_SPV_BUCKET');
  }

  get enabled(): boolean {
    return this.config.get<string>('SPV_STORAGE') === 'supabase';
  }

  pathFor(accountantId: number, anafMessageId: string): string {
    return `${accountantId}/${anafMessageId}.pdf`;
  }

  put(path: string, content: Buffer, contentType: string): Promise<void> {
    return this.storage.put(path, content, contentType);
  }

  get(path: string): Promise<Buffer> {
    return this.storage.get(path);
  }
}
