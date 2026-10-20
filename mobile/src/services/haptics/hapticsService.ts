import * as Haptics from 'expo-haptics';
import { Vibration } from 'react-native';

/**
 * Serviço de feedback tátil (vibração), usado em conjunto com o
 * FeedbackMode definido nas configurações (US08).
 */
export const hapticsService = {
  light(): void {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  success(): void {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },

  warning(): void {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },

  /** Padrão curto para eventos simples de proximidade. */
  short(): void {
    Vibration.vibrate(100);
  },

  /** Padrão distinto: pulso curto, pausa e pulso longo. */
  highMovement(): void {
    Vibration.vibrate([0, 100, 180, 500]);
  },

  error(): void {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },

  /**
   * Vibração curta usada por "Testar feedback". Usa a notificação "success"
   * (no Android é um pulso curto e claramente perceptível; um "impact" leve
   * costuma ser fraco demais para o usuário confirmar que funcionou).
   */
  async test(): Promise<void> {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
};
