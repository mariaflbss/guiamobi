import { darkColors, lightColors, ColorPalette } from '../constants/colors';
import { FontSize } from '../types/settings';

/**
 * Escalas de fonte da preferência "Tamanho do texto" (US03/US08). O
 * multiplicador é aplicado sobre o tamanho base de cada estilo; o ajuste de
 * fonte do sistema continua valendo por cima (allowFontScaling).
 */
export const FONT_SCALE: Record<FontSize, number> = {
  pequeno: 0.9,
  medio: 1,
  grande: 1.25,
};

// Tamanho mínimo de área de toque (WCAG 2.5.5 / R28)
export const MIN_TOUCH_TARGET = 44;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

/** Famílias Nunito (mesma tipografia dos mockups), carregadas em App.tsx. */
export const FONT_FAMILY = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
} as const;

export interface Theme {
  colors: ColorPalette;
  fontScale: number;
  spacing: typeof spacing;
  radius: typeof radius;
  dark: boolean;
  highContrast: boolean;
}

/**
 * Monta o tema a partir das preferências (modo escuro, alto contraste e
 * tamanho da fonte). O alto contraste troca texto e bordas para preto/branco
 * puro e escurece o azul principal, sem depender só de cor (US03 / R13).
 */
export function buildTheme(darkMode: boolean, highContrast: boolean, fontSize: FontSize): Theme {
  const base = darkMode ? darkColors : lightColors;

  const colors: ColorPalette = highContrast
    ? {
        ...base,
        text: darkMode ? '#FFFFFF' : '#000000',
        textSecondary: darkMode ? '#FFFFFF' : '#000000',
        border: darkMode ? '#FFFFFF' : '#000000',
        borderStrong: darkMode ? '#FFFFFF' : '#000000',
        primary: darkMode ? '#A9C6FF' : '#0B3A8A',
        primaryDark: darkMode ? '#000000' : '#06265C',
        success: darkMode ? '#9BE3B2' : '#0B5D2A',
        warning: darkMode ? '#FFD9A0' : '#7A3A00',
        error: darkMode ? '#FFB4AB' : '#8C1410',
      }
    : base;

  return {
    colors,
    fontScale: FONT_SCALE[fontSize],
    spacing,
    radius,
    dark: darkMode,
    highContrast,
  };
}
