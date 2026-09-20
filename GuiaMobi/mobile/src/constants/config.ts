/**
 * Configurações globais do aplicativo.
 */

// EXPO_PUBLIC_API_URL é lida em tempo de build pelo Expo (variáveis com
// prefixo EXPO_PUBLIC_ ficam disponíveis no bundle do app).
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333';

// Regras de negócio (US07)
export const MAX_HISTORY_ITEMS = 10;

// Chaves usadas no SecureStore (US01 - armazenamento seguro da sessão)
export const SECURE_STORE_KEYS = {
  ACCESS_TOKEN: 'guiamobi.accessToken',
  USER: 'guiamobi.user',
} as const;

/** Marca, por usuário, que o tutorial do primeiro acesso ainda não foi concluído. */
export const tutorialPendingKey = (userId: string) => `guiamobi.tutorialPending.${userId}`;

// Preferências de acessibilidade (US08) e idioma. SecureStore é usado por
// simplicidade (já faz parte do conjunto de bibliotecas); não há dado sensível.
export const SETTINGS_STORAGE_KEY = 'guiamobi.settings';
export const LANGUAGE_STORAGE_KEY = 'guiamobi.language';

// Canais de contato exibidos na tela Ajuda. Configure em mobile/.env; enquanto
// estiverem vazios, a tela informa que o contato ainda não foi configurado
// (não inventamos e-mail nem telefone).
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '';
export const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE ?? '';
