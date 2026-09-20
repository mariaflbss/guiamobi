import React, { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps } from 'react-native';
import { Eye, EyeOff, Lock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AccessibleTextInput } from './AccessibleTextInput';
import { Icon } from './Icon';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { MIN_TOUCH_TARGET } from '../theme/theme';

interface PasswordInputProps extends Omit<TextInputProps, 'secureTextEntry'> {
  label: string;
  errorMessage?: string;
}

/**
 * Campo de senha com botão mostrar/ocultar (ícone + accessibilityLabel que
 * muda conforme o estado; role "button" com estado "checked" para leitores
 * de tela). Usado em Login, Cadastro, Redefinir senha e Editar perfil.
 */
export const PasswordInput = forwardRef<TextInput, PasswordInputProps>(function PasswordInput(props, ref) {
  const { t } = useTranslation();
  const { theme } = useAccessibility();
  const [visible, setVisible] = useState(false);

  return (
    <AccessibleTextInput
      ref={ref}
      {...props}
      icon={Lock}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      rightElement={
        <Pressable
          onPress={() => setVisible((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          accessibilityState={{ checked: visible }}
          hitSlop={4}
          style={styles.toggle}
        >
          <Icon icon={visible ? EyeOff : Eye} size={20} color={theme.colors.textSecondary} />
        </Pressable>
      }
    />
  );
});

const styles = StyleSheet.create({
  toggle: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -8,
  },
});
