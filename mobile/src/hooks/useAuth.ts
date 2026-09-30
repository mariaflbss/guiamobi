import { useAuthContext } from '../contexts/AuthContext';

/**
 * Ponto único de acesso à autenticação a partir das telas.
 * Mantido como um hook fino sobre o contexto para permitir evoluir a
 * implementação (ex.: cache adicional) sem alterar as telas.
 */
export function useAuth() {
  return useAuthContext();
}
