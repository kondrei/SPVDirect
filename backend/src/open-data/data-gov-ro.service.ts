import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

export interface CkanResource {
  name?: string;
  url?: string;
  format?: string;
  last_modified?: string | null;
  created?: string | null;
}

export interface CkanPackage {
  name?: string;
  metadata_created?: string;
  resources?: CkanResource[];
}

interface CkanSearch {
  success?: boolean;
  result?: { results?: CkanPackage[] };
}

@Injectable()
export class DataGovRoService {
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  async searchPackages(
    query: string,
    organization: string,
    rows = 20,
  ): Promise<CkanPackage[]> {
    const url = new URL(
      `${this.config.getOrThrow<string>('DATA_GOV_RO_API_URL').replace(/\/$/, '')}/package_search`,
    );
    url.searchParams.set('q', query);
    url.searchParams.set('fq', `organization:${organization}`);
    url.searchParams.set('sort', 'metadata_created desc');
    url.searchParams.set('rows', String(rows));
    const res = await this.http.axiosRef.get<CkanSearch>(url.toString(), {
      timeout: 30_000,
    });
    if (!res.data?.success) {
      throw new Error('data.gov.ro package_search failed');
    }
    return res.data.result?.results ?? [];
  }

  async downloadText(url: string): Promise<string> {
    const res = await this.http.axiosRef.get<string>(url, {
      timeout: 60_000,
      responseType: 'text',
    });
    return res.data;
  }
}
