import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, post } from './api';
import type { Me, PublicConfig } from './types';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api<{ user: Me | null }>('/auth/me')).user,
    staleTime: 30_000,
  });
}

export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: () => api<PublicConfig>('/config'), staleTime: 5 * 60_000 });
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await post('/auth/logout').catch(() => undefined);
    // Drop every cached query so nothing personal stays in memory on a shared device.
    qc.clear();
    window.location.assign('/');
  };
}

export const hasRole = (me: Me | null | undefined, ...roles: Me['roles']) => !!me && me.roles.some((r) => roles.includes(r));
