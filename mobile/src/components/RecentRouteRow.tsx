import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArrowRight, ChevronRight, Search } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { Card } from './Card';
import { Icon } from './Icon';
import { RouteBadge } from './RouteBadge';
import { SearchHistoryItem } from '../types/favorites';
import { formatSearchDate, LOCALE_BY_LANGUAGE } from '../utils/format';

/**
 * Linha de uma busca recente (mockups de Histórico e "Rotas recentes"):
 * badge da linha (ou lupa quando ainda não houve escolha de linha),
 * "Origem → Destino", data e duração.
 */
export function RecentRouteRow({
  item,
  onPress,
  hint,
}: {
  item: SearchHistoryItem;
  onPress: () => void;
  hint?: string;
}) {
  const { t } = useTranslation();
  const { theme, language } = useAccessibility();
  const c = theme.colors;

  const date = formatSearchDate(
    item.searchedAt,
    { today: t('history.today'), yesterday: t('history.yesterday') },
    LOCALE_BY_LANGUAGE[language]
  );
  const duration = item.durationMinutes ? ` · ${t('history.durationShort', { count: item.durationMinutes })}` : '';
  const spoken = `${item.originLabel} ${t('common.to')} ${item.destinationLabel}. ${date}${duration}`;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={spoken} accessibilityHint={hint}>
      <Card style={styles.card}>
        {item.lineCode ? (
          <RouteBadge code={item.lineCode} />
        ) : (
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={[styles.searchTile, { backgroundColor: c.primarySoft }]}
          >
            <Icon icon={Search} size={20} color={c.primary} />
          </View>
        )}
        <View style={styles.texts}>
          <View style={styles.titleRow}>
            <AccessibleText variant="body" weight="extrabold" numberOfLines={1} style={styles.flexShrink}>
              {item.originLabel}
            </AccessibleText>
            <Icon icon={ArrowRight} size={14} color={c.textSecondary} />
            <AccessibleText variant="body" weight="extrabold" numberOfLines={1} style={styles.flexShrink}>
              {item.destinationLabel}
            </AccessibleText>
          </View>
          <AccessibleText variant="caption" weight="semibold" color={c.textSecondary}>
            {date}
            {duration}
          </AccessibleText>
        </View>
        <Icon icon={ChevronRight} size={20} color={c.textSecondary} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 10,
  },
  searchTile: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flexShrink: { flexShrink: 1 },
});
