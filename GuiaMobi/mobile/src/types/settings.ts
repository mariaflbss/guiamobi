// Tipos relacionados às configurações de acessibilidade e feedback (US03/US08)

export type FontSize = 'pequeno' | 'medio' | 'grande';
export type SpeechRate = 'lenta' | 'normal' | 'rapida';
export type FeedbackMode = 'voz' | 'vibracao' | 'voz_vibracao' | 'nenhum';
export type SupportedLanguage = 'pt' | 'en' | 'es';

export interface AccessibilitySettings {
  fontSize: FontSize;
  highContrast: boolean;
  darkMode: boolean;
  feedbackMode: FeedbackMode;
  speechRate: SpeechRate;
  simpleMode: boolean; // Modo Simples: interface reduzida (mockup "Interface simplificada")
}
