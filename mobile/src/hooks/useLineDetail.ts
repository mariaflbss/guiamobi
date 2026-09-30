import { useCallback, useEffect, useState } from 'react';
import { routesService } from '../services/api/routesService';
import { LineDetail } from '../types/routes';

/** Carrega o detalhe (paradas em ordem) de uma linha na API. */
export function useLineDetail(lineId: string) {
  const [line, setLine] = useState<LineDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setLine(await routesService.getLineDetail(lineId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'error');
    } finally {
      setIsLoading(false);
    }
  }, [lineId]);

  useEffect(() => {
    load();
  }, [load]);

  return { line, isLoading, errorMessage, reload: load };
}
