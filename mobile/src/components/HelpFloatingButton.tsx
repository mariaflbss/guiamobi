import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CircleHelp } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AppStackParamList } from '../navigation/types';
import { MIN_TOUCH_TARGET } from '../theme/theme';
import { Icon } from './Icon';
import type { NavigationProp } from '@react-navigation/native';

const HIDDEN_ROUTES = new Set(['Settings', 'Help', 'Login', 'Register', 'ForgotPassword', 'ResetPassword', 'Splash']);

/**
 * Acesso global à Ajuda para as telas do aplicativo, exceto Configurações e
 * a própria Ajuda, onde já existe um acesso direto. Ao tocar, abre a tela
 * completa de Ajuda/FAQ.
 */
export function HelpFloatingButton({ hasFooter = false }: { hasFooter?: boolean }) {
  const navigation = useNavigation<NavigationProp<AppStackParamList>>();
  const route = useRoute();
  const { t } = useTranslation();
  const { theme } = useAccessibility();
  const insets = useSafeAreaInsets();

  if (HIDDEN_ROUTES.has(route.name)) return null;

  return (
    <Pressable
      onPress={() => navigation.navigate('Help')}
      accessibilityRole="button"
      accessibilityLabel={t('help.floatingLabel')}
      accessibilityHint={t('help.floatingHint')}
      style={[
        styles.button,
        {
          backgroundColor: theme.colors.primary,
          borderColor: theme.colors.surface,
          bottom: Math.max(insets.bottom, 8) + (hasFooter ? 76 : 16),
        },
      ]}
    >
      <Icon icon={CircleHelp} size={28} color={theme.colors.onPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 16,
    width: MIN_TOUCH_TARGET + 8,
    height: MIN_TOUCH_TARGET + 8,
    borderRadius: (MIN_TOUCH_TARGET + 8) / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
});
