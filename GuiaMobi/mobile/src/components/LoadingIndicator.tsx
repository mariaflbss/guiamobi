import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';

/**
 * Indicador de carregamento padrão. Usa o ActivityIndicator nativo (sem
 * animações customizadas rápidas ou piscantes), respeitando a diretriz de
 * evitar flashing (US03 / WCAG 2.3.1).
 */
export function LoadingIndicator({ label }: { label?: string }) {
  const { theme } = useAccessibility();

  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={label ?? 'Carregando'}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      {label ? (
        <AccessibleText variant="body" color={theme.colors.textSecondary} style={styles.label}>
          {label}
        </AccessibleText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 12,
  },
});
