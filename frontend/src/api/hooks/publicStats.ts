import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { PublicStats } from '../types';
import { keys } from './queryKeys';

export function usePublicStats() {
  return useQuery({
    queryKey: keys.publicStats,
    queryFn: () => api<PublicStats>('/public/stats'),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
}
