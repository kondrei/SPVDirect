import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ARCHIVE_PAGE_SIZE } from '../../common/constants';
import { api, downloadFile, openFile } from '../client';
import type {
  ArchiveEmailInput,
  EfacturaMessageList,
  ArchiveFileKind,
  ArchivePage,
  ArchiveQuery,
  ArchivedInvoiceDetail,
  ImportPeriodResult,
  ImportResult,
} from '../types';
import { keys } from './queryKeys';
import { useAccountantApiPath, requirePath } from './accountantPath';

export function archiveSearch(query: ArchiveQuery): URLSearchParams {
  const params = new URLSearchParams({
    direction: query.direction,
    page: String(query.page),
    pageSize: String(ARCHIVE_PAGE_SIZE),
  });
  if (query.companyId) params.set('companyId', String(query.companyId));
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.q) params.set('q', query.q);
  return params;
}

export function useEfacturaArchive(query: ArchiveQuery) {
  const path = useAccountantApiPath('/efactura/archive');
  return useQuery({
    queryKey: [...keys.efacturaArchive, 'list', query] as const,
    queryFn: () =>
      api<ArchivePage>(`${requirePath(path)}?${archiveSearch(query)}`),
    enabled: !!path,
  });
}

export function useArchivedInvoice(id: number | undefined) {
  const path = useAccountantApiPath('/efactura/archive');
  return useQuery({
    queryKey: [...keys.efacturaArchive, 'detail', id] as const,
    queryFn: () => api<ArchivedInvoiceDetail>(`${requirePath(path)}/${id}`),
    enabled: !!path && !!id,
  });
}

export function markArchived(
  list: EfacturaMessageList | undefined,
  results: ImportResult[],
): EfacturaMessageList | undefined {
  const archived = new Map(
    results.flatMap((r) => (r.id ? [[r.messageId, r.id] as const] : [])),
  );
  if (!list || archived.size === 0) return list;
  return {
    ...list,
    messages: list.messages.map((m) => ({
      ...m,
      archivedId: archived.get(m.id) ?? m.archivedId,
    })),
  };
}

function useInvalidateImports() {
  const qc = useQueryClient();
  return (results: ImportResult[]) => {
    qc.setQueriesData<EfacturaMessageList>(
      { queryKey: [...keys.efactura, 'messages'] },
      (list) => markArchived(list, results),
    );
    return Promise.all([
      qc.invalidateQueries({ queryKey: keys.efacturaArchive }),
      qc.invalidateQueries({ queryKey: keys.activity }),
    ]);
  };
}

export function useImportMessages() {
  const path = useAccountantApiPath('/efactura/companies');
  const invalidate = useInvalidateImports();
  return useMutation({
    mutationFn: ({
      companyId,
      messageIds,
    }: {
      companyId: number;
      messageIds: string[];
    }) =>
      api<ImportResult[]>(
        `${requirePath(path)}/${companyId}/messages/import`,
        { method: 'POST', json: { messageIds } },
      ),
    onSuccess: (results) => invalidate(results),
  });
}

export function useImportPeriodRequest() {
  const path = useAccountantApiPath('/efactura/companies');
  return (companyId: number, zile: number) =>
    api<ImportPeriodResult>(
      `${requirePath(path)}/${companyId}/messages/import-period`,
      { method: 'POST', json: { zile } },
    );
}

export function useImportsDone() {
  return useInvalidateImports();
}

export function useDownloadArchiveFile() {
  const path = useAccountantApiPath('/efactura/archive');
  return useMutation({
    mutationFn: ({ id, kind }: { id: number; kind: ArchiveFileKind }) =>
      downloadFile(`${requirePath(path)}/${id}/${kind}`, `factura-${id}.${kind}`),
  });
}

export function usePreviewArchivePdf() {
  const path = useAccountantApiPath('/efactura/archive');
  return useMutation({
    mutationFn: ({ id, target }: { id: number; target: Window | null }) =>
      openFile(`${requirePath(path)}/${id}/pdf`, target),
  });
}

export function useEmailArchivedInvoice() {
  const path = useAccountantApiPath('/efactura/archive');
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ArchiveEmailInput) =>
      api<{ to: string; withPdf: boolean }>(`${requirePath(path)}/${id}/email`, {
        method: 'POST',
        json: body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.activity }),
  });
}
