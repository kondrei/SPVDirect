import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Company } from '../../../companies/company.entity.js';
import { parseAnafDateTime } from '../spv-date.js';
import { SpvFileStore } from './spv-file-store.service.js';
import { SpvMessage } from '../spv-message.entity.js';
import {
  SpvService,
  type SpvDocument,
  type SpvMessage as AnafSpvMessage,
} from './spv.service.js';

export const MAX_DOWNLOADS_PER_SYNC = 100;
export const INSERT_CHUNK = 200;
export const DEFAULT_SYNC_DAYS = 60;

export interface SyncSummary {
  fetched: number;
  added: number;
  downloaded: number;
  failed: number;
  pending: number;
}

export interface ArchiveFilter {
  cif?: string;
  type?: string;
  companyId?: number;
  page: number;
  pageSize: number;
}

export interface ArchivedMessage {
  id: number;
  anafMessageId: string;
  cif: string | null;
  type: string | null;
  details: string | null;
  requestId: string | null;
  createdAt: string | null;
  createdAtRaw: string | null;
  companyId: number | null;
  stored: boolean;
  sizeBytes: number | null;
  downloadedAt: string | null;
}

export interface ArchivePage {
  items: ArchivedMessage[];
  total: number;
  page: number;
  pageSize: number;
}

export function normalizeCif(value: string | null): string | null {
  const cleaned = value?.replace(/\s+/g, '').replace(/^RO/i, '') ?? '';
  return cleaned || null;
}

