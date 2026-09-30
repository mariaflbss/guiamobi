import { useAccessibility } from '../contexts/AccessibilityContext';

/**
 * Hook de conveniência para as telas de Configurações (US08) e para
 * qualquer tela que precise ler o tema/preferências (US03).
 */
export function useSettings() {
  return useAccessibility();
}
