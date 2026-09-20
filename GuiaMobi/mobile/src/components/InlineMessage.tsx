import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react-native';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { Icon } from './Icon';

type Tone = 'error' | 'warning' | 'info';

/**
 * Mensagem de feedback (erro, aviso ou informação). Sempre traz ícone e
 * prefixo textual além da cor, para não depender só de cor (WCAG 1.4.1).
 */
export function InlineMessage({ message, tone = 'info' }: { message: string; tone?: Tone }) {
  const { theme } = useAccessibility();
  const c = theme.colors;

  const backgroundColor = tone === 'error' ? c.errorSoft : tone === 'warning' ? c.warningSoft : c.primarySoft;
  const textColor = tone === 'error' ? c.error : tone === 'warning' ? c.warning : c.primary;
  const prefix = tone === 'error' ? 'Erro: ' : tone === 'warning' ? 'Atenção: ' : '';
  const IconComponent = tone === 'error' ? AlertCircle : tone === 'warning' ? AlertTriangle : Info;

  return (
    <View
      style={[styles.container, { backgroundColor, borderColor: textColor }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon icon={IconComponent} size={18} color={textColor} />
      <AccessibleText variant="body" color={textColor} weight="semibold" style={styles.text}>
        {prefix}
        {message}
      </AccessibleText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  text: {
    flex: 1,
  },
});
