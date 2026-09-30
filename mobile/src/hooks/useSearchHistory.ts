import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '../contexts/AuthContext';
import { historyRepository } from '../database/repositories/historyRepository';
import { CreateHistoryInput } from '../types/favorites';
import { MAX_HISTORY_ITEMS } from '../constants/config';

const HISTORY_QUERY_KEY = ['search-history'];
const LAST_ROUTE_QUERY_KEY = ['last-route'];

/**
 * Hook do histórico de pesquisas (US07): mantém as últimas
 * MAX_HISTORY_ITEMS buscas e expõe a última rota para sugerir ao reabrir o app.
 */
export function useSearchHistory() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const historyQueryKey = [...HISTORY_QUERY_KEY, user?.id ?? 'anonymous'];
  const lastRouteQueryKey = [...LAST_ROUTE_QUERY_KEY, user?.id ?? 'anonymous'];

  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: () => historyRepository.findRecent(MAX_HISTORY_ITEMS),
    enabled: Boolean(user?.id),
  });

  const lastRouteQuery = useQuery({
    queryKey: lastRouteQueryKey,
    queryFn: () => historyRepository.findLast(),
    enabled: Boolean(user?.id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: historyQueryKey });
    queryClient.invalidateQueries({ queryKey: lastRouteQueryKey });
  };

  const addMutation = useMutation({
    mutationFn: (input: CreateHistoryInput) => historyRepository.create(input),
    onSuccess: invalidate,
  });

  const chosenLineMutation = useMutation({
    mutationFn: (input: { id: string; lineCode: string; durationMinutes: number }) =>
      historyRepository.setChosenLine(input.id, input.lineCode, input.durationMinutes),
    onSuccess: invalidate,
  });

  return {
    history: historyQuery.data ?? [],
    isLoading: historyQuery.isLoading,
    lastRoute: lastRouteQuery.data ?? null,
    addSearch: addMutation.mutateAsync,
    setChosenLine: chosenLineMutation.mutateAsync,
  };
}
