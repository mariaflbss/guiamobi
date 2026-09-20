import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heart, History, House, Route, Settings } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from '../components/AccessibleText';
import { Icon } from '../components/Icon';
import { AppTabParamList } from './types';

const TAB_ICONS: Record<keyof AppTabParamList, LucideIcon> = {
  Home: House,
  Routes: Route,
  Favorites: Heart,
  History: History,
  Settings: Settings,
};

const TAB_LABEL_KEYS: Record<keyof AppTabParamList, string> = {
  Home: 'navigation.home',
  Routes: 'navigation.routes',
  Favorites: 'navigation.favorites',
  History: 'navigation.history',
  Settings: 'navigation.settings',
};

/**
 * Barra de abas do mockup: 5 itens, aba ativa com fundo azul-claro arredondado
 * (ícone + rótulo em azul e negrito - o estado não depende só de cor). Cada
 * aba tem role "tab" e estado selecionado para leitores de tela. No Modo
 * Simples a barra some, como no mockup da interface simplificada.
 */
export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const { theme, settings } = useAccessibility();
  const insets = useSafeAreaInsets();
  const c = theme.colors;

  if (settings.simpleMode) return null;

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 8) },
      ]}
      accessibilityRole="tablist"
    >
      {state.routes.map((route, index) => {
        const name = route.name as keyof AppTabParamList;
        const isFocused = state.index === index;
        const label = t(TAB_LABEL_KEYS[name]);

        function onPress() {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        }

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: isFocused }}
            style={styles.item}
          >
            <View style={[styles.pill, isFocused ? { backgroundColor: c.primarySoft } : null]}>
              <Icon icon={TAB_ICONS[name]} size={22} color={isFocused ? c.primary : c.textSecondary} />
              <AccessibleText
                variant="caption"
                weight={isFocused ? 'extrabold' : 'semibold'}
                color={isFocused ? c.primary : c.textSecondary}
                numberOfLines={1}
                style={styles.label}
              >
                {label}
              </AccessibleText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 58,
    minHeight: 52,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 2,
  },
  label: {
    fontSize: 11,
  },
});
