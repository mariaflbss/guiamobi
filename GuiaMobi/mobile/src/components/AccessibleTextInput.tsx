import React, { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { Icon } from './Icon';
import { FONT_FAMILY, MIN_TOUCH_TARGET } from '../theme/theme';

interface AccessibleTextInputProps extends TextInputProps {
  label: string;
  errorMessage?: string;
  icon?: LucideIcon;
  /** Elemento à direita dentro do campo (ex.: botão mostrar/ocultar senha). */
  rightElement?: React.ReactNode;
  /** Esconde o rótulo visível (o accessibilityLabel continua existindo). */
  hideLabel?: boolean;
}

/**
 * Campo de texto padrão (US01 formulários, US05 busca). Estilo dos
 * mockups: rótulo acima, ícone à esquerda, fundo cinza-claro arredondado.
 * O rótulo é sempre lido pelo leitor de tela, o erro é texto + região
 * "live" (não só cor) e o foco tem contorno visível.
 */
export const AccessibleTextInput = forwardRef<TextInput, AccessibleTextInputProps>(function AccessibleTextInput(
  { label, errorMessage, icon, rightElement, hideLabel, style, onFocus, onBlur, ...props },
  ref
) {
  const { theme } = useAccessibility();
  const [isFocused, setIsFocused] = useState(false);
  const c = theme.colors;

  return (
    <View style={styles.container}>
      {hideLabel ? null : (
        <AccessibleText variant="caption" weight="bold" color={c.textSecondary} style={styles.label}>
          {label}
        </AccessibleText>
      )}

      <View
        style={[
          styles.inputWrapper,
          {
            borderColor: errorMessage ? c.error : isFocused ? c.focus : c.border,
            borderWidth: isFocused || errorMessage ? 2 : theme.highContrast ? 2 : 1,
            backgroundColor: c.surfaceAlt,
          },
        ]}
      >
        {icon ? <Icon icon={icon} size={18} color={c.textSecondary} style={styles.icon} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={c.textSecondary}
          style={[
            styles.input,
            { color: c.text, fontSize: 15 * theme.fontScale, fontFamily: FONT_FAMILY.semibold },
            style,
          ]}
          {...props}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
        />
        {rightElement}
      </View>

      {errorMessage ? (
        <AccessibleText variant="caption" color={c.error} accessibilityLiveRegion="polite" style={styles.error}>
          {errorMessage}
        </AccessibleText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 8,
  },
  error: {
    marginTop: 4,
  },
});
