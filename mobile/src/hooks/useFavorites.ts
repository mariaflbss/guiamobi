import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '../contexts/AuthContext';
import { favoritesRepository } from '../database/repositories/favoritesRepository';
import { CreateFavoriteInput, FavoriteLine } from '../types/favorites';

const FAVORITES_QUERY_KEY = ['favorites'];
const FAVORITE_LINES_QUERY_KEY = ['favorite-lines'];

/**
 * Hook de favoritos (US07): locais e linhas favoritas. React Query faz o
 * cache sobre o SQLite local e mantém as telas sincronizadas após criar ou
 * remover um item.
 */
export function useFavorites() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const queryKey = [...FAVORITES_QUERY_KEY, user?.id ?? 'anonymous'];
  const linesQueryKey = [...FAVORITE_LINES_QUERY_KEY, user?.id ?? 'anonymous'];

  const query = useQuery({
    queryKey,
    queryFn: favoritesRepository.findAll,
    enabled: Boolean(user?.id),
  });

  const linesQuery = useQuery({
    queryKey: linesQueryKey,
    queryFn: favoritesRepository.findAllLines,
    enabled: Boolean(user?.id),
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateFavoriteInput) => favoritesRepository.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => favoritesRepository.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const addLineMutation = useMutation({
    mutationFn: (line: FavoriteLine) => favoritesRepository.addLine(line),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: linesQueryKey }),
  });

  const removeLineMutation = useMutation({
    mutationFn: (lineId: string) => favoritesRepository.removeLine(lineId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: linesQueryKey }),
  });

  return {
    favorites: query.data ?? [],
    favoriteLines: linesQuery.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    createFavorite: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    removeFavorite: removeMutation.mutateAsync,
    addFavoriteLine: addLineMutation.mutateAsync,
    removeFavoriteLine: removeLineMutation.mutateAsync,
  };
}
