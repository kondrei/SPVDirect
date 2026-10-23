import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { recaptchaToken } from '../../lib/recaptcha';
import { api, ApiError } from '../client';
import type { Accountant, LoginResult, MfaEmailCodeSent, MfaRequired } from '../types';
import { keys, removeAccountData } from './queryKeys';
import { AccountStatus, type MfaMethod } from '../enums';

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

export function isMfaRequired(result: LoginResult): result is MfaRequired {
  return 'mfaRequired' in result;
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { email: string; password: string }) =>
      api<LoginResult>('/auth/login', { method: 'POST', json: dto }),
    onSuccess: (result) => {
      if (isMfaRequired(result)) return;
      removeAccountData(qc);
      qc.setQueryData(keys.me, result);
    },
  });
}

export function useLoginMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { code: string; method: MfaMethod; rememberDevice: boolean }) =>
      api<Accountant>('/auth/login/mfa', { method: 'POST', json: dto }),
    onSuccess: (me) => {
      removeAccountData(qc);
      qc.setQueryData(keys.me, me);
    },
  });
}

export function useSendLoginEmailCode() {
  return useMutation({
    mutationFn: () => api<MfaEmailCodeSent>('/auth/login/mfa/email', { method: 'POST' }),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: async (dto: {
      email: string;
      password: string;
      name?: string;
    }) =>
      api<{ status: AccountStatus.Pending }>('/auth/register', {
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
