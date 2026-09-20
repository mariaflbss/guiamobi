import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { RecentRouteRow } from '../components/RecentRouteRow';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AppStackParamList } from '../navigation/types';
import { SearchHistoryItem } from '../types/favorites';

/**
 * Histórico (US07, mockup 11): as últimas 10 buscas, persistidas no
 * aparelho. Tocar em uma repete a busca (abre as rotas com a mesma origem e
 * o mesmo destino).
 */
export function HistoryScreen() {
  const { t } = useTranslation();
  const { theme } = useAccessibility();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { history } = useSearchHistory();
  useStatusBarStyle('light');

  function repeat(item: SearchHistoryItem) {
    navigation.navigate('RoutesFound', {
      origin: { label: item.originLabel, latitude: item.originLatitude, longitude: item.originLongitude },
      destination: { label: item.destinationLabel, latitude: item.destinationLatitude, longitude: item.destinationLongitude },
      historyId: item.id,
    });
  }

  return (
    <ScreenContainer scroll header={<ScreenHeader title={t('history.title')} subtitle={t('history.subtitle')} />}>
      {history.length === 0 ? (
        <AccessibleText variant="body" color={theme.colors.textSecondary}>
          {t('history.empty')}
        </AccessibleText>
      ) : (
        history.map((item) => <RecentRouteRow key={item.id} item={item} onPress={() => repeat(item)} hint={t('history.selectHint')} />)
      )}
    </ScreenContainer>
  );
}
