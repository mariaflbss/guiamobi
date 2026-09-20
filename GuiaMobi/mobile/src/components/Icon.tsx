import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAccessibility } from '../contexts/AccessibilityContext';

interface IconProps {
  icon: LucideIcon;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Ícone vetorial (Lucide) decorativo: fica oculto para leitores de tela
 * (R43). O significado sempre é dado pelo texto/accessibilityLabel do
 * elemento que contém o ícone. O tamanho acompanha a preferência de texto
 * do usuário (R55).
 */
export function Icon({ icon: IconComponent, size = 20, color, strokeWidth = 2, fill, style }: IconProps) {
  const { theme } = useAccessibility();
  const scaled = Math.round(size * Math.max(1, theme.fontScale));

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={style}
    >
      <IconComponent size={scaled} color={color ?? theme.colors.text} strokeWidth={strokeWidth} fill={fill ?? 'none'} />
    </View>
  );
}
