import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { secureStorageService } from '../services/storage/secureStorageService';
import { SETTINGS_STORAGE_KEY, LANGUAGE_STORAGE_KEY } from '../constants/config';
import { AccessibilitySettings, FeedbackMode, SupportedLanguage } from '../types/settings';
import { buildTheme, Theme } from '../theme/theme';
import i18n from '../locales/i18n';
import { speechService } from '../services/speech/speechService';
import { hapticsService } from '../services/haptics/hapticsService';
import {
  feedbackModeUsesHaptics,
  feedbackModeUsesVoice,
  feedbackService,
} from '../services/feedback/feedbackService';

const DEFAULT_SETTINGS: AccessibilitySettings = {
  fontSize: 'medio',
  highContrast: false,
  darkMode: false,
  feedbackMode: 'voz_vibracao',
  speechRate: 'normal',
  simpleMode: false,
};

type HapticKind = 'light' | 'success' | 'warning' | 'error';

interface AccessibilityContextValue {
  settings: AccessibilitySettings;
  theme: Theme;
  language: SupportedLanguage;
  isLoading: boolean;
  /** Feedback por voz/vibração está ligado nas preferências? */
  voiceEnabled: boolean;
  hapticsEnabled: boolean;
  updateSettings: (partial: Partial<AccessibilitySettings>) => Promise<void>;
  setLanguage: (language: SupportedLanguage) => Promise<void>;
  setVoiceEnabled: (enabled: boolean) => Promise<void>;
  setHapticsEnabled: (enabled: boolean) => Promise<void>;
  /** Reproduz feedback (voz e/ou vibração) respeitando a preferência atual do usuário. */
  announce: (message: string, options?: { haptic?: HapticKind }) => void;
  /** Fala o texto SEMPRE (ação explícita do usuário, ex.: "Ouvir explicação"), na velocidade escolhida. */
  speak: (message: string) => void;
  /** "Testar feedback": executa a preferência atual (voz, vibração, ambos ou nada). */
  testFeedback: (message: string) => Promise<void>;
}

const AccessibilityContext = createContext<AccessibilityContextValue | undefined>(undefined);

/**
 * Provider central de acessibilidade e configurações (US03 e US08):
 * idioma, tema (fonte/contraste/modo escuro), Modo Simples e preferências
 * de feedback (voz/vibração), persistidos localmente no dispositivo.
 */
export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(DEFAULT_SETTINGS);
  const [language, setLanguageState] = useState<SupportedLanguage>('pt');
  const [isLoading, setIsLoading] = useState(true);
  // Mantém sempre o valor mais recente, evitando que duas alterações seguidas
  // (ex.: dois switches) sobrescrevam uma à outra.
  const settingsRef = useRef<AccessibilitySettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    loadPersistedPreferences();
  }, []);

  async function loadPersistedPreferences() {
    try {
      const savedSettings = await secureStorageService.getObject<Partial<AccessibilitySettings>>(SETTINGS_STORAGE_KEY);
      const savedLanguage = await secureStorageService.getItem(LANGUAGE_STORAGE_KEY);

      if (savedSettings) {
        const merged = { ...DEFAULT_SETTINGS, ...savedSettings };
        settingsRef.current = merged;
        setSettings(merged);
      }

      const initialLanguage = (savedLanguage as SupportedLanguage) ?? 'pt';
      setLanguageState(initialLanguage);
      await i18n.changeLanguage(initialLanguage);
    } finally {
      setIsLoading(false);
    }
  }

  const updateSettings = useCallback(async (partial: Partial<AccessibilitySettings>) => {
    const next = { ...settingsRef.current, ...partial };
    settingsRef.current = next;
    setSettings(next);
    await secureStorageService.setObject(SETTINGS_STORAGE_KEY, next);
  }, []);

  const setLanguage = useCallback(async (newLanguage: SupportedLanguage) => {
    setLanguageState(newLanguage);
    await secureStorageService.setItem(LANGUAGE_STORAGE_KEY, newLanguage);
    await i18n.changeLanguage(newLanguage);
  }, []);

  const voiceEnabled = feedbackModeUsesVoice(settings.feedbackMode);
  const hapticsEnabled = feedbackModeUsesHaptics(settings.feedbackMode);

  const setFeedbackFlags = useCallback(
    async (voice: boolean, haptics: boolean) => {
      const mode: FeedbackMode = voice && haptics ? 'voz_vibracao' : voice ? 'voz' : haptics ? 'vibracao' : 'nenhum';
      await updateSettings({ feedbackMode: mode });
    },
    [updateSettings]
  );

  const setVoiceEnabled = useCallback(
    (enabled: boolean) => setFeedbackFlags(enabled, feedbackModeUsesHaptics(settingsRef.current.feedbackMode)),
    [setFeedbackFlags]
  );

  const setHapticsEnabled = useCallback(
    (enabled: boolean) => setFeedbackFlags(feedbackModeUsesVoice(settingsRef.current.feedbackMode), enabled),
    [setFeedbackFlags]
  );

  const announce = useCallback(
    (message: string, options?: { haptic?: HapticKind }) => {
      const current = settingsRef.current;
      if (feedbackModeUsesVoice(current.feedbackMode)) {
        speechService.speak(message, { rate: current.speechRate, language });
      }
      if (feedbackModeUsesHaptics(current.feedbackMode) && options?.haptic) {
        hapticsService[options.haptic]();
      }
    },
    [language]
  );

  const speak = useCallback(
    (message: string) => {
      const current = settingsRef.current;
      if (!feedbackModeUsesVoice(current.feedbackMode)) {
        speechService.stop();
        return;
      }
      speechService.speak(message, { rate: current.speechRate, language });
    },
    [language]
  );

  const testFeedback = useCallback(
    (message: string) =>
      feedbackService.test(settingsRef.current.feedbackMode, {
        message,
        rate: settingsRef.current.speechRate,
        language,
      }),
    [language]
  );

  const theme = useMemo(
    () => buildTheme(settings.darkMode, settings.highContrast, settings.fontSize),
    [settings.darkMode, settings.highContrast, settings.fontSize]
  );

  const value = useMemo(
    () => ({
      settings,
      theme,
      language,
      isLoading,
      voiceEnabled,
      hapticsEnabled,
      updateSettings,
      setLanguage,
      setVoiceEnabled,
      setHapticsEnabled,
      announce,
      speak,
      testFeedback,
    }),
    [
      settings,
      theme,
      language,
      isLoading,
      voiceEnabled,
      hapticsEnabled,
      updateSettings,
      setLanguage,
      setVoiceEnabled,
      setHapticsEnabled,
      announce,
      speak,
      testFeedback,
    ]
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility(): AccessibilityContextValue {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility deve ser usado dentro de um AccessibilityProvider');
  }
  return context;
}
