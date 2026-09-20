import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Flag, MapPin, Plus, Trash2 } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { Card } from '../components/Card';
import { ChoiceSheet } from '../components/ChoiceSheet';
import { FavoriteIcon } from '../components/FavoriteIcon';
import { Icon } from '../components/Icon';
import { RouteBadge } from '../components/RouteBadge';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useRouteDraft } from '../contexts/RouteDraftContext';
import { useFavorites } from '../hooks/useFavorites';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { FavoritePlace } from '../types/favorites';
import { AppStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

/**
 * Favoritos (US07, mockup 10): vários locais com apelido e ícone por tipo,
 * "Adicionar local" e linhas favoritas. Tocar em um local abre as ações
 * (usar como origem/destino, excluir); os dados ficam no SQLite do aparelho.
 */
export function FavoritesScreen() {
  const { t } = useTranslation();
  const { theme, announce } = useAccessibility();
  const navigation = useNavigation<Nav>();
  const { favorites, favoriteLines, removeFavorite } = useFavorites();
  const draft = useRouteDraft();
  const [selected, setSelected] = useState<FavoritePlace | null>(null);
  useStatusBarStyle('light');
  const c = theme.colors;

  function useAs(kind: 'origin' | 'destination', favorite: FavoritePlace) {
    const place = { label: favorite.nickname, latitude: favorite.latitude, longitude: favorite.longitude };
    if (kind === 'origin') draft.setOrigin(place);
    else draft.setDestination(place);
    announce(`${t('microphone.confirmPrefix')} ${t(kind === 'origin' ? 'home.origin' : 'home.destination')}: ${favorite.nickname}`, {
      haptic: 'success',
    });
    navigation.navigate('MainTabs', { screen: 'Home' });
  }

  function confirmDelete(favorite: FavoritePlace) {
    Alert.alert(t('favorites.deleteConfirmTitle'), t('favorites.deleteConfirmMessage', { nickname: favorite.nickname }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => removeFavorite(favorite.id) },
    ]);
  }

  return (
    <>
      <ScreenContainer scroll header={<ScreenHeader title={t('favorites.title')} subtitle={t('favorites.subtitle')} />}>
        <AccessibleText variant="subtitle" weight="extrabold" accessibilityRole="header" style={styles.sectionTitle}>
          {t('favorites.places')}
        </AccessibleText>

        {favorites.map((favorite) => (
          <Pressable
            key={favorite.id}
            onPress={() => setSelected(favorite)}
            accessibilityRole="button"
            accessibilityLabel={`${favorite.nickname}. ${favorite.address}`}
            accessibilityHint={t('favorites.selectHint')}
          >
            <Card style={styles.row}>
              <FavoriteIcon kind={favorite.kind} />
              <View style={styles.flex}>
                <AccessibleText variant="subtitle" weight="extrabold">
                  {favorite.nickname}
                </AccessibleText>
                <AccessibleText variant="caption" weight="semibold" color={c.textSecondary} numberOfLines={2}>
                  {favorite.address}
                </AccessibleText>
              </View>
              <Icon icon={ChevronRight} size={20} color={c.textSecondary} />
            </Card>
          </Pressable>
        ))}

        {favorites.length === 0 ? (
          <AccessibleText variant="body" color={c.textSecondary} style={styles.empty}>
            {t('favorites.empty')}
          </AccessibleText>
        ) : null}

        <Pressable
          onPress={() => navigation.navigate('AddFavorite')}
          accessibilityRole="button"
          accessibilityLabel={t('favorites.addPlace')}
          style={[styles.add, { borderColor: c.borderStrong }]}
        >
          <Icon icon={Plus} size={20} color={c.textSecondary} />
          <AccessibleText variant="body" weight="bold" color={c.textSecondary}>
            {t('favorites.addPlace')}
          </AccessibleText>
        </Pressable>

        <AccessibleText variant="subtitle" weight="extrabold" accessibilityRole="header" style={[styles.sectionTitle, styles.linesTitle]}>
          {t('favorites.linesTitle')}
        </AccessibleText>

        {favoriteLines.length === 0 ? (
          <AccessibleText variant="body" color={c.textSecondary}>
            {t('favorites.noLines')}
          </AccessibleText>
        ) : (
          favoriteLines.map((line) => (
            <Pressable
              key={line.lineId}
              onPress={() => navigation.navigate('RouteDetail', { lineId: line.lineId, lineCode: line.code, lineName: line.name })}
              accessibilityRole="button"
              accessibilityLabel={`${line.code}, ${line.name}`}
            >
              <Card style={styles.row}>
                <RouteBadge code={line.code} />
                <AccessibleText variant="subtitle" weight="extrabold" style={styles.flex}>
                  {line.name}
                </AccessibleText>
                <Icon icon={ChevronRight} size={20} color={c.textSecondary} />
              </Card>
            </Pressable>
          ))
        )}
      </ScreenContainer>

      <ChoiceSheet
        visible={selected !== null}
        title={selected?.nickname ?? ''}
        onClose={() => setSelected(null)}
        choices={
          selected
            ? [
                { label: t('favorites.useAsOrigin'), icon: MapPin, variant: 'primary', onPress: () => useAs('origin', selected) },
                { label: t('favorites.useAsDestination'), icon: Flag, variant: 'primary', onPress: () => useAs('destination', selected) },
                { label: t('favorites.deleteLabel', { nickname: selected.nickname }), icon: Trash2, variant: 'dangerSoft', onPress: () => confirmDelete(selected) },
              ]
            : []
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sectionTitle: { marginBottom: 10 },
  linesTitle: { marginTop: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10 },
  empty: { marginBottom: 12 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginTop: 2,
  },
});
