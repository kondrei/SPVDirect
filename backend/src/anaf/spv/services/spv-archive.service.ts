import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  spvDocumentSaved,
  spvImported,
} from '../../../api-logs/activity-entries.js';
import { ActivityLogsService } from '../../../api-logs/activity-logs.service.js';
import { CompanyRepository } from '../../../companies/repositories/company.repository.js';
import { parseAnafDateTime } from '../spv-date.js';
import { parseSpvExport, validateSpvPdf } from '../spv-import.js';
import { SpvFileStore } from './spv-file-store.service.js';
import type { SpvMessage } from '../spv-message.entity.js';
import { SpvMessageRepository } from '../repositories/spv-message.repository.js';
import {
  SpvService,
  type SpvDocument,
  type SpvMessage as AnafSpvMessage,
} from './spv.service.js';
import type {
  ImportSummary,
  SyncSummary,
  ArchiveFilter,
  ArchivedMessage,
  ArchivePage,
} from '../dto/spv.types.js';

export const MAX_DOWNLOADS_PER_SYNC = 100;
export const INSERT_CHUNK = 200;
export const DEFAULT_SYNC_DAYS = 60;
export const NOT_STORED =
  'Documentul nu este salvat în SPVDirect. Deschideți-l la ANAF și încărcați PDF-ul.';

const MAX_CUI_DIGITS = 10;

export function normalizeCif(value: string | null): string | null {
  const cleaned = value?.replaceAll(/\s+/g, '').replace(/^RO/i, '') ?? '';
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
    private readonly spvService: SpvService,
    private readonly spvMessageRepository: SpvMessageRepository,
    private readonly companyRepository: CompanyRepository,
    private readonly spvFileStore: SpvFileStore,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async sync(
    accountantId: number,
    connectionId: number,
    zile: number = DEFAULT_SYNC_DAYS,
  ): Promise<SyncSummary> {
    const list = await this.spvService.listMessages(
      accountantId,
      connectionId,
      {
        zile,
      },
    );
    const added = await this.saveMetadata(
      accountantId,
      connectionId,
      list.messages,
    );

    let downloaded = 0;
    let failed = 0;
    let pending = 0;
    if (list.messages.length > 0) {
      const [missing, missingTotal] =
        await this.spvMessageRepository.missingContent(
          accountantId,
          list.messages.map((m) => m.id),
          MAX_DOWNLOADS_PER_SYNC,
        );
      pending = missingTotal;
      for (const row of missing) {
        try {
          const doc = await this.spvService.downloadMessage(
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
    const [rows, total] = await this.spvMessageRepository.page(
      accountantId,
      filter,
    );
    return {
      items: rows.map((row) => toArchived(row)),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  async download(accountantId: number, id: number): Promise<SpvDocument> {
    const message = await this.spvMessageRepository.findWithContent(
      accountantId,
      id,
    );
    if (!message) throw new NotFoundException('Mesajul nu a fost găsit');

    if (message.content) {
      return {
        content: message.content,
        contentType: message.contentType ?? 'application/pdf',
        filename: `mesaj-${message.anafMessageId}.pdf`,
      };
    }
    if (message.storagePath) {
      if (!this.spvFileStore.enabled) {
        throw new ConflictException(
          'Documentul este în Supabase Storage, dar stocarea nu este activată (SPV_STORAGE).',
        );
      }
      return {
        content: await this.spvFileStore.get(message.storagePath),
        contentType: message.contentType ?? 'application/pdf',
        filename: `mesaj-${message.anafMessageId}.pdf`,
      };
    }
    throw new ConflictException(NOT_STORED);
  }

  async importMessages(
    accountantId: number,
    content: Buffer | undefined,
  ): Promise<ImportSummary> {
    const list = parseSpvExport(content);
    const added = await this.saveMetadata(accountantId, null, list.messages);
    await this.activityLogsService.record(
      accountantId,
      spvImported({
        fetched: list.messages.length,
        added,
        certSerial: list.certSerial,
      }),
    );
    return {
      fetched: list.messages.length,
      added,
      title: list.title,
      certSerial: list.certSerial,
      notice: list.notice,
      rights: list.cuis.length,
      unknownCuis: await this.unknownCuis(accountantId, list.cuis),
    };
  }

  private async unknownCuis(
    accountantId: number,
    cuis: string[],
  ): Promise<string[]> {
    const companyCuis = cuis.filter((c) => c.length <= MAX_CUI_DIGITS);
    if (companyCuis.length === 0) return [];
    const known = await this.companyRepository.existingCuis(
      accountantId,
      companyCuis,
    );
    const have = new Set(known.map((c) => c.cui));
    return companyCuis.filter((c) => !have.has(c));
  }

  async saveDocument(
    accountantId: number,
    id: number,
    content: Buffer | undefined,
  ): Promise<ArchivedMessage> {
    const pdf = validateSpvPdf(content);
    const message = await this.spvMessageRepository.findOwned(accountantId, id);
    if (!message) throw new NotFoundException('Mesajul nu a fost găsit');
    await this.saveContent(accountantId, message, message.anafConnectionId, {
      content: pdf,
      contentType: 'application/pdf',
      filename: `mesaj-${message.anafMessageId}.pdf`,
    });
    const saved = await this.spvMessageRepository.findOwned(accountantId, id);
    if (!saved) throw new NotFoundException('Mesajul nu a fost găsit');
    await this.activityLogsService.record(
      accountantId,
      spvDocumentSaved(saved),
    );
    return toArchived(saved);
  }

  async moveStoredContent(limit = MAX_DOWNLOADS_PER_SYNC): Promise<number> {
    if (!this.spvFileStore.enabled) return 0;
    const rows = await this.spvMessageRepository.contentNotInStorage(limit);
    let moved = 0;
    for (const row of rows) {
      if (!row.content) continue;
      try {
        const path = this.spvFileStore.pathFor(
          row.accountantId,
          row.anafMessageId,
        );
        await this.spvFileStore.put(
          path,
          row.content,
          row.contentType ?? 'application/pdf',
        );
        await this.spvMessageRepository.update(row.id, {
          storagePath: path,
          content: null,
        });
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
    connectionId: number | null,
    doc: SpvDocument,
  ): Promise<void> {
    const common = {
      anafConnectionId: connectionId,
      contentType: doc.contentType,
      sizeBytes: doc.content.length,
      downloadedAt: new Date(),
    };
    if (this.spvFileStore.enabled) {
      const path = this.spvFileStore.pathFor(accountantId, row.anafMessageId);
      await this.spvFileStore.put(path, doc.content, doc.contentType);
      await this.spvMessageRepository.update(row.id, {
        ...common,
        storagePath: path,
        content: null,
      });
      return;
    }
    await this.spvMessageRepository.update(row.id, {
      ...common,
      storagePath: null,
      content: doc.content,
    });
  }

  private async saveMetadata(
    accountantId: number,
    connectionId: number | null,
    messages: AnafSpvMessage[],
  ): Promise<number> {
    if (messages.length === 0) return 0;

    const cuis = [
      ...new Set(
        messages.map((m) => normalizeCif(m.cif)).filter((c) => c !== null),
      ),
    ];
    const companies = cuis.length
      ? await this.companyRepository.withCuis(accountantId, cuis)
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
      added += await this.spvMessageRepository.insertNew(
        rows.slice(i, i + INSERT_CHUNK),
      );
    }
    return added;
  }
}
