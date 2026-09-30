import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

/**
 * Serviço de verificação de conectividade.
 * Usado antes de qualquer consulta externa (geocodificação, login, etc.)
 * para exibir mensagens claras de offline em vez de erros genéricos (US05).
 */
export const connectivityService = {
  async isConnected(): Promise<boolean> {
    const state = await NetInfo.fetch();
    return isUsable(state);
  },

  /**
   * Assina mudanças de conectividade. Retorna a função de "unsubscribe".
   */
  subscribe(callback: (isConnected: boolean) => void): () => void {
    const unsubscribe = NetInfo.addEventListener((state) => {
      callback(isUsable(state));
    });
    return unsubscribe;
  },
};

function isUsable(state: NetInfoState): boolean {
  // isInternetReachable pode ser null em alguns dispositivos/plataformas;
  // nesse caso, confiamos apenas em isConnected.
  if (state.isInternetReachable === null) {
    return Boolean(state.isConnected);
  }
  return Boolean(state.isConnected && state.isInternetReachable);
}
