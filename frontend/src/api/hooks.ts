import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { INVOICE_PAGE_SIZE, SPV_PAGE_SIZE } from '../common/constants';
import { accountantPath } from '../hooks/useAppPath';
import { recaptchaToken } from '../lib/recaptcha';
import { api, API_URL, ApiError, downloadFile, fetchFile } from './client';
import type {
  Accountant,
  AccountantProfile,
  AnafConnection,
  AuthorizationLink,
  BulkCompanyResult,
  CaenInfo,
  Company,
  ConnectionTestResult,
  CreateInvoiceInput,
  CreateStornoInput,
  CreatedInvoice,
  BuyerLookup,
  Invoice,
  InvoicePage,
  InvoiceStats,
  EfacturaMessageList,
  EfacturaUpload,
  EfacturaUploadPage,
  MessageFilter,
  UploadXmlInput,
  XmlValidation,
  FirmLookup,
  ProfileUpdate,
  PublicStats,
  SpvArchivePage,
  SpvRequestInput,
  SpvRequestResult,
  SpvSyncSummary,
} from './types';

export const keys = {
  me: ['me'] as const,
  profile: ['profile'] as const,
  caen: (code: string) => ['caen', code] as const,
  companies: ['companies'] as const,
  company: (id: number) => ['companies', id] as const,
  connections: ['connections'] as const,
  invoices: ['invoices'] as const,
  efactura: ['efactura'] as const,
};

export function usePublicStats() {
  return useQuery({
    queryKey: ['public-stats'],
    queryFn: () => api<PublicStats>('/public/stats'),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
}

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
  return useMutation({
    mutationFn: async (dto: {
      email: string;
      password: string;
      name?: string;
    }) =>
      api<{ status: 'pending' }>('/auth/register', {
        method: 'POST',
        json: { ...dto, captchaToken: await recaptchaToken('register') },
      }),
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
  anafConnectionId?: string | null;
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
    queryKey: ['spv-archive', query] as const,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spv-archive'] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spv-archive'] }),
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

export interface InvoiceListQuery {
  companyId?: number;
  page: number;
}

export function useInvoiceStats() {
  const path = useAccountantApiPath('/invoices');
  return useQuery({
    queryKey: [...keys.invoices, 'stats'] as const,
    queryFn: () => api<InvoiceStats>(`${requirePath(path)}/stats`),
    enabled: !!path,
  });
}

export function useInvoices(query: InvoiceListQuery) {
  const path = useAccountantApiPath('/invoices');
  return useQuery({
    queryKey: [...keys.invoices, query] as const,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(query.page),
        pageSize: String(INVOICE_PAGE_SIZE),
      });
      if (query.companyId) params.set('companyId', String(query.companyId));
      return api<InvoicePage>(`${requirePath(path)}?${params}`);
    },
    enabled: !!path,
    placeholderData: (previous) => previous,
  });
}

export function useBuyerLookup() {
  const path = useAccountantApiPath('/invoices/buyer-lookup');
  return useMutation({
    mutationFn: (cui: string) =>
      api<BuyerLookup>(`${requirePath(path)}/${encodeURIComponent(cui)}`),
  });
}

export function useNextInvoiceNumber(companyId: number, series: string) {
  const path = useAccountantApiPath('/invoices/next-number');
  const valid = companyId > 0 && /^[A-Z0-9]{1,10}$/.test(series);
  return useQuery({
    queryKey: [...keys.invoices, 'next-number', companyId, series] as const,
    queryFn: () =>
      api<{ number: number }>(
        `${requirePath(path)}?${new URLSearchParams({ companyId: String(companyId), series })}`,
      ),
    enabled: !!path && valid,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  const path = useAccountantApiPath('/invoices');
  return useMutation({
    mutationFn: (dto: CreateInvoiceInput) =>
      api<CreatedInvoice>(requirePath(path), { method: 'POST', json: dto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invoices }),
  });
}

export function useDownloadInvoice() {
  const path = useAccountantApiPath('/invoices');
  return useMutation({
    mutationFn: ({
      id,
      format,
      filename,
    }: {
      id: number;
      format: 'pdf' | 'xml';
      filename: string;
    }) =>
      downloadFile(`${requirePath(path)}/${id}/${format}`, `${filename}.${format}`),
  });
}

export function useSaveInvoiceToStorage() {
  const qc = useQueryClient();
  const path = useAccountantApiPath('/invoices');
  return useMutation({
    mutationFn: (id: number) =>
      api<Invoice>(`${requirePath(path)}/${id}/store`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invoices }),
  });
}

export function useSendInvoice() {
  const qc = useQueryClient();
  const path = useAccountantApiPath('/invoices');
  return useMutation({
    mutationFn: ({ id, to }: { id: number; to?: string }) =>
      api<Invoice>(`${requirePath(path)}/${id}/send`, {
        method: 'POST',
        json: to ? { to } : {},
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invoices }),
  });
}

export function useInvoice(id: number | null) {
  const path = useAccountantApiPath('/invoices');
  return useQuery({
    queryKey: [...keys.invoices, 'detail', id] as const,
    queryFn: () => api<Invoice>(`${requirePath(path)}/${id}`),
    enabled: !!path && id !== null,
  });
}

export function useCreateStorno() {
  const qc = useQueryClient();
  const path = useAccountantApiPath('/invoices');
  return useMutation({
    mutationFn: ({ id, ...dto }: CreateStornoInput & { id: number }) =>
      api<CreatedInvoice>(`${requirePath(path)}/${id}/storno`, {
        method: 'POST',
        json: dto,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invoices }),
  });
}

export function useEfacturaUploads(query: {
  companyId?: number;
  page: number;
  pageSize?: number;
}) {
  const path = useAccountantApiPath('/efactura/uploads');
  return useQuery({
    queryKey: [...keys.efactura, 'uploads', query] as const,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(query.page),
        pageSize: String(query.pageSize ?? INVOICE_PAGE_SIZE),
      });
      if (query.companyId) params.set('companyId', String(query.companyId));
      return api<EfacturaUploadPage>(`${requirePath(path)}?${params}`);
    },
    enabled: !!path,
  });
}

