import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Briefcase, GraduationCap, HeartPulse, House, MapPin } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { FavoriteKind } from '../types/favorites';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { Icon } from './Icon';
import { Tone, toneColors } from './SettingCard';

export const FAVORITE_KIND_STYLE: Record<FavoriteKind, { icon: LucideIcon; tone: Tone }> = {
  home: { icon: House, tone: 'primary' },
  school: { icon: GraduationCap, tone: 'success' },
  work: { icon: Briefcase, tone: 'purple' },
  health: { icon: HeartPulse, tone: 'danger' },
  other: { icon: MapPin, tone: 'primary' },
};

/** Azulejo colorido com o ícone do tipo de local (Casa, Faculdade, Trabalho, Saúde). Decorativo. */
export function FavoriteIcon({ kind, size = 44 }: { kind: FavoriteKind; size?: number }) {
  const { theme } = useAccessibility();
  const style = FAVORITE_KIND_STYLE[kind] ?? FAVORITE_KIND_STYLE.other;
  const { bg, fg } = toneColors(style.tone, theme.colors);

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.tile, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: bg }]}
    >
      <Icon icon={style.icon} size={Math.round(size * 0.45)} color={fg} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