function toArchived(m: SpvMessage): ArchivedMessage {
  return {
    id: m.id,
    anafMessageId: m.anafMessageId,
    cif: m.cif,
    type: m.type,
    details: m.details,
    requestId: m.requestId,
    createdAt: m.anafCreatedAt?.toISOString() ?? null,
    createdAtRaw: m.anafCreatedRaw,
    companyId: m.companyId,
    stored: m.sizeBytes !== null,
    sizeBytes: m.sizeBytes,
    downloadedAt: m.downloadedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class SpvArchiveService {
  private readonly logger = new Logger(SpvArchiveService.name);

  constructor(
    private readonly spv: SpvService,
    @InjectRepository(SpvMessage)
    private readonly messages: Repository<SpvMessage>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly store: SpvFileStore,
  ) {}

  async sync(
    accountantId: number,
    connectionId: string,
    zile: number = DEFAULT_SYNC_DAYS,
  ): Promise<SyncSummary> {
    const list = await this.spv.listMessages(accountantId, connectionId, {
      zile,
    });
    const added = await this.saveMetadata(
      accountantId,
      connectionId,
      list.messages,
    );

    let downloaded = 0;
    let failed = 0;
    let pending = 0;
    if (list.messages.length > 0) {
      const [missing, missingTotal] = await this.messages.findAndCount({
        select: { id: true, anafMessageId: true },
        where: {
          accountantId,
          anafMessageId: In(list.messages.map((m) => m.id)),
          sizeBytes: IsNull(),
        },
        order: { anafCreatedAt: 'DESC', id: 'DESC' },
        take: MAX_DOWNLOADS_PER_SYNC,
      });
      pending = missingTotal;
      for (const row of missing) {
        try {
          const doc = await this.spv.downloadMessage(
            accountantId,
            connectionId,
            row.anafMessageId,
          );
          await this.saveContent(accountantId, row, connectionId, doc);
          downloaded++;
          pending--;
        } catch (err) {
          failed++;
          this.logger.warn(
            `SPV message ${row.anafMessageId} not stored: ${(err as Error).message}`,
          );
          if (
            err instanceof HttpException &&
            err.getStatus() === HttpStatus.TOO_MANY_REQUESTS
          ) {
            break;
          }
        }
      }
    }

    return {
      fetched: list.messages.length,
      added,
      downloaded,
      failed,
      pending,
    };
  }

  async list(
    accountantId: number,
    filter: ArchiveFilter,
  ): Promise<ArchivePage> {
    const qb = this.messages
      .createQueryBuilder('m')
      .where('m.accountantId = :accountantId', { accountantId });
    if (filter.cif) qb.andWhere('m.cif = :cif', { cif: filter.cif });
    if (filter.type) qb.andWhere('m.type = :type', { type: filter.type });
    if (filter.companyId) {
      qb.andWhere('m.companyId = :companyId', { companyId: filter.companyId });
    }
    const [rows, total] = await qb
      .orderBy('m.anafCreatedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('m.id', 'DESC')
      .skip((filter.page - 1) * filter.pageSize)
      .take(filter.pageSize)
      .getManyAndCount();
    return {
      items: rows.map(toArchived),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  async download(accountantId: number, id: number): Promise<SpvDocument> {
    const message = await this.messages
      .createQueryBuilder('m')
      .addSelect('m.content')
      .where('m.id = :id AND m.accountantId = :accountantId', {
        id,
        accountantId,
      })
      .getOne();
    if (!message) throw new NotFoundException('Mesajul nu a fost găsit');

    if (message.content) {
      return {
        content: message.content,
        contentType: message.contentType ?? 'application/pdf',
        filename: `mesaj-${message.anafMessageId}.pdf`,
      };
    }
    if (message.storagePath) {
      if (!this.store.enabled) {
        throw new ConflictException(
          'Documentul este în Supabase Storage, dar stocarea nu este activată (SPV_STORAGE).',
        );
      }
      return {
        content: await this.store.get(message.storagePath),
        contentType: message.contentType ?? 'application/pdf',
        filename: `mesaj-${message.anafMessageId}.pdf`,
      };
    }
    if (!message.anafConnectionId) {
      throw new ConflictException(
        'Documentul nu a fost salvat, iar certificatul prin care a fost obținut a fost șters.',
      );
    }
    const doc = await this.spv.downloadMessage(
      accountantId,
      message.anafConnectionId,
      message.anafMessageId,
    );
    await this.saveContent(
      accountantId,
      message,
      message.anafConnectionId,
      doc,
    );
    return doc;
  }

  async moveStoredContent(limit = MAX_DOWNLOADS_PER_SYNC): Promise<number> {
    if (!this.store.enabled) return 0;
    const rows = await this.messages
      .createQueryBuilder('m')
      .addSelect('m.content')
      .where('m.content IS NOT NULL AND m.storagePath IS NULL')
      .orderBy('m.id', 'ASC')
      .take(limit)
      .getMany();
    let moved = 0;
    for (const row of rows) {
      if (!row.content) continue;
      try {
        const path = this.store.pathFor(row.accountantId, row.anafMessageId);
        await this.store.put(
          path,
          row.content,
          row.contentType ?? 'application/pdf',
        );
        await this.messages.update(
          { id: row.id },
          { storagePath: path, content: null },
        );
        moved++;
      } catch (err) {
        this.logger.warn(
          `SPV message ${row.anafMessageId} not moved to storage: ${(err as Error).message}`,
        );
        break;
      }
    }
    return moved;
  }

  private async saveContent(
    accountantId: number,
    row: Pick<SpvMessage, 'id' | 'anafMessageId'>,
    connectionId: string,
    doc: SpvDocument,
  ): Promise<void> {
    const common = {
      anafConnectionId: connectionId,
      contentType: doc.contentType,
      sizeBytes: doc.content.length,
      downloadedAt: new Date(),
    };
    if (this.store.enabled) {
      const path = this.store.pathFor(accountantId, row.anafMessageId);
      await this.store.put(path, doc.content, doc.contentType);
      await this.messages.update(
        { id: row.id },
        { ...common, storagePath: path, content: null },
      );
      return;
    }
    await this.messages.update(
      { id: row.id },
      { ...common, storagePath: null, content: doc.content },
    );
  }

  private async saveMetadata(
    accountantId: number,
    connectionId: string,
    messages: AnafSpvMessage[],
  ): Promise<number> {
    if (messages.length === 0) return 0;

    const cuis = [
      ...new Set(
        messages.map((m) => normalizeCif(m.cif)).filter((c) => c !== null),
      ),
    ];
    const companies = cuis.length
      ? await this.companies.find({
          select: { id: true, cui: true },
          where: { accountantId, cui: In(cuis) },
        })
      : [];
    const companyByCui = new Map(companies.map((c) => [c.cui, c.id]));

    const rows = messages.map((m) => ({
      accountantId,
      anafConnectionId: connectionId,
      companyId: companyByCui.get(normalizeCif(m.cif) ?? '') ?? null,
      anafMessageId: m.id,
      cif: m.cif?.slice(0, 20) ?? null,
      type: m.type,
      details: m.details,
      requestId: m.requestId,
      anafCreatedAt: parseAnafDateTime(m.createdAt),
      anafCreatedRaw: m.createdAt?.slice(0, 30) ?? null,
    }));

    let added = 0;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const result = await this.messages
        .createQueryBuilder()
        .insert()
        .into(SpvMessage)
        .values(rows.slice(i, i + INSERT_CHUNK))
        .orIgnore()
        .returning('id')
        .execute();
      added += (result.raw as unknown[]).length;
    }
    return added;
  }
}