export function useUploadInvoiceToAnaf() {
  const qc = useQueryClient();
  const path = useAccountantApiPath('/efactura/invoices');
  return useMutation({
    mutationFn: (invoiceId: number) =>
      api<EfacturaUpload>(`${requirePath(path)}/${invoiceId}/upload`, {
        method: 'POST',
        json: {},
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.efactura }),
  });
}

export function useValidateInvoice() {
  const path = useAccountantApiPath('/efactura/invoices');
  return useMutation({
    mutationFn: (invoiceId: number) =>
      api<XmlValidation>(`${requirePath(path)}/${invoiceId}/validate`, {
        method: 'POST',
      }),
  });
}

export function useUploadXml() {
  const qc = useQueryClient();
  const path = useAccountantApiPath('/efactura/uploads');
  return useMutation({
    mutationFn: ({ file, ...fields }: UploadXmlInput) => {
      const body = new FormData();
      body.append('file', file);
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) body.append(key, String(value));
      }
      return api<EfacturaUpload>(requirePath(path), { method: 'POST', body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.efactura }),
  });
}

export function useRefreshUpload() {
  const qc = useQueryClient();
  const path = useAccountantApiPath('/efactura/uploads');
  return useMutation({
    mutationFn: (id: number) =>
      api<EfacturaUpload>(`${requirePath(path)}/${id}/refresh`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.efactura }),
  });
}

export function useDownloadUpload() {
  const path = useAccountantApiPath('/efactura/uploads');
  return useMutation({
    mutationFn: (id: number) =>
      downloadFile(`${requirePath(path)}/${id}/download`, `efactura-${id}.zip`),
  });
}

export interface MessagesQuery {
  companyId: number | undefined;
  filtru?: MessageFilter;
  zile: number;
}

export function useEfacturaMessages(query: MessagesQuery) {
  const path = useAccountantApiPath('/efactura/companies');
  return useQuery({
    queryKey: [...keys.efactura, 'messages', query] as const,
    queryFn: () => {
      const params = new URLSearchParams({ zile: String(query.zile) });
      if (query.filtru) params.set('filtru', query.filtru);
      return api<EfacturaMessageList>(
        `${requirePath(path)}/${query.companyId}/messages?${params}`,
      );
    },
    enabled: !!path && !!query.companyId,
    retry: false,
  });
}

export function useDownloadMessage() {
  const path = useAccountantApiPath('/efactura/companies');
  return useMutation({
    mutationFn: ({
      companyId,
      messageId,
    }: {
      companyId: number;
      messageId: string;
    }) =>
      downloadFile(
        `${requirePath(path)}/${companyId}/messages/${messageId}/download`,
        `efactura-${messageId}.zip`,
      ),
  });
}

export function useValidateXml() {
  const path = useAccountantApiPath('/efactura/validate');
  return useMutation({
    mutationFn: ({
      file,
      standard,
    }: {
      file: File;
      standard: 'FACT1' | 'FCN';
    }) => {
      const body = new FormData();
      body.append('file', file);
      body.append('standard', standard);
      return api<XmlValidation>(requirePath(path), { method: 'POST', body });
    },
  });
}

export function useTransformXml() {
  const path = useAccountantApiPath('/efactura/transform');
  const invoicesPath = useAccountantApiPath('/invoices');
  return useMutation({
    mutationFn: async ({
      file,
      invoiceId,
      standard,
      skipValidation,
    }: {
      file?: File;
      invoiceId?: number;
      standard: 'FACT1' | 'FCN';
      skipValidation: boolean;
    }) => {
      const source =
        file ??
        (await fetchFile(
          `${requirePath(invoicesPath)}/${invoiceId}/xml`,
          'factura.xml',
        ));
      const body = new FormData();
      body.append('file', source);
      body.append('standard', standard);
      body.append('skipValidation', String(skipValidation));
      return downloadFile(requirePath(path), 'factura.pdf', {
        method: 'POST',
        body,
      });
    },
  });
}
