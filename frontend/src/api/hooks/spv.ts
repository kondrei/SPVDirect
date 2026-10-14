import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SPV_PAGE_SIZE } from '../../common/constants';
import { api, downloadFile } from '../client';
import type {
  SpvArchivePage,
  SpvRequestInput,
  SpvRequestResult,
  SpvSyncSummary,
} from '../types';
import { keys } from './queryKeys';
import { useAccountantApiPath, requirePath } from './accountantPath';
import { useConnectionsPath } from './connections';

function spvPath(path: string | null, connectionId: string, rest: string) {
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

export function useSyncSpv() {
  const qc = useQueryClient();
  const path = useConnectionsPath();
  return useMutation({
    mutationFn: ({
      connectionId,
      zile,
    }: {
      connectionId: string;
      zile: number;
    }) =>
      api<SpvSyncSummary>(spvPath(path, connectionId, '/sync'), {
        method: 'POST',
        json: { zile },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.spvArchive }),
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

export function useCreateSpvRequest() {
  const qc = useQueryClient();
  const path = useConnectionsPath();
  return useMutation({
    mutationFn: ({
      connectionId,
      ...dto
    }: SpvRequestInput & { connectionId: string }) =>
      api<SpvRequestResult>(spvPath(path, connectionId, '/requests'), {
        method: 'POST',
        json: dto,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.spvArchive }),
  });
}
