import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './client';
import type { Accountant, AnafConnection, AuthorizationLink, Company, ConnectionTestResult } from './types';

export const keys = {
  me: ['me'] as const,
  companies: ['companies'] as const,
  company: (id: string) => ['companies', id] as const,
  connections: ['connections'] as const,
};

// --- Session ---------------------------------------------------------------

/** The signed-in accountant, or null when there is no valid session (401). */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api<Accountant>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 404)) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { email: string; password: string }) => api<Accountant>('/auth/login', { method: 'POST', json: dto }),
    onSuccess: (me) => qc.setQueryData(keys.me, me),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { email: string; password: string; name?: string }) => api<Accountant>('/auth/register', { method: 'POST', json: dto }),
    onSuccess: (me) => qc.setQueryData(keys.me, me),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(keys.me, null);
    },
  });
}

// --- Companies -------------------------------------------------------------

export function useCompanies({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: keys.companies, queryFn: () => api<Company[]>('/companies'), enabled });
}

export function useCompany(id: string) {
  return useQuery({ queryKey: keys.company(id), queryFn: () => api<Company>(`/companies/${encodeURIComponent(id)}`) });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { cui: string; name: string }) => api<Company>('/companies', { method: 'POST', json: dto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.companies }),
  });
}

export function useUpdateCompany(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { name?: string; anafConnectionId?: string | null }) =>
      api<Company>(`/companies/${encodeURIComponent(id)}`, { method: 'PATCH', json: dto }),
    onSuccess: (company) => {
      qc.setQueryData(keys.company(id), company);
      void qc.invalidateQueries({ queryKey: keys.companies, exact: true });
    },
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/companies/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: keys.company(id) });
      void qc.invalidateQueries({ queryKey: keys.companies });
    },
  });
}

export function useCreateAuthorizationLink(companyId: string) {
  return useMutation({
    mutationFn: () => api<AuthorizationLink>(`/companies/${encodeURIComponent(companyId)}/authorization-links`, { method: 'POST' }),
  });
}

// --- ANAF connections (certificates) ----------------------------------------

export function useConnections({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: keys.connections, queryFn: () => api<AnafConnection[]>('/anaf/connections'), enabled });
}

export function useRenameConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      api<AnafConnection>(`/anaf/connections/${encodeURIComponent(id)}`, { method: 'PATCH', json: { label } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.connections }),
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/anaf/connections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.connections });
      // companies.anaf_connection_id is ON DELETE SET NULL: refetch so they show "Fără certificat".
      // Prefix match also refreshes every cached ['companies', id].
      void qc.invalidateQueries({ queryKey: keys.companies });
    },
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (id: string) => api<ConnectionTestResult>(`/anaf/connections/${encodeURIComponent(id)}/test`),
  });
}
