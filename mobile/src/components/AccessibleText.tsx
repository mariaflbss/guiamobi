import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { FONT_FAMILY } from '../theme/theme';

type Variant = 'display' | 'title' | 'heading' | 'subtitle' | 'body' | 'caption' | 'label' | 'button';
type Weight = 'regular' | 'semibold' | 'bold' | 'extrabold';

interface AccessibleTextProps extends TextProps {
  variant?: Variant;
  color?: string;
  /** Atalho para weight="bold". */
  bold?: boolean;
  weight?: Weight;
}

// Tamanhos base (pt) de cada variante, antes do fontScale (preferência do app)
const BASE_SIZES: Record<Variant, number> = {
  display: 32,
  title: 24,
  heading: 20,
  subtitle: 16,
  body: 15,
  caption: 13,
  label: 12,
  button: 16,
};

const DEFAULT_WEIGHT: Record<Variant, Weight> = {
  display: 'extrabold',
  title: 'extrabold',
  heading: 'bold',
  subtitle: 'semibold',
  body: 'regular',
  caption: 'regular',
  label: 'bold',
  button: 'bold',
};

/**
 * Texto padrão do app. Respeita o tamanho de fonte escolhido pelo usuário
 * (US08) e o ajuste de fonte do sistema (allowFontScaling), sempre em
 * Nunito, como nos mockups. Textos longos quebram linha em vez de cortar
 * (R82).
 */
export function AccessibleText({ variant = 'body', color, bold, weight, style, ...props }: AccessibleTextProps) {
  const { theme } = useAccessibility();
  const resolvedWeight: Weight = weight ?? (bold ? 'bold' : DEFAULT_WEIGHT[variant]);

  const textStyle: TextStyle = {
    fontSize: BASE_SIZES[variant] * theme.fontScale,
    color: color ?? theme.colors.text,
    fontFamily: FONT_FAMILY[resolvedWeight],
  };

  return <Text allowFontScaling style={[textStyle, style]} {...props} />;
}
