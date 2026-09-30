import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { AccessibleButton } from './AccessibleButton';
import { Card } from './Card';
import { RouteBadge } from './RouteBadge';
import { RouteOption } from '../types/routes';

/** Modo Simples: só a melhor opção, com poucas informações e botão grande. */
export function SimpleRouteCard({ option, onOpen }: { option: RouteOption; onOpen: () => void }) {
  const { t } = useTranslation();
  const { theme } = useAccessibility();

  return (
    <Card style={styles.card} borderColor={theme.colors.primary}>
      <AccessibleText variant="label" color={theme.colors.primary} style={styles.eyebrow}>
        {t('simpleMode.bestOption').toUpperCase()}
      </AccessibleText>
      <View style={styles.row}>
        <RouteBadge code={option.lineCode} size={64} />
        <View style={styles.flex}>
          <AccessibleText variant="heading" weight="extrabold">
            {t('simpleMode.bestOptionLine', { code: option.lineCode })}
          </AccessibleText>
          <AccessibleText variant="subtitle" weight="bold" color={theme.colors.textSecondary}>
            {t('simpleMode.minutes', { count: option.durationMinutes })}
          </AccessibleText>
        </View>
      </View>
      <View style={styles.boarding}>
        <AccessibleText variant="subtitle" weight="bold">
          {t('routes.boarding')}: {option.boardingStop.name}
        </AccessibleText>
      </View>
      <AccessibleButton label={t('simpleMode.howToGet')} onPress={onOpen} size="lg" />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { padding: 20, borderWidth: 2, marginBottom: 16, gap: 16 },
  eyebrow: { letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  boarding: { gap: 4 },
});
