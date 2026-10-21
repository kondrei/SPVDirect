import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, downloadFile } from '../client';
import type { Accountant, AccountantProfile, CaenInfo, FirmLookup, ProfileUpdate } from '../types';
import { keys } from './queryKeys';
import { useAccountantApiPath, requirePath } from './accountantPath';

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

export function useExportAccount() {
  const path = useAccountantApiPath('/export');
  return useMutation({
    mutationFn: () => downloadFile(requirePath(path), 'cont-spvdirect-export.zip'),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  const path = useAccountantApiPath('');
  return useMutation({
    mutationFn: (password: string) =>
      api<void>(requirePath(path), { method: 'DELETE', json: { password } }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(keys.me, null);
    },
  });
}

export function useChangePassword() {
  const path = useAccountantApiPath('/password');
  return useMutation({
    mutationFn: (dto: { currentPassword: string; newPassword: string }) =>
      api<void>(requirePath(path), { method: 'POST', json: dto }),
  });
}
