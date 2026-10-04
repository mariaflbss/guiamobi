import React from 'react';
import { StyleSheet, View, ActivityIndicator, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { AccessibleTextInput } from '../components/AccessibleTextInput';
import { RouteBadge } from '../components/RouteBadge';
import { InlineMessage } from '../components/InlineMessage';
import { RouteOptionCard } from '../components/RouteOptionCard';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { useRouteOptions } from '../hooks/useRouteOptions';
import { routesService } from '../services/api/routesService';
import { LineSearchResult } from '../types/routes';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AppStackParamList } from '../navigation/types';
import { RouteOption } from '../types/routes';

/**
 * Aba "Rotas": mostra as opções de ônibus da última busca feita (a mesma
 * lista da tela "Rotas encontradas"). Sem busca anterior, orienta o
 * usuário a escolher origem e destino na tela inicial.
 */
export function RoutesTabScreen() {
  const { t } = useTranslation();
  const { theme } = useAccessibility();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { lastRoute } = useSearchHistory();
  const origin = lastRoute ? { latitude: lastRoute.originLatitude, longitude: lastRoute.originLongitude } : null;
  const destination = lastRoute ? { latitude: lastRoute.destinationLatitude, longitude: lastRoute.destinationLongitude } : null;
  const { options, isLoading, errorMessage, hasTransitData } = useRouteOptions(origin, destination);
  const [lineQuery, setLineQuery] = React.useState('');
  const [lineResults, setLineResults] = React.useState<LineSearchResult[]>([]);
  const [lineLoading, setLineLoading] = React.useState(false);

  React.useEffect(() => {
    const query = lineQuery.trim();
    if (!query) { setLineResults([]); setLineLoading(false); return; }
    let cancelled = false;
    setLineLoading(true);
    const timer = setTimeout(() => {
      routesService.searchLines(query)
        .then((items) => { if (!cancelled) setLineResults(items); })
        .catch(() => { if (!cancelled) setLineResults([]); })
        .finally(() => { if (!cancelled) setLineLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [lineQuery]);
  useStatusBarStyle('light');
  const c = theme.colors;

  function open(option: RouteOption) {
    navigation.navigate('RouteDetail', {
      lineId: option.lineId,
      lineCode: option.lineCode,
      lineName: option.lineName,
      boardingStopId: option.boardingStop.id,
      alightingStopId: option.alightingStop.id,
      durationMinutes: option.durationMinutes,
      stopsCount: option.stopsCount,
      nextDeparture: option.nextDeparture,
      destinationLabel: lastRoute?.destinationLabel,
      originLatitude: lastRoute?.originLatitude,
      originLongitude: lastRoute?.originLongitude,
      destinationLatitude: lastRoute?.destinationLatitude,
      destinationLongitude: lastRoute?.destinationLongitude,
    });
  }

  return (
    <ScreenContainer
      scroll
      header={
        <ScreenHeader
          title={t('routes.tabTitle')}
          subtitle={lastRoute ? `${lastRoute.originLabel} → ${lastRoute.destinationLabel}` : t('routes.tabSubtitle')}
        />
      }
    >
      {!lastRoute ? (
        <View style={styles.empty}>
          <InlineMessage message={t('routes.tabEmpty')} tone="info" />
          <AccessibleButton
            label={t('routes.tabGoHome')}
            icon={Search}
            onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })}
          />
        </View>
      ) : null}

      <View style={[styles.searchSection, { borderColor: c.border, backgroundColor: c.surface }]}>
        <AccessibleText variant="subtitle" weight="extrabold" style={styles.searchTitle}>
          {t('routes.lineSearchTitle')}
        </AccessibleText>
        <AccessibleTextInput
          label={t('routes.lineSearchLabel')}
          placeholder={t('routes.lineSearchPlaceholder')}
          icon={Search}
          value={lineQuery}
          onChangeText={setLineQuery}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {lineLoading ? <ActivityIndicator size="small" color={c.primary} /> : null}
        {!lineLoading && lineQuery.trim() && lineResults.length === 0 ? (
          <AccessibleText variant="caption" color={c.textSecondary}>{t('routes.lineSearchEmpty')}</AccessibleText>
        ) : null}
        {lineResults.map((item) => (
          <Pressable
            key={item.lineId}
            onPress={() => navigation.navigate('RouteDetail', { lineId: item.lineId, lineCode: item.lineCode, lineName: item.lineName })}
            accessibilityRole="button"
            accessibilityLabel={`${item.lineCode}, ${item.lineName}. ${item.status === 'DELAYED' ? t('routes.lineDelayed', { minutes: item.delayMinutes ?? 0 }) : item.status === 'UNAVAILABLE' ? t('routes.lineUnavailable') : t('routes.lineOperational')}`}
            style={[styles.lineResult, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}
          >
            <RouteBadge code={item.lineCode} />
            <View style={styles.flex}>
              <AccessibleText variant="body" weight="extrabold">{item.lineName}</AccessibleText>
              <AccessibleText variant="caption" color={item.status === 'DELAYED' ? c.warning : item.status === 'UNAVAILABLE' ? c.error : c.textSecondary}>
                {item.status === 'DELAYED' ? t('routes.lineDelayed', { minutes: item.delayMinutes ?? 0 }) : item.status === 'UNAVAILABLE' ? t('routes.lineUnavailable') : t('routes.lineOperational')}
              </AccessibleText>
            </View>
          </Pressable>
        ))}
      </View>

      {lastRoute && isLoading ? (
        <View style={styles.empty} accessibilityRole="progressbar" accessibilityLabel={t('routes.searching')}>
          <ActivityIndicator size="large" color={c.primary} />
          <AccessibleText color={c.textSecondary}>{t('routes.searching')}</AccessibleText>
        </View>
      ) : null}

      {lastRoute && !isLoading && errorMessage ? <InlineMessage message={errorMessage} tone="error" /> : null}
      {lastRoute && !isLoading && !errorMessage && options.length === 0 ? (
        <InlineMessage message={hasTransitData ? t('routes.notFound') : t('routes.noTransitData')} tone="warning" />
      ) : null}

      {options.length > 0 ? (
        <>
          <AccessibleText variant="caption" weight="bold" color={c.textSecondary} style={styles.count}>
            {t('routes.foundCount', { count: options.length })}
          </AccessibleText>
          {options.map((option, index) => (
            <RouteOptionCard key={`${option.lineId}-${option.boardingStop.id}-${option.alightingStop.id}`} option={option} fastest={index === 0} onOpen={() => open(option)} />
          ))}
        </>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  empty: { gap: 12, alignItems: 'stretch', paddingVertical: 8 },
  flex: { flex: 1 },
  searchSection: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 16, gap: 8 },
  searchTitle: { marginBottom: 2 },
  lineResult: { minHeight: 60, borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  count: { marginBottom: 12 },
});
