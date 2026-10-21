import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SPV_PAGE_SIZE } from '../../common/constants';
import { api, downloadFile } from '../client';
import type { ArchivedSpvMessage, SpvArchivePage, SpvImportSummary, SpvRequestInput, SpvRequestResult } from '../types';
import { keys } from './queryKeys';
import { useAccountantApiPath, requirePath } from './accountantPath';
import { useConnectionsPath } from './connections';

function spvPath(path: string | null, connectionId: number, rest: string) {
  return `${requirePath(path)}/${encodeURIComponent(connectionId)}/spv${rest}`;
}

export interface SpvArchiveQuery {
  cif?: string;
  page: number;
}

export function useSpvArchive(query: SpvArchiveQuery) {
  const path = useAccountantApiPath('/spv/archive');
  return useQuery({
    queryKey: [...keys.spvArchive, query] as const,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(query.page),
        pageSize: String(SPV_PAGE_SIZE),
      });
      if (query.cif) params.set('cif', query.cif);
      return api<SpvArchivePage>(`${requirePath(path)}?${params}`);
    },
    enabled: !!path,
    placeholderData: (previous) => previous,
  });
}

export function useDownloadSpvMessage() {
  const path = useAccountantApiPath('/spv/archive');
  return useMutation({
    mutationFn: (message: { id: number; anafMessageId: string }) =>
      downloadFile(
        `${requirePath(path)}/${message.id}/download`,
        `mesaj-${message.anafMessageId}.pdf`,
      ),
  });
}

export function useImportSpvMessages() {
  const qc = useQueryClient();
  const path = useAccountantApiPath('/spv/archive');
  return useMutation({
    mutationFn: (content: string) => {
      const body = new FormData();
      body.append(
        'file',
        new Blob([content], { type: 'application/json' }),
        'lista-mesaje-anaf.json',
      );
      return api<SpvImportSummary>(`${requirePath(path)}/import`, {
        method: 'POST',
        body,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.spvArchive }),
  });
}

export function useUploadSpvDocument() {
  const qc = useQueryClient();
  const path = useAccountantApiPath('/spv/archive');
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => {
      const body = new FormData();
      body.append('document', file);
      return api<ArchivedSpvMessage>(`${requirePath(path)}/${id}/document`, {
        method: 'PUT',
        body,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.spvArchive }),
  });
}

export function useCreateSpvRequest() {
  const qc = useQueryClient();
  const path = useConnectionsPath();
  return useMutation({
    mutationFn: ({
      connectionId,
      ...dto
    }: SpvRequestInput & { connectionId: number }) =>
      api<SpvRequestResult>(spvPath(path, connectionId, '/requests'), {
        method: 'POST',
        json: dto,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.spvArchive }),
  });
}
