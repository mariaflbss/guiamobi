import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

  const historyQuery = useQuery({
    queryKey: HISTORY_QUERY_KEY,
    queryFn: () => historyRepository.findRecent(MAX_HISTORY_ITEMS),
  });

  const lastRouteQuery = useQuery({
    queryKey: LAST_ROUTE_QUERY_KEY,
    queryFn: () => historyRepository.findLast(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: LAST_ROUTE_QUERY_KEY });
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
