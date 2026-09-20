import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Mic } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { Icon } from './Icon';
import { MIN_TOUCH_TARGET } from '../theme/theme';

interface MicrophoneButtonProps {
  /** Foca o campo de texto associado (abre o teclado, que traz o ícone de ditado). */
  onPress: () => void;
}

/**
 * Botão de microfone da busca de endereço.
 *
 * O projeto usa `expo-speech`, que é só texto-em-voz (TTS). Para ditar, o
 * botão foca o campo e orienta (voz + vibração, conforme a preferência) a
 * tocar no microfone do teclado do sistema, que faz o ditado de verdade.
 * Não há reconhecimento de fala simulado.
 */
export function MicrophoneButton({ onPress }: MicrophoneButtonProps) {
  const { t } = useTranslation();
  const { theme, announce } = useAccessibility();

  function handlePress() {
    onPress();
    announce(t('microphone.instruction'), { haptic: 'light' });
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={t('microphone.label')}
      accessibilityHint={t('microphone.hint')}
      style={[styles.button, { backgroundColor: theme.colors.primarySoft }]}
    >
      <Icon icon={Mic} size={20} color={theme.colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: MIN_TOUCH_TARGET + 4,
    height: MIN_TOUCH_TARGET + 4,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
