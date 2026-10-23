import type { QueryClient } from '@tanstack/react-query';

export const keys = {
  me: ['me'] as const,
  profile: ['profile'] as const,
  mfa: ['mfa'] as const,
  caen: (code: string) => ['caen', code] as const,
  companies: ['companies'] as const,
  company: (id: number) => ['companies', id] as const,
  connections: ['connections'] as const,
  invoices: ['invoices'] as const,
  efactura: ['efactura'] as const,
  efacturaArchive: ['efactura-archive'] as const,
  publicStats: ['public-stats'] as const,
  spvArchive: ['spv-archive'] as const,
  activity: ['activity'] as const,
};

export function removeAccountData(qc: QueryClient): void {
  qc.removeQueries({
    predicate: (query) =>
      query.queryKey[0] !== keys.me[0] &&
      query.queryKey[0] !== keys.publicStats[0],
  });
}
