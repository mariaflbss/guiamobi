import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Clock, Flag, Timer } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { AccessibleButton } from './AccessibleButton';
import { Card } from './Card';
import { Icon } from './Icon';
import { RouteBadge } from './RouteBadge';
import { RouteOption } from '../types/routes';

/**
 * Cartão de uma opção de rota (mockup 05): badge da linha, nome, horário e
 * duração, caixa com embarque/desembarque, paradas/duração e "Ver rota". A
 * opção mais rápida recebe borda azul e a etiqueta "MAIS RÁPIDO" (texto,
 * não só cor).
 */
export function RouteOptionCard({
  option,
  fastest,
  onOpen,
}: {
  option: RouteOption;
  fastest: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useAccessibility();
  const c = theme.colors;

  return (
    <Card
      borderColor={fastest ? c.primary : c.border}
      style={[styles.card, fastest ? styles.fastest : null]}
      accessible
      accessibilityLabel={
        (fastest ? `${t('routes.fastestSpoken')}. ` : '') +
        t('routes.optionAccessibilityLabel', {
          code: option.lineCode,
          name: option.lineName,
          duration: option.durationMinutes,
          stops: option.stopsCount,
          boarding: option.boardingStop.name,
          alighting: option.alightingStop.name,
        })
      }
    >
      {fastest ? (
        <View style={[styles.tag, { backgroundColor: c.primary }]} accessible={false} importantForAccessibility="no-hide-descendants">
          <AccessibleText variant="label" weight="extrabold" color={c.onPrimary} style={styles.tagText}>
            {t('routes.fastest')}
          </AccessibleText>
        </View>
      ) : null}

      <View style={styles.headerRow}>
        <RouteBadge code={option.lineCode} />
        <View style={styles.flex}>
          <AccessibleText variant="subtitle" weight="extrabold" numberOfLines={2}>
            {option.lineName}
          </AccessibleText>
          <View style={styles.metaRow}>
            {option.nextDeparture ? (
              <View style={styles.meta}>
                <Icon icon={Clock} size={14} color={c.textSecondary} />
                <AccessibleText variant="caption" weight="bold" color={c.textSecondary}>
                  {option.nextDeparture}
                </AccessibleText>
              </View>
            ) : null}
            <View style={styles.meta}>
              <Icon icon={Timer} size={14} color={c.textSecondary} />
              <AccessibleText variant="caption" weight="bold" color={c.textSecondary}>
                {t('routes.durationValue', { count: option.durationMinutes })}
              </AccessibleText>
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.stopsBox, { backgroundColor: c.surfaceAlt }]}>
        <View style={styles.stopRow}>
          <View style={styles.marker}>
            <View style={[styles.dot, { backgroundColor: c.primary }]} />
          </View>
          <View style={styles.flex}>
            <AccessibleText variant="label" color={c.textSecondary} style={styles.stopLabel}>
              {t('routes.boarding')}
            </AccessibleText>
            <AccessibleText variant="body" weight="extrabold">
              {option.boardingStop.name}
            </AccessibleText>
          </View>
        </View>
        <View style={styles.stopRow}>
          <View style={styles.marker}>
            <Icon icon={Flag} size={16} color={c.success} />
          </View>
          <View style={styles.flex}>
            <AccessibleText variant="label" color={c.textSecondary} style={styles.stopLabel}>
              {t('routes.alighting')}
            </AccessibleText>
            <AccessibleText variant="body" weight="extrabold">
              {option.alightingStop.name}
            </AccessibleText>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View>
          <AccessibleText variant="label" color={c.textSecondary}>
            {t('routes.stopsLabel')}
          </AccessibleText>
          <AccessibleText variant="heading" weight="extrabold">
            {option.stopsCount}
          </AccessibleText>
        </View>
        <View>
          <AccessibleText variant="label" color={c.textSecondary}>
            {t('routes.durationLabel')}
          </AccessibleText>
          <AccessibleText variant="heading" weight="extrabold">
            {t('routes.durationValue', { count: option.durationMinutes })}
          </AccessibleText>
        </View>
      </View>

      <AccessibleButton
        label={t('routes.viewRoute')}
        accessibilityHint={t('routes.viewRouteHint', { code: option.lineCode })}
        onPress={onOpen}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { padding: 16, marginBottom: 14, overflow: 'hidden' },
  fastest: { borderWidth: 2 },
  tag: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 12,
  },
  tagText: { letterSpacing: 0.5 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 8, marginTop: 8 },
  metaRow: { flexDirection: 'row', gap: 14, marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stopsBox: { borderRadius: 14, padding: 12, marginTop: 14, gap: 12 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  marker: { width: 20, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  stopLabel: { letterSpacing: 0.6 },
  statsRow: { flexDirection: 'row', gap: 48, marginVertical: 14 },
});
