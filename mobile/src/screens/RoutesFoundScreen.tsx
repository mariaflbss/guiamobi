import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { InlineMessage } from '../components/InlineMessage';
import { RouteOptionCard } from '../components/RouteOptionCard';
import { SimpleRouteCard } from '../components/SimpleRouteCard';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { useRouteOptions } from '../hooks/useRouteOptions';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AppStackParamList } from '../navigation/types';
import { RouteOption } from '../types/routes';

type Props = NativeStackScreenProps<AppStackParamList, 'RoutesFound'>;

/**
 * Rotas encontradas (mockup 05). A busca é gravada no histórico ao chegar
 * aqui (busca de fato realizada) e, ao abrir uma linha, a linha e a duração
 * escolhidas são anexadas àquele registro. No Modo Simples mostra só a
 * melhor opção, com texto maior.
 */
export function RoutesFoundScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { theme, announce, settings } = useAccessibility();
  const { addSearch, setChosenLine } = useSearchHistory();
  const { origin, destination, historyId } = route.params;
  const { options, isLoading, errorMessage, hasTransitData } = useRouteOptions(origin, destination);
  const historyIdRef = useRef<string | undefined>(historyId);
  const announcedRef = useRef(false);
  useStatusBarStyle('light');

  useEffect(() => {
    if (historyIdRef.current) return;
    addSearch({
      originLabel: origin.label,
      originCoordinates: { latitude: origin.latitude, longitude: origin.longitude },
      destinationLabel: destination.label,
      destinationCoordinates: { latitude: destination.latitude, longitude: destination.longitude },
    }).then((item) => {
      historyIdRef.current = item.id;
    });
    // registra uma vez por abertura da tela
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isLoading || announcedRef.current) return;
    announcedRef.current = true;
    if (errorMessage) announce(errorMessage, { haptic: 'error' });
    else if (options.length === 0) announce(hasTransitData ? t('routes.notFound') : t('routes.noTransitData'), { haptic: 'warning' });
    else announce(t('routes.foundCount', { count: options.length }), { haptic: 'success' });
  }, [isLoading, errorMessage, options.length, hasTransitData, announce, t]);

  function openDetail(option: RouteOption) {
    if (historyIdRef.current) {
      setChosenLine({ id: historyIdRef.current, lineCode: option.lineCode, durationMinutes: option.durationMinutes });
    }
    navigation.navigate('RouteDetail', {
      lineId: option.lineId,
      lineCode: option.lineCode,
      lineName: option.lineName,
      boardingStopId: option.boardingStop.id,
      alightingStopId: option.alightingStop.id,
      durationMinutes: option.durationMinutes,
      stopsCount: option.stopsCount,
      nextDeparture: option.nextDeparture,
      destinationLabel: destination.label,
    });
  }

  const c = theme.colors;

  return (
    <ScreenContainer
      scroll
      header={
        <ScreenHeader
          title={t('routes.title')}
          subtitle={`${origin.label} → ${destination.label}`}
          onBack={() => navigation.goBack()}
        />
      }
    >
      {isLoading ? (
        <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={t('routes.searching')}>
          <ActivityIndicator size="large" color={c.primary} />
          <AccessibleText variant="body" color={c.textSecondary}>
            {t('routes.searching')}
          </AccessibleText>
        </View>
      ) : null}

      {!isLoading && errorMessage ? <InlineMessage message={errorMessage} tone="error" /> : null}

      {!isLoading && !errorMessage && options.length === 0 ? (
        <InlineMessage message={hasTransitData ? t('routes.notFound') : t('routes.noTransitData')} tone="warning" />
      ) : null}

      {!isLoading && options.length > 0 ? (
        settings.simpleMode ? (
          <SimpleRouteCard option={options[0]} onOpen={() => openDetail(options[0])} />
        ) : (
          <>
            <AccessibleText variant="caption" weight="bold" color={c.textSecondary} style={styles.count}>
              {t('routes.foundCount', { count: options.length })}
            </AccessibleText>
            {options.map((option, index) => (
              <RouteOptionCard key={option.lineId} option={option} fastest={index === 0} onOpen={() => openDetail(option)} />
            ))}
          </>
        )
      ) : null}

      {!isLoading ? (
        <AccessibleButton label={t('routes.chooseAnother')} variant="secondary" onPress={() => navigation.goBack()} />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  count: { marginBottom: 12 },
});
