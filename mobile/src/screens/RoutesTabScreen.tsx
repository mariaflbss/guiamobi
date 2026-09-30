import React from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { InlineMessage } from '../components/InlineMessage';
import { RouteOptionCard } from '../components/RouteOptionCard';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { useRouteOptions } from '../hooks/useRouteOptions';
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
            <RouteOptionCard key={option.lineId} option={option} fastest={index === 0} onOpen={() => open(option)} />
          ))}
        </>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  empty: { gap: 12, alignItems: 'stretch', paddingVertical: 8 },
  count: { marginBottom: 12 },
});
