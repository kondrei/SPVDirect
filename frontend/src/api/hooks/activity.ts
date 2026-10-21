import { useQuery } from '@tanstack/react-query';
import { ACTIVITY_PAGE_SIZE } from '../../common/constants';
import { api } from '../client';
import type { ActivityPage, ActivityQuery } from '../types';
import { keys } from './queryKeys';
import { useAccountantApiPath, requirePath } from './accountantPath';

export function useActivity(query: ActivityQuery) {
  const path = useAccountantApiPath('/activity');
  return useQuery({
    queryKey: [...keys.activity, query] as const,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(query.page),
        pageSize: String(ACTIVITY_PAGE_SIZE),
      });
      if (query.companyId) params.set('companyId', String(query.companyId));
      return api<ActivityPage>(`${requirePath(path)}?${params}`);
    },
    enabled: !!path,
    placeholderData: (previous) => previous,
  });
}
