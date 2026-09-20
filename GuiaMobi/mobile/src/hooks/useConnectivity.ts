import { useEffect, useState } from 'react';
import { connectivityService } from '../services/connectivity/connectivityService';

/**
 * Hook que expõe o status de conectividade em tempo real.
 * Usado para bloquear buscas externas e exibir mensagens claras de offline
 * (US05 - "Verificação de internet antes de consultas externas").
 */
export function useConnectivity() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    connectivityService.isConnected().then(setIsConnected);
    const unsubscribe = connectivityService.subscribe(setIsConnected);
    return unsubscribe;
  }, []);

  return { isConnected };
}
