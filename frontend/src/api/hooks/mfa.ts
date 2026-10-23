import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import type {
  MfaEmailCodeSent,
  MfaEnabled,
  MfaFactor,
  MfaRecoveryCode,
  MfaSetup,
  MfaStatus,
} from '../types';
import { keys } from './queryKeys';
import { requirePath, useAccountantApiPath } from './accountantPath';

function useMfaChanged() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.mfa });
}

export function useMfaStatus() {
  const path = useAccountantApiPath('/mfa');
  return useQuery({
    queryKey: keys.mfa,
    queryFn: () => api<MfaStatus>(requirePath(path)),
    enabled: !!path,
  });
}

export function useStartAppSetup() {
  const path = useAccountantApiPath('/mfa/app/setup');
  return useMutation({
    mutationFn: (password: string) =>
      api<MfaSetup>(requirePath(path), { method: 'POST', json: { password } }),
  });
}

export function useConfirmAppSetup() {
  const path = useAccountantApiPath('/mfa/app/setup/confirm');
  const changed = useMfaChanged();
  return useMutation({
    mutationFn: (code: string) =>
      api<MfaEnabled>(requirePath(path), { method: 'POST', json: { code } }),
    onSuccess: changed,
  });
}

export function useStartEmailSetup() {
  const path = useAccountantApiPath('/mfa/email/setup');
  return useMutation({
    mutationFn: (password: string) =>
      api<MfaEmailCodeSent>(requirePath(path), { method: 'POST', json: { password } }),
  });
}

export function useConfirmEmailSetup() {
  const path = useAccountantApiPath('/mfa/email/setup/confirm');
  const changed = useMfaChanged();
  return useMutation({
    mutationFn: (code: string) =>
      api<MfaEnabled>(requirePath(path), { method: 'POST', json: { code } }),
    onSuccess: changed,
  });
}

export function useRegenerateRecoveryCode() {
  const path = useAccountantApiPath('/mfa/recovery-code');
  const changed = useMfaChanged();
  return useMutation({
    mutationFn: (password: string) =>
      api<MfaRecoveryCode>(requirePath(path), { method: 'POST', json: { password } }),
    onSuccess: changed,
  });
}

export function useDisableMfa(method: MfaFactor) {
  const path = useAccountantApiPath(`/mfa/${method}`);
  const changed = useMfaChanged();
  return useMutation({
    mutationFn: (password: string) =>
      api<void>(requirePath(path), { method: 'DELETE', json: { password } }),
    onSuccess: changed,
  });
}
