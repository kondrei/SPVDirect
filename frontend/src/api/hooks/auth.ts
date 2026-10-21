import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { recaptchaToken } from '../../lib/recaptcha';
import { api, ApiError } from '../client';
import type { Accountant } from '../types';
import { keys, removeAccountData } from './queryKeys';
import { AccountStatus } from '../enums';

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
    onSuccess: (me) => {
      removeAccountData(qc);
      qc.setQueryData(keys.me, me);
    },
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
