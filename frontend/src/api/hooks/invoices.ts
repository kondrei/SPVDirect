import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { INVOICE_PAGE_SIZE } from '../../common/constants';
import { isValidCui } from '../../lib/format';
import { api, downloadFile, fetchFile } from '../client';
import type {
  CreateInvoiceInput,
  CreateStornoInput,
  CreatedInvoice,
  BuyerLookup,
  FoundBuyer,
  Invoice,
  InvoicePage,
  InvoiceStats,
  LineSuggestion,
} from '../types';
import { keys } from './queryKeys';
import { useAccountantApiPath, requirePath } from './accountantPath';

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

export function useFindBuyer() {
  const path = useAccountantApiPath('/invoices/buyers');
  return useMutation({
    mutationFn: (cui: string) =>
      api<FoundBuyer>(`${requirePath(path)}/${encodeURIComponent(cui)}`),
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

export function useInvoiceLineSuggestions(companyId: number, buyerCui: string) {
  const path = useAccountantApiPath('/invoices/line-suggestions');
  const valid = companyId > 0 && isValidCui(buyerCui);
  return useQuery({
    queryKey: [...keys.invoices, 'line-suggestions', companyId, buyerCui] as const,
    queryFn: () =>
      api<LineSuggestion[]>(
        `${requirePath(path)}?${new URLSearchParams({ companyId: String(companyId), buyerCui })}`,
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

export function useInvoicePdf(id: number) {
  const path = useAccountantApiPath('/invoices');
  return useQuery({
    queryKey: [...keys.invoices, id, 'pdf'] as const,
    queryFn: () => fetchFile(`${requirePath(path)}/${id}/pdf`, `factura-${id}.pdf`),
    enabled: !!path,
    staleTime: Infinity,
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
