import { useCallback, useEffect, useState } from 'react';
import { routesService } from '../services/api/routesService';
import { LineDetail } from '../types/routes';

/** Carrega o detalhe (paradas em ordem) de uma linha na API. */
export function useLineDetail(lineId: string, prefetchedLine?: LineDetail | null) {
  const [line, setLine] = useState<LineDetail | null>(prefetchedLine ?? null);
  const [isLoading, setIsLoading] = useState(!prefetchedLine);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (prefetchedLine) {
      setLine(prefetchedLine);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setLine(await routesService.getLineDetail(lineId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'error');
    } finally {
      setIsLoading(false);
    }
  }, [lineId, prefetchedLine]);

  useEffect(() => {
    load();
  }, [load]);

  return { line, isLoading, errorMessage, reload: load };
}
