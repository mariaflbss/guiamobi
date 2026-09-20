import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { Icon } from './Icon';
import { MIN_TOUCH_TARGET } from '../theme/theme';

/** Cabeçalho claro das telas de cadastro/recuperação: botão voltar + título (mockup "Criar conta"). */
export function BackTitleHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { theme } = useAccessibility();

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        style={[styles.back, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
      >
        <Icon icon={ArrowLeft} size={22} color={theme.colors.text} />
      </Pressable>
      <AccessibleText variant="heading" weight="extrabold" accessibilityRole="header" style={styles.title}>
        {title}
      </AccessibleText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 24,
  },
  back: {
    width: MIN_TOUCH_TARGET + 4,
    height: MIN_TOUCH_TARGET + 4,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
  },
});
