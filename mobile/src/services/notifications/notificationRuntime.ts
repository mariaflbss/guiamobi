import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Isolamento do que depende do ambiente de execução (US17).
 *
 * O módulo `expo-notifications` só é carregado quando realmente funciona:
 * no Expo Go para Android ele não oferece notificações do sistema e, ao ser
 * importado, escreve um erro técnico no console. Carregando-o sob demanda e
 * apenas fora do Expo Go/web, o usuário nunca vê esse tipo de mensagem. Nesses
 * ambientes o app continua avisando por dentro (faixa no app + tela de
 * notificações), só não mostra a notificação do sistema.
 */
export type NotificationsModule = typeof import('expo-notifications');

export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** true quando o ambiente é capaz de exibir notificações do sistema. */
export const supportsSystemNotifications = Platform.OS !== 'web' && !(isExpoGo && Platform.OS === 'android');

/** Tarefas em segundo plano não existem no Expo Go nem na web. */
export const supportsBackgroundTasks = Platform.OS !== 'web' && !isExpoGo;

let cached: NotificationsModule | null | undefined;

export function getNotificationsModule(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (!supportsSystemNotifications) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}
