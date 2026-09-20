import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Check, Star } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AppStackParamList } from '../navigation/types';
import { formatClock } from '../utils/format';
import { MIN_TOUCH_TARGET } from '../theme/theme';

type Props = NativeStackScreenProps<AppStackParamList, 'Arrival'>;

/**
 * Chegada (mockup 09): resumo da viagem com a duração real (do início do
 * acompanhamento até agora) e a avaliação por estrelas. A avaliação fica só
 * neste aparelho durante a tela: o app ainda não envia avaliações a nenhum
 * servidor.
 */
export function ArrivalScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { theme, announce } = useAccessibility();
  const { placeName, trip } = route.params;
  const [rating, setRating] = useState(0);
  const [arrivedAt] = useState(() => new Date());
  useStatusBarStyle(theme.dark ? 'light' : 'dark');
  const c = theme.colors;

  const elapsedMinutes = Math.max(1, Math.round((arrivedAt.getTime() - new Date(trip.startedAt).getTime()) / 60000));

  useEffect(() => {
    announce(`${t('arrival.title')} ${t('arrival.welcome', { place: placeName })}`, { haptic: 'success' });
    // uma única vez ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function rate(value: number) {
    setRating(value);
    announce(t('arrival.thanks'), { haptic: 'light' });
  }

  function backHome() {
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Home' } }] })
    );
  }

  const rows: { label: string; value: string }[] = [
    { label: t('arrival.line'), value: `${trip.lineCode} · ${trip.lineName}` },
    { label: t('arrival.duration'), value: t('arrival.minutes', { count: elapsedMinutes }) },
    ...(trip.stopsCount ? [{ label: t('arrival.stops'), value: t('arrival.stopsValue', { count: trip.stopsCount }) }] : []),
    { label: t('arrival.arrivalTime'), value: formatClock(arrivedAt) },
  ];

  return (
    <ScreenContainer scroll backgroundColor={c.successBg} padding={24} contentStyle={styles.content}>
      <View style={[styles.circle, { backgroundColor: c.successStrong }]} accessible={false} importantForAccessibility="no-hide-descendants">
        <Icon icon={Check} size={48} color="#FFFFFF" strokeWidth={2.4} />
      </View>

      <AccessibleText variant="display" color={c.successDark} style={styles.center} accessibilityRole="header">
        {t('arrival.title')}
      </AccessibleText>
      <AccessibleText variant="subtitle" weight="bold" color={c.success} style={styles.center}>
        {t('arrival.welcome', { place: placeName })}
      </AccessibleText>

      <Card style={styles.summary} borderColor={c.successStrong} accessible accessibilityLabel={`${t('arrival.summary')}. ${rows.map((r) => `${r.label}: ${r.value}`).join('. ')}`}>
        <AccessibleText variant="body" weight="bold" color={c.textSecondary} style={styles.center}>
          {t('arrival.summary')}
        </AccessibleText>
        {rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <AccessibleText variant="body" weight="semibold" color={c.textSecondary}>
              {row.label}
            </AccessibleText>
            <AccessibleText variant="body" weight="extrabold" style={styles.value}>
              {row.value}
            </AccessibleText>
          </View>
        ))}
      </Card>

      <Card style={styles.rating}>
        <AccessibleText variant="body" weight="bold" color={c.textSecondary} style={styles.center} accessibilityRole="header">
          {t('arrival.rate')}
        </AccessibleText>
        <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel={t('arrival.rate')}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable
              key={value}
              onPress={() => rate(value)}
              accessibilityRole="radio"
              accessibilityLabel={t('arrival.starLabel', { count: value })}
              accessibilityState={{ selected: rating === value, checked: rating === value }}
              style={styles.star}
            >
              <Icon icon={Star} size={32} color={value <= rating ? c.warningStrong : c.borderStrong} fill={value <= rating ? c.warningStrong : 'none'} />
            </Pressable>
          ))}
        </View>
        {rating > 0 ? (
          <AccessibleText variant="caption" weight="bold" color={c.success} style={styles.center} accessibilityLiveRegion="polite">
            {t('arrival.thanks')}
          </AccessibleText>
        ) : null}
      </Card>

      <AccessibleButton label={t('arrival.backHome')} variant="success" size="lg" onPress={backHome} style={styles.button} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', gap: 12 },
  circle: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  center: { textAlign: 'center' },
  summary: { alignSelf: 'stretch', padding: 16, gap: 10, borderWidth: 2, marginTop: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  value: { flexShrink: 1, textAlign: 'right' },
  rating: { alignSelf: 'stretch', padding: 16, gap: 8 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  star: { width: MIN_TOUCH_TARGET + 4, height: MIN_TOUCH_TARGET + 4, alignItems: 'center', justifyContent: 'center' },
  button: { alignSelf: 'stretch', marginTop: 4 },
});
