import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';

const UNAVAILABLE = 'Stocarea documentelor nu este disponibilă momentan';

@Injectable()
export class SpvFileStore {
  private readonly logger = new Logger(SpvFileStore.name);
  private bucketReady: Promise<void> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  get enabled(): boolean {
    return this.config.get<string>('SPV_STORAGE') === 'supabase';
  }

  pathFor(accountantId: number, anafMessageId: string): string {
    return `${accountantId}/${anafMessageId}.pdf`;
  }

  async put(path: string, content: Buffer, contentType: string): Promise<void> {
    await this.ensureBucket();
    const res = await this.call('POST', this.objectUrl(path), {
      data: content,
      headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
    });
    if (res.status >= 400) this.fail('upload', res.status);
  }

  async get(path: string): Promise<Buffer> {
    const res = await this.call('GET', this.objectUrl(path), {
      responseType: 'arraybuffer',
    });
    if (res.status >= 400) this.fail('download', res.status);
    return Buffer.from(res.data as ArrayBuffer);
  }

  private objectUrl(path: string): string {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    return `${this.baseUrl()}/storage/v1/object/${this.bucket()}/${encoded}`;
  }

  private ensureBucket(): Promise<void> {
    this.bucketReady ??= this.createBucketIfMissing().catch((err: unknown) => {
      this.bucketReady = null;
      throw err;
    });
    return this.bucketReady;
  }

  private async createBucketIfMissing(): Promise<void> {
    const url = `${this.baseUrl()}/storage/v1/bucket`;
    const found = await this.call('GET', `${url}/${this.bucket()}`);
    if (found.status === 200) return;
    const created = await this.call('POST', url, {
      data: { id: this.bucket(), name: this.bucket(), public: false },
    });
    const alreadyThere = created.status === 409 || created.status === 400;
    if (created.status >= 400 && !alreadyThere) {
      this.fail('bucket creation', created.status);
    }
  }

  private async call(
    method: 'GET' | 'POST',
    url: string,
    options: {
      data?: unknown;
      headers?: Record<string, string>;
      responseType?: 'arraybuffer';
    } = {},
  ) {
    const key = this.config.getOrThrow<string>('SUPABASE_SERVICE_KEY');
    try {
      return await this.http.axiosRef.request({
        method,
        url,
        data: options.data,
        responseType: options.responseType,
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          ...options.headers,
        },
        timeout: 60_000,
        maxBodyLength: Infinity,
        validateStatus: () => true,
      });
    } catch (err) {
      const reason = isAxiosError(err) ? (err.code ?? err.message) : 'error';
      this.logger.error(`Supabase Storage unreachable: ${reason}`);
      throw new BadGatewayException(UNAVAILABLE);
    }
  }

  private fail(action: string, status: number): never {
    this.logger.error(`Supabase Storage ${action} failed: HTTP ${status}`);
    throw new BadGatewayException(UNAVAILABLE);
  }

  private baseUrl(): string {
    return this.config.getOrThrow<string>('SUPABASE_URL').replace(/\/+$/, '');
  }

  private bucket(): string {
    return this.config.getOrThrow<string>('SUPABASE_SPV_BUCKET');
  }
}
