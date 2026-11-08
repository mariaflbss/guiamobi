import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

let handlerConfigured = false;

export function configurePushNotifications() {
  if (handlerConfigured) return;
  handlerConfigured = true;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (error) {
    console.warn('[Notifications] Não foi possível configurar o handler:', error);
  }
}

export async function getNotificationPermissionStatus() {
  configurePushNotifications();
  try {
    return await Notifications.getPermissionsAsync();
  } catch (error) {
    console.warn('[Notifications] Não foi possível consultar a permissão:', error);
    return { granted: false } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>;
  }
}

export async function requestPushPermission(): Promise<boolean> {
  configurePushNotifications();
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      return true;
    }

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted ||
      requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch (error) {
    console.warn('[Notifications] Não foi possível solicitar permissão:', error);
    return false;
  }
}

export async function getExpoPushToken(): Promise<string | null> {
  try {
    configurePushNotifications();
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted &&
      permissions.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) {
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch (error) {
    // Expo Go/Android pode não fornecer token remoto. A tela continua utilizável
    // e informa ao usuário que o registro remoto depende de um build nativo.
    console.warn('[Notifications] Token push remoto indisponível neste ambiente:', error);
    return null;
  }
}
