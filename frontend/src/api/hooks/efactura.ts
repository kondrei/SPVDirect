import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { INVOICE_PAGE_SIZE } from '../../common/constants';
import { api, downloadFile, fetchFile } from '../client';
import type { EfacturaMessageList, EfacturaUpload, EfacturaUploadPage, MessagesQuery, UploadXmlInput, XmlValidation } from '../types';
import { keys } from './queryKeys';
import { useAccountantApiPath, requirePath } from './accountantPath';

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

export function useInvoiceUploads(invoiceIds: number[]) {
  const path = useAccountantApiPath('/efactura/invoices/latest-uploads');
  const ids = [...invoiceIds].sort((a, b) => a - b);
  return useQuery({
    queryKey: [...keys.efactura, 'latest-uploads', ids] as const,
    queryFn: () =>
      api<EfacturaUpload[]>(
        `${requirePath(path)}?${new URLSearchParams({ ids: ids.join(',') })}`,
      ),
    enabled: !!path && ids.length > 0,
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
      for (const [key, value] of Object.entries(fields) as [string, unknown][]) {
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
    refetchOnWindowFocus: false,
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
        `${requirePath(path)}/${companyId}/messages/${encodeURIComponent(messageId)}/download`,
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
