import { FeedbackMode, SpeechRate, SupportedLanguage } from '../../types/settings';
import { hapticsService } from '../haptics/hapticsService';
import { speechService } from '../speech/speechService';

export const feedbackModeUsesVoice = (mode: FeedbackMode) => mode === 'voz' || mode === 'voz_vibracao';
export const feedbackModeUsesHaptics = (mode: FeedbackMode) => mode === 'vibracao' || mode === 'voz_vibracao';

/** Intervalo entre a vibração e a fala no teste combinado (evita sobreposição). */
const VOICE_AFTER_HAPTIC_MS = 400;

/**
 * "Testar feedback" (US08): executa exatamente o que a preferência atual
 * do usuário faz, sem misturar com os alertas de navegação futuros.
 *
 * - voz: fala uma frase de teste;
 * - vibracao: uma vibração curta;
 * - voz_vibracao: vibração curta e, logo depois, a fala (estímulos em
 *   sequência, não simultâneos, para não sobrecarregar);
 * - nenhum: não faz nada (o botão da tela também fica desabilitado).
 */
export const feedbackService = {
  async test(
    mode: FeedbackMode,
    options: { message: string; rate: SpeechRate; language: SupportedLanguage }
  ): Promise<void> {
    if (mode === 'nenhum') return;

    if (mode === 'vibracao') {
      await hapticsService.test();
      return;
    }

    if (mode === 'voz') {
      speechService.speak(options.message, { rate: options.rate, language: options.language });
      return;
    }

    await hapticsService.test();
    setTimeout(() => {
      speechService.speak(options.message, { rate: options.rate, language: options.language });
    }, VOICE_AFTER_HAPTIC_MS);
  },
};
