import * as Speech from 'expo-speech';
import { SpeechRate, SupportedLanguage } from '../../types/settings';

/**
 * Serviço de texto-em-voz (Text-to-Speech), usado tanto para feedback de
 * acessibilidade (US03) quanto para as configurações de voz (US08).
 */

// Mapeia a preferência do usuário para o parâmetro "rate" do expo-speech
// (1.0 = velocidade normal do dispositivo)
const SPEECH_RATE_MAP: Record<SpeechRate, number> = {
  lenta: 0.75,
  normal: 1.0,
  rapida: 1.3,
};

// Mapeia o idioma do app para um código de localidade aceito pelo TTS nativo
const LANGUAGE_LOCALE_MAP: Record<SupportedLanguage, string> = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
};

export const speechService = {
  speak(text: string, options: { rate: SpeechRate; language: SupportedLanguage }): void {
    // Interrompe qualquer fala anterior antes de iniciar uma nova, evitando
    // sobreposição de áudios (importante para acessibilidade).
    Speech.stop();
    Speech.speak(text, {
      rate: SPEECH_RATE_MAP[options.rate],
      language: LANGUAGE_LOCALE_MAP[options.language],
    });
  },

  stop(): void {
    Speech.stop();
  },

  async isSpeaking(): Promise<boolean> {
    return Speech.isSpeakingAsync();
  },
};
