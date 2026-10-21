import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { FileStorage } from '../../config/dto/env.enums.js';
import { SupabaseStorage } from '../../common/storage/supabase-storage.js';
import type { AnafEnvironment } from '../../anaf/dto/anaf.enums.js';
import type { EfacturaFileKind } from '../dto/efactura.enums.js';

@Injectable()
export class EfacturaFileStore {
  private readonly storage: SupabaseStorage;

  constructor(
    private readonly config: ConfigService,
    http: HttpService,
  ) {
    this.storage = new SupabaseStorage(
      config,
      http,
      'SUPABASE_EFACTURA_BUCKET',
    );
  }

  get configured(): boolean {
    return this.storage.configured;
  }

  get enabled(): boolean {
    return (
      this.config.get<FileStorage>('EFACTURA_STORAGE') === FileStorage.Supabase
    );
  }

  pathFor(
    row: {
      accountantId: number;
      companyId: number;
      environment: AnafEnvironment;
      anafMessageId: string;
    },
    kind: EfacturaFileKind,
  ): string {
    return `${row.accountantId}/${row.companyId}/${row.environment}/${row.anafMessageId}.${kind}`;
  }

  put(path: string, content: Buffer, contentType: string): Promise<void> {
    return this.storage.put(path, content, contentType);
  }

  get(path: string): Promise<Buffer> {
    return this.storage.get(path);
  }

  remove(paths: string[]): Promise<void> {
    return this.storage.remove(paths);
  }
}
