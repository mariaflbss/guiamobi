import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { Icon } from './Icon';
import { MIN_TOUCH_TARGET } from '../theme/theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Conteúdo à direita (ex.: badge "SIMPLES" ou botão). */
  right?: React.ReactNode;
  /** Conteúdo extra dentro do cabeçalho azul, abaixo dos textos. */
  children?: React.ReactNode;
  /** Ícone/elemento à esquerda do título (ex.: badge da linha). */
  leading?: React.ReactNode;
  color?: string;
  compact?: boolean;
  /** Reduz o título para cabeçalhos compactos com nomes longos. */
  titleVariant?: React.ComponentProps<typeof AccessibleText>['variant'];
}

/**
 * Cabeçalho azul das telas (mockups: Rotas encontradas, Favoritos,
 * Histórico, Configurações, Ajuda...). Estende-se sob a barra de status,
 * expõe o título como "header" para leitores de tela e traz o botão de
 * voltar com 44x44 (R28).
 */
export function ScreenHeader({ title, subtitle, onBack, right, children, leading, color, compact = false, titleVariant }: ScreenHeaderProps) {
  const { t } = useTranslation();
  const { theme } = useAccessibility();
  const insets = useSafeAreaInsets();
  const c = theme.colors;

  return (
    <View style={[styles.container, compact ? styles.compactContainer : null, { backgroundColor: color ?? c.primary, paddingTop: insets.top + (compact ? 6 : 14) }]}>
      <View style={[styles.row, compact ? styles.compactRow : null]}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={[styles.backButton, { backgroundColor: c.headerOverlay }]}
          >
            <Icon icon={ArrowLeft} size={22} color={c.onPrimary} />
          </Pressable>
        ) : null}
        {leading}
        <View style={styles.texts}>
          <AccessibleText variant={titleVariant ?? (compact ? 'title' : 'heading')} color={c.onPrimary} accessibilityRole="header" weight="extrabold">
            {title}
          </AccessibleText>
          {subtitle ? (
            <AccessibleText variant="caption" color={c.onPrimaryMuted} weight="semibold">
              {subtitle}
            </AccessibleText>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  compactContainer: { paddingBottom: 7 },
  compactRow: { gap: 8 },
  backButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
  },
});
