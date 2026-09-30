import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { Icon } from './Icon';
import { MIN_TOUCH_TARGET } from '../theme/theme';
import { hapticsService } from '../services/haptics/hapticsService';

type Variant = 'primary' | 'secondary' | 'danger' | 'dangerSoft' | 'soft' | 'success' | 'warning' | 'link';

interface AccessibleButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  /** Ícone à direita do texto (ex.: seta). */
  trailingIcon?: LucideIcon;
  accessibilityHint?: string;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}

/**
 * Botão base do app (US03): área de toque ≥ 44x44, role "button", estados
 * disabled/busy, ícone vetorial decorativo e vibração leve quando a
 * preferência de feedback inclui vibração.
 *
 * Variantes seguem os mockups: preenchido azul (primary), contorno azul
 * (secondary), tracejado azul-claro (soft - "Usar minha localização atual"),
 * vermelho claro (dangerSoft - "Cancelar"), verde (success) e âmbar (warning).
 */
export function AccessibleButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  trailingIcon,
  accessibilityHint,
  size = 'md',
  style,
}: AccessibleButtonProps) {
  const { theme, settings } = useAccessibility();
  const c = theme.colors;
  const isDisabled = disabled || loading;

  const palette: Record<Variant, { bg: string; fg: string; border: string; dashed?: boolean }> = {
    primary: { bg: c.primary, fg: c.onPrimary, border: c.primary },
    secondary: { bg: c.surface, fg: c.primary, border: c.primary },
    danger: { bg: c.error, fg: '#FFFFFF', border: c.error },
    dangerSoft: { bg: c.errorSoft, fg: c.error, border: c.errorBorder },
    soft: { bg: c.primarySoft, fg: c.primary, border: c.primary, dashed: true },
    success: { bg: c.successButton, fg: '#FFFFFF', border: 'transparent' },
    warning: { bg: c.warning, fg: '#FFFFFF', border: 'transparent' },
    link: { bg: 'transparent', fg: c.primary, border: 'transparent' },
  };
  const p = palette[variant];

  function handlePress() {
    if (settings.feedbackMode === 'vibracao' || settings.feedbackMode === 'voz_vibracao') {
      hapticsService.light();
    }
    onPress();
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' ? styles.large : null,
        variant === 'link' ? styles.link : null,
        {
          backgroundColor: p.bg,
          borderColor: p.border,
          borderWidth: p.border === 'transparent' ? 0 : 1.5,
          borderStyle: p.dashed ? 'dashed' : 'solid',
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon icon={icon} size={18} color={p.fg} /> : null}
          <AccessibleText variant="button" color={p.fg} style={styles.text}>
            {label}
          </AccessibleText>
          {trailingIcon ? <Icon icon={trailingIcon} size={18} color={p.fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: {
    minHeight: 60,
    borderRadius: 16,
  },
  link: {
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET - 12,
    flexShrink: 1,
  },
  text: {
    textAlign: 'center',
    flexShrink: 1,
  },
});
