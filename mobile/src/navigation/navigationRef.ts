import { createNavigationContainerRef } from '@react-navigation/native';
import { AppStackParamList } from './types';

/**
 * Referência ao NavigationContainer, usada para abrir a tela de Notificações
 * a partir de fora de uma tela (ex.: toque numa notificação do sistema).
 */
export const navigationRef = createNavigationContainerRef<AppStackParamList>();

/**
 * Abre a tela de Notificações. Espera o navegador ficar pronto (app recém
 * aberto pela notificação) e ignora o pedido se o usuário não estiver
 * autenticado, para nunca gerar erro de navegação.
 */
export function openNotificationsScreen(attempt = 0): void {
  if (navigationRef.isReady()) {
    const routeNames = navigationRef.getRootState()?.routeNames ?? [];
    if (routeNames.includes('Notifications')) navigationRef.navigate('Notifications');
    return;
  }
  if (attempt < 20) setTimeout(() => openNotificationsScreen(attempt + 1), 500);
}
