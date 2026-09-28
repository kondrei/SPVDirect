import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accountantPath } from '../hooks/useAppPath';
import { api, API_URL, ApiError } from './client';
import type {
  Accountant,
  AccountantProfile,
  AnafConnection,
  AuthorizationLink,
  CaenInfo,
  Company,
  ConnectionTestResult,
  FirmLookup,
  ProfileUpdate,
} from './types';

export const keys = {
  me: ['me'] as const,
  profile: ['profile'] as const,
  caen: (code: string) => ['caen', code] as const,
  companies: ['companies'] as const,
  company: (id: number) => ['companies', id] as const,
  connections: ['connections'] as const,
};

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api<Accountant>('/auth/me');
      } catch (err) {
        if (
          err instanceof ApiError &&
          (err.status === 401 || err.status === 404)
        )
          return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { email: string; password: string }) =>
      api<Accountant>('/auth/login', { method: 'POST', json: dto }),
    onSuccess: (me) => qc.setQueryData(keys.me, me),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { email: string; password: string; name?: string }) =>
      api<Accountant>('/auth/register', { method: 'POST', json: dto }),
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

function useAccountantApiPath(path: string) {
  const accountantId = useMe().data?.id;
  return accountantId ? accountantPath(accountantId, path) : null;
}

function seedCaen(
  qc: ReturnType<typeof useQueryClient>,
  caen: CaenInfo | null,
) {
  if (caen) qc.setQueryData(keys.caen(caen.code), caen);
}

export function useProfile() {
  const qc = useQueryClient();
  const path = useAccountantApiPath('/profile');
  return useQuery({
    queryKey: keys.profile,
    queryFn: async () => {
      const profile = await api<AccountantProfile>(requirePath(path));
      seedCaen(qc, profile.firmCaen);
      return profile;
    },
    enabled: !!path,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const path = useAccountantApiPath('/profile');
  return useMutation({
    mutationFn: (dto: ProfileUpdate) =>
      api<AccountantProfile>(requirePath(path), { method: 'PATCH', json: dto }),
    onSuccess: (profile) => {
      qc.setQueryData(keys.profile, profile);
      seedCaen(qc, profile.firmCaen);
      qc.setQueryData<Accountant | null>(keys.me, (me) =>
        me ? { ...me, name: profile.name } : me,
      );
    },
  });
}

export function useFirmLookup() {
  const qc = useQueryClient();
  const path = useAccountantApiPath('/profile/firm-lookup');
  return useMutation({
    mutationFn: (cui: string) =>
      api<FirmLookup>(`${requirePath(path)}/${encodeURIComponent(cui)}`),
    onSuccess: (firm) => seedCaen(qc, firm.firmCaen),
  });
}

export function useCaen(code: string) {
  const valid = /^\d{4}$/.test(code);
  return useQuery({
    queryKey: keys.caen(code),
    queryFn: async () => {
      try {
        return await api<CaenInfo>(`/caen/${code}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: valid,
    staleTime: Infinity,
  });
}

export function useChangePassword() {
  const path = useAccountantApiPath('/password');
  return useMutation({
    mutationFn: (dto: { currentPassword: string; newPassword: string }) =>
      api<void>(requirePath(path), { method: 'POST', json: dto }),
  });
}

function useCompaniesPath() {
  return useAccountantApiPath('/companies');
}

function useConnectionsPath() {
  return useAccountantApiPath('/anaf/connections');
}

export function useConnectUrl() {
  const path = useAccountantApiPath('/anaf/connect');
  return path ? `${API_URL}${path}` : undefined;
}

function requirePath(path: string | null): string {
  if (!path)
    throw new ApiError(401, 'Sesiunea a expirat. Autentificați-vă din nou.');
  return path;
}

export function useCompanies({ enabled = true }: { enabled?: boolean } = {}) {
  const path = useCompaniesPath();
  return useQuery({
    queryKey: keys.companies,
    queryFn: () => api<Company[]>(requirePath(path)),
    enabled: enabled && !!path,
  });
}

export function useCompany(id: number) {
  const path = useCompaniesPath();
  return useQuery({
    queryKey: keys.company(id),
    queryFn: () => {
      if (!Number.isSafeInteger(id) || id < 1)
        throw new ApiError(404, 'Firma nu a fost găsită');
      return api<Company>(`${requirePath(path)}/${id}`);
    },
    enabled: !!path,
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  const path = useCompaniesPath();
  return useMutation({
    mutationFn: (dto: { cui: string }) =>
      api<Company>(requirePath(path), { method: 'POST', json: dto }),
    onSuccess: (company) => {
      qc.setQueryData(keys.company(company.id), company);
      void qc.invalidateQueries({ queryKey: keys.companies, exact: true });
    },
  });
}

export function useRefreshCompanyAnaf(id: number) {
  const qc = useQueryClient();
  const path = useCompaniesPath();
  return useMutation({
    mutationFn: () =>
      api<Company>(`${requirePath(path)}/${id}/anaf-refresh`, {
        method: 'POST',
      }),
    onSuccess: (company) => {
      qc.setQueryData(keys.company(id), company);
      void qc.invalidateQueries({ queryKey: keys.companies, exact: true });
    },
  });
}

export function useUpdateCompany(id: number) {
  const qc = useQueryClient();
  const path = useCompaniesPath();
  return useMutation({
    mutationFn: (dto: { name?: string; anafConnectionId?: string | null }) =>
      api<Company>(`${requirePath(path)}/${id}`, {
        method: 'PATCH',
        json: dto,
      }),
    onSuccess: (company) => {
      qc.setQueryData(keys.company(id), company);
      void qc.invalidateQueries({ queryKey: keys.companies, exact: true });
    },
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  const path = useCompaniesPath();
  return useMutation({
    mutationFn: (id: number) =>
      api<void>(`${requirePath(path)}/${id}`, { method: 'DELETE' }),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: keys.company(id) });
      void qc.invalidateQueries({ queryKey: keys.companies });
    },
  });
}

export function useCreateAuthorizationLink(companyId: number) {
  const path = useCompaniesPath();
  return useMutation({
    mutationFn: () =>
      api<AuthorizationLink>(
        `${requirePath(path)}/${companyId}/authorization-links`,
        { method: 'POST' },
      ),
  });
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
    mutationFn: ({ id, label }: { id: string; label: string }) =>
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
    mutationFn: (id: string) =>
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
    mutationFn: (id: string) =>
      api<ConnectionTestResult>(
        `${requirePath(path)}/${encodeURIComponent(id)}/test`,
      ),
  });
}
