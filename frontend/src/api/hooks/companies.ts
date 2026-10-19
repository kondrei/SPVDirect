import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_URL, ApiError } from '../client';
import type {
  AuthorizationLink,
  BulkCompanyResult,
  Company,
} from '../types';
import { keys } from './queryKeys';
import { useAccountantApiPath, requirePath } from './accountantPath';

function useCompaniesPath() {
  return useAccountantApiPath('/companies');
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

export function useCreateCompanies() {
  const qc = useQueryClient();
  const path = useCompaniesPath();
  return useMutation({
    mutationFn: (cuis: string[]) =>
      api<BulkCompanyResult[]>(`${requirePath(path)}/bulk`, {
        method: 'POST',
        json: { cuis },
      }),
    onSuccess: (results) => {
      for (const r of results) {
        if (r.status === 'created')
          qc.setQueryData(keys.company(r.company.id), r.company);
      }
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

export interface CompanyUpdate {
  name?: string;
  anafConnectionId?: number | null;
  iban?: string | null;
  bankName?: string | null;
  email?: string | null;
  phone?: string | null;
}

export function useUpdateCompany(id: number) {
  const qc = useQueryClient();
  const path = useCompaniesPath();
  return useMutation({
    mutationFn: (dto: CompanyUpdate) =>
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
      void qc.invalidateQueries({ queryKey: keys.invoices });
      void qc.invalidateQueries({ queryKey: keys.efactura });
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

export function useCompanyLogoUrl(company: {
  id: number;
  hasLogo: boolean;
  updatedAt: string;
}) {
  const path = useCompaniesPath();
  if (!company.hasLogo || !path) return null;
  return `${API_URL}${path}/${company.id}/logo?v=${encodeURIComponent(company.updatedAt)}`;
}

export function useUploadCompanyLogo(id: number) {
  const qc = useQueryClient();
  const path = useCompaniesPath();
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('logo', file);
      return api<Company>(`${requirePath(path)}/${id}/logo`, {
        method: 'PUT',
        body,
      });
    },
    onSuccess: (company) => {
      qc.setQueryData(keys.company(id), (old: Company | undefined) =>
        old ? { ...old, ...company, updatedAt: new Date().toISOString() } : company,
      );
      void qc.invalidateQueries({ queryKey: keys.companies, exact: true });
    },
  });
}

export function useRemoveCompanyLogo(id: number) {
  const qc = useQueryClient();
  const path = useCompaniesPath();
  return useMutation({
    mutationFn: () =>
      api<Company>(`${requirePath(path)}/${id}/logo`, { method: 'DELETE' }),
    onSuccess: (company) => {
      qc.setQueryData(keys.company(id), company);
      void qc.invalidateQueries({ queryKey: keys.companies, exact: true });
    },
  });
}
