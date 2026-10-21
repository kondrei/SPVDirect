import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_URL } from '../client';
import type { AnafConnection, ConnectionTestResult } from '../types';
import { keys } from './queryKeys';
import { useAccountantApiPath, requirePath } from './accountantPath';

export function useConnectionsPath() {
  return useAccountantApiPath('/anaf/connections');
}

export function useConnectUrl() {
  const path = useAccountantApiPath('/anaf/connect');
  return path ? `${API_URL}${path}` : undefined;
}

export function useConnections({ enabled = true }: { enabled?: boolean } = {}) {
  const path = useConnectionsPath();
  return useQuery({
    queryKey: keys.connections,
    queryFn: () => api<AnafConnection[]>(requirePath(path)),
    enabled: enabled && !!path,
  });
}

export function useRenameConnection() {
  const qc = useQueryClient();
  const path = useConnectionsPath();
  return useMutation({
    mutationFn: ({ id, label }: { id: number; label: string }) =>
      api<AnafConnection>(`${requirePath(path)}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        json: { label },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.connections }),
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  const path = useConnectionsPath();
  return useMutation({
    mutationFn: (id: number) =>
      api<void>(`${requirePath(path)}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.connections });
      void qc.invalidateQueries({ queryKey: keys.companies });
    },
  });
}

export function useTestConnection() {
  const path = useConnectionsPath();
  return useMutation({
    mutationFn: (id: number) =>
      api<ConnectionTestResult>(
        `${requirePath(path)}/${encodeURIComponent(id)}/test`,
      ),
  });
}
