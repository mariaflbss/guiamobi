import * as SecureStore from 'expo-secure-store';

/**
 * Wrapper sobre o expo-secure-store, usado para dados sensíveis (sessão do
 * usuário - US01) e para as preferências de acessibilidade (US08), que
 * devem persistir entre sessões do app.
 *
 * Nunca logar o conteúdo salvo aqui (pode conter token de acesso).
 */
export const secureStorageService = {
  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },

  async getItem(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },

  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },

  async setObject<T>(key: string, value: T): Promise<void> {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  },

  async getObject<T>(key: string): Promise<T | null> {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
};
