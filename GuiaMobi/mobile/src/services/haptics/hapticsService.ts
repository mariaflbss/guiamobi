import * as Haptics from 'expo-haptics';

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
